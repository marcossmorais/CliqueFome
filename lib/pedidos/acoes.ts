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

export async function avancarStatus(sb: Sb, pedidoId: string, novoStatus: StatusPedido) {
  const { error } = await sb.from('pedidos').update({ status: novoStatus }).eq('id', pedidoId);
  if (error) throw error;
}

export async function cancelarPedido(sb: Sb, pedidoId: string) {
  const { error } = await sb.from('pedidos').update({ status: 'cancelado' }).eq('id', pedidoId);
  if (error) throw error;
}

export async function marcarPagamento(sb: Sb, pedidoId: string, status: 'pendente' | 'confirmado' | 'estornado') {
  const { error } = await sb.from('pedidos').update({ pagamento_status: status }).eq('id', pedidoId);
  if (error) throw error;
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
