import { buscarFilaCozinha } from '@/lib/cozinha/acoes';
import { obterLojaAtual } from '@/lib/loja';
import { criarClientServidor } from '@/lib/supabase/server';
import { CozinhaClient } from './CozinhaClient';

export default async function CozinhaPage() {
  const { loja } = await obterLojaAtual();
  if (!loja) return null;

  const sb = await criarClientServidor();
  const pedidos = await buscarFilaCozinha(sb, loja.id);

  return <CozinhaClient lojaId={loja.id} pedidosIniciais={pedidos} />;
}
