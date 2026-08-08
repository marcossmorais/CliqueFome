import { createClient } from '@supabase/supabase-js';
import { createHash, createHmac } from 'node:crypto';

/** Client com service_role — só existe em código de servidor. Nunca
 * importar este módulo de um Client Component. */
export function criarClientPrivilegiado() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY_NAO_CONFIGURADA');
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function pimenta() {
  const segredo = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!segredo || segredo.length < 24) throw new Error('SEGREDO_CHECKOUT_NAO_CONFIGURADO');
  return segredo;
}

/** Chave de rate limit (IP ou telefone) sem guardar o valor cru — hash com
 * pepper do servidor, igual a lib/delivery/servidor.ts. */
export function hashLimite(valor: string) {
  return createHmac('sha256', pimenta()).update(valor).digest('hex');
}

/** Hash canônico do payload pra idempotência — não precisa de pepper, só
 * precisa ser determinístico pro mesmo pedido gerar o mesmo hash. */
export function hashPayload(valor: string) {
  return createHash('sha256').update(valor).digest('hex');
}
