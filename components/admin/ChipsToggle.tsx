/** Chips liga/desliga (dias da semana, tipos de pedido, listas de complemento). */
export function ChipsToggle({
  itens,
  selecionados,
  onToggle,
}: {
  itens: { id: string; nome: string }[];
  selecionados: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="dias-grid">
      {itens.map((it) => (
        <button
          key={it.id}
          type="button"
          className={'chip-toggle' + (selecionados.includes(it.id) ? ' on' : '')}
          onClick={() => onToggle(it.id)}
        >
          {it.nome}
        </button>
      ))}
    </div>
  );
}
