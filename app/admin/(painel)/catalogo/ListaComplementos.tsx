import { regraTexto, type GrupoComplemento, type Produto } from '@/lib/catalogo/tipos';

export function ListaComplementos({
  grupos,
  produtos,
  busca,
  onEditar,
}: {
  grupos: GrupoComplemento[];
  produtos: Produto[];
  busca: string;
  onEditar: (g: GrupoComplemento) => void;
}) {
  const lista = grupos.filter((g) => !busca || g.nome.toLowerCase().indexOf(busca) !== -1);

  return (
    <div className="painel-col">
      <div className="col-header">
        <span>Listas de complemento</span>
      </div>

      {lista.length === 0 ? (
        <div className="lista-vazia">
          Nenhuma lista cadastrada ainda. Uma lista agrupa opções que o cliente escolhe (ex: &quot;Escolha
          o tamanho&quot;).
        </div>
      ) : (
        <div id="listasComplemento">
          {lista.map((g) => {
            const usos = produtos.filter((p) =>
              (p.produto_grupos || []).some((pg) => pg.grupo_id === g.id)
            ).length;
            return (
              <div key={g.id} className="lista-linha" onClick={() => onEditar(g)}>
                <div className="li-info">
                  <div className="li-nome">
                    {g.nome} {!g.ativo && <span className="tag tag-inativo">Pausada</span>}
                  </div>
                  <div className="li-meta">
                    {regraTexto(g)} · {g.complementos.length} opç{g.complementos.length === 1 ? 'ão' : 'ões'} ·
                    usada em {usos} produto{usos === 1 ? '' : 's'}
                  </div>
                </div>
                <div className="li-acoes">
                  <button type="button" className="btn-ghost btn-small">
                    Editar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
