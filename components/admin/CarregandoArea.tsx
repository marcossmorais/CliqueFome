/** Carregamento das páginas internas sem desmontar a casca persistente. */
export function CarregandoArea() {
  return (
    <div className="conteudo-carregando" role="status" aria-live="polite" aria-label="Carregando esta área">
      <svg className="conteudo-carregando-icone" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <path d="M39 18A16 16 0 1 0 40 29" />
        <path d="M39 9v10H29" />
      </svg>
    </div>
  );
}
