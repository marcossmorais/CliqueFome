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
      throw new ErroApiDelivery('Muitas gravações em pouco tempo. Aguarde alguns minutos.', 429);
    }

    const corpo = objeto(await lerJson(request, 8_000));

    // Endereço e taxas são salvos por botões diferentes na tela, e cada um
    // grava só as suas colunas. Antes um PUT único regravava tudo: mexer na
    // taxa mandava a origem pro Geoapify de novo, e uma falha de
    // geocodificação derrubava junto a gravação da taxa.
    const escopo = corpo.escopo;
    if (escopo !== 'endereco' && escopo !== 'taxas') {
      throw new ErroApiDelivery('Escopo de gravação inválido.');
    }

    let campos: Record<string, unknown>;
    if (escopo === 'endereco') {
      const origem = validarEnderecoDelivery(corpo.origem);
      // O Geoapify só é chamado aqui — salvar taxa não geocodifica nada.
      const coordenadas = await geocodificarEndereco(origem);
      campos = {
        origin_postal_code: origem.cep,
        origin_street: origem.rua,
        origin_number: origem.numero,
        origin_neighborhood: origem.bairro,
        origin_city: origem.cidade,
        origin_state: origem.uf,
        origin_latitude: coordenadas.latitude,
        origin_longitude: coordenadas.longitude,
      };
    } else {
      const feeMode = corpo.feeMode;
      if (feeMode !== 'FIXED' && feeMode !== 'PER_KM') {
        throw new ErroApiDelivery('Selecione um tipo de taxa.');
      }
      campos = {
        enabled: booleano(corpo.enabled, 'Ativação de entregas'),
        fee_mode: feeMode,
        // As duas colunas vão sempre juntas: a checagem
        // store_delivery_settings_single_fee_check exige que a do modo não
        // escolhido fique nula.
        fixed_fee_cents:
          feeMode === 'FIXED' ? inteiroNaoNegativo(corpo.fixedFeeCents, 'Taxa fixa') : null,
        price_per_km_cents:
          feeMode === 'PER_KM'
            ? inteiroNaoNegativo(corpo.pricePerKmCents, 'Valor por quilômetro')
            : null,
        free_delivery_threshold_cents:
          corpo.freeDeliveryThresholdCents === null ||
          corpo.freeDeliveryThresholdCents === undefined
            ? null
            : inteiroNaoNegativo(corpo.freeDeliveryThresholdCents, 'Limite de entrega grátis'),
      };
    }

    // A tabela não aceita escrita direta de `authenticated`: somente este
    // endpoint, depois de resolver owner/admin, persiste as coordenadas que o
    // Geoapify calculou no servidor. A loja vem de `autorizarLojaAdministrativa`,
    // nunca de um store_id mandado pelo navegador.
    const sb = criarClientPrivilegiado();
    const { data, error } = await sb
      .from('store_delivery_settings')
      .upsert({ store_id: loja.id, ...campos }, { onConflict: 'store_id' })
      .select(`
        store_id, enabled, fee_mode, fixed_fee_cents, price_per_km_cents,
        free_delivery_threshold_cents, origin_postal_code, origin_street,
        origin_number, origin_neighborhood, origin_city, origin_state,
        origin_latitude, origin_longitude, created_at, updated_at
      `)
      .single();
    // O banco só aceita `enabled` com origem completa e taxa do modo
    // escolhido preenchidas. Sem esta tradução, ativar a entrega antes de
    // salvar o endereço devolvia um 500 com texto de constraint.
    if (error?.code === '23514' && error.message?.includes('enabled_complete')) {
      throw new ErroApiDelivery(
        'Salve o endereço de origem antes de ativar as entregas.',
        409
      );
    }
    if (error || !data) throw error || new Error('CONFIGURACAO_NAO_RETORNADA');

    logger.info(
      { rota: ROTA, lojaId: loja.id, userId, escopo },
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
