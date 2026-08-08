import { useEffect } from 'react';

/** Fecha o modal com Escape. Cada modal só existe montado enquanto está
 * aberto, então basta escutar Escape durante o tempo de vida do componente. */
export function useEscFechar(onFechar: () => void) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onFechar]);
}
