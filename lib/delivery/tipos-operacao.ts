export type ModoTaxaDelivery = 'FIXED' | 'PER_KM';

export type StatusDelivery =
  | 'WAITING_DRIVER'
  | 'ASSIGNED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELED';

export type ConfiguracaoDelivery = {
  store_id: string;
  enabled: boolean;
  origin_postal_code: string | null;
  origin_street: string | null;
  origin_number: string | null;
  origin_neighborhood: string | null;
  origin_city: string | null;
  origin_state: string | null;
  origin_latitude: number | null;
  origin_longitude: number | null;
  fee_mode: ModoTaxaDelivery | null;
  fixed_fee_cents: number | null;
  price_per_km_cents: number | null;
  free_delivery_threshold_cents: number | null;
  updated_at: string;
};

export type EntregadorDelivery = {
  id: string;
  store_id: string;
  /** Usado apenas em rotinas server-side de Auth Admin; a UI não recebe. */
  auth_user_id?: string;
  name: string;
  phone: string;
  active: boolean;
  available: boolean;
  created_at: string;
  updated_at: string;
};

export type PedidoDaEntrega = {
  id: string;
  numero: number;
  cliente_nome: string;
  cliente_telefone: string;
  forma_pagamento: string | null;
  pagamento_status: string;
  total: number;
  delivery_postal_code: string | null;
  delivery_street: string | null;
  delivery_number: string | null;
  delivery_neighborhood: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_complement: string | null;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
};

export type EntregaDelivery = {
  id: string;
  store_id: string;
  order_id: string;
  driver_id: string | null;
  status: StatusDelivery;
  assigned_at: string | null;
  started_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
  pedido: PedidoDaEntrega;
  entregador: Pick<EntregadorDelivery, 'id' | 'name' | 'phone'> | null;
};

export type EntregaDeliveryAdmin = Omit<EntregaDelivery, 'pedido' | 'entregador'> & {
  pedido: Pick<
    PedidoDaEntrega,
    | 'id'
    | 'numero'
    | 'cliente_nome'
    | 'forma_pagamento'
    | 'pagamento_status'
    | 'total'
    | 'delivery_street'
    | 'delivery_number'
    | 'delivery_neighborhood'
    | 'delivery_city'
    | 'delivery_state'
  >;
  entregador: Pick<EntregadorDelivery, 'id' | 'name'> | null;
};

export type StatusVisualEntregador = 'DISPONIVEL' | 'EM_ROTA' | 'INDISPONIVEL';

export function statusVisualEntregador(
  entregador: Pick<EntregadorDelivery, 'active' | 'available'>,
  possuiEntregaAtiva: boolean
): StatusVisualEntregador {
  if (possuiEntregaAtiva) return 'EM_ROTA';
  if (entregador.active && entregador.available) return 'DISPONIVEL';
  return 'INDISPONIVEL';
}

export function formatarTotalPedido(valor: number | string) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(valor));
}

export function sanitizarTelefone(valor: string) {
  return valor.replace(/\D/g, '').slice(0, 15);
}

export function urlTelefone(valor: string) {
  const telefone = sanitizarTelefone(valor);
  return telefone ? `tel:${telefone}` : null;
}

export function urlWhatsapp(valor: string) {
  const telefone = sanitizarTelefone(valor);
  if (!telefone) return null;
  const comPais = telefone.length <= 11 ? `55${telefone}` : telefone;
  return `https://wa.me/${comPais}`;
}

export function urlGoogleMaps(latitude: number | null, longitude: number | null) {
  if (
    latitude === null ||
    longitude === null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}

export function enderecoResumido(
  pedido: Pick<
    PedidoDaEntrega,
    | 'delivery_street'
    | 'delivery_number'
    | 'delivery_neighborhood'
    | 'delivery_city'
    | 'delivery_state'
  >
) {
  const linha1 = [pedido.delivery_street, pedido.delivery_number].filter(Boolean).join(', ');
  const linha2 = [pedido.delivery_neighborhood, pedido.delivery_city, pedido.delivery_state]
    .filter(Boolean)
    .join(' - ');
  return { linha1, linha2 };
}

export function resumoPagamentoEntrega(
  pedido: Pick<PedidoDaEntrega, 'pagamento_status' | 'forma_pagamento' | 'total'>
) {
  if (pedido.pagamento_status === 'confirmado') {
    return { tipo: 'pago' as const, texto: '✓ Pagamento confirmado' };
  }
  if (pedido.forma_pagamento === 'pix_manual') {
    return { tipo: 'pendente' as const, texto: 'Pix aguardando confirmação da loja' };
  }
  if (['dinheiro', 'cartao_credito', 'cartao_debito'].includes(pedido.forma_pagamento || '')) {
    return { tipo: 'receber' as const, texto: `Receber ${formatarTotalPedido(pedido.total)}` };
  }
  return { tipo: 'pendente' as const, texto: 'Pagamento pendente com a loja' };
}
