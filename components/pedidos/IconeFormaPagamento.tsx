import type { FormaPagamentoOffline } from '@/lib/pedidos/pagamento';

/**
 * Ícone da forma de pagamento, compartilhado pelo checkout público, pelo
 * lançamento de pedido manual e pela listagem da operação — os três
 * mostravam a mesma forma e cada um tinha a sua cópia do mesmo SVG.
 *
 * Sem `fill`/`stroke` de propósito: cada tela pinta pelo CSS do seu próprio
 * contexto (o cardápio é whitelabel e usa a cor da loja; o painel usa a cor
 * do painel), então o traço fica a cargo de quem monta.
 */
export function IconeFormaPagamento({ forma }: { forma: FormaPagamentoOffline | string }) {
  if (forma === 'dinheiro') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="2.5" y="5" width="19" height="14" rx="2" />
        <circle cx="12" cy="12" r="3" />
        <path d="M6 8.5h.01M18 15.5h.01" />
      </svg>
    );
  }
  if (forma === 'pix_manual') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m8.2 5.2 2.1-2.1a2.4 2.4 0 0 1 3.4 0l2.1 2.1M18.8 8.2l2.1 2.1a2.4 2.4 0 0 1 0 3.4l-2.1 2.1M15.8 18.8l-2.1 2.1a2.4 2.4 0 0 1-3.4 0l-2.1-2.1M5.2 15.8l-2.1-2.1a2.4 2.4 0 0 1 0-3.4l2.1-2.1" />
        <path d="m7.5 12 2.7 2.7a2.6 2.6 0 0 0 3.6 0l2.7-2.7-2.7-2.7a2.6 2.6 0 0 0-3.6 0L7.5 12Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.5" y="4.5" width="19" height="15" rx="2" />
      <path d="M3 9h18M6 15h5" />
    </svg>
  );
}
