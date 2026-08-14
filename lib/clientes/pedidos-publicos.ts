import type { StatusPedido, TipoPedido } from '@/lib/pedidos/tipos';

export type StatusPedidoCliente = StatusPedido | 'saiu_entrega';

export type PedidoClienteResumo = {
  orderNumber: number;
  createdAt: string;
  status: StatusPedidoCliente;
  total: number;
  fulfillmentType: TipoPedido;
  items: { name: string; quantity: number }[];
  trackingToken: string;
};

export type PedidoClienteDetalhe = Omit<PedidoClienteResumo, 'items'> & {
  subtotal: number;
  deliveryFee: number;
  discount: number;
  address: string | null;
  items: {
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    note: string | null;
    options: { group: string; name: string; price: number; quantity: number }[];
  }[];
};

export const STATUS_TERMINAIS_CLIENTE: StatusPedido[] = ['concluido', 'cancelado'];
export const STATUS_ANDAMENTO_CLIENTE: StatusPedido[] = ['pendente', 'confirmado', 'em_preparo', 'pronto'];

export const ROTULOS_STATUS_CLIENTE: Record<StatusPedidoCliente, string> = {
  pendente: 'Pedido recebido',
  confirmado: 'Confirmado',
  em_preparo: 'Em preparo',
  pronto: 'Pronto',
  saiu_entrega: 'Saiu para entrega',
  concluido: 'Entregue',
  cancelado: 'Cancelado',
};

export function statusVisivelCliente(
  status: StatusPedido,
  entregas?: { status?: string | null } | { status?: string | null }[] | null
): StatusPedidoCliente {
  const lista = Array.isArray(entregas) ? entregas : entregas ? [entregas] : [];
  return status === 'pronto' && lista.some((entrega) => entrega.status === 'OUT_FOR_DELIVERY')
    ? 'saiu_entrega'
    : status;
}
