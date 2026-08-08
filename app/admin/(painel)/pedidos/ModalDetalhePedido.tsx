'use client';

import { useEffect, useRef, useState } from 'react';
import { criarClientNavegador } from '@/lib/supabase/client';
import { useEscFechar } from '@/hooks/useEscFechar';
import { avancarStatus, buscarDetalhePedido, cancelarPedido, marcarPagamento } from '@/lib/pedidos/acoes';
import { textoTempo } from '@/lib/pedidos/prioridade';
import {
  formatBRL,
  NOMES_ORIGEM,
  NOMES_STATUS,
  NOMES_TIPO,
  proximoStatus,
  rotuloAvancar,
  type PedidoItem,
  type PedidoResumo,
} from '@/lib/pedidos/tipos';

export function ModalDetalhePedido({
  pedido,
  onFechar,
  onAtualizado,
  onErro,
}: {
  pedido: PedidoResumo;
  onFechar: () => void;
  onAtualizado: () => Promise<void> | void;
  onErro: (msg: string) => void;
}) {
  useEscFechar(onFechar);

  const [itens, setItens] = useState<PedidoItem[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [avancando, setAvancando] = useState(false);

  // "Latest ref" pro callback de erro: onErro é uma função nova a cada
  // render do componente pai, e colocá-la como dependência do efeito
  // abaixo faria ele buscar os itens de novo a cada re-render do pai (o
  // polling da lista, por exemplo) enquanto o modal está aberto.
  const onErroRef = useRef(onErro);
  useEffect(() => {
    onErroRef.current = onErro;
  });

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const sb = criarClientNavegador();
        const dados = await buscarDetalhePedido(sb, pedido.id);
        if (!cancelado) setItens(dados);
      } catch (err) {
        if (!cancelado) onErroRef.current('Erro ao carregar itens: ' + (err as Error).message);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [pedido.id]);

  const proximo = proximoStatus(pedido);
  const rotulo = rotuloAvancar(pedido);
  const ativo = pedido.status !== 'concluido' && pedido.status !== 'cancelado';

  async function avancar() {
    if (!proximo) return;
    setAvancando(true);
    try {
      const sb = criarClientNavegador();
      await avancarStatus(sb, pedido.id, proximo);
      await onAtualizado();
      onFechar();
    } catch (err) {
      onErro('Erro ao avançar status: ' + (err as Error).message);
    } finally {
      setAvancando(false);
    }
  }

  async function cancelar() {
    if (!confirm(`Cancelar o pedido #${pedido.numero}?`)) return;
    try {
      const sb = criarClientNavegador();
      await cancelarPedido(sb, pedido.id);
      await onAtualizado();
      onFechar();
    } catch (err) {
      onErro('Erro ao cancelar: ' + (err as Error).message);
    }
  }

  async function alternarPagamento() {
    const novo = pedido.pagamento_status === 'confirmado' ? 'pendente' : 'confirmado';
    try {
      const sb = criarClientNavegador();
      await marcarPagamento(sb, pedido.id, novo);
      await onAtualizado();
    } catch (err) {
      onErro('Erro ao atualizar pagamento: ' + (err as Error).message);
    }
  }

  const local =
    pedido.tipo === 'mesa'
      ? 'Consumo no local (mesa)'
      : pedido.tipo === 'balcao'
      ? 'Balcão'
      : pedido.endereco
      ? pedido.endereco
      : 'Retirada no local';

  return (
    <div className="modal aberto">
      <div className="modal-backdrop" onClick={onFechar} />
      <div className="modal-sheet estreito">
        <div className="modal-topo">
          <div className="modal-titulo">
            Pedido #{pedido.numero} <span className="tag tag-inativo">{NOMES_STATUS[pedido.status]}</span>
          </div>
          <button type="button" className="modal-fechar" aria-label="Fechar" onClick={onFechar}>
            ✕
          </button>
        </div>

        <div className="modal-corpo">
          <div className="pedido-detalhe-bloco">
            <div className="pedido-detalhe-linha">
              <strong>{pedido.cliente_nome}</strong>
              <span>{pedido.cliente_telefone}</span>
            </div>
            <p className="dica" style={{ margin: '4px 0 0' }}>
              Pedido feito {textoTempo(pedido)} · {NOMES_TIPO[pedido.tipo]}
              {pedido.origem !== 'site' && ` · via ${NOMES_ORIGEM[pedido.origem]}`}
            </p>
          </div>

          <div className="pedido-detalhe-bloco">
            <span className="usos-titulo">Local</span>
            <p style={{ margin: 0 }}>{local}</p>
            {pedido.tipo === 'encomenda' && pedido.data_hora_agendada && (
              <p className="dica" style={{ marginBottom: 0 }}>
                Combinado pra{' '}
                {new Date(pedido.data_hora_agendada).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
          </div>

          <div className="pedido-detalhe-bloco">
            <span className="usos-titulo">Itens</span>
            {carregando ? (
              <p className="dica">Carregando...</p>
            ) : (
              (itens || []).map((item) => (
                <div key={item.id} className="pedido-item-linha">
                  <div className="pedido-item-topo">
                    <span>
                      {item.quantidade}x {item.nome}
                    </span>
                    <span>{formatBRL(item.subtotal)}</span>
                  </div>
                  {item.opcoes.length > 0 && (
                    <ul className="pedido-item-opcoes">
                      {item.opcoes.map((o, i) => (
                        <li key={i}>
                          {o.quantidade > 1 ? `${o.quantidade}x ` : ''}
                          {o.nome} <span>({o.grupo})</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {item.observacao && <p className="pedido-item-obs">Obs: {item.observacao}</p>}
                </div>
              ))
            )}
          </div>

          {pedido.observacao && (
            <div className="pedido-detalhe-bloco">
              <span className="usos-titulo">Observação do pedido</span>
              <p style={{ margin: 0 }}>{pedido.observacao}</p>
            </div>
          )}

          <div className="pedido-detalhe-bloco">
            <div className="pedido-total-linha">
              <span>Subtotal</span>
              <span>{formatBRL(pedido.subtotal)}</span>
            </div>
            {pedido.taxa_entrega > 0 && (
              <div className="pedido-total-linha">
                <span>Entrega</span>
                <span>{formatBRL(pedido.taxa_entrega)}</span>
              </div>
            )}
            <div className="pedido-total-linha pedido-total-final">
              <span>Total</span>
              <span>{formatBRL(pedido.total)}</span>
            </div>
          </div>

          <div className="pedido-detalhe-bloco">
            <span className="usos-titulo">Pagamento</span>
            <div className="pedido-detalhe-linha">
              <span>{pedido.forma_pagamento || 'Não informado'}</span>
              <button type="button" className="btn-ghost btn-small" onClick={alternarPagamento}>
                {pedido.pagamento_status === 'confirmado' ? '✓ Pago — desmarcar' : 'Marcar como pago'}
              </button>
            </div>
          </div>
        </div>

        <div className="modal-rodape">
          {ativo && (
            <button type="button" className="btn-danger" style={{ marginRight: 'auto' }} onClick={cancelar}>
              Cancelar pedido
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={onFechar}>
            Fechar
          </button>
          {proximo && rotulo && (
            <button type="button" className="btn-primary" disabled={avancando} onClick={avancar}>
              {avancando ? 'Salvando...' : rotulo}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
