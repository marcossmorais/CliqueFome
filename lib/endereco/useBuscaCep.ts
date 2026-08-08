'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { somenteDigitosCep, type EnderecoPorCep } from './cep';

type EstadoCep =
  | { status: 'idle'; mensagem: '' }
  | { status: 'carregando'; mensagem: 'Buscando CEP…' }
  | { status: 'encontrado'; mensagem: string }
  | { status: 'erro'; mensagem: string };

function enderecoValido(valor: unknown): valor is EnderecoPorCep {
  if (!valor || typeof valor !== 'object') return false;
  const e = valor as Record<string, unknown>;
  return (
    typeof e.cep === 'string' && /^\d{8}$/.test(e.cep) &&
    typeof e.logradouro === 'string' && typeof e.bairro === 'string' &&
    typeof e.cidade === 'string' && e.cidade.length >= 2 &&
    typeof e.uf === 'string' && /^[A-Z]{2}$/.test(e.uf)
  );
}

export function useBuscaCep() {
  const [estado, setEstado] = useState<EstadoCep>({ status: 'idle', mensagem: '' });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const consultar = useCallback(async (
    valor: string,
    aoEncontrar: (endereco: EnderecoPorCep) => void,
  ) => {
    controllerRef.current?.abort();
    const cep = somenteDigitosCep(valor);
    if (cep.length !== 8) {
      setEstado({ status: 'idle', mensagem: '' });
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    setEstado({ status: 'carregando', mensagem: 'Buscando CEP…' });
    try {
      const resposta = await fetch(`/api/endereco/cep/${cep}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      const corpo = (await resposta.json().catch(() => null)) as
        | (EnderecoPorCep & { erro?: never })
        | { erro?: string }
        | null;
      if (!resposta.ok || !enderecoValido(corpo)) {
        const mensagem = corpo && 'erro' in corpo && typeof corpo.erro === 'string'
          ? corpo.erro
          : 'Não foi possível consultar o CEP.';
        setEstado({ status: 'erro', mensagem });
        return;
      }
      aoEncontrar(corpo);
      setEstado({
        status: 'encontrado',
        mensagem: corpo.logradouro
          ? 'Endereço preenchido pelo CEP.'
          : 'Cidade e UF preenchidas. Complete o logradouro e o número.',
      });
    } catch (erro) {
      if (erro instanceof DOMException && erro.name === 'AbortError') return;
      setEstado({ status: 'erro', mensagem: 'Consulta de CEP indisponível. Preencha o endereço manualmente.' });
    }
  }, []);

  return { ...estado, consultar };
}
