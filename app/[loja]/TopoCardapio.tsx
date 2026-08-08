'use client';

import type { LojaPublica } from '@/lib/cardapio/tipos';

/**
 * Badges de status da loja (delivery e encomendas), no topo do cardápio.
 *
 * A barra de navegação que existia aqui — logo, "Cardápio", "Peça agora" e
 * o ícone do carrinho — foi removida a pedido do dono do projeto. O
 * cardápio de uma loja é uma página só, e a nav repetia o que o
 * `HeroLoja` logo abaixo já mostra (logo e nome).
 *
 * O carrinho continua acessível pelo botão flutuante, que aparece assim que
 * há item. Com o carrinho vazio não há mais como abri-lo — e não há o que
 * ver dentro dele.
 */
export function TopoCardapio({ loja }: { loja: LojaPublica }) {
  return (
    <div className="status-badges-wrap">
      <div className="status-badges">
        <span className={'status-badge status-delivery ' + (loja.delivery_ativo ? 'on' : 'off')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="5" cy="17.5" r="2.2" />
            <circle cx="17" cy="17.5" r="2.2" />
            <path d="M2.8 17.5h1.6M7.2 17.5h5.6l1.4-4h3.6" />
            <path d="M13.2 13.5h-2l-1-3.4h2.6" />
            <rect x="15" y="9.6" width="3.6" height="3.4" rx="0.5" />
            <circle cx="9.6" cy="6" r="1.3" />
            <path d="M9.3 7.3c-.3.9.1 1.9 1 2.5" />
          </svg>
          <span className="status-delivery-text">
            {loja.delivery_ativo ? 'Delivery ON' : 'Delivery OFF'}
          </span>
          <span className="status-delivery-dot" />
        </span>

        {loja.recebendo_encomendas && (
          <span className="status-badge status-encomendas">
            <span className="status-delivery-text">Recebendo encomendas</span>
            <span className="status-delivery-dot" />
          </span>
        )}
      </div>
    </div>
  );
}
