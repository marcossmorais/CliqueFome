'use client';

import { useEffect, useRef, useState } from 'react';
import { criarClientNavegador } from '@/lib/supabase/client';
import { COR_STATUS, formatBRL, ICONE_STATUS, type StatusPedido } from '@/lib/pedidos/tipos';
import { usePedidoAcompanhado } from '@/hooks/usePedidoAcompanhado';
import { NOMES_PAGAMENTO, NOMES_STATUS, type PedidoTracking } from './tipos';
import { nomeFormaPagamento } from '@/lib/pedidos/pagamento';

const INTERVALO_MS = 15_000;

const ETAPAS: StatusPedido[] = ['pendente', 'confirmado', 'em_preparo', 'pronto', 'concluido'];

function IconeStatus({ status }: { status: StatusPedido }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONE_STATUS[status]} />
    </svg>
  );
}

export function TrackingClient({ token, inicial }: { token: string; inicial: PedidoTracking }) {
  const [pedido, setPedido] = useState(inicial);
  const controladorRef = useRef<AbortController | null>(null);
  const { registrar } = usePedidoAcompanhado(inicial.loja_slug);

  // Cobre quem chega direto por este link (ex: reabriu o WhatsApp) sem ter
  // passado pelo checkout nesta sessão do navegador — sem isso, a barra de
  // acompanhamento no cardápio só apareceria pra quem finalizou o pedido
  // agora há pouco, nunca pra quem voltou depois.
  useEffect(() => {
    registrar({ token, numero: inicial.numero, criadoEm: inicial.criado_em });
  }, [registrar, token, inicial.numero, inicial.criado_em]);

  useEffect(() => {
    const sb = criarClientNavegador();

    async function atualizar() {
      if (document.visibilityState !== 'visible') return;
      controladorRef.current?.abort();
      const controlador = new AbortController();
      controladorRef.current = controlador;
      try {
        const { data, error } = await sb
          .rpc('pedido_por_token', { p_token: token })
          .abortSignal(controlador.signal);
        if (!error && data) setPedido(data as PedidoTracking);
      } catch {
        // Falha de rede num refresh silencioso não precisa virar erro na
        // tela — o próximo tick tenta de novo.
      }
    }

    const id = setInterval(atualizar, INTERVALO_MS);
    document.addEventListener('visibilitychange', atualizar);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', atualizar);
      controladorRef.current?.abort();
    };
  }, [token]);

  const numeroWhats = (pedido.loja_whatsapp || '').replace(/\D/g, '');
  const linkWhatsapp = numeroWhats
    ? `https://wa.me/${numeroWhats}?text=${encodeURIComponent(`Olá! Sobre o meu pedido #${pedido.numero}...`)}`
    : null;

  const indiceAtual = ETAPAS.indexOf(pedido.status as StatusPedido);

  return (
    <main className="tracking-pagina" style={{ ['--marca' as string]: pedido.loja_cor || '#1E7A4E' }}>
      <header className="tracking-topo">
        <span className="tracking-loja">{pedido.loja_nome}</span>
        <h1>Pedido #{pedido.numero}</h1>

        {pedido.status === 'cancelado' ? (
          <div className="tracking-cancelado" style={{ ['--cor-status' as string]: COR_STATUS.cancelado }}>
            <span className="tracking-etapa-icone"><IconeStatus status="cancelado" /></span>
            <strong>Pedido cancelado</strong>
          </div>
        ) : (
          <ol className="tracking-stepper">
            {ETAPAS.map((etapa, i) => (
              <li
                key={etapa}
                className={'tracking-etapa' + (i <= indiceAtual ? ' alcancada' : '') + (i === indiceAtual ? ' atual' : '')}
                style={i <= indiceAtual ? { ['--cor-status' as string]: COR_STATUS[etapa] } : undefined}
              >
                <span className="tracking-etapa-icone"><IconeStatus status={etapa} /></span>
                <span className="tracking-etapa-nome">{NOMES_STATUS[etapa]}</span>
              </li>
            ))}
          </ol>
        )}

        <span className="tracking-pagamento">{NOMES_PAGAMENTO[pedido.pagamento_status] || pedido.pagamento_status}</span>
      </header>

      {pedido.status === 'pendente' && (
        <p className="tracking-aviso" role="status">
          Seu pedido já está registrado e aguarda a confirmação do restaurante. O WhatsApp é opcional para combinar detalhes.
        </p>
      )}

      <section className="tracking-itens">
        {pedido.itens.map((item, i) => (
          <div className="tracking-item" key={i}>
            <div className="tracking-item-linha">
              <span>
                {item.quantidade}x {item.nome}
              </span>
              <span>{formatBRL(item.subtotal)}</span>
            </div>
            {item.opcoes.map((op, j) => (
              <div className="tracking-item-opcao" key={j}>
                + {op.quantidade > 1 ? `${op.quantidade}x ` : ''}
                {op.nome}
              </div>
            ))}
            {item.observacao && <div className="tracking-item-opcao">Obs: {item.observacao}</div>}
          </div>
        ))}
      </section>

      <section className="tracking-resumo">
        <div className="tracking-linha">
          <span>Forma de pagamento</span>
          <span>{nomeFormaPagamento(pedido.forma_pagamento)}</span>
        </div>
        <div className="tracking-linha">
          <span>Subtotal</span>
          <span>{formatBRL(pedido.subtotal)}</span>
        </div>
        <div className="tracking-linha tracking-total">
          <span>Total</span>
          <span>{formatBRL(pedido.total)}</span>
        </div>
      </section>

      {linkWhatsapp && (
        <a className="tracking-whatsapp" href={linkWhatsapp} target="_blank" rel="noopener noreferrer">
          Falar com a loja no WhatsApp
        </a>
      )}
    </main>
  );
}
