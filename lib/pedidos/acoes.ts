import { criarClientNavegador } from '@/lib/supabase/client';
import { produtoApareceNoTipo } from '@/lib/cardapio/tipos';
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
 * Compare-and-set, agora dentro da RPC `transicionar_pedido` — não existe
 * mais policy de UPDATE amplo em `pedidos` (fechado o achado SEC-06: o
 * dono podia sobrescrever total/loja_id/token de qualquer jeito). A função
 * confere dono da loja, aplica a matriz de transição e só então faz o
 * `update ... where status = esperado`, atômico dentro da própria RPC.
 * `error.message === 'CONFLITO'` é o sinal de que o pedido mudou embaixo —
 * mesmo contrato de antes, só a origem do erro que mudou.
 */
export async function avancarStatus(
  sb: Sb,
  pedidoId: string,
  statusEsperado: StatusPedido,
  novoStatus: StatusPedido
) {
  const { error } = await sb.rpc('transicionar_pedido', {
    p_pedido_id: pedidoId,
    p_status_esperado: statusEsperado,
    p_novo_status: novoStatus,
  });
  if (error) {
    if (error.message?.includes('CONFLITO')) throw new ConflitoDePedido();
    throw error;
  }
}

/** Cancelar também é uma transição: pedido já entregue não volta atrás —
 * a RPC libera cancelamento de qualquer status ativo, mas nunca a partir
 * de concluído/cancelado. */
export async function cancelarPedido(sb: Sb, pedidoId: string, statusEsperado: StatusPedido) {
  const { error } = await sb.rpc('transicionar_pedido', {
    p_pedido_id: pedidoId,
    p_status_esperado: statusEsperado,
    p_novo_status: 'cancelado',
  });
  if (error) {
    if (error.message?.includes('CONFLITO')) throw new ConflitoDePedido();
    throw error;
  }
}

export async function marcarPagamento(
  sb: Sb,
  pedidoId: string,
  esperado: 'pendente' | 'confirmado' | 'estornado',
  novo: 'pendente' | 'confirmado' | 'estornado'
) {
  const { error } = await sb.rpc('marcar_pagamento_manual', {
    p_pedido_id: pedidoId,
    p_pagamento_esperado: esperado,
    p_novo_pagamento: novo,
  });
  if (error) {
    if (error.message?.includes('CONFLITO')) throw new ConflitoDePedido();
    throw error;
  }
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
  /** Mesmo formato que criar_pedido() já valida pro cardápio público —
   * grupo obrigatório, qtd_min/qtd_max e preço são conferidos no banco,
   * nunca aceitos do formulário. */
  opcoes?: { complemento_id: string; quantidade: number }[];
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
  // A tela pode ter sido aberta antes de alguém esgotar o item no catálogo.
  // Revalida imediatamente antes da RPC para dar um erro claro; a RPC/trigger
  // continuam sendo a barreira definitiva contra corrida e POST adulterado.
  const idsProdutos = [...new Set(params.itens.map((item) => item.produto_id))];
  const { data: disponibilidade, error: erroDisponibilidade } = await sb
    .from('produtos')
    .select('id, nome, ativo, tipos_pedido')
    .in('id', idsProdutos);
  if (erroDisponibilidade) throw erroDisponibilidade;

  const produtosPorId = new Map((disponibilidade || []).map((produto) => [produto.id, produto]));
  for (const id of idsProdutos) {
    const produto = produtosPorId.get(id);
    if (!produto || !produto.ativo) throw new Error(`Produto esgotado ou indisponível: ${produto?.nome || 'item removido'}.`);
    if (!produtoApareceNoTipo(produto.tipos_pedido, params.tipo)) {
      throw new Error(`O produto "${produto.nome}" não está disponível para ${params.tipo === 'encomenda' ? 'agendamento' : 'este tipo de pedido'}.`);
    }
  }

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
