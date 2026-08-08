'use client';

export default function CozinhaError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="area ativo">
      <div className="card">
        <h2>Não foi possível carregar a cozinha</h2>
        <p className="dica">
          A fila atual não pôde ser consultada. Verifique a conexão e tente
          novamente.
          {error.digest ? ` Código: ${error.digest}.` : ''}
        </p>
        <button type="button" className="btn-primary" onClick={reset}>
          Tentar novamente
        </button>
      </div>
    </div>
  );
}
