import { formatBRL, type GrupoComplemento } from '@/lib/catalogo/tipos';

/**
 * Aba Opções: todas as opções de todas as listas, agrupadas por nome.
 * Uma opção com o mesmo nome pode existir em várias listas (ex: "Média" em
 * "Escolha seu tamanho" e em "Tamanho da porção") — aqui elas viram um card
 * só, mostrando em quantas e em quais listas aparecem.
 */
export function GridOpcoes({
  grupos,
  busca,
  onEditarLista,
}: {
  grupos: GrupoComplemento[];
  busca: string;
  onEditarLista: (g: GrupoComplemento) => void;
}) {
  const porNome = new Map<
    string,
    { nome: string; listas: GrupoComplemento[]; precos: number[]; algumAtivo: boolean }
  >();

  grupos.forEach((g) => {
    g.complementos.forEach((o) => {
      if (busca && o.nome.toLowerCase().indexOf(busca) === -1) return;
      const chave = o.nome.toLowerCase();
      const atual = porNome.get(chave) || { nome: o.nome, listas: [], precos: [], algumAtivo: false };
      atual.listas.push(g);
      atual.precos.push(Number(o.preco));
      if (o.ativo) atual.algumAtivo = true;
      porNome.set(chave, atual);
    });
  });

  const cards = Array.from(porNome.values());

  return (
    <div className="painel-col">
      <div className="col-header">
        <span>Todas as opções</span>
      </div>

      {cards.length === 0 ? (
        <div className="lista-vazia">
          Nenhuma opção cadastrada ainda. As opções são criadas dentro de cada lista, na aba
          Complementos.
        </div>
      ) : (
        <div id="opcoesLista">
          {cards.map((o) => {
            const min = Math.min(...o.precos);
            const max = Math.max(...o.precos);
            const preco = min === max ? formatBRL(min) : `${formatBRL(min)} – ${formatBRL(max)}`;
            return (
              <div key={o.nome} className="opcao-card" onClick={() => onEditarLista(o.listas[0])}>
                <div className="opcao-card-topo">
                  <div className="opcao-card-nome">{o.nome}</div>
                  <button type="button" className="prod-menu-btn" title="Editar">
                    ✎
                  </button>
                </div>
                <div className="opcao-card-usos">
                  <b>
                    Usado {o.listas.length} vez{o.listas.length === 1 ? '' : 'es'}:
                  </b>{' '}
                  {o.listas.map((g) => g.nome).join(', ')}
                </div>
                <div className="opcao-card-rodape">
                  <span className="opcao-card-preco">{preco}</span>
                  <span className={'tag ' + (o.algumAtivo ? 'tag-ativo' : 'tag-inativo')}>
                    {o.algumAtivo ? 'Ativo' : 'Pausado'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
