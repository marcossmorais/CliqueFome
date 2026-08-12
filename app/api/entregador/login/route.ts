import { NextRequest } from 'next/server';
import { criarClientServidor } from '@/lib/supabase/server';
import { logger } from '@/lib/observabilidade/logger';
import {
  ErroApiDelivery,
  lerJson,
  objeto,
  respostaErroApi,
  respostaJson,
} from '@/lib/delivery/operacao-api';
import { consumirLimitePersistente, ipDaRequisicao } from '@/lib/delivery/operacao-rate-limit';
import { validarEmail, validarSenhaInicial } from '@/lib/delivery/driver-servidor';

export const runtime = 'nodejs';

const ROTA = '/api/entregador/login';

export async function POST(request: NextRequest) {
  try {
    const corpo = objeto(await lerJson(request, 2_000));
    const email = validarEmail(corpo.email);
    const senha = validarSenhaInicial(corpo.senha);

    // IP primeiro: depois de bloqueado, variar emails não cria uma chave nova
    // no limitador persistente a cada tentativa.
    const porIp = await consumirLimitePersistente(
      `driver-login-ip:${ipDaRequisicao(request)}`,
      10,
      15 * 60_000
    );
    if (!porIp.permitido) {
      return respostaJson(
        { erro: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' },
        429,
        { 'Retry-After': String(porIp.tentarEmSegundos) }
      );
    }

    const porConta = await consumirLimitePersistente(
      `driver-login-conta:${email}`,
      10,
      15 * 60_000
    );
    if (!porConta.permitido) {
      return respostaJson(
        { erro: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' },
        429,
        { 'Retry-After': String(porConta.tentarEmSegundos) }
      );
    }

    const sb = await criarClientServidor();
    const { data: autenticacao, error: erroLogin } = await sb.auth.signInWithPassword({
      email,
      password: senha,
    });
    if (erroLogin || !autenticacao.user) {
      throw new ErroApiDelivery('Usuário ou senha incorretos.', 401);
    }

    const { data: entregador, error: erroEntregador } = await sb
      .from('delivery_drivers')
      .select('id, active')
      .eq('auth_user_id', autenticacao.user.id)
      .maybeSingle();

    if (erroEntregador || !entregador?.active) {
      await sb.auth.signOut();
      throw new ErroApiDelivery('Usuário ou senha incorretos.', 401);
    }

    return respostaJson({ ok: true });
  } catch (erro) {
    if (!(erro instanceof ErroApiDelivery)) {
      logger.error({ rota: ROTA }, 'Falha inesperada no login do entregador');
    }
    return respostaErroApi(erro, 'Não foi possível entrar agora. Tente novamente.');
  }
}
