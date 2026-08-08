import { criarClientNavegador } from '@/lib/supabase/client';
import type { PedidoItem, PedidoResumo, StatusPedido } from './tipos';

type Sb = ReturnType<typeof criarClientNavegador>;

export async function buscarPedidos(sb: Sb, lojaId: string): Promise<PedidoResumo[]> {
  const { data, error } = await sb
    .from('pedidos')
    .select('*, pedido_itens(id)')
    .eq('loja_id', lojaId)
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return (data as PedidoResumo[]) || [];
}

/**
 * Erro de disputa: o pedido mudou no banco entre a tela ter sido carregada
 * e o clique. Tem tipo próprio pra tela poder tratar diferente de uma falha
 * de rede — aqui a resposta certa é recarregar, não tentar de novo.
 */
export class ConflitoDePedido extends Error {
  constructor() {
    super('Este pedido mudou em outro lugar. Recarregando pra mostrar o estado atual.');
    this.name = 'ConflitoDePedido';
  }
}

/**
 * Compare-and-set: a transição só vale se o pedido AINDA estiver no status
 * que a tela viu. Um `update ... where id = ?` sozinho é incondicional — a
 * cozinha e o balcão abertos lado a lado conseguiam regredir o pedido, ou
 * ressuscitar um que já tinha sido cancelado. O `eq('status', esperado)`
 * transforma isso em uma única instrução atômica no Postgres: ou casa, ou
 * não altera linha nenhuma.
 */
export async function avancarStatus(
  sb: Sb,
  pedidoId: string,
  statusEsperado: StatusPedido,
  novoStatus: StatusPedido
) {
  const { data, error } = await sb
    .from('pedidos')
    .update({ status: novoStatus })
    .eq('id', pedidoId)
    .eq('status', statusEsperado)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new ConflitoDePedido();
}

/** Cancelar também é uma transição: pedido já entregue não volta atrás. */
export async function cancelarPedido(sb: Sb, pedidoId: string, statusEsperado: StatusPedido) {
  const { data, error } = await sb
    .from('pedidos')
    .update({ status: 'cancelado' })
    .eq('id', pedidoId)
    .eq('status', statusEsperado)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new ConflitoDePedido();
}

export async function marcarPagamento(
  sb: Sb,
  pedidoId: string,
  esperado: 'pendente' | 'confirmado' | 'estornado',
  novo: 'pendente' | 'confirmado' | 'estornado'
) {
  const { data, error } = await sb
    .from('pedidos')
    .update({ pagamento_status: novo })
    .eq('id', pedidoId)
    .eq('pagamento_status', esperado)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new ConflitoDePedido();
}

/** Itens + opções de um pedido, buscados só quando o card é aberto — não
 * vêm na lista pra não pesar o polling. */
export async function buscarDetalhePedido(sb: Sb, pedidoId: string): Promise<PedidoItem[]> {
  const { data, error } = await sb.rpc('pedido_detalhe', { p_pedido_id: pedidoId });
  if (error) throw error;
  return (data as PedidoItem[]) || [];
}

export type ItemPedidoManual = {
  produto_id: string;
  quantidade: number;
  observacao?: string;
};

/** Pedido lançado pelo dono da loja (telefone, Instagram etc). Passa pela
 * MESMA função que o cardápio público usa — o preço continua sendo
 * recalculado no banco a partir do catálogo, nunca aceito do formulário. */
export async function criarPedidoManual(
  sb: Sb,
  params: {
    lojaSlug: string;
    clienteNome: string;
    clienteTelefone: string;
    tipo: 'delivery' | 'retirada' | 'balcao' | 'mesa' | 'encomenda';
    endereco?: string;
    observacao?: string;
    formaPagamento?: string;
    itens: ItemPedidoManual[];
    dataHoraAgendada?: string;
    origem: 'instagram' | 'telefone' | 'outro';
    statusInicial: 'pendente' | 'confirmado';
  }
) {
  const { data, error } = await sb.rpc('criar_pedido', {
    p_loja_slug: params.lojaSlug,
    p_cliente_nome: params.clienteNome,
    p_cliente_telefone: params.clienteTelefone,
    p_tipo: params.tipo,
    p_endereco: params.endereco || null,
    p_observacao: params.observacao || null,
    p_forma_pagamento: params.formaPagamento || null,
    p_itens: params.itens,
    p_data_hora_agendada: params.dataHoraAgendada || null,
    p_origem: params.origem,
    p_status_inicial: params.statusInicial,
  });
  if (error) throw error;
  return data as { numero: number; token: string; total: number };
}
