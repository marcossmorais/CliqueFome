'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type SugestaoEndereco = {
  formatado: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  latitude: number;
  longitude: number;
};

type Estado =
  | { status: 'idle' }
  | { status: 'buscando' }
  | { status: 'resultados'; sugestoes: SugestaoEndereco[] }
  | { status: 'vazio' }
  | { status: 'erro'; mensagem: string };

const ATRASO_MS = 350;

/**
 * Autocomplete de endereço com debounce — a tela de configuração de
 * entrega chama isto pra "Logradouro" funcionar como busca de verdade,
 * não como texto livre que só é validado (e pode falhar) no salvar.
 */
export function useBuscaEndereco() {
  const [estado, setEstado] = useState<Estado>({ status: 'idle' });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    controllerRef.current?.abort();
  }, []);

  const buscar = useCallback((texto: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    controllerRef.current?.abort();

    const limpo = texto.trim();
    if (limpo.length < 4) {
      setEstado({ status: 'idle' });
      return;
    }

    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      controllerRef.current = controller;
      setEstado({ status: 'buscando' });
      try {
        const resposta = await fetch(`/api/endereco/sugestoes?texto=${encodeURIComponent(limpo)}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        const corpo = (await resposta.json().catch(() => null)) as
          | { sugestoes?: SugestaoEndereco[]; erro?: never }
          | { erro?: string }
          | null;
        if (!resposta.ok) {
          const mensagem = corpo && 'erro' in corpo && typeof corpo.erro === 'string'
            ? corpo.erro
            : 'Não foi possível buscar o endereço.';
          setEstado({ status: 'erro', mensagem });
          return;
        }
        const sugestoes = (corpo && 'sugestoes' in corpo && Array.isArray(corpo.sugestoes)) ? corpo.sugestoes : [];
        setEstado(sugestoes.length > 0 ? { status: 'resultados', sugestoes } : { status: 'vazio' });
      } catch (erro) {
        if (erro instanceof DOMException && erro.name === 'AbortError') return;
        setEstado({ status: 'erro', mensagem: 'Busca de endereço indisponível. Preencha manualmente.' });
      }
    }, ATRASO_MS);
  }, []);

  const limpar = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    controllerRef.current?.abort();
    setEstado({ status: 'idle' });
  }, []);

  return { estado, buscar, limpar };
}
