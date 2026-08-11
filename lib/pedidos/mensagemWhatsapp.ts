import { formatBRL } from './tipos';
import { nomeFormaPagamento, type FormaPagamentoOffline } from './pagamento';

export type ItemMensagem = {
  nome: string;
  quantidade: number;
  subtotal: number;
  observacao: string | null;
  opcoes: { grupo: string; nome: string; preco: number; quantidade: number }[];
};

/**
 * Monta a mensagem do WhatsApp a partir do SNAPSHOT já persistido (o que
 * criar_pedido() gravou em pedido_itens/pedido_item_opcoes), nunca do
 * carrinho em memória do navegador — depois do commit, a fonte de verdade
 * é o banco.
 */
export function montarMensagemPedido(params: {
  numero: number;
  clienteNome: string;
  itens: ItemMensagem[];
  total: number;
  trackingUrl: string;
  formaPagamento: FormaPagamentoOffline;
}) {
  const { numero, clienteNome, itens, total, trackingUrl, formaPagamento } = params;

  return [
    `Olá! Meu pedido #${numero} já está registrado no sistema.`,
    '',
    `Nome: ${clienteNome}`,
    '',
    ...itens.flatMap((item) => [
      `${item.quantidade}x ${item.nome} - ${formatBRL(item.subtotal)}`,
      ...item.opcoes.map((op) => {
        const vezes = op.quantidade > 1 ? `${op.quantidade}x ` : '';
        const valor = op.preco > 0 ? ` (${formatBRL(op.preco * op.quantidade)})` : '';
        return `   + ${vezes}${op.nome}${valor}`;
      }),
      ...(item.observacao ? [`   Obs: ${item.observacao}`] : []),
    ]),
    '',
    'Retirada no local',
    `Total: ${formatBRL(total)}`,
    `Forma de pagamento: ${nomeFormaPagamento(formaPagamento)}`,
    '',
    formaPagamento === 'pix_manual'
      ? 'Vamos combinar o Pix por aqui mesmo — a confirmação do pagamento é manual.'
      : 'Pagamento a receber pela loja — confirmação manual.',
    `Acompanhar: ${trackingUrl}`,
  ].join('\n');
}
