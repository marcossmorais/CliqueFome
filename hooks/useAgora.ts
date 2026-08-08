import { useSyncExternalStore } from 'react';

/**
 * "Agora" seguro pra renderizar no servidor.
 *
 * Devolve null no snapshot do servidor e o horário real no cliente. Sem
 * isso, tudo que depende do relógio — "há 12 min", a cor de urgência, a
 * espera média — sairia com um valor no HTML do servidor e outro na
 * hidratação, o que o React acusa como mismatch.
 *
 * Usa useSyncExternalStore (e não useState + useEffect) porque é
 * exatamente o caso pra que ele existe: assinar uma fonte externa — aqui o
 * relógio — com snapshots separados pra servidor e cliente. Fazer com
 * setState dentro de efeito dispararia render em cascata a cada tique.
 *
 * O tique mantém os contadores vivos entre uma atualização e outra da
 * lista: sem ele, "há 12 min" ficaria congelado até o próximo fetch.
 */

const INTERVALO_PADRAO_MS = 30_000;

let instantaneo = Date.now();
const inscritos = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function assinar(aoMudar: () => void) {
  inscritos.add(aoMudar);
  if (!timer) {
    timer = setInterval(() => {
      instantaneo = Date.now();
      inscritos.forEach((fn) => fn());
    }, INTERVALO_PADRAO_MS);
  }
  return () => {
    inscritos.delete(aoMudar);
    if (inscritos.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

// Number (e não Date) porque useSyncExternalStore compara o snapshot por
// identidade: um new Date() a cada leitura entraria em laço infinito.
const lerCliente = () => instantaneo;
const lerServidor = () => null;

export function useAgora(): Date | null {
  const ms = useSyncExternalStore(assinar, lerCliente, lerServidor);
  return ms === null ? null : new Date(ms);
}
