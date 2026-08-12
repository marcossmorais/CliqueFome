import { NextRequest } from 'next/server';
import { logger } from '@/lib/observabilidade/logger';
import {
  autorizarEntregador,
  booleano,
  ErroApiDelivery,
  lerJson,
  objeto,
  respostaErroApi,
  respostaJson,
} from '@/lib/delivery/operacao-api';
import { consumirLimite } from '@/lib/delivery/operacao-rate-limit';

export const runtime = 'nodejs';

const ROTA = '/api/entregador/disponibilidade';

export async function POST(request: NextRequest) {
  try {
    const { sb, userId, entregador } = await autorizarEntregador();
    const limite = consumirLimite(`driver-availability:${userId}`, 30, 60_000);
    if (!limite.permitido) throw new ErroApiDelivery('Aguarde alguns instantes e tente novamente.', 429);

    const corpo = objeto(await lerJson(request, 1_000));
    const available = booleano(corpo.available, 'Disponibilidade');
    const { data, error } = await sb.rpc('definir_disponibilidade_driver_v1', {
      p_available: available,
    });
    if (error) {
      if (error.message?.includes('ACTIVE_DELIVERY')) {
        throw new ErroApiDelivery('A disponibilidade não pode ser alterada durante uma entrega.', 409);
      }
      throw error;
    }

    logger.info(
      { rota: ROTA, entregadorId: entregador.id, disponivel: available },
      'Disponibilidade do entregador alterada'
    );
    const resultado = data as { available?: boolean } | null;
    return respostaJson({ available: resultado?.available ?? available });
  } catch (erro) {
    if (!(erro instanceof ErroApiDelivery)) {
      logger.error({ rota: ROTA }, 'Falha ao alterar disponibilidade do entregador');
    }
    return respostaErroApi(erro, 'Não foi possível alterar a disponibilidade.');
  }
}
