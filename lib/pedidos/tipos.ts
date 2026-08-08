export type StatusPedido =
  | 'pendente'
  | 'confirmado'
  | 'em_preparo'
  | 'pronto'
  | 'saiu_entrega'
  | 'concluido'
  | 'cancelado';

export type PagamentoStatus = 'pendente' | 'confirmado' | 'estornado';
export type TipoPedido = 'delivery' | 'retirada' | 'balcao' | 'mesa' | 'encomenda';
export type OrigemPedido = 'site' | 'instagram' | 'telefone' | 'outro';

export type PedidoItemOpcao = {
  grupo: string;
  nome: string;
  preco: number;
  quantidade: number;
};

export type PedidoItem = {
  id: string;
  nome: string;
  preco_unitario: number;
  quantidade: number;
  observacao: string | null;
  subtotal: number;
  opcoes: PedidoItemOpcao[];
};

/** Formato da lista (leve — sem itens, só a contagem via pedido_itens(id)). */
export type PedidoResumo = {
  id: string;
  numero: number;
  token: string;
  cliente_nome: string;
  cliente_telefone: string;
  tipo: TipoPedido;
  endereco: string | null;
  observacao: string | null;
  forma_pagamento: string | null;
  status: StatusPedido;
  pagamento_status: PagamentoStatus;
  subtotal: number;
  taxa_entrega: number;
  total: number;
  data_hora_agendada: string | null;
  origem: OrigemPedido;
  criado_em: string;
  confirmado_em: string | null;
  concluido_em: string | null;
  pedido_itens: { id: string }[];
};

export const NOMES_STATUS: Record<StatusPedido, string> = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  em_preparo: 'Em preparo',
  pronto: 'Pronto',
  saiu_entrega: 'Saiu p/ entrega',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

export const NOMES_TIPO: Record<TipoPedido, string> = {
  delivery: 'Delivery',
  retirada: 'Retirada',
  balcao: 'Balcão',
  mesa: 'Mesa',
  encomenda: 'Encomenda',
};

export const NOMES_ORIGEM: Record<OrigemPedido, string> = {
  site: 'Site',
  instagram: 'Instagram',
  telefone: 'Telefone',
  outro: 'Outro',
};

/** Próximo status no fluxo normal (sem contar cancelamento, que é ação à
 * parte). null = já é status terminal, não avança mais. */
export const PROXIMO_STATUS: Partial<Record<StatusPedido, StatusPedido>> = {
  pendente: 'confirmado',
  confirmado: 'em_preparo',
  em_preparo: 'pronto',
  // "pronto" avança pra "saiu_entrega" só quando é delivery; pra
  // retirada/balcão/mesa/encomenda-retirada, o botão pula direto pra
  // concluído. Essa ramificação fica no componente, não aqui.
  saiu_entrega: 'concluido',
};

export const ROTULO_AVANCAR: Partial<Record<StatusPedido, string>> = {
  pendente: 'Confirmar pedido',
  confirmado: 'Iniciar preparo',
  em_preparo: 'Marcar como pronto',
  pronto: 'Saiu p/ entrega',
  saiu_entrega: 'Marcar como entregue',
};

export function formatBRL(v: number | string) {
  return 'R$ ' + Number(v).toFixed(2).replace('.', ',');
}

/** Próximo status, com a única ramificação do fluxo: "pronto" avança pra
 * "saiu p/ entrega" só quando é delivery — pra retirada, balcão, mesa e
 * encomenda-sem-endereço, vai direto pra concluído. */
export function proximoStatus(p: { status: StatusPedido; tipo: TipoPedido }): StatusPedido | null {
  if (p.status === 'pronto') return p.tipo === 'delivery' ? 'saiu_entrega' : 'concluido';
  return PROXIMO_STATUS[p.status] ?? null;
}

export function rotuloAvancar(p: { status: StatusPedido; tipo: TipoPedido }): string | null {
  if (p.status === 'pronto') {
    return p.tipo === 'delivery' ? 'Saiu p/ entrega' : 'Marcar como entregue/retirado';
  }
  return ROTULO_AVANCAR[p.status] ?? null;
}
