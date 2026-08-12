/**
 * Resolução dos segredos de servidor do checkout.
 *
 * Módulo sem dependência nenhuma de propósito: as regras são a parte que
 * precisa de teste, e `servidor.ts` puxa o client do Supabase e o logger
 * junto.
 */

type Ambiente = Record<string, string | undefined>;

const TAMANHO_MINIMO = 24;

function limpo(valor: string | undefined) {
  const texto = valor?.trim();
  return texto ? texto : undefined;
}

/**
 * Chave secreta do Supabase.
 *
 * O nome reflete o modelo de chaves atual (`sb_secret_…`, revogável
 * individualmente). `SUPABASE_SERVICE_ROLE_KEY` foi aceito como ponte durante
 * a migração e não é mais lido: produção, local e CI já usam o nome novo.
 */
export function resolverChaveSupabase(env: Ambiente) {
  const chave = limpo(env.SUPABASE_SECRET_KEY);
  if (!chave) throw new Error('SUPABASE_SECRET_KEY_NAO_CONFIGURADA');
  return chave;
}

/**
 * Segredo do HMAC que anonimiza IP e telefone nos baldes de rate limit.
 *
 * Variável própria, e não mais a chave do Supabase: eram duas funções sem
 * relação na mesma credencial — rotacionar a chave do banco zerava todos os
 * limites, e o segredo de hash herdava o alcance de uma credencial que ignora
 * RLS. A ponte para a chave do Supabase também já foi removida.
 *
 * Falta a variável, ou ela é curta demais, o checkout para: aceitar um
 * segredo fraco em silêncio tornaria os hashes de IP e telefone reversíveis
 * por dicionário, que é exatamente o que o HMAC existe para impedir.
 */
export function resolverSegredoDeLimite(env: Ambiente) {
  const segredo = limpo(env.RATE_LIMIT_HMAC_SECRET);
  if (!segredo || segredo.length < TAMANHO_MINIMO) {
    throw new Error('RATE_LIMIT_HMAC_SECRET_NAO_CONFIGURADO');
  }
  return segredo;
}
