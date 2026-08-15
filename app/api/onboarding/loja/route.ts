import { logger } from '@/lib/observabilidade/logger';
import { validarCategoria, validarNomeLoja, normalizarWhatsapp } from '@/lib/onboarding/dados';
import {
  autorizarCadastro,
  lerCorpo,
  limitarCadastro,
  respostaDeErro,
  respostaJson,
  salvarLojaDoCadastro,
} from '@/lib/onboarding/servidor';

export const runtime = 'nodejs';

const ROTA = '/api/onboarding/loja';

/**
 * Etapa 2 do cadastro: dados básicos da loja.
 *
 * Salva ao avançar, sem esperar o fim do onboarding — quem fecha a aba depois
 * daqui volta direto pro endereço. Os três campos são obrigatórios porque sem
 * eles a loja não abre: nome e categoria montam o cardápio, o WhatsApp é por
 * onde o pedido chega.
 *
 * O corpo não tem (nem pode ter) id de loja: a loja é a do usuário da sessão.
 */
export async function POST(request: Request) {
  try {
    const userId = await autorizarCadastro();
    await limitarCadastro(userId, 'loja', 20);

    const corpo = await lerCorpo(request);
    const nome = validarNomeLoja(corpo.nome);
    const categoria = validarCategoria(corpo.categoria);
    const whatsapp = normalizarWhatsapp(corpo.whatsapp);

    const loja = await salvarLojaDoCadastro(userId, { nome, categoria, whatsapp });

    logger.info({ rota: ROTA, lojaId: loja.id, userId }, 'Loja salva no cadastro');
    return respostaJson({ loja: { slug: loja.slug, nome: loja.nome }, etapa: 'ADDRESS' });
  } catch (erro) {
    return respostaDeErro(erro, 'Não foi possível salvar os dados da loja.', ROTA);
  }
}
