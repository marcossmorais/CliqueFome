import { NextRequest } from 'next/server';
import { criarClientPrivilegiado } from '@/lib/pedidos/servidor';
import { logger } from '@/lib/observabilidade/logger';
import {
  autorizarLojaAdministrativa,
  booleano,
  ErroApiDelivery,
  lerJson,
  objeto,
  respostaErroApi,
  respostaJson,
  uuid,
} from '@/lib/delivery/operacao-api';

export const runtime = 'nodejs';

const ROTA = '/api/admin/delivery/[loja]/entregadores/[driverId]';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ loja: string; driverId: string }> }
) {
  try {
    const { loja: slug, driverId: idBruto } = await params;
    const driverId = uuid(idBruto, 'Entregador');
    const { loja, userId } = await autorizarLojaAdministrativa(slug);
    const corpo = objeto(await lerJson(request, 1_000));
    const active = booleano(corpo.active, 'Status do entregador');
    // authenticated tem apenas SELECT nesta tabela. A alteração passa pelo
    // backend já autorizado acima e usa service_role somente no servidor,
    // sempre com store_id + id; o trigger também impede desativar em rota.
    const sb = criarClientPrivilegiado();

    if (!active) {
      const { data: ativa, error: erroAtiva } = await sb
        .from('deliveries')
        .select('id')
        .eq('store_id', loja.id)
        .eq('driver_id', driverId)
        .in('status', ['ASSIGNED', 'OUT_FOR_DELIVERY'])
        .limit(1)
        .maybeSingle();
      if (erroAtiva) throw erroAtiva;
      if (ativa) throw new ErroApiDelivery('Conclua a entrega atual antes de desativar.', 409);
    }

    const { data: entregador, error } = await sb
      .from('delivery_drivers')
      .update({ active, available: false })
      .eq('store_id', loja.id)
      .eq('id', driverId)
      .select('id, store_id, name, phone, active, available, created_at, updated_at')
      .maybeSingle();
    if (error?.message?.includes('entrega ativa')) {
      throw new ErroApiDelivery('Conclua a entrega atual antes de desativar.', 409);
    }
    if (error) throw error;
    if (!entregador) throw new ErroApiDelivery('Entregador não encontrado.', 404);

    logger.info(
      { rota: ROTA, lojaId: loja.id, userId, entregadorId: driverId, active },
      'Status do cadastro de entregador alterado'
    );
    return respostaJson({ entregador });
  } catch (erro) {
    if (!(erro instanceof ErroApiDelivery)) {
      logger.error({ rota: ROTA }, 'Falha ao alterar cadastro do entregador');
    }
    return respostaErroApi(erro, 'Não foi possível alterar o entregador.');
  }
}
