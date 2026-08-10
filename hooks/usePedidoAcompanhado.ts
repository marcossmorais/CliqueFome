'use client';

import { useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { useAgora } from './useAgora';

const JANELA_MS = 4 * 60 * 60 * 1000; // 4h

type SessaoPedido = { token: string; numero: number; criadoEm: number };

function ehSessaoValida(v: unknown): v is SessaoPedido {
  const s = v as SessaoPedido;
  return !!s && typeof s.token === 'string' && typeof s.numero === 'number' && typeof s.criadoEm === 'number';
}

/**
 * "Acompanhar pedido" persistido no navegador do cliente anônimo, por
 * loja (chave inclui o slug — não faz sentido misturar pedidos de lojas
 * diferentes na mesma barra). Fica disponível por 4h a partir da criação
 * do pedido — depois disso some sozinho, sem precisar de faxina manual no
 * banco ou no storage. Fazer outro pedido nessa loja sobrescreve a mesma
 * chave, então a barra passa a apontar pro pedido novo e a janela
 * reinicia — não precisa de lógica extra pra "substituir".
 */
export function usePedidoAcompanhado(lojaSlug: string) {
  const [sessao, definir] = useLocalStorage<SessaoPedido | null>(
    `cf_pedido_ativo:${lojaSlug}`,
    null,
    ehSessaoValida
  );
  const agora = useAgora();

  const registrar = useCallback(
    (pedido: { token: string; numero: number; criadoEm?: string }) => {
      const criadoEm = pedido.criadoEm ? new Date(pedido.criadoEm).getTime() : Date.now();
      definir({ token: pedido.token, numero: pedido.numero, criadoEm });
    },
    [definir]
  );

  const ativo = sessao && agora && agora.getTime() - sessao.criadoEm < JANELA_MS ? sessao : null;

  return { ativo, registrar };
}
