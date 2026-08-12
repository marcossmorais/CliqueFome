import { NextRequest } from 'next/server';
import { logger } from '@/lib/observabilidade/logger';
import {
  autorizarLojaAdministrativa,
  ErroApiDelivery,
  lerJson,
  objeto,
  respostaErroApi,
  respostaJson,
  textoObrigatorio,
} from '@/lib/delivery/operacao-api';
import { consumirLimitePersistente } from '@/lib/delivery/operacao-rate-limit';
import {
  criarEntregadorComAuth,
  validarEmail,
  validarSenhaInicial,
} from '@/lib/delivery/driver-servidor';
import { sanitizarTelefone } from '@/lib/delivery/tipos-operacao';

export const runtime = 'nodejs';

const ROTA = '/api/admin/delivery/[loja]/entregadores';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ loja: string }> }
) {
  try {
    const { loja: slug } = await params;
    const { loja, userId } = await autorizarLojaAdministrativa(slug);
    const limite = await consumirLimitePersistente(
      `driver-create:${userId}:${loja.id}`,
      10,
      15 * 60_000
    );
    if (!limite.permitido) {
      throw new ErroApiDelivery('Muitos cadastros em pouco tempo. Aguarde alguns minutos.', 429);
    }

    const corpo = objeto(await lerJson(request, 4_000));
    const name = textoObrigatorio(corpo.name, 'Nome', 2, 100);
    const phone = sanitizarTelefone(textoObrigatorio(corpo.phone, 'Telefone', 10, 25));
    if (phone.length < 10 || phone.length > 13) throw new ErroApiDelivery('Telefone inválido.');
    const email = validarEmail(corpo.email);
    const password = validarSenhaInicial(corpo.password);

    const entregador = await criarEntregadorComAuth({
      storeId: loja.id,
      name,
      phone,
      email,
      password,
    });

    logger.info(
      { rota: ROTA, lojaId: loja.id, userId, entregadorId: entregador.id },
      'Entregador cadastrado'
    );
    return respostaJson({ entregador }, 201);
  } catch (erro) {
    if (!(erro instanceof ErroApiDelivery)) {
      logger.error({ rota: ROTA }, 'Falha ao cadastrar entregador');
    }
    return respostaErroApi(erro, 'Não foi possível cadastrar o entregador.');
  }
}
