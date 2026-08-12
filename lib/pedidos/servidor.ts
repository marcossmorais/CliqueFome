import { createClient } from '@supabase/supabase-js';
import { createHash, createHmac } from 'node:crypto';

import { logger } from '@/lib/observabilidade/logger';
import { resolverChaveSupabase, resolverSegredoDeLimite } from './segredos';

/** Client privilegiado — só existe em código de servidor. Nunca importar
 * este módulo de um Client Component. */
export function criarClientPrivilegiado() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) throw new Error('SUPABASE_URL_NAO_CONFIGURADA');
  return createClient(url, resolverChaveSupabase(process.env), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let avisouSegredoLegado = false;

/** Chave de rate limit (IP ou telefone) sem guardar o valor cru. */
export function hashLimite(valor: string) {
  const { segredo, fonte } = resolverSegredoDeLimite(process.env);
  if (fonte === 'legado' && !avisouSegredoLegado) {
    // Uma vez por processo: isto roda em toda cotação e todo checkout.
    avisouSegredoLegado = true;
    logger.warn(
      { variavel: 'RATE_LIMIT_HMAC_SECRET' },
      'Rate limit usando a chave do Supabase como segredo; configure a variável dedicada'
    );
  }
  return createHmac('sha256', segredo).update(valor).digest('hex');
}

/** Hash canônico do payload pra idempotência — não precisa de pepper, só
 * precisa ser determinístico pro mesmo pedido gerar o mesmo hash. */
export function hashPayload(valor: string) {
  return createHash('sha256').update(valor).digest('hex');
}
