const FORMAS_PAGAMENTO_OFFLINE = {
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  pix_manual: 'Fazer Pix no WhatsApp',
  pagamento_retirada: 'Pagamento na retirada',
} as const;

export type FormaPagamentoOffline = keyof typeof FORMAS_PAGAMENTO_OFFLINE;
export type TipoPedidoCheckout = 'retirada' | 'delivery';

const FORMAS_RETIRADA: FormaPagamentoOffline[] = [
  'dinheiro',
  'cartao_credito',
  'cartao_debito',
  'pix_manual',
  'pagamento_retirada',
];

const FORMAS_DELIVERY: FormaPagamentoOffline[] = [
  'dinheiro',
  'cartao_credito',
  'cartao_debito',
  'pix_manual',
];

export function formasPagamentoPara(tipo: TipoPedidoCheckout) {
  return tipo === 'delivery' ? FORMAS_DELIVERY : FORMAS_RETIRADA;
}

function ehFormaPagamentoOffline(valor: unknown): valor is FormaPagamentoOffline {
  return typeof valor === 'string' && valor in FORMAS_PAGAMENTO_OFFLINE;
}

export function formaPagamentoPermitida(tipo: TipoPedidoCheckout, forma: unknown): forma is FormaPagamentoOffline {
  return ehFormaPagamentoOffline(forma) && formasPagamentoPara(tipo).includes(forma);
}

export function nomeFormaPagamento(forma: string | null | undefined) {
  if (!forma) return 'Não informado';
  return FORMAS_PAGAMENTO_OFFLINE[forma as FormaPagamentoOffline] || forma;
}

export function instrucaoPagamento(forma: string, tipo: TipoPedidoCheckout = 'retirada') {
  switch (forma) {
    case 'dinheiro':
      return tipo === 'delivery'
        ? 'O pagamento em dinheiro será feito ao receber o pedido.'
        : 'O pagamento em dinheiro será feito diretamente no estabelecimento, no momento da retirada.';
    case 'cartao_credito':
      return tipo === 'delivery'
        ? 'O pagamento com cartão de crédito será feito na entrega.'
        : 'O pagamento com cartão de crédito será feito na maquininha do estabelecimento, no momento da retirada.';
    case 'cartao_debito':
      return tipo === 'delivery'
        ? 'O pagamento com cartão de débito será feito na entrega.'
        : 'O pagamento com cartão de débito será feito na maquininha do estabelecimento, no momento da retirada.';
    case 'pix_manual':
      return 'Você será encaminhado pro WhatsApp da loja pra combinar e enviar o Pix — o pedido já está registrado, a confirmação do pagamento é manual.';
    case 'pagamento_retirada':
      return 'O pagamento será feito diretamente no estabelecimento, no momento da retirada.';
    default:
      return 'O pagamento será confirmado manualmente pelo restaurante.';
  }
}
