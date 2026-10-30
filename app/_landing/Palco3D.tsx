'use client';

import { useEffect, useRef } from 'react';

/**
 * Palco do hero: inclina as telas conforme o ponteiro anda pela página.
 *
 * Só escreve duas variáveis CSS (`--px`, `--py`, de -0.5 a 0.5); quem
 * transforma é o landing.css. Assim não há re-render do React a cada
 * movimento, e sem JS (ou com movimento reduzido) a cena fica parada no
 * ângulo padrão — continua bonita, só não reage.
 */
export function Palco3D({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const palco = ref.current;
    if (!palco) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    let quadro = 0;
    function mover(e: PointerEvent) {
      const x = e.clientX / window.innerWidth - 0.5;
      const y = e.clientY / window.innerHeight - 0.5;
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => {
        palco!.style.setProperty('--px', x.toFixed(3));
        palco!.style.setProperty('--py', y.toFixed(3));
      });
    }

    window.addEventListener('pointermove', mover, { passive: true });
    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener('pointermove', mover);
    };
  }, []);

  return (
    <div ref={ref} className="palco" aria-hidden="true">
      <div className="palco-entrada">
        <div className="palco-cena">{children}</div>
      </div>
    </div>
  );
}
