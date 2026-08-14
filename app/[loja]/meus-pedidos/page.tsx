import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import '../cardapio.css';
import '../vitrine.css';
import '../cliente.css';
import { MeusPedidosClient } from './MeusPedidosClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Meus pedidos',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

function clientePublico() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

export default async function MeusPedidosPage({ params }: { params: Promise<{ loja: string }> }) {
  const { loja: slug } = await params;
  const { data: loja } = await clientePublico()
    .from('lojas')
    .select('slug, nome, logo_url, cor_marca, whatsapp_numero')
    .eq('slug', slug)
    .maybeSingle();

  if (!loja) notFound();
  return <MeusPedidosClient loja={loja} />;
}
