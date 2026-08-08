import { useArrastar } from '@/hooks/useArrastar';
import { Alca } from '@/components/admin/IconesCatalogo';
import { ETIQUETAS, formatBRL, type Categoria, type Produto } from '@/lib/catalogo/tipos';

export function GridProdutos({
  produtos,
  categorias,
  categoriaSelecionadaId,
  busca,
  onEditarCategoria,
  onEditarProduto,
  onReordenar,
}: {
  produtos: Produto[];
  categorias: Categoria[];
  categoriaSelecionadaId: string | null;
  busca: string;
  onEditarCategoria: (c: Categoria) => void;
  onEditarProduto: (p: Produto) => void;
  onReordenar: (ids: string[]) => void;
}) {
  const cat = categorias.find((c) => c.id === categoriaSelecionadaId) || null;
  const lista = produtos.filter((p) => {
    if (categoriaSelecionadaId !== null && p.categoria_id !== categoriaSelecionadaId) return false;
    if (busca && p.nome.toLowerCase().indexOf(busca) === -1) return false;
    return true;
  });

  const ref = useArrastar<HTMLDivElement>('.prod-card', onReordenar);

  return (
    <div className="painel-col">
      <div className="col-header">
        <span className="titulo-cat">
          {cat ? (cat.emoji ? cat.emoji + ' ' : '') + cat.nome : 'Todos os itens'}
        </span>
        {cat && (
          <button type="button" className="btn-ghost btn-small" onClick={() => onEditarCategoria(cat)}>
            Editar categoria
          </button>
        )}
      </div>

      {lista.length === 0 ? (
        <div className="lista-vazia">
          {busca
            ? `Nenhum item encontrado pra "${busca}".`
            : 'Nenhum item aqui ainda. Use "+ Novo produto" pra cadastrar.'}
        </div>
      ) : (
        <div id="produtosGrid" ref={ref}>
          {lista.map((p, i) => {
            const promo = p.preco_promocional != null;
            return (
              <div key={p.id} data-id={p.id} className="prod-card" onClick={() => onEditarProduto(p)}>
                {!busca && <Alca />}
                {p.imagem_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- foto do catálogo do usuário, vinda do Storage
                  <img className="prod-thumb" src={p.imagem_url} alt="" />
                ) : (
                  <div className="prod-thumb">🖼️</div>
                )}
                <div className="prod-info">
                  <div className="prod-nome">
                    {/* Posição na lista exibida — sempre 1, 2, 3... Usar o
                        "ordem" bruto do banco mostraria buracos, porque o
                        arrasto só reindexa os itens visíveis no momento. */}
                    <span className="prod-ordem">{i + 1}</span>
                    {p.nome}
                  </div>
                  <div className="prod-preco">
                    {promo && <span className="antigo">{formatBRL(p.preco)}</span>}
                    {formatBRL(promo ? p.preco_promocional! : p.preco)}
                  </div>
                  <div className="prod-tags">
                    <span className={'tag ' + (p.ativo ? 'tag-ativo' : 'tag-inativo')}>
                      {p.ativo ? 'Ativo' : 'Pausado'}
                    </span>
                    {p.etiqueta && ETIQUETAS[p.etiqueta] && (
                      <span className="tag tag-etiqueta">{ETIQUETAS[p.etiqueta]}</span>
                    )}
                    {p.destaque && <span className="tag tag-etiqueta">Destaque</span>}
                  </div>
                </div>
                <button type="button" className="prod-menu-btn" title="Editar">
                  ✎
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
