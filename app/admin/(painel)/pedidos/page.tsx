import { obterLojaAtual } from '@/lib/loja';
import { criarClientServidor } from '@/lib/supabase/server';
import { ShellPainel } from '@/components/admin/ShellPainel';
import { PedidosClient } from './PedidosClient';
import type { PedidoResumo } from '@/lib/pedidos/tipos';
import type { CategoriaPublica, GrupoPublico, ProdutoPublico } from '@/lib/cardapio/tipos';

/** O grupo vem do banco com "ativo", que não entra no tipo público. */
type GrupoBruto = GrupoPublico & { ativo: boolean };
type RowProdutoGrupo = { ordem: number; grupos_complemento: GrupoBruto | null };

export default async function PedidosPage() {
  const { loja, souAdmin } = await obterLojaAtual();
  if (!loja) return null;

  const sb = await criarClientServidor();

  const [{ data: pedidos }, { data: categorias }, { data: produtosBrutos }] = await Promise.all([
    sb.from('pedidos').select('*, pedido_itens(id)').eq('loja_id', loja.id).order('criado_em', { ascending: false }),
    sb.from('categorias').select('id, nome, emoji, ordem').eq('loja_id', loja.id).eq('ativo', true).order('ordem'),
    // Mesma consulta do cardápio público (app/[loja]/page.tsx): o pedido
    // manual do painel precisa das mesmas listas de complemento pra não
    // ficar restrito a produto simples, sem opção — era essa a limitação
    // que fazia o atendente não conseguir lançar um item com lista
    // obrigatória (ex: "escolha o ponto da carne").
    sb
      .from('produtos')
      .select(
        'id, categoria_id, nome, descricao, preco, preco_promocional, imagem_url, etiqueta, destaque, esconder_observacao, esconder_quantidade, ativo, ordem, tipos_pedido, produto_grupos(ordem, grupos_complemento(id, nome, qtd_min, qtd_max, tipo_selecao, modo_preco, tipos_pedido, ordem, ativo, complementos(id, nome, preco, qtd_max, imagem_url, ativo, ordem)))'
      )
      .eq('loja_id', loja.id)
      .order('ordem'),
  ]);

  const produtos: ProdutoPublico[] = ((produtosBrutos as unknown as (ProdutoPublico & {
    produto_grupos: RowProdutoGrupo[];
  })[]) || [])
    .map((p) => ({
      ...p,
      grupos: (p.produto_grupos || [])
        .map((pg) => ({ pg, g: pg.grupos_complemento }))
        .filter((x): x is { pg: RowProdutoGrupo; g: GrupoBruto } => !!x.g && x.g.ativo)
        .sort((a, b) => a.pg.ordem - b.pg.ordem)
        .map(({ g }) => ({
          ...g,
          complementos: (g.complementos || []).filter((c) => c.ativo).sort((a, b) => a.ordem - b.ordem),
        })),
    }))
    .sort((a, b) => a.ordem - b.ordem);

  return (
    <ShellPainel lojaNome={loja.nome} lojaSlug={loja.slug} souAdmin={souAdmin} titulo="Gestão de pedidos">
      <PedidosClient
        lojaId={loja.id}
        lojaSlug={loja.slug}
        pedidosIniciais={(pedidos as PedidoResumo[]) || []}
        categorias={(categorias as CategoriaPublica[]) || []}
        produtos={produtos}
      />
    </ShellPainel>
  );
}
