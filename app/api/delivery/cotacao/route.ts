import { NextRequest, NextResponse } from 'next/server';
import { criarTokenCotacao } from '@/lib/delivery/cotacao';
import { calcularDistanciaDeRota, ErroGeoapify, geocodificarParaEndereco } from '@/lib/delivery/geoapify';
import { criarClientPrivilegiado, hashEndereco, hashLimite } from '@/lib/delivery/servidor';
import { textoParaGeocodificar } from '@/lib/delivery/endereco';
import {
  fecharCotacaoPorKm,
  planejarCotacao,
  MENSAGEM_INDISPONIVEL,
  type ConfiguracaoEntrega,
  type PlanoCotacao,
  type TaxaEspecifica,
} from '@/lib/delivery/taxas';
import {
  enderecoEmLinha,
  enderecoEstruturadoValido,
  normalizarTexto,
  type EnderecoEstruturado,
} from '@/lib/delivery/tipos';
import { logger } from '@/lib/observabilidade/logger';

export const runtime = 'nodejs';

const ROTA = '/api/delivery/cotacao';
const VALIDADE_MS = 15 * 60_000;

type CacheRota = { distanciaMetros: number; enderecoFormatado: string; expira: number };
const globalCache = globalThis as typeof globalThis & { __cfDeliveryCache?: Map<string, CacheRota> };
const cacheRotas = globalCache.__cfDeliveryCache ?? new Map<string, CacheRota>();
globalCache.__cfDeliveryCache = cacheRotas;

function erro(mensagem: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ erro: mensagem, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function limparEndereco(valor: unknown): EnderecoEstruturado {
  const e = (valor && typeof valor === 'object' ? valor : {}) as EnderecoEstruturado;
  return {
    cep: String(e.cep || '').replace(/\D/g, ''), logradouro: String(e.logradouro || '').trim(),
    numero: String(e.numero || '').trim(), bairro: String(e.bairro || '').trim(),
    cidade: String(e.cidade || '').trim(), uf: String(e.uf || '').trim().toUpperCase(),
    complemento: String(e.complemento || '').trim(), referencia: String(e.referencia || '').trim(),
  };
}

type LinhaConfig = {
  store_id: string;
  enabled: boolean;
  calculation_type: 'FIXED' | 'PER_KM';
  fixed_fee_cents: number;
  price_per_km_cents: number;
  max_fee_cents: number;
  max_distance_meters: number;
  origin_lat: number | null;
  origin_lng: number | null;
  updated_at: string;
  lojas: { delivery_ativo: boolean; recebendo_encomendas: boolean } | null;
};

export async function POST(request: NextRequest) {
  let corpo: { lojaSlug?: unknown; endereco?: unknown };
  try {
    corpo = (await request.json()) as typeof corpo;
  } catch (falha) {
    logger.error({ err: falha, rota: ROTA }, 'JSON malformado no corpo da cotação');
    return erro('Dados inválidos.', 400);
  }

  const slug = typeof corpo.lojaSlug === 'string' ? corpo.lojaSlug.trim() : '';
  const endereco = limparEndereco(corpo.endereco);
  if (!/^[a-z0-9-]{1,80}$/.test(slug) || !enderecoEstruturadoValido(endereco)) {
    return erro('Confirme o endereço de entrega, incluindo o número.', 400);
  }

  let sb;
  try {
    sb = criarClientPrivilegiado();
  } catch (falha) {
    logger.error({ err: falha, rota: ROTA, lojaSlug: slug }, 'Falha ao criar client privilegiado do Supabase');
    return erro('Cálculo de entrega ainda não configurado.', 503);
  }

  const { data, error } = await sb
    .from('store_delivery_settings')
    .select(
      'store_id,enabled,calculation_type,fixed_fee_cents,price_per_km_cents,max_fee_cents,max_distance_meters,origin_lat,origin_lng,updated_at,lojas!inner(slug,delivery_ativo,recebendo_encomendas)',
    )
    .eq('lojas.slug', slug)
    .maybeSingle();
  if (error) {
    logger.error({ err: error, rota: ROTA, lojaSlug: slug }, 'Falha ao ler configuração de entrega');
    return erro('Não foi possível calcular a entrega agora. Tente novamente.', 503);
  }
  if (!data) return erro('Entrega não configurada para esta loja.', 404);
  const linha = data as unknown as LinhaConfig;

  // A tela esconder a opção é só UX. O estado operacional é conferido de novo
  // aqui porque o cliente pode ter deixado o checkout aberto enquanto a loja
  // fechava — e porque um POST manual não passa pela tela nenhuma.
  if (!linha.lojas?.recebendo_encomendas) return erro('A loja está fechada e não está recebendo pedidos agora.', 409);
  if (!linha.lojas.delivery_ativo) return erro('A loja não está aceitando entregas agora.', 409);

  const config: ConfiguracaoEntrega = {
    enabled: linha.enabled,
    calculationType: linha.calculation_type,
    fixedFeeCents: Number(linha.fixed_fee_cents),
    pricePerKmCents: Number(linha.price_per_km_cents),
    maxFeeCents: Number(linha.max_fee_cents),
    maxDistanceMeters: Number(linha.max_distance_meters),
    origem: linha.origin_lat != null && linha.origin_lng != null
      ? { latitude: Number(linha.origin_lat), longitude: Number(linha.origin_lng) }
      : null,
    atualizadoEm: linha.updated_at,
  };

  const { data: linhasOverride } = await sb
    .from('delivery_fee_overrides')
    .select('id,scope,city_normalized,neighborhood_normalized,fee_cents')
    .eq('store_id', linha.store_id)
    .eq('active', true);

  const taxasEspecificas: TaxaEspecifica[] = (linhasOverride ?? []).map((o) => {
    const linhaO = o as unknown as {
      id: string; scope: 'CITY' | 'NEIGHBORHOOD';
      city_normalized: string; neighborhood_normalized: string | null; fee_cents: number;
    };
    return {
      id: linhaO.id,
      scope: linhaO.scope,
      cityNormalized: linhaO.city_normalized,
      neighborhoodNormalized: linhaO.neighborhood_normalized,
      feeCents: Number(linhaO.fee_cents),
    };
  });

  const destino = {
    cityNormalized: normalizarTexto(endereco.cidade),
    neighborhoodNormalized: normalizarTexto(endereco.bairro),
  };

  // Decide ANTES de qualquer request externa. Se sai daqui como 'pronto',
  // nenhum crédito de rota é gasto.
  let plano: PlanoCotacao = planejarCotacao({ config, taxasEspecificas, destino });

  const enderecoCompleto = enderecoEmLinha(endereco);
  let enderecoFormatado = enderecoCompleto;
  let distanciaMetros: number | null = null;

  const precisaRota = plano.tipo === 'precisa_rota';
  const chaveCache = hashEndereco(`${linha.store_id}|${normalizarTexto(enderecoCompleto)}`);
  const cache = cacheRotas.get(chaveCache);
  const cacheValido = !!cache && cache.expira > Date.now();

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconhecido';
  const { data: limite, error: erroLimite } = await sb.rpc('consumir_cota_delivery', {
    p_chave: hashLimite(ip),
    p_usa_rota: precisaRota && !cacheValido,
  });
  const l = limite as { permitido?: boolean; motivo?: string } | null;
  if (erroLimite || l?.permitido !== true) {
    return erro(
      l?.motivo === 'LIMITE_DIARIO'
        ? 'Limite diário de cálculos de rota atingido. Confirme a taxa pelo WhatsApp.'
        : 'Muitas tentativas. Aguarde um minuto.',
      429,
    );
  }

  if (plano.tipo === 'precisa_rota') {
    try {
      if (cacheValido && cache) {
        distanciaMetros = cache.distanciaMetros;
        enderecoFormatado = cache.enderecoFormatado;
      } else {
        // A ÚNICA geocodificação do endereço do cliente, feita depois de ele
        // ter informado o número. A loja não é geocodificada aqui: a origem
        // vem salva da configuração.
        const geo = await geocodificarParaEndereco(textoParaGeocodificar({
          formattedAddress: '', street: endereco.logradouro, number: endereco.numero,
          neighborhood: endereco.bairro, city: endereco.cidade, state: endereco.uf,
          postalCode: endereco.cep, latitude: null, longitude: null,
        }));
        if (geo.latitude == null || geo.longitude == null) throw new ErroGeoapify('ENDERECO_NAO_ENCONTRADO');

        distanciaMetros = Math.round(
          await calcularDistanciaDeRota(config.origem!, { latitude: geo.latitude, longitude: geo.longitude }),
        );
        enderecoFormatado = geo.formattedAddress || enderecoCompleto;
        if (cacheRotas.size >= 500) cacheRotas.delete(cacheRotas.keys().next().value as string);
        cacheRotas.set(chaveCache, { distanciaMetros, enderecoFormatado, expira: Date.now() + 10 * 60_000 });
      }

      plano = fecharCotacaoPorKm({ config, distanceMeters: distanciaMetros });
    } catch (falha) {
      logger.error({ err: falha, rota: ROTA, lojaSlug: slug }, 'Falha ao geocodificar ou calcular rota de entrega');
      // NUNCA cair pra taxa zero por falha externa. Sem rota não há cotação,
      // e a tela oferece tentar de novo ou trocar pra retirada.
      const externo = falha instanceof ErroGeoapify
        && ['CHAVE_AUSENTE', 'CHAVE_RECUSADA', 'LIMITE_ATINGIDO', 'SERVICO_INDISPONIVEL'].includes(falha.codigo);
      return erro(
        externo
          ? 'Não conseguimos calcular a entrega no momento. Tente novamente ou escolha retirada.'
          : 'Não encontramos uma rota até esse endereço. Confira o número e o bairro.',
        externo ? 503 : 422,
        { podeTentarNovamente: true },
      );
    }
  }

  if (plano.tipo !== 'pronto') {
    const motivo = plano.tipo === 'indisponivel' ? plano.motivo : 'DELIVERY_DESLIGADO';
    return erro(MENSAGEM_INDISPONIVEL[motivo], motivo === 'DELIVERY_DESLIGADO' ? 409 : 422);
  }

  const exp = Date.now() + VALIDADE_MS;
  try {
    const token = criarTokenCotacao({
      lojaId: linha.store_id,
      enderecoHash: hashEndereco(normalizarTexto(enderecoCompleto)),
      taxaCentavos: plano.feeCents,
      distanciaMetros,
      regra: plano.regra,
      overrideId: plano.overrideId,
      configVersao: config.atualizadoEm,
      exp,
    });
    return NextResponse.json(
      {
        taxa: plano.feeCents / 100,
        taxaCents: plano.feeCents,
        distanciaKm: distanciaMetros == null ? null : Math.round((distanciaMetros / 1000) * 10) / 10,
        distanciaMetros,
        regra: plano.regra,
        enderecoFormatado,
        expiraEm: new Date(exp).toISOString(),
        token,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (falha) {
    logger.error({ err: falha, rota: ROTA, lojaSlug: slug }, 'Falha ao assinar token de cotação');
    return erro('Assinatura de cotação não configurada.', 503);
  }
}
