import { NextRequest } from 'next/server';
import { criarClientServidor } from '@/lib/supabase/server';
import { logger } from '@/lib/observabilidade/logger';
import {
  autorizarLojaAdministrativa,
  ErroApiDelivery,
  lerJson,
  objeto,
  respostaErroApi,
  respostaJson,
  uuid,
} from '@/lib/delivery/operacao-api';
import { consumirLimite } from '@/lib/delivery/operacao-rate-limit';

export const runtime = 'nodejs';

const ROTA = '/api/admin/delivery/[loja]/entregas/[deliveryId]/atribuir';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ loja: string; deliveryId: string }> }
) {
  try {
    const { loja: slug, deliveryId: idBruto } = await params;
    const deliveryId = uuid(idBruto, 'Entrega');
    const { loja, userId } = await autorizarLojaAdministrativa(slug);
    const limite = consumirLimite(`delivery-assign:${userId}:${loja.id}`, 30, 60_000);
    if (!limite.permitido) throw new ErroApiDelivery('Aguarde alguns instantes e tente novamente.', 429);
    const corpo = objeto(await lerJson(request, 1_000));
    const driverId = uuid(corpo.driverId, 'Entregador');

    // A RPC resolve a loja por auth.uid(), confere delivery e driver do mesmo
    // tenant, disponibilidade e status antes do compare-and-set atômico.
    const sb = await criarClientServidor();
    const { data, error } = await sb.rpc('atribuir_delivery_v1', {
      p_delivery_id: deliveryId,
      p_driver_id: driverId,
    });
    if (error) {
      const mensagem = error.message || '';
      if (mensagem.includes('DRIVER_UNAVAILABLE') || mensagem.includes('Entregador indisponivel')) {
        throw new ErroApiDelivery('Este entregador não está mais disponível.', 409);
      }
      if (mensagem.includes('CONFLITO') || mensagem.includes('INVALID_STATUS')) {
        throw new ErroApiDelivery('Esta entrega mudou. Atualize a tela.', 409, 'DELIVERY_CHANGED');
      }
      if (
        mensagem.includes('FORBIDDEN') ||
        mensagem.includes('NOT_FOUND') ||
        mensagem.includes('Entrega nao encontrada')
      ) {
        throw new ErroApiDelivery('Entrega ou entregador não encontrado.', 404);
      }
      throw error;
    }

    logger.info(
      { rota: ROTA, lojaId: loja.id, userId, deliveryId, entregadorId: driverId },
      'Entregador atribuído à entrega'
    );
    const resultado = data as { status?: string } | null;
    return respostaJson({ status: resultado?.status ?? 'ASSIGNED', driverId });
  } catch (erro) {
    if (!(erro instanceof ErroApiDelivery)) {
      logger.error({ rota: ROTA }, 'Falha ao atribuir entregador');
    }
    return respostaErroApi(erro, 'Não foi possível atribuir o entregador.');
  }
}
