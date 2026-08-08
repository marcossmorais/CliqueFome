'use client';

import type { LojaPublica } from '@/lib/cardapio/tipos';

/**
 * Barra de navegação e badges de status. Estrutura e classes iguais às do
 * cardapio.html original — o CSS veio de lá sem alteração.
 *
 * O nome da loja é quebrado em duas partes só pra herdar o tratamento
 * tipográfico do original (primeira palavra discreta, resto em destaque).
 */
export function TopoCardapio({ loja, onAbrirCarrinho }: { loja: LojaPublica; onAbrirCarrinho: () => void }) {
  const partes = loja.nome.trim().split(' ');
  const prefixo = partes.length > 1 ? partes[0] : '';
  const marca = partes.length > 1 ? partes.slice(1).join(' ') : loja.nome;

  return (
    <>
      <nav>
        <div className="logo-nav">
          {loja.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo da loja, vinda do Storage
            <img src={loja.logo_url} alt="" className="logo-nav-img" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.3">
              <path d="M12 4c-2.5 2-2.5 3.5 0 5.5C14.5 7.5 14.5 6 12 4Z" />
              <path d="M6 20v-6c0-2 2.5-3 6-3s6 1 6 3v6" />
              <path d="M6 17c2 1 10 1 12 0" />
              <path d="M6 14c2 1 10 1 12 0" />
            </svg>
          )}
          <div className="logo-nav-text">
            {prefixo && <span className="prefixo">{prefixo}</span>}
            <span className="marca">{marca}</span>
          </div>
        </div>

        <ul className="nav-links">
          <li>
            <a href="#cardapio">Cardápio</a>
          </li>
        </ul>

        <div className="nav-actions">
          <a href="#cardapio" className="btn-outline">
            Peça agora
          </a>
          <button type="button" className="icon-btn" aria-label="Carrinho" onClick={onAbrirCarrinho}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="9" cy="21" r="1" />
              <circle cx="19" cy="21" r="1" />
              <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
            </svg>
          </button>
        </div>
      </nav>

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
    </>
  );
}
