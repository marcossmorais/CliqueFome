import { useCallback, useSyncExternalStore } from 'react';

/**
 * Estado persistido no localStorage, seguro pra renderizar no servidor.
 *
 * Duas armadilhas que este hook resolve:
 *
 * 1. Hidratação. O servidor não tem localStorage, então renderiza o valor
 *    padrão; o cliente tem o valor salvo. useSyncExternalStore aceita um
 *    snapshot próprio pro servidor (getServerSnapshot) e reconcilia isso
 *    sem acusar mismatch — que é o que aconteceria lendo no primeiro
 *    render, e o que um useEffect resolveria só à custa de um render extra.
 *
 * 2. Identidade do snapshot. getSnapshot é chamado a cada render e o React
 *    compara por Object.is; devolver JSON.parse() direto criaria um objeto
 *    novo toda vez e entraria em laço infinito. Por isso o cache guarda a
 *    string crua e só reprocessa quando ela muda.
 */

const inscritos = new Set<() => void>();

function avisar() {
  inscritos.forEach((fn) => fn());
}

function assinar(aoMudar: () => void) {
  inscritos.add(aoMudar);
  // 'storage' dispara quando OUTRA aba mexe — mantém o carrinho igual se o
  // cliente abrir o cardápio em duas abas.
  window.addEventListener('storage', aoMudar);
  return () => {
    inscritos.delete(aoMudar);
    window.removeEventListener('storage', aoMudar);
  };
}

const cacheCru = new Map<string, string | null>();
const cacheValor = new Map<string, unknown>();

function lerCru(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    // localStorage bloqueado (navegação anônima em alguns navegadores):
    // a página segue funcionando, só não lembra entre visitas.
    return null;
  }
}

export function useLocalStorage<T>(chave: string, padrao: T) {
  const getSnapshot = useCallback((): T => {
    const cru = lerCru(chave);
    if (cacheCru.get(chave) !== cru) {
      cacheCru.set(chave, cru);
      let valor: unknown = padrao;
      if (cru !== null) {
        try {
          valor = JSON.parse(cru);
        } catch {
          valor = padrao; // conteúdo corrompido: volta pro padrão
        }
      }
      cacheValor.set(chave, valor);
    }
    return cacheValor.get(chave) as T;
    // `padrao` fica de fora de propósito: só é usado quando não há valor
    // salvo, e incluí-lo faria o snapshot mudar a cada render se quem
    // chamar passar um literal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  const getServerSnapshot = useCallback(() => padrao, [padrao]);

  const valor = useSyncExternalStore(assinar, getSnapshot, getServerSnapshot);

  const definir = useCallback(
    (novo: T | ((atual: T) => T)) => {
      const atual = getSnapshot();
      const resultado = typeof novo === 'function' ? (novo as (a: T) => T)(atual) : novo;
      try {
        localStorage.setItem(chave, JSON.stringify(resultado));
      } catch {
        /* idem: segue sem persistir */
      }
      avisar();
    },
    [chave, getSnapshot]
  );

  return [valor, definir] as const;
}
