'use client';

import { useEffect, useRef, useState } from 'react';
import { criarClientNavegador } from '@/lib/supabase/client';
import { formatBRL } from '@/lib/pedidos/tipos';
import { NOMES_PAGAMENTO, NOMES_STATUS, type PedidoTracking } from './tipos';
import { nomeFormaPagamento } from '@/lib/pedidos/pagamento';

const INTERVALO_MS = 15_000;

export function TrackingClient({ token, inicial }: { token: string; inicial: PedidoTracking }) {
  const [pedido, setPedido] = useState(inicial);
  const controladorRef = useRef<AbortController | null>(null);

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

  return (
    <main className="tracking-pagina" style={{ ['--marca' as string]: pedido.loja_cor || '#1E7A4E' }}>
      <header className="tracking-topo">
        <span className="tracking-loja">{pedido.loja_nome}</span>
        <h1>Pedido #{pedido.numero}</h1>
        <span className={`tracking-status tracking-status-${pedido.status}`}>
          {NOMES_STATUS[pedido.status] || pedido.status}
        </span>
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
        {pedido.tipo === 'delivery' && pedido.endereco && (
          <div className="tracking-linha">
            <span>Entrega</span>
            <span>{pedido.endereco}</span>
          </div>
        )}
        <div className="tracking-linha">
          <span>Subtotal</span>
          <span>{formatBRL(pedido.subtotal)}</span>
        </div>
        {pedido.taxa_entrega > 0 && (
          <div className="tracking-linha">
            <span>Taxa de entrega</span>
            <span>{formatBRL(pedido.taxa_entrega)}</span>
          </div>
        )}
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
