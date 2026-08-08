import { useArrastar } from '@/hooks/useArrastar';
import { Alca, IconeLapis, IconeOlho, IconeOlhoOff } from '@/components/admin/IconesCatalogo';
import type { Categoria, Produto } from '@/lib/catalogo/tipos';

export function ColunaCategorias({
  categorias,
  produtos,
  categoriaSelecionadaId,
  busca,
  onSelecionar,
  onNova,
  onEditar,
  onToggleVisibilidade,
  onReordenar,
}: {
  categorias: Categoria[];
  produtos: Produto[];
  categoriaSelecionadaId: string | null;
  busca: string;
  onSelecionar: (id: string | null) => void;
  onNova: () => void;
  onEditar: (c: Categoria) => void;
  onToggleVisibilidade: (c: Categoria) => void;
  onReordenar: (ids: string[]) => void;
}) {
  const ref = useArrastar<HTMLDivElement>('.cat-item', onReordenar);

  return (
    <aside className="painel-col">
      <div className="col-header">
        <span>Categorias</span>
        <button type="button" className="btn-icone" title="Nova categoria" onClick={onNova}>
          +
        </button>
      </div>
      <div id="categoriasLista" ref={ref}>
        <button
          type="button"
          className={'cat-item' + (categoriaSelecionadaId === null ? ' ativo' : '')}
          onClick={() => onSelecionar(null)}
        >
          <span className="cat-nome">Todos os itens</span>
          <span className="li-meta">{produtos.length}</span>
        </button>

        {categorias.map((c) => {
          const qtd = produtos.filter((p) => p.categoria_id === c.id).length;
          return (
            <button
              key={c.id}
              type="button"
              data-id={c.id}
              className={
                'cat-item' + (categoriaSelecionadaId === c.id ? ' ativo' : '') + (c.ativo ? '' : ' oculta')
              }
              onClick={() => onSelecionar(c.id)}
            >
              {!busca && <Alca />}
              <span className="cat-nome">
                {c.emoji ? c.emoji + ' ' : ''}
                {c.nome}
              </span>
              <span className="li-meta">{qtd}</span>
              <span
                className="cat-btn"
                title={c.ativo ? 'Ocultar do cardápio' : 'Mostrar no cardápio'}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleVisibilidade(c);
                }}
              >
                {c.ativo ? <IconeOlho /> : <IconeOlhoOff />}
              </span>
              <span
                className="cat-btn"
                title="Editar categoria"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditar(c);
                }}
              >
                <IconeLapis />
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
