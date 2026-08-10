export const FORMAS_PAGAMENTO_OFFLINE = {
  dinheiro_entrega: 'Dinheiro na entrega',
  cartao_credito_entrega: 'Cartão de crédito na entrega',
  cartao_debito_entrega: 'Cartão de débito na entrega',
  pix_manual: 'Fazer Pix no WhatsApp',
  pagamento_retirada: 'Pagamento na retirada',
} as const;

export type FormaPagamentoOffline = keyof typeof FORMAS_PAGAMENTO_OFFLINE;
export type TipoPedidoCheckout = 'delivery' | 'retirada';

const FORMAS_DELIVERY: FormaPagamentoOffline[] = [
  'dinheiro_entrega',
  'cartao_credito_entrega',
  'cartao_debito_entrega',
  'pix_manual',
];

const FORMAS_RETIRADA: FormaPagamentoOffline[] = ['pagamento_retirada', 'pix_manual'];

export function formasPagamentoPara(tipo: TipoPedidoCheckout) {
  return tipo === 'delivery' ? FORMAS_DELIVERY : FORMAS_RETIRADA;
}

export function ehFormaPagamentoOffline(valor: unknown): valor is FormaPagamentoOffline {
  return typeof valor === 'string' && valor in FORMAS_PAGAMENTO_OFFLINE;
}

export function formaPagamentoPermitida(tipo: TipoPedidoCheckout, forma: unknown): forma is FormaPagamentoOffline {
  return ehFormaPagamentoOffline(forma) && formasPagamentoPara(tipo).includes(forma);
}

export function nomeFormaPagamento(forma: string | null | undefined) {
  if (!forma) return 'Não informado';
  return FORMAS_PAGAMENTO_OFFLINE[forma as FormaPagamentoOffline] || forma;
}

export function instrucaoPagamento(forma: string) {
  switch (forma) {
    case 'pix_manual':
      return 'Você será encaminhado pro WhatsApp da loja pra combinar e enviar o Pix — o pedido já está registrado, a confirmação do pagamento é manual.';
    case 'pagamento_retirada':
      return 'O pagamento será feito diretamente no estabelecimento, no momento da retirada.';
    case 'dinheiro_entrega':
      return 'O pagamento em dinheiro será recebido na entrega.';
    case 'cartao_credito_entrega':
    case 'cartao_debito_entrega':
      return 'O pagamento será feito na maquininha no momento da entrega.';
    default:
      return 'O pagamento será confirmado manualmente pelo restaurante.';
  }
}
