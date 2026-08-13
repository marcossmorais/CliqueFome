'use client';

import { useEffect, useRef, useState } from 'react';
import { criarClientNavegador } from '@/lib/supabase/client';
import { useEscFechar } from '@/hooks/useEscFechar';
import {
  ConflitoDePedido,
  avancarStatus,
  buscarDetalhePedido,
  cancelarPedido,
  marcarPagamento,
} from '@/lib/pedidos/acoes';
import { textoTempo } from '@/lib/pedidos/prioridade';
import { nomeFormaPagamento } from '@/lib/pedidos/pagamento';
import { numeroPedido } from '@/lib/pedidos/numero';
import {
  COR_STATUS,
  formatBRL,
  ICONE_STATUS,
  NOMES_ORIGEM,
  NOMES_STATUS,
  NOMES_TIPO,
  proximoStatus,
  rotuloAvancar,
  type PedidoItem,
  type PedidoResumo,
} from '@/lib/pedidos/tipos';

function IconeStatus({ status }: { status: PedidoResumo['status'] }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONE_STATUS[status]} />
    </svg>
  );
}

export function PainelDetalhePedido({
  pedido,
  agora,
  onFechar,
  onAtualizado,
  onErro,
}: {
  pedido: PedidoResumo;
  /** null enquanto não hidratou — ver useAgora. */
  agora: Date | null;
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

  /** Em conflito o estado da tela está velho: recarrega e fecha, em vez de
   * insistir numa transição que partia de um status que não existe mais. */
  async function tratarErro(err: unknown, prefixo: string) {
    if (err instanceof ConflitoDePedido) {
      onErro(err.message);
      await onAtualizado();
      onFechar();
      return;
    }
    onErro(prefixo + (err as Error).message);
  }

  async function avancar() {
    if (!proximo) return;
    setAvancando(true);
    try {
      const sb = criarClientNavegador();
      await avancarStatus(sb, pedido.id, pedido.status, proximo);
      await onAtualizado();
      onFechar();
    } catch (err) {
      await tratarErro(err, 'Erro ao avançar status: ');
    } finally {
      setAvancando(false);
    }
  }

  async function cancelar() {
    const motivo = prompt(`Por que o pedido ${numeroPedido(pedido.numero)} será cancelado?`);
    if (motivo === null) return;
    if (motivo.trim().length < 3 || motivo.trim().length > 300) {
      onErro('Informe um motivo entre 3 e 300 caracteres.');
      return;
    }
    if (!confirm(`Confirmar o cancelamento do pedido ${numeroPedido(pedido.numero)}?`)) return;
    try {
      const sb = criarClientNavegador();
      await cancelarPedido(sb, pedido.id, pedido.status, motivo.trim());
      await onAtualizado();
      onFechar();
    } catch (err) {
      await tratarErro(err, 'Erro ao cancelar: ');
    }
  }

  async function alternarPagamento() {
    const novo = pedido.pagamento_status === 'confirmado' ? 'pendente' : 'confirmado';
    try {
      const sb = criarClientNavegador();
      await marcarPagamento(sb, pedido.id, pedido.pagamento_status, novo);
      await onAtualizado();
    } catch (err) {
      await tratarErro(err, 'Erro ao atualizar pagamento: ');
    }
  }

  const local =
    pedido.tipo === 'mesa'
      ? 'Consumo no local (mesa)'
      : pedido.tipo === 'balcao'
      ? 'Balcão'
      : 'Retirada no local';

  return (
    <>
      {/* Só existe no mobile, onde o painel vira drawer sobre a lista. */}
      <div className="pedido-painel-backdrop" onClick={onFechar} />

      <aside className="pedido-painel">
        <div className="modal-topo">
          <div className="modal-titulo">
            Pedido {numeroPedido(pedido.numero)}{' '}
            <span className="pedido-chip-status" style={{ ['--cor-status' as string]: COR_STATUS[pedido.status] }}>
              <IconeStatus status={pedido.status} />
              {NOMES_STATUS[pedido.status]}
            </span>
          </div>
          <button type="button" className="modal-fechar" aria-label="Fechar" onClick={onFechar}>
            ✕
          </button>
        </div>

        <div className="pedido-painel-corpo">
          <div className="pedido-detalhe-bloco">
            <div className="pedido-detalhe-linha">
              <strong>{pedido.cliente_nome}</strong>
              <span>{pedido.cliente_telefone}</span>
            </div>
            <p className="dica" style={{ margin: '4px 0 0' }}>
              Pedido feito {agora ? textoTempo(pedido, agora) : '—'} · {NOMES_TIPO[pedido.tipo]}
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
            <div className="pedido-total-linha pedido-total-final">
              <span>Total</span>
              <span>{formatBRL(pedido.total)}</span>
            </div>
          </div>

          <div className="pedido-detalhe-bloco">
            <span className="usos-titulo">Pagamento</span>
            <div className="pedido-detalhe-linha">
              <span>{nomeFormaPagamento(pedido.forma_pagamento)}</span>
              {/* Pedido cancelado não recebe confirmação de pagamento — mas se
                  já estava pago quando foi cancelado, desmarcar continua
                  liberado, que é como a loja registra a devolução. */}
              <button
                type="button"
                className="btn-ghost btn-small"
                disabled={pedido.status === 'cancelado' && pedido.pagamento_status !== 'confirmado'}
                title={
                  pedido.status === 'cancelado' && pedido.pagamento_status !== 'confirmado'
                    ? 'Pedido cancelado não pode ser marcado como pago.'
                    : undefined
                }
                onClick={alternarPagamento}
              >
                {pedido.pagamento_status === 'confirmado' ? '✓ Pago manualmente — desmarcar' : 'Confirmar pagamento recebido'}
              </button>
            </div>
            {pedido.status === 'cancelado' && pedido.pagamento_status !== 'confirmado' && (
              <p className="pedido-detalhe-aviso">Este pedido foi cancelado — não dá pra registrar pagamento.</p>
            )}
          </div>
        </div>

        {/* Ação principal fixa no rodapé do painel: numa cozinha o botão de
            avançar precisa estar sempre alcançável, sem rolar o detalhe. */}
        <div className="pedido-painel-rodape">
          {proximo && rotulo && (
            <button type="button" className="btn-primary pedido-acao-principal" disabled={avancando} onClick={avancar}>
              {avancando ? 'Salvando...' : rotulo}
            </button>
          )}
          {ativo && (
            <button type="button" className="btn-ghost btn-small pedido-cancelar" onClick={cancelar}>
              Cancelar pedido
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
