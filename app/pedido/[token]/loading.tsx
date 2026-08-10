import './tracking.css';

/**
 * Esqueleto da tela de acompanhamento — formato aproximado do
 * `TrackingClient.tsx` real (cabeçalho + stepper + itens + resumo).
 */
export default function CarregandoTracking() {
  return (
    <main className="tracking-pagina" aria-hidden="true">
      <header className="tracking-topo esq-topo-tracking">
        <span className="esq-t esq-t-linha" style={{ width: '40%', height: 11 }} />
        <span className="esq-t esq-t-linha" style={{ width: '55%', height: 22, marginTop: 4 }} />
        <div className="esq-t-stepper">
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} className="esq-t esq-t-circulo" />
          ))}
        </div>
      </header>
      <div className="esq-t-secao">
        {Array.from({ length: 2 }).map((_, i) => (
          <span key={i} className="esq-t esq-t-item" />
        ))}
      </div>
      <span className="esq-t esq-t-resumo" />
    </main>
  );
}
