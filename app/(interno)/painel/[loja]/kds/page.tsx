import { buscarFilaCozinha } from '@/lib/cozinha/acoes';
import { obterLojaPorSlug } from '@/lib/loja';
import { criarClientServidor } from '@/lib/supabase/server';
import { CozinhaClient } from './CozinhaClient';

export default async function CozinhaPage({
  params,
}: {
  params: Promise<{ loja: string }>;
}) {
  const { loja: slug } = await params;
  const { loja } = await obterLojaPorSlug(slug);
  if (!loja) return null;

  const sb = await criarClientServidor();
  const pedidos = await buscarFilaCozinha(sb, loja.id);

  return <CozinhaClient lojaId={loja.id} pedidosIniciais={pedidos} />;
}
