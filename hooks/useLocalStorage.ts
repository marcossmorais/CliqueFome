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

// Espelho em memória, usado quando o localStorage não aceita escrita
// (navegação anônima, cota estourada). Sem ele o valor voltava pro padrão
// na leitura seguinte e o carrinho não funcionava nem dentro da sessão.
const memoria = new Map<string, string>();
const semStorage = new Set<string>();

function lerCru(chave: string): string | null {
  if (semStorage.has(chave)) return memoria.get(chave) ?? null;
  try {
    return localStorage.getItem(chave);
  } catch {
    semStorage.add(chave);
    return memoria.get(chave) ?? null;
  }
}

function escreverCru(chave: string, cru: string) {
  if (!semStorage.has(chave)) {
    try {
      localStorage.setItem(chave, cru);
      return;
    } catch {
      // Cai pra memória e não tenta de novo nesta sessão.
      semStorage.add(chave);
    }
  }
  memoria.set(chave, cru);
}

/**
 * `validar` é a defesa contra o que está gravado não ter mais o formato que
 * o código espera — conteúdo adulterado à mão ou salvo por uma versão
 * anterior. Sem ela, `JSON.parse('{}')` passa e o erro só aparece lá na
 * frente, no primeiro `.reduce`.
 */
export function useLocalStorage<T>(chave: string, padrao: T, validar?: (v: unknown) => boolean) {
  const getSnapshot = useCallback((): T => {
    const cru = lerCru(chave);
    if (cacheCru.get(chave) !== cru) {
      cacheCru.set(chave, cru);
      let valor: unknown = padrao;
      if (cru !== null) {
        try {
          const bruto = JSON.parse(cru);
          valor = !validar || validar(bruto) ? bruto : padrao;
        } catch {
          valor = padrao; // conteúdo corrompido: volta pro padrão
        }
      }
      cacheValor.set(chave, valor);
    }
    return cacheValor.get(chave) as T;
    // `padrao` e `validar` ficam de fora de propósito: são usados só na
    // leitura, e incluí-los faria o snapshot mudar a cada render se quem
    // chamar passar um literal ou uma função inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  const getServerSnapshot = useCallback(() => padrao, [padrao]);

  const valor = useSyncExternalStore(assinar, getSnapshot, getServerSnapshot);

  const definir = useCallback(
    (novo: T | ((atual: T) => T)) => {
      const atual = getSnapshot();
      const resultado = typeof novo === 'function' ? (novo as (a: T) => T)(atual) : novo;
      escreverCru(chave, JSON.stringify(resultado));
      avisar();
    },
    [chave, getSnapshot]
  );

  return [valor, definir] as const;
}
