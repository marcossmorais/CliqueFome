/**
 * Traduz a recusa do Supabase Auth na mensagem que o lojista vê ao cadastrar
 * um entregador.
 *
 * Módulo sem dependência nenhuma de propósito: o mapeamento é a parte que
 * precisa de teste, e `driver-servidor.ts` não é importável fora do servidor.
 */

export type RecusaDeAcesso = { mensagem: string; status: number };

/**
 * Enumerar contas é risco de endpoint público. Quem chega aqui já passou por
 * `autorizarLojaAdministrativa` — é o dono da loja, autenticado e com limite
 * de 10 tentativas por 15 min —, então esconder dele o motivo não protege
 * ninguém e o deixa sem saída. Era o que travava o cadastro de entregador:
 * `email_exists` virava "Não foi possível criar o acesso", sem log nenhum.
 */
export function recusaDeAcessoDoEntregador(
  erroAuth: { code?: string; status?: number } | null | undefined
): RecusaDeAcesso {
  if (erroAuth?.code === 'email_exists') {
    return {
      mensagem: 'Este e-mail já tem acesso cadastrado na plataforma. Use outro e-mail.',
      status: 409,
    };
  }
  if (erroAuth?.status === 429 || erroAuth?.code === 'over_request_rate_limit') {
    return {
      mensagem: 'O Supabase recusou por excesso de tentativas. Aguarde alguns minutos.',
      status: 429,
    };
  }
  if (erroAuth?.code === 'weak_password') {
    return { mensagem: 'Escolha uma senha mais forte para o entregador.', status: 422 };
  }
  return { mensagem: 'Não foi possível criar o acesso do entregador.', status: 409 };
}
