import { createClient } from '@supabase/supabase-js';
import { createHmac, createHash } from 'node:crypto';

export function criarClientPrivilegiado() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY_NAO_CONFIGURADA');
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function segredoServidor() {
  const segredo =
    process.env.DELIVERY_QUOTE_SECRET?.trim() ||
    process.env.GEOAPIFY_API_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!segredo || segredo.length < 24) throw new Error('SEGREDO_DELIVERY_NAO_CONFIGURADO');
  return segredo;
}

export function hashLimite(valor: string) {
  return createHmac('sha256', segredoServidor()).update(valor).digest('hex');
}

export function hashEndereco(valor: string) {
  return createHash('sha256').update(valor).digest('hex');
}
