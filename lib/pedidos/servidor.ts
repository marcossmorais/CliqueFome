// `server-only` faz o build QUEBRAR se este módulo entrar num Client
// Component, em vez de depender de alguém ler o comentário abaixo. Ele carrega
// a chave que ignora RLS: um import errado num arquivo 'use client' mandaria
// esse segredo pro bundle do navegador. O módulo de Delivery já fazia isso; a
// proteção estava faltando justamente no arquivo com a credencial mais forte.
import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { createHash, createHmac } from 'node:crypto';

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

/** Chave de rate limit (IP ou telefone) sem guardar o valor cru. */
export function hashLimite(valor: string) {
  return createHmac('sha256', resolverSegredoDeLimite(process.env))
    .update(valor)
    .digest('hex');
}

/** Hash canônico do payload pra idempotência — não precisa de pepper, só
 * precisa ser determinístico pro mesmo pedido gerar o mesmo hash. */
export function hashPayload(valor: string) {
  return createHash('sha256').update(valor).digest('hex');
}
