'use client';

import { formatBRL, subtotalLinha, type LinhaCarrinho, type LojaPublica } from '@/lib/cardapio/tipos';

export type ModoEntrega = 'retirada' | 'entrega';

/**
 * Estrutura e nomes de classe iguais aos do cardapio.html original — o CSS
 * veio de lá sem alteração, então divergir aqui quebra o layout.
 */
export function Carrinho({
  loja,
  linhas,
  aberto,
  nome,
  endereco,
  modo,
  erro,
  onFechar,
  onMudarQtd,
  onRemover,
  onNome,
  onEndereco,
  onModo,
  onFinalizar,
}: {
  loja: LojaPublica;
  linhas: LinhaCarrinho[];
  aberto: boolean;
  nome: string;
  endereco: string;
  modo: ModoEntrega;
  erro: string | null;
  onFechar: () => void;
  onMudarQtd: (lineId: string, delta: number) => void;
  onRemover: (lineId: string) => void;
  onNome: (v: string) => void;
  onEndereco: (v: string) => void;
  onModo: (m: ModoEntrega) => void;
  onFinalizar: () => void;
}) {
  const subtotal = linhas.reduce((s, l) => s + subtotalLinha(l), 0);
  const taxa = Number(loja.taxa_entrega) || 0;
  const total = subtotal + (modo === 'entrega' && linhas.length > 0 ? taxa : 0);
  const minimo = Number(loja.pedido_minimo) || 0;
  const abaixoDoMinimo = modo === 'entrega' && minimo > 0 && subtotal > 0 && subtotal < minimo;

  return (
    <section id="carrinho" className={'cart-section' + (aberto ? ' open' : '')}>
      <div className="cart-section-header">
        <h2>Seu carrinho</h2>
        <button type="button" className="cart-close" aria-label="Fechar carrinho" onClick={onFechar}>
          ✕
        </button>
      </div>

      <div className="cart-items">
        {linhas.length === 0 ? (
          <>
            <p className="cart-empty">Seu carrinho está vazio.</p>
            <button type="button" className="btn-primary cart-empty-cta" onClick={onFechar}>
              Ver cardápio
            </button>
          </>
        ) : (
          linhas.map((linha) => {
            const precoUnit = linha.precoUnit + linha.complementos.reduce((s, c) => s + c.preco, 0);
            return (
              <div key={linha.lineId} className="cart-item">
                <div className="cart-item-info">
                  <span className="cart-item-name">{linha.nome}</span>
                  {linha.complementos.length > 0 && (
                    <span className="cart-item-custom">
                      {linha.complementos.map((c) => c.nome).join(', ')}
                    </span>
                  )}
                  {linha.observacao && <span className="cart-item-obs">Obs: {linha.observacao}</span>}
                  <span className="cart-item-price">{formatBRL(precoUnit)} un.</span>
                </div>
                <div className="cart-item-qty">
                  <button
                    type="button"
                    className="qty-btn"
                    aria-label="Diminuir quantidade"
                    onClick={() => onMudarQtd(linha.lineId, -1)}
                  >
                    −
                  </button>
                  <span>{linha.qty}</span>
                  <button
                    type="button"
                    className="qty-btn"
                    aria-label="Aumentar quantidade"
                    onClick={() => onMudarQtd(linha.lineId, 1)}
                  >
                    +
                  </button>
                </div>
                <span className="cart-item-subtotal">{formatBRL(subtotalLinha(linha))}</span>
                <button type="button" className="cart-item-remove" onClick={() => onRemover(linha.lineId)}>
                  Remover
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="cart-footer">
        <div className="delivery-address">
          <label htmlFor="nomeClienteInput">Seu nome</label>
          <input
            type="text"
            id="nomeClienteInput"
            placeholder="Como podemos te chamar?"
            value={nome}
            onChange={(e) => onNome(e.target.value)}
          />
        </div>

        <div className="delivery-toggle">
          <button
            type="button"
            className={'delivery-btn' + (modo === 'retirada' ? ' active' : '')}
            onClick={() => onModo('retirada')}
          >
            Retirar no local
          </button>
          <button
            type="button"
            className={'delivery-btn' + (modo === 'entrega' ? ' active' : '')}
            onClick={() => onModo('entrega')}
          >
            {taxa > 0 ? `Entrega (+ ${formatBRL(taxa)})` : 'Entrega'}
          </button>
        </div>

        {modo === 'entrega' && (
          <div className="delivery-address">
            <label htmlFor="enderecoInput">Endereço (rua, bairro e número)</label>
            <input
              type="text"
              id="enderecoInput"
              placeholder="Ex: Rua das Flores, Centro, 123"
              value={endereco}
              onChange={(e) => onEndereco(e.target.value)}
            />
          </div>
        )}

        {abaixoDoMinimo && (
          <p className="delivery-erro">Pedido mínimo pra entrega é {formatBRL(minimo)}.</p>
        )}
        {erro && <p className="delivery-erro">{erro}</p>}

        <div className="cart-total-row">
          <span>Total</span>
          <span>{formatBRL(total)}</span>
        </div>

        <button
          type="button"
          className="btn-primary btn-checkout"
          disabled={linhas.length === 0}
          onClick={onFinalizar}
        >
          Finalizar pedido no WhatsApp
        </button>
        <button type="button" className="btn-continue" onClick={onFechar}>
          Continuar comprando
        </button>
      </div>
    </section>
  );
}
