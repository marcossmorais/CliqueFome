'use client';

import { extraDaLinha, formatBRL, subtotalLinha, type LinhaCarrinho } from '@/lib/cardapio/tipos';

export type ModoEntrega = 'retirada' | 'entrega';
export type CotacaoEstado =
  | { status: 'idle' }
  | { status: 'calculando' }
  | { status: 'erro'; erro: string }
  | { status: 'ok'; taxa: number; distanciaKm: number | null; enderecoFormatado: string; token: string; expiraEm: string };

export type PedidoRegistrado = {
  pedido: {
    numero: number; token: string; status: string; pagamento_status: string;
    subtotal: number; taxa_entrega: number; total: number; tracking_url: string;
  };
  proximaAcao: { tipo: string; url: string };
};

export function formatarTelefone(valor: string) {
  const digitos = valor.replace(/\D/g, '').slice(0, 11);
  if (digitos.length <= 2) return digitos;
  if (digitos.length <= 7) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
}

export function Carrinho({
  linhas, aberto, pedidoRegistrado, onFechar, onMudarQtd, onRemover, onAbrirCheckout, onNovoPedido,
}: {
  linhas: LinhaCarrinho[];
  aberto: boolean;
  pedidoRegistrado: PedidoRegistrado | null;
  onFechar: () => void;
  onMudarQtd: (lineId: string, delta: number) => void;
  onRemover: (lineId: string) => void;
  onAbrirCheckout: () => void;
  onNovoPedido: () => void;
}) {
  const subtotal = linhas.reduce((s, linha) => s + subtotalLinha(linha), 0);

  if (pedidoRegistrado) {
    return (
      <section id="carrinho" className={'cart-section' + (aberto ? ' open' : '')}>
        <div className="cart-section-header">
          <h2>Pedido registrado</h2>
          <button type="button" className="cart-close" aria-label="Fechar carrinho" onClick={onFechar}>×</button>
        </div>
        <div className="cart-footer">
          <p><strong>Pedido #{pedidoRegistrado.pedido.numero} registrado.</strong></p>
          <p className="delivery-erro">Pagamento pendente. Continue no WhatsApp para confirmar com a loja.</p>
          <a className="btn-primary btn-checkout" href={pedidoRegistrado.proximaAcao.url} target="_blank" rel="noopener noreferrer">
            Continuar no WhatsApp
          </a>
          <a className="btn-continue" href={pedidoRegistrado.pedido.tracking_url}>Acompanhar pedido</a>
          <button type="button" className="btn-continue" onClick={onNovoPedido}>Fazer novo pedido</button>
        </div>
      </section>
    );
  }

  return (
    <section id="carrinho" className={'cart-section' + (aberto ? ' open' : '')}>
      <div className="cart-section-header">
        <h2>Seu carrinho</h2>
        <button type="button" className="cart-close" aria-label="Fechar carrinho" onClick={onFechar}>×</button>
      </div>
      <div className="cart-items">
        {linhas.length === 0 ? (
          <><p className="cart-empty">Seu carrinho está vazio.</p><button type="button" className="btn-primary cart-empty-cta" onClick={onFechar}>Ver cardápio</button></>
        ) : linhas.map((linha) => (
          <div key={linha.lineId} className="cart-item">
            <div className="cart-item-info">
              <span className="cart-item-name">{linha.nome}</span>
              {linha.complementos.length > 0 && <span className="cart-item-custom">{linha.complementos.map((c) => c.quantidade > 1 ? `${c.quantidade}x ${c.nome}` : c.nome).join(', ')}</span>}
              {linha.observacao && <span className="cart-item-obs">Obs: {linha.observacao}</span>}
              <span className="cart-item-price">{formatBRL(linha.precoUnit + extraDaLinha(linha))} un.</span>
            </div>
            <div className="cart-item-qty">
              <button type="button" className="qty-btn" aria-label="Diminuir quantidade" onClick={() => onMudarQtd(linha.lineId, -1)}>−</button>
              <span>{linha.qty}</span>
              <button type="button" className="qty-btn" aria-label="Aumentar quantidade" onClick={() => onMudarQtd(linha.lineId, 1)}>+</button>
            </div>
            <span className="cart-item-subtotal">{formatBRL(subtotalLinha(linha))}</span>
            <button type="button" className="cart-item-remove" onClick={() => onRemover(linha.lineId)}>Remover</button>
          </div>
        ))}
      </div>
      <div className="cart-footer">
        <div className="cart-total-row"><span>Subtotal</span><span>{formatBRL(subtotal)}</span></div>
        <button type="button" className="btn-primary btn-checkout" disabled={linhas.length === 0} onClick={onAbrirCheckout}>
          Continuar pedido
        </button>
        <button type="button" className="btn-continue" onClick={onFechar}>Continuar comprando</button>
        <small className="checkout-seguranca">O valor final e a taxa são validados no servidor.</small>
      </div>
    </section>
  );
}
