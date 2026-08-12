import { NextRequest } from 'next/server';
import { logger } from '@/lib/observabilidade/logger';
import {
  autorizarEntregador,
  ErroApiDelivery,
  lerJson,
  objeto,
  respostaErroApi,
  respostaJson,
  uuid,
} from '@/lib/delivery/operacao-api';
import { consumirLimite } from '@/lib/delivery/operacao-rate-limit';

export const runtime = 'nodejs';

const ROTA = '/api/entregador/entregas/[deliveryId]/iniciar';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ deliveryId: string }> }
) {
  try {
    objeto(await lerJson(request, 500));
    const { deliveryId: idBruto } = await params;
    const deliveryId = uuid(idBruto, 'Entrega');
    const { sb, userId, entregador } = await autorizarEntregador();
    const limite = consumirLimite(`driver-start:${userId}`, 20, 60_000);
    if (!limite.permitido) throw new ErroApiDelivery('Aguarde alguns instantes e tente novamente.', 429);

    const { data, error } = await sb.rpc('iniciar_delivery_v1', { p_delivery_id: deliveryId });
    if (error) {
      const mensagem = error.message || '';
      if (mensagem.includes('CONFLITO') || mensagem.includes('INVALID_STATUS')) {
        throw new ErroApiDelivery('Esta entrega mudou. Atualize a tela.', 409, 'DELIVERY_CHANGED');
      }
      if (
        mensagem.includes('FORBIDDEN') ||
        mensagem.includes('NOT_ASSIGNED') ||
        mensagem.includes('Entrega nao encontrada')
      ) {
        throw new ErroApiDelivery('Entrega não encontrada.', 404);
      }
      throw error;
    }

    logger.info(
      { rota: ROTA, deliveryId, entregadorId: entregador.id },
      'Entrega iniciada pelo entregador'
    );
    const resultado = data as { status?: string } | null;
    return respostaJson({ status: resultado?.status ?? 'OUT_FOR_DELIVERY' });
  } catch (erro) {
    if (!(erro instanceof ErroApiDelivery)) {
      logger.error({ rota: ROTA }, 'Falha ao iniciar entrega');
    }
    return respostaErroApi(erro, 'Não foi possível iniciar a entrega.');
  }
}
