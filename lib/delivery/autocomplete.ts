import type { SugestaoEnderecoPublica } from './endereco';

/** Espelha o mínimo aplicado no servidor. Manter os dois iguais evita a
 *  request que o servidor rejeitaria de qualquer forma. */
export const MINIMO_CARACTERES = 3;

/** 450ms: dentro da faixa que dá tempo de terminar a palavra sem parecer
 *  travado. Abaixo de ~400 dispara no meio da digitação e queima cota; acima
 *  de ~500 a lista parece atrasada no celular. */
export const ATRASO_DEBOUNCE_MS = 450;

export type EstadoAutocomplete =
  | { status: 'idle' }
  | { status: 'buscando' }
  | { status: 'resultados'; sugestoes: SugestaoEnderecoPublica[] }
  | { status: 'vazio' }
  | { status: 'erro'; mensagem: string };

export type ControladorBusca = {
  digitar(texto: string): void;
  limpar(): void;
  destruir(): void;
};

/**
 * Debounce + cancelamento, sem React — é aqui que mora a regra que o teste
 * cobre. O hook por cima só liga isto a `useState`.
 *
 * Dois mecanismos independentes contra resultado velho aparecendo na tela,
 * porque um só não basta:
 *
 *  - `AbortController` corta a request em voo (economiza cota do provedor);
 *  - o número de sequência descarta a resposta que chegou fora de ordem.
 *
 * O segundo é necessário porque abortar não é instantâneo: uma resposta que
 * já estava no buffer da rede pode resolver DEPOIS do abort e antes da
 * request nova, e sem o contador ela sobrescreveria a lista com o resultado
 * da consulta anterior — exatamente o "resultado antigo depois de uma busca
 * nova" que precisa não acontecer.
 */
export function criarControladorBusca({
  buscar,
  aoMudarEstado,
  atrasoMs = ATRASO_DEBOUNCE_MS,
  minimoCaracteres = MINIMO_CARACTERES,
}: {
  buscar: (texto: string, signal: AbortSignal) => Promise<SugestaoEnderecoPublica[]>;
  aoMudarEstado: (estado: EstadoAutocomplete) => void;
  atrasoMs?: number;
  minimoCaracteres?: number;
}): ControladorBusca {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  let sequencia = 0;

  const cancelarPendentes = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    controller?.abort();
    controller = null;
  };

  return {
    digitar(texto: string) {
      cancelarPendentes();
      const limpo = texto.trim();
      // Abaixo do mínimo nem agenda: nenhuma request sai.
      if (limpo.length < minimoCaracteres) {
        sequencia += 1;
        aoMudarEstado({ status: 'idle' });
        return;
      }

      timer = setTimeout(() => {
        const meuTurno = (sequencia += 1);
        const meuController = new AbortController();
        controller = meuController;
        aoMudarEstado({ status: 'buscando' });

        buscar(limpo, meuController.signal)
          .then((sugestoes) => {
            if (meuTurno !== sequencia) return;
            aoMudarEstado(sugestoes.length > 0 ? { status: 'resultados', sugestoes } : { status: 'vazio' });
          })
          .catch((erro: unknown) => {
            if (meuTurno !== sequencia) return;
            if (erro instanceof DOMException && erro.name === 'AbortError') return;
            aoMudarEstado({
              status: 'erro',
              mensagem: erro instanceof Error && erro.message
                ? erro.message
                : 'Busca de endereço indisponível. Tente pelo CEP.',
            });
          });
      }, atrasoMs);
    },

    limpar() {
      cancelarPendentes();
      sequencia += 1;
      aoMudarEstado({ status: 'idle' });
    },

    destruir() {
      cancelarPendentes();
      sequencia += 1;
    },
  };
}

/** Chamada de rede usada pelo hook. Isolada pra o teste poder substituir. */
export async function buscarSugestoes(
  texto: string,
  lojaSlug: string,
  signal: AbortSignal,
): Promise<SugestaoEnderecoPublica[]> {
  const url = `/api/delivery/address/autocomplete?q=${encodeURIComponent(texto)}&loja=${encodeURIComponent(lojaSlug)}`;
  const resposta = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  const corpo = (await resposta.json().catch(() => null)) as
    | { sugestoes?: SugestaoEnderecoPublica[]; erro?: string }
    | null;
  if (!resposta.ok) {
    throw new Error(corpo?.erro || 'Não foi possível buscar o endereço.');
  }
  return Array.isArray(corpo?.sugestoes) ? corpo.sugestoes : [];
}
