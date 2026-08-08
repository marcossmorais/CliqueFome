import { createBrowserClient } from '@supabase/ssr';

/**
 * Client de navegador. Usar só em Client Components, e só pra ações
 * interativas do painel (arrastar, toggles, salvar formulário) — a carga
 * inicial de dados vem do servidor.
 *
 * Só enxerga a anon key. Quem barra acesso indevido é a RLS no banco,
 * nunca este arquivo.
 */
export function criarClientNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
