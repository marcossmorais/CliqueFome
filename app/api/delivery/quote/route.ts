import { NextRequest, NextResponse } from 'next/server';
import { ErroEnderecoDelivery, validarEnderecoDelivery } from '@/lib/delivery/endereco';
import { calcularDistanciaRota, ErroGeoapify, geocodificarEndereco } from '@/lib/delivery/geoapify';
import {
  calcularCotacaoDelivery,
  ErroCalculoDelivery,
  itensDeliveryParaRpc,
  validarItensDelivery,
} from '@/lib/delivery/quote';
import type { ConfiguracaoCalculoDelivery } from '@/lib/delivery/tipos';
import { logger } from '@/lib/observabilidade/logger';
import { criarClientPrivilegiado, hashLimite } from '@/lib/pedidos/servidor';

export const runtime = 'nodejs';

const ROTA = '/api/delivery/quote';
const TAMANHO_MAXIMO_BYTES = 60_000;

function respostaErro(erro: string, status: number) {
  return NextResponse.json({ erro }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function ipDoCliente(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconhecido';
}

export async function POST(request: NextRequest) {
  if (process.env.CHECKOUT_PUBLICO_ATIVO === 'false') {
    return respostaErro('O Delivery está temporariamente indisponível.', 503);
  }
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return respostaErro('Content-Type precisa ser application/json.', 415);
  }

  const bruto = await request.text();
  if (bruto.length > TAMANHO_MAXIMO_BYTES) return respostaErro('Dados grandes demais.', 413);

  let corpo: Record<string, unknown>;
  try {
    const json = JSON.parse(bruto) as unknown;
    if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('JSON_INVALIDO');
    corpo = json as Record<string, unknown>;
  } catch {
    return respostaErro('Dados inválidos.', 422);
  }

  const lojaSlug = String(corpo.lojaSlug ?? '').trim();
  if (!/^[a-z0-9-]{1,80}$/.test(lojaSlug)) return respostaErro('Loja não encontrada.', 404);

  let endereco;
  let itens;
  try {
    endereco = validarEnderecoDelivery(corpo.endereco);
    itens = validarItensDelivery(corpo.itens);
  } catch (erro) {
    if (erro instanceof ErroEnderecoDelivery || erro instanceof ErroCalculoDelivery) {
      return respostaErro(erro.message, 422);
    }
    return respostaErro('Dados inválidos.', 422);
  }

  let sb;
  try {
    sb = criarClientPrivilegiado();
  } catch {
    logger.error({ rota: ROTA, lojaSlug }, 'Client privilegiado indisponível para cotar Delivery');
    return respostaErro('O Delivery está temporariamente indisponível.', 503);
  }

  const { data: loja, error: erroLoja } = await sb
    .from('lojas')
    .select('id, recebendo_encomendas')
    .eq('slug', lojaSlug)
    .maybeSingle();
  if (erroLoja) {
    logger.error({ codigo: erroLoja.code, rota: ROTA, lojaSlug }, 'Falha ao resolver loja para cotar Delivery');
    return respostaErro('Não foi possível calcular a taxa de entrega. Tente novamente.', 503);
  }
  if (!loja) return respostaErro('Loja não encontrada.', 404);
  if (!loja.recebendo_encomendas) return respostaErro('A loja não está recebendo pedidos agora.', 409);

  let chaveIp: string;
  try {
    chaveIp = hashLimite(`delivery-quote:${ipDoCliente(request)}:${lojaSlug}`);
  } catch {
    logger.error({ rota: ROTA, lojaSlug }, 'Falha ao proteger limite da cotação Delivery');
    return respostaErro('O Delivery está temporariamente indisponível.', 503);
  }

  const { data: limite, error: erroLimite } = await sb.rpc('consumir_cota_delivery_quote', {
    p_chave_ip: chaveIp,
  });
  if (erroLimite) {
    logger.error({ codigo: erroLimite.code, rota: ROTA, lojaSlug }, 'Falha no limite da cotação Delivery');
    return respostaErro('Não foi possível calcular a taxa de entrega. Tente novamente.', 503);
  }
  if ((limite as { permitido?: boolean } | null)?.permitido !== true) {
    return respostaErro('Muitas tentativas. Aguarde alguns minutos e tente novamente.', 429);
  }

  const itensRpc = itensDeliveryParaRpc(itens);
  const [configuracaoResposta, subtotalResposta] = await Promise.all([
    sb
      .from('store_delivery_settings')
      .select('enabled, fee_mode, fixed_fee_cents, price_per_km_cents, free_delivery_threshold_cents, origin_latitude, origin_longitude, updated_at')
      .eq('store_id', loja.id)
      .maybeSingle(),
    sb.rpc('calcular_subtotal_delivery_v1', {
      p_loja_slug: lojaSlug,
      p_itens: itensRpc,
    }),
  ]);

  if (configuracaoResposta.error) {
    logger.error(
      { codigo: configuracaoResposta.error.code, rota: ROTA, lojaSlug },
      'Falha ao consultar configuração Delivery'
    );
    return respostaErro('Não foi possível calcular a taxa de entrega. Tente novamente.', 503);
  }
  const configuracaoDb = configuracaoResposta.data;
  if (!configuracaoDb?.enabled) return respostaErro('O Delivery está indisponível no momento.', 409);

  if (subtotalResposta.error) {
    return respostaErro('O carrinho mudou. Confira os itens e tente novamente.', 409);
  }
  const subtotalCentavos = Number(subtotalResposta.data);
  if (!Number.isInteger(subtotalCentavos) || subtotalCentavos < 0) {
    logger.error({ rota: ROTA, lojaSlug }, 'Subtotal inválido retornado ao cotar Delivery');
    return respostaErro('Não foi possível calcular a taxa de entrega. Tente novamente.', 503);
  }

  const configuracao: ConfiguracaoCalculoDelivery = {
    feeMode: configuracaoDb.fee_mode,
    fixedFeeCents: configuracaoDb.fixed_fee_cents,
    pricePerKmCents: configuracaoDb.price_per_km_cents,
    freeDeliveryThresholdCents: configuracaoDb.free_delivery_threshold_cents,
  };

  let resultadoCotacao;
  try {
    const origem = configuracaoDb.origin_latitude == null || configuracaoDb.origin_longitude == null
      ? null
      : {
          latitude: Number(configuracaoDb.origin_latitude),
          longitude: Number(configuracaoDb.origin_longitude),
        };
    resultadoCotacao = await calcularCotacaoDelivery({
      endereco,
      configuracao,
      subtotalCentavos,
      origem,
      geocodificar: geocodificarEndereco,
      rotear: calcularDistanciaRota,
    });
  } catch (erro) {
    if (erro instanceof ErroGeoapify && erro.codigo === 'NAO_CONFIGURADO') {
      logger.error({ rota: ROTA, lojaSlug }, 'Geoapify não configurado para cotar Delivery');
      return respostaErro('O Delivery está temporariamente indisponível.', 503);
    }
    if (erro instanceof ErroGeoapify && erro.codigo === 'ENDERECO_NAO_ENCONTRADO') {
      return respostaErro('Não conseguimos localizar esse endereço. Confira os dados.', 422);
    }
    if (erro instanceof ErroGeoapify && erro.codigo === 'GEOCODE_INDISPONIVEL') {
      return respostaErro(
        'Não foi possível localizar esse endereço agora. Confira os dados e tente novamente.',
        503
      );
    }
    if (!(erro instanceof ErroGeoapify || erro instanceof ErroCalculoDelivery)) {
      logger.error({ rota: ROTA, lojaSlug }, 'Falha inesperada ao calcular taxa Delivery');
    }
    return respostaErro('Não foi possível calcular a taxa de entrega. Tente novamente.', 503);
  }

  const { destino, distanciaMetros, taxaEntregaCentavos } = resultadoCotacao;

  const { data: quote, error: erroQuote } = await sb
    .from('delivery_quotes')
    .insert({
      store_id: loja.id,
      postal_code: endereco.cep,
      street: endereco.rua,
      number: endereco.numero,
      neighborhood: endereco.bairro,
      city: endereco.cidade,
      state: endereco.uf,
      complement: endereco.complemento,
      latitude: destino.latitude,
      longitude: destino.longitude,
      distance_meters: distanciaMetros,
      delivery_fee_cents: taxaEntregaCentavos,
      items_subtotal_cents: subtotalCentavos,
      settings_updated_at: configuracaoDb.updated_at,
    })
    .select('id, expires_at')
    .single();
  if (erroQuote || !quote) {
    logger.error(
      { codigo: erroQuote?.code, rota: ROTA, lojaSlug },
      'Falha ao salvar cotação Delivery'
    );
    return respostaErro('Não foi possível calcular a taxa de entrega. Tente novamente.', 503);
  }

  return NextResponse.json({
    quoteId: quote.id,
    deliveryFeeCents: taxaEntregaCentavos,
    address: endereco,
    expiresAt: quote.expires_at,
  }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
