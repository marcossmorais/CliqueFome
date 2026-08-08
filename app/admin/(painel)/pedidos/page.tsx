import { obterLojaAtual } from '@/lib/loja';
import { criarClientServidor } from '@/lib/supabase/server';
import { ShellPainel } from '@/components/admin/ShellPainel';
import { PedidosClient } from './PedidosClient';
import type { PedidoResumo } from '@/lib/pedidos/tipos';

export type ProdutoPicker = { id: string; nome: string; preco: number; preco_promocional: number | null };

export default async function PedidosPage() {
  const { loja, souAdmin } = await obterLojaAtual();
  if (!loja) return null;

  const sb = await criarClientServidor();

  const [{ data: pedidos }, { data: produtos }] = await Promise.all([
    sb.from('pedidos').select('*, pedido_itens(id)').eq('loja_id', loja.id).order('criado_em', { ascending: false }),
    sb
      .from('produtos')
      .select('id, nome, preco, preco_promocional')
      .eq('loja_id', loja.id)
      .eq('ativo', true)
      .order('nome'),
  ]);

  return (
    <ShellPainel lojaNome={loja.nome} lojaSlug={loja.slug} souAdmin={souAdmin} titulo="Gestão de pedidos">
      <PedidosClient
        lojaId={loja.id}
        lojaSlug={loja.slug}
        pedidosIniciais={(pedidos as PedidoResumo[]) || []}
        produtos={(produtos as ProdutoPicker[]) || []}
      />
    </ShellPainel>
  );
}
