import { NextRequest } from 'next/server';
import { criarClientPrivilegiado } from '@/lib/pedidos/servidor';
import { logger } from '@/lib/observabilidade/logger';
import { validarEnderecoDelivery, ErroEnderecoDelivery } from '@/lib/delivery/endereco';
import { geocodificarEndereco, ErroGeoapify } from '@/lib/delivery/geoapify';
import {
  autorizarLojaAdministrativa,
  booleano,
  ErroApiDelivery,
  inteiroNaoNegativo,
  lerJson,
  objeto,
  respostaErroApi,
  respostaJson,
} from '@/lib/delivery/operacao-api';
import { consumirLimitePersistente } from '@/lib/delivery/operacao-rate-limit';

export const runtime = 'nodejs';

const ROTA = '/api/admin/delivery/[loja]/configuracao';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ loja: string }> }
) {
  try {
    const { loja: slug } = await params;
    const { loja, userId } = await autorizarLojaAdministrativa(slug);
    const limite = await consumirLimitePersistente(
      `delivery-settings:${userId}:${loja.id}`,
      15,
      15 * 60_000
    );
    if (!limite.permitido) {
      throw new ErroApiDelivery('Muitas tentativas de localização. Aguarde alguns minutos.', 429);
    }

    const corpo = objeto(await lerJson(request, 8_000));
    const enabled = booleano(corpo.enabled, 'Ativação de entregas');
    const feeMode = corpo.feeMode;
    if (feeMode !== 'FIXED' && feeMode !== 'PER_KM') {
      throw new ErroApiDelivery('Selecione um tipo de taxa.');
    }

    const fixedFeeCents =
      feeMode === 'FIXED' ? inteiroNaoNegativo(corpo.fixedFeeCents, 'Taxa fixa') : null;
    const pricePerKmCents =
      feeMode === 'PER_KM'
        ? inteiroNaoNegativo(corpo.pricePerKmCents, 'Valor por quilômetro')
        : null;
    const freeDeliveryThresholdCents =
      corpo.freeDeliveryThresholdCents === null || corpo.freeDeliveryThresholdCents === undefined
        ? null
        : inteiroNaoNegativo(corpo.freeDeliveryThresholdCents, 'Limite de entrega grátis');
    const origem = validarEnderecoDelivery(corpo.origem);

    // Uma única chamada: a origem é localizada somente quando o responsável
    // pressiona "Localizar e salvar". As coordenadas ficam persistidas e não
    // serão recalculadas a cada pedido.
    const coordenadas = await geocodificarEndereco(origem);
    // A tabela não aceita escrita direta de `authenticated`: somente este
    // endpoint, depois de resolver owner/admin, persiste as coordenadas que o
    // Geoapify calculou no servidor.
    const sb = criarClientPrivilegiado();
    const { data, error } = await sb
      .from('store_delivery_settings')
      .upsert(
        {
          store_id: loja.id,
          enabled,
          fee_mode: feeMode,
          fixed_fee_cents: fixedFeeCents,
          price_per_km_cents: pricePerKmCents,
          free_delivery_threshold_cents: freeDeliveryThresholdCents,
          origin_postal_code: origem.cep,
          origin_street: origem.rua,
          origin_number: origem.numero,
          origin_neighborhood: origem.bairro,
          origin_city: origem.cidade,
          origin_state: origem.uf,
          origin_latitude: coordenadas.latitude,
          origin_longitude: coordenadas.longitude,
        },
        { onConflict: 'store_id' }
      )
      .select(`
        store_id, enabled, fee_mode, fixed_fee_cents, price_per_km_cents,
        free_delivery_threshold_cents, origin_postal_code, origin_street,
        origin_number, origin_neighborhood, origin_city, origin_state,
        origin_latitude, origin_longitude, created_at, updated_at
      `)
      .single();
    if (error || !data) throw error || new Error('CONFIGURACAO_NAO_RETORNADA');

    logger.info(
      { rota: ROTA, lojaId: loja.id, userId, feeMode, enabled },
      'Configuração de delivery salva'
    );
    return respostaJson({ configuracao: data });
  } catch (erro) {
    if (erro instanceof ErroEnderecoDelivery) {
      return respostaJson({ erro: 'Preencha corretamente o endereço de origem.' }, 422);
    }
    if (erro instanceof ErroGeoapify) {
      logger.warn({ rota: ROTA, codigo: erro.codigo }, 'Falha segura ao localizar origem do Delivery');
      const status = erro.codigo === 'NAO_CONFIGURADO' ? 503 : 422;
      return respostaJson(
        {
          erro:
            erro.codigo === 'NAO_CONFIGURADO'
              ? 'O serviço de localização ainda não está configurado.'
              : 'Não conseguimos localizar esse endereço. Confira os dados.',
        },
        status
      );
    }
    if (!(erro instanceof ErroApiDelivery)) {
      logger.error({ rota: ROTA }, 'Falha ao salvar configuração de delivery');
    }
    return respostaErroApi(erro, 'Não foi possível salvar a configuração.');
  }
}
