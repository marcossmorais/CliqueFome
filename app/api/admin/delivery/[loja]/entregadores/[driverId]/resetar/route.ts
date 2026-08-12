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
import { consumirLimitePersistente } from '@/lib/delivery/operacao-rate-limit';
import { resetarSenhaEntregador, validarSenhaInicial } from '@/lib/delivery/driver-servidor';

export const runtime = 'nodejs';

const ROTA = '/api/admin/delivery/[loja]/entregadores/[driverId]/resetar';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ loja: string; driverId: string }> }
) {
  try {
    const { loja: slug, driverId: idBruto } = await params;
    const driverId = uuid(idBruto, 'Entregador');
    const { loja, userId } = await autorizarLojaAdministrativa(slug);
    const limite = await consumirLimitePersistente(
      `driver-reset:${userId}:${loja.id}`,
      10,
      15 * 60_000
    );
    if (!limite.permitido) {
      throw new ErroApiDelivery('Muitos resets em pouco tempo. Aguarde alguns minutos.', 429);
    }

    const corpo = objeto(await lerJson(request, 1_000));
    const password = validarSenhaInicial(corpo.password);
    const sb = await criarClientServidor();
    const { data: entregador, error } = await sb
      .from('delivery_drivers')
      .select('id, auth_user_id')
      .eq('store_id', loja.id)
      .eq('id', driverId)
      .maybeSingle();
    if (error) throw error;
    if (!entregador) throw new ErroApiDelivery('Entregador não encontrado.', 404);

    await resetarSenhaEntregador(entregador.auth_user_id, password);
    logger.info(
      { rota: ROTA, lojaId: loja.id, userId, entregadorId: driverId },
      'Acesso do entregador resetado'
    );
    return respostaJson({ ok: true });
  } catch (erro) {
    if (!(erro instanceof ErroApiDelivery)) {
      logger.error({ rota: ROTA }, 'Falha ao resetar acesso do entregador');
    }
    return respostaErroApi(erro, 'Não foi possível resetar o acesso.');
  }
}
