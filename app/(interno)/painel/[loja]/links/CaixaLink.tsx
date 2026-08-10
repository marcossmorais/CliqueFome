'use client';

import { useState } from 'react';

export function CaixaLink({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // clipboard exige contexto seguro (https ou localhost); fora disso
      // o usuário copia na mão pelo próprio texto exibido.
      window.prompt('Copie o link:', url);
    }
  }

  return (
    <div className="link-box">
      <code>{url}</code>
      <button type="button" className="btn-ghost btn-small" onClick={copiar}>
        {copiado ? 'Copiado!' : 'Copiar'}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-ghost btn-small"
        style={{ textDecoration: 'none' }}
      >
        Abrir
      </a>
    </div>
  );
}
