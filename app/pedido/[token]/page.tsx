import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import './tracking.css';
import { TrackingClient } from './TrackingClient';
import type { PedidoTracking } from './tipos';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Acompanhar pedido',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/** Client anônimo direto — mesma razão de app/[loja]/page.tsx: esta página
 * não tem sessão, e criar o client de cookies aqui obrigaria a rota a
 * virar dinâmica pela leitura de cookies sem nenhum ganho. */
function clientePublico() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

const TOKEN_RE = /^[0-9a-f]{32}$/i;

async function carregar(token: string): Promise<PedidoTracking | null> {
  if (!TOKEN_RE.test(token)) return null;
  const sb = clientePublico();
  const { data, error } = await sb.rpc('pedido_por_token', { p_token: token });
  if (error || !data) return null;
  return data as PedidoTracking;
}

export default async function PedidoTrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const pedido = await carregar(token);

  if (!pedido) {
    return (
      <main className="tracking-pagina tracking-vazio">
        <p>Pedido não encontrado. Confira o link que você recebeu.</p>
      </main>
    );
  }

  return <TrackingClient token={token} inicial={pedido} />;
}
