'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
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
  NOMES_ORIGEM,
  NOMES_STATUS,
  proximoStatus,
  rotuloAvancar,
  type PedidoItem,
  type PedidoResumo,
} from '@/lib/pedidos/tipos';

function IconeContato({ tipo }: { tipo: 'telefone' | 'whatsapp' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {tipo === 'telefone' ? (
        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.8 19.8 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.8 19.8 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.35 1.9.65 2.8a2 2 0 01-.45 2.11L8.04 9.9a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.9.3 1.84.52 2.8.65A2 2 0 0122 16.92z" />
      ) : (
        <><path d="M21 11.5a8.4 8.4 0 01-9 8.5 9.5 9.5 0 01-4.2-1L3 20l1.2-4.3A8.5 8.5 0 1112 20" /><path d="M8.8 8.2c.4 3 2 4.6 5 5" /></>
      )}
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
  const pago = pedido.pagamento_status === 'confirmado';

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

  /** Não fecha o painel ao avançar: quem está tocando o pedido normalmente
   * dá dois ou três passos seguidos (confirmar → preparar → pronto) e ter de
   * reabrir o mesmo pedido a cada clique custa tempo na operação. O painel
   * fica aberto e o próprio botão troca de rótulo — só some sozinho quando o
   * pedido sai da fila ativa, que é quando não há mais nada a fazer nele. */
  async function avancar() {
    if (!proximo) return;
    setAvancando(true);
    try {
      const sb = criarClientNavegador();
      await avancarStatus(sb, pedido.id, pedido.status, proximo);
      await onAtualizado();
      // Concluído é o fim do fluxo: o pedido sai da fila ativa e manter o
      // painel aberto mostraria um detalhe que não está mais na lista ao lado.
      if (proximo === 'concluido') onFechar();
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
      : pedido.tipo === 'delivery'
      ? 'Delivery'
      : 'Retirada no local';
  const telefone = pedido.cliente_telefone.replace(/\D/g, '');
  const telefoneComPais = telefone.length <= 11 ? `55${telefone}` : telefone;
  const taxaEntrega = Number(pedido.delivery_fee_cents || 0) / 100;

  return (
    <>
      {/* Só existe no mobile, onde o painel vira drawer sobre a lista. */}
      <div className="pedido-painel-backdrop" onClick={onFechar} />

      <aside className="pedido-painel">
        <div className="modal-topo">
          <div className="modal-titulo">
            Pedido {numeroPedido(pedido.numero)}{' '}
            <span className="pedido-chip-status" style={{ ['--cor-status' as string]: COR_STATUS[pedido.status] }}>
              {NOMES_STATUS[pedido.status]}
            </span>
          </div>
          <button type="button" className="modal-fechar" aria-label="Fechar" onClick={onFechar}>
            ✕
          </button>
        </div>

        <div className="pedido-painel-corpo">
          <div className="pedido-detalhe-cliente">
            <span className="pedido-cliente-avatar" aria-hidden="true">{pedido.cliente_nome.slice(0, 1).toUpperCase()}</span>
            <div className="pedido-cliente-identidade">
              <strong>{pedido.cliente_nome}</strong>
              <span>{pedido.cliente_telefone}</span>
            </div>
            <div className="pedido-cliente-contatos">
              <a href={`tel:${telefone}`} aria-label={`Ligar para ${pedido.cliente_nome}`} title="Ligar">
                <IconeContato tipo="telefone" />
              </a>
              <a href={`https://wa.me/${telefoneComPais}`} target="_blank" rel="noopener noreferrer" aria-label={`Conversar com ${pedido.cliente_nome} no WhatsApp`} title="WhatsApp">
                <IconeContato tipo="whatsapp" />
              </a>
            </div>
          </div>
          <p className="pedido-detalhe-horario">Pedido feito {agora ? textoTempo(pedido, agora) : '—'}</p>

          <div className="pedido-detalhe-bloco">
            <h3>Informações</h3>
            <div className="pedido-informacao-linha"><span>Tipo de pedido</span><strong>{local}</strong></div>
            <div className="pedido-informacao-linha"><span>Pagamento</span><strong>{nomeFormaPagamento(pedido.forma_pagamento)}</strong></div>
            <div className="pedido-informacao-linha"><span>Origem</span><strong>{NOMES_ORIGEM[pedido.origem]}</strong></div>
            {pedido.tipo === 'delivery' && pedido.endereco && (
              <div className="pedido-informacao-endereco"><span>Endereço</span><strong>{pedido.endereco}</strong></div>
            )}
            {pedido.tipo === 'encomenda' && pedido.data_hora_agendada && (
              <div className="pedido-informacao-endereco">
                <span>Agendado para</span>
                <strong>{new Date(pedido.data_hora_agendada).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}</strong>
              </div>
            )}
            {pedido.observacao && (
              <div className="pedido-observacao"><span>Observação</span><p>{pedido.observacao}</p></div>
            )}
          </div>

          <div className="pedido-detalhe-bloco">
            <h3>Itens do pedido</h3>
            {carregando ? (
              <p className="dica">Carregando...</p>
            ) : (
              (itens || []).map((item) => {
                const resumo = pedido.pedido_itens.find((pedidoItem) => pedidoItem.id === item.id);
                return (
                  <div key={item.id} className="pedido-item-linha">
                    <div className="pedido-item-miniatura">
                      {resumo?.produto?.imagem_url ? (
                        <Image src={resumo.produto.imagem_url} alt="" fill sizes="48px" />
                      ) : <span aria-hidden="true">{item.nome.slice(0, 1).toUpperCase()}</span>}
                    </div>
                    <div className="pedido-item-conteudo">
                      <div className="pedido-item-topo">
                        <span>{item.quantidade}x {item.nome}</span>
                        <span>{formatBRL(item.subtotal)}</span>
                      </div>
                      {item.opcoes.length > 0 && (
                        <ul className="pedido-item-opcoes">
                          {item.opcoes.map((opcao, indice) => (
                            <li key={indice}>
                              {opcao.quantidade > 1 ? `${opcao.quantidade}x ` : ''}
                              {opcao.nome} <span>({opcao.grupo})</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {item.observacao && <p className="pedido-item-obs">Obs: {item.observacao}</p>}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="pedido-detalhe-bloco">
            <div className="pedido-total-linha">
              <span>Subtotal</span>
              <span>{formatBRL(pedido.subtotal)}</span>
            </div>
            {taxaEntrega > 0 && (
              <div className="pedido-total-linha">
                <span>Taxa de entrega</span>
                <span>{formatBRL(taxaEntrega)}</span>
              </div>
            )}
            <div className="pedido-total-linha pedido-total-final">
              <span>Total</span>
              <span>{formatBRL(pedido.total)}</span>
            </div>
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
          {/* Pago e a receber precisam se distinguir de relance: antes os dois
              eram o mesmo botão contornado e a única diferença era um "✓" no
              fim do texto, fácil de não ver no meio do serviço. */}
          <button
            type="button"
            className={'btn-ghost btn-small pedido-pagamento-acao' + (pago ? ' pago' : '')}
            disabled={pedido.status === 'cancelado' && !pago}
            title={
              pedido.status === 'cancelado' && !pago
                ? 'Pedido cancelado não pode ser marcado como pago.'
                : pago
                ? 'Clique para desfazer a confirmação do pagamento.'
                : undefined
            }
            aria-pressed={pago}
            onClick={alternarPagamento}
          >
            <span className="pedido-pagamento-marca" aria-hidden="true">
              {pago ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              ) : 'R$'}
            </span>
            {pago ? 'Pagamento confirmado' : 'Marcar pagamento recebido'}
          </button>
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
