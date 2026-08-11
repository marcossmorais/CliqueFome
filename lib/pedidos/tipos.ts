export type StatusPedido =
  | 'pendente'
  | 'confirmado'
  | 'em_preparo'
  | 'pronto'
  | 'concluido'
  | 'cancelado';

export type PagamentoStatus = 'pendente' | 'confirmado' | 'estornado';
export type TipoPedido = 'retirada' | 'balcao' | 'mesa' | 'encomenda';
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
  total: number;
  data_hora_agendada: string | null;
  origem: OrigemPedido;
  criado_em: string;
  confirmado_em: string | null;
  concluido_em: string | null;
  pedido_itens: { id: string }[];
};

/** Ícone (path de svg 24x24, stroke) e cor por etapa — usado tanto no
 * stepper da tela pública de acompanhamento quanto no badge do admin, pra
 * mudar de etapa ficar visível de longe, não só no texto. */
export const ICONE_STATUS: Record<StatusPedido, string> = {
  pendente: 'M12 21a9 9 0 110-18 9 9 0 010 18zM12 7v5l4 2',
  confirmado: 'M12 21a9 9 0 110-18 9 9 0 010 18zM8 12.5l2.5 2.5L16 9',
  em_preparo: 'M12 2C9 6 6 9 6 13a6 6 0 0012 0c0-2.5-1.5-4-1.5-4s0 2.5-1.5 2.5S13 9 13 7c0-2 1-3-1-5z',
  pronto: 'M6 8h12l-1 12H7L6 8zM9 8V6a3 3 0 016 0v2M9.5 13.5l2 2 3-4',
  concluido: 'M5 13l4 4L19 7',
  cancelado: 'M12 21a9 9 0 110-18 9 9 0 010 18zM9 9l6 6M15 9l-6 6',
};

export const COR_STATUS: Record<StatusPedido, string> = {
  pendente: '#E0A020',
  confirmado: '#2F6FE0',
  em_preparo: '#F28C28',
  pronto: '#2FA968',
  concluido: '#0F3D2E',
  cancelado: '#B23B3B',
};

export const NOMES_STATUS: Record<StatusPedido, string> = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  em_preparo: 'Em preparo',
  pronto: 'Pronto',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

export const NOMES_TIPO: Record<TipoPedido, string> = {
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
  pronto: 'concluido',
};

export const ROTULO_AVANCAR: Partial<Record<StatusPedido, string>> = {
  pendente: 'Confirmar pedido',
  confirmado: 'Iniciar preparo',
  em_preparo: 'Marcar como pronto',
  pronto: 'Marcar como concluído/retirado',
};

export function formatBRL(v: number | string) {
  return 'R$ ' + Number(v).toFixed(2).replace('.', ',');
}

export function proximoStatus(p: { status: StatusPedido; tipo: TipoPedido }): StatusPedido | null {
  return PROXIMO_STATUS[p.status] ?? null;
}

export function rotuloAvancar(p: { status: StatusPedido; tipo: TipoPedido }): string | null {
  return ROTULO_AVANCAR[p.status] ?? null;
}
