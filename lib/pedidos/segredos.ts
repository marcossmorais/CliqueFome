/**
 * Resolução dos segredos de servidor do checkout.
 *
 * Módulo sem dependência nenhuma de propósito: as regras de precedência e de
 * ponte são a parte que precisa de teste, e `servidor.ts` puxa o client do
 * Supabase e o logger junto.
 */

type Ambiente = Record<string, string | undefined>;

const TAMANHO_MINIMO = 24;

function limpo(valor: string | undefined) {
  const texto = valor?.trim();
  return texto ? texto : undefined;
}

/**
 * `SUPABASE_SECRET_KEY` é o nome novo, alinhado ao modelo de chaves atual do
 * Supabase (`sb_secret_…`, revogável individualmente).
 * `SUPABASE_SERVICE_ROLE_KEY` fica aceito como ponte enquanto os ambientes não
 * são renomeados — sem isso, publicar a renomeação derrubaria o checkout no
 * ar. Remover a ponte quando o nome novo estiver na Vercel e no CI.
 */
export function resolverChaveSupabase(env: Ambiente) {
  const chave = limpo(env.SUPABASE_SECRET_KEY) || limpo(env.SUPABASE_SERVICE_ROLE_KEY);
  if (!chave) throw new Error('SUPABASE_SECRET_KEY_NAO_CONFIGURADA');
  return chave;
}

export type SegredoDeLimite = { segredo: string; fonte: 'dedicado' | 'legado' };

/**
 * Segredo do HMAC que anonimiza IP e telefone nos baldes de rate limit.
 *
 * Era a própria chave do Supabase. Duas funções sem relação na mesma
 * credencial: rotacionar a chave do banco zerava todos os limites, e o
 * segredo de hash herdava o alcance de uma credencial que ignora RLS.
 *
 * A ponte para a chave do Supabase continua aqui para não quebrar o checkout
 * enquanto `RATE_LIMIT_HMAC_SECRET` não estiver publicada — quem chama avisa
 * no log quando ela é usada. Trocar o segredo só reinicia os baldes, que são
 * por janela de tempo e expiram sozinhos.
 */
export function resolverSegredoDeLimite(env: Ambiente): SegredoDeLimite {
  const dedicado = limpo(env.RATE_LIMIT_HMAC_SECRET);
  if (dedicado && dedicado.length >= TAMANHO_MINIMO) {
    return { segredo: dedicado, fonte: 'dedicado' };
  }

  const legado = limpo(env.SUPABASE_SECRET_KEY) || limpo(env.SUPABASE_SERVICE_ROLE_KEY);
  if (!legado || legado.length < TAMANHO_MINIMO) {
    throw new Error('SEGREDO_CHECKOUT_NAO_CONFIGURADO');
  }
  return { segredo: legado, fonte: 'legado' };
}
