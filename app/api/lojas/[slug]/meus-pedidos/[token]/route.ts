import { NextRequest, NextResponse } from 'next/server';
import { criarClientPrivilegiado } from '@/lib/pedidos/servidor';
import { resolverSessaoCliente } from '@/lib/clientes/sessao-servidor';
import { statusVisivelCliente, type PedidoClienteDetalhe } from '@/lib/clientes/pedidos-publicos';
import type { StatusPedido, TipoPedido } from '@/lib/pedidos/tipos';
import { logger } from '@/lib/observabilidade/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROTA = '/api/lojas/[slug]/meus-pedidos/[token]';
const SLUG_RE = /^[a-z0-9-]{1,80}$/;
const TOKEN_RE = /^[0-9a-f]{32}$/i;

type LinhaDetalhe = {
  numero: number;
  token: string;
  status: StatusPedido;
  total: number;
  subtotal: number;
  taxa_entrega: number | null;
  delivery_fee_cents: number | null;
  tipo: TipoPedido;
  endereco: string | null;
  criado_em: string;
  deliveries: { status: string }[] | null;
  pedido_itens: {
    nome: string;
    quantidade: number;
    preco_unitario: number;
    subtotal: number;
    observacao: string | null;
    pedido_item_opcoes: {
      grupo_nome: string;
      nome: string;
      preco: number;
      quantidade: number;
    }[] | null;
  }[] | null;
};

function resposta(dados: unknown, status = 200) {
  return NextResponse.json(dados, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; token: string }> }
) {
  const { slug, token } = await params;
  if (!SLUG_RE.test(slug) || !TOKEN_RE.test(token)) return resposta({ erro: 'Pedido não encontrado.' }, 404);

  let sb;
  try {
    sb = criarClientPrivilegiado();
  } catch {
    return resposta({ erro: 'Não foi possível carregar o pedido.' }, 503);
  }

  const { data: loja, error: erroLoja } = await sb.from('lojas').select('id').eq('slug', slug).maybeSingle();
  if (erroLoja) {
    logger.error({ rota: ROTA, lojaSlug: slug, codigo: erroLoja.code }, 'Falha ao resolver loja do detalhe do cliente');
    return resposta({ erro: 'Não foi possível carregar o pedido.' }, 503);
  }
  if (!loja) return resposta({ erro: 'Pedido não encontrado.' }, 404);

  const sessao = await resolverSessaoCliente(sb, request, { lojaId: loja.id, lojaSlug: slug });
  if (!sessao) return resposta({ erro: 'Sessão de cliente não encontrada.' }, 401);

  const { data, error } = await sb
    .from('pedidos')
    .select(
      'numero, token, status, total, subtotal, taxa_entrega, delivery_fee_cents, tipo, endereco, criado_em, deliveries(status), pedido_itens(nome, quantidade, preco_unitario, subtotal, observacao, pedido_item_opcoes(grupo_nome, nome, preco, quantidade))'
    )
    .eq('loja_id', sessao.lojaId)
    .eq('cliente_telefone_normalizado', sessao.telefoneNormalizado)
    .eq('token', token)
    .maybeSingle();

  if (error) {
    logger.error({ rota: ROTA, lojaSlug: slug, codigo: error.code }, 'Falha ao consultar detalhe do pedido do cliente');
    return resposta({ erro: 'Não foi possível carregar o pedido.' }, 503);
  }
  if (!data) return resposta({ erro: 'Pedido não encontrado.' }, 404);

  const pedido = data as unknown as LinhaDetalhe;
  const taxaEntrega = pedido.delivery_fee_cents != null
    ? Number(pedido.delivery_fee_cents) / 100
    : Number(pedido.taxa_entrega || 0);
  const detalhe: PedidoClienteDetalhe = {
    orderNumber: pedido.numero,
    createdAt: pedido.criado_em,
    status: statusVisivelCliente(pedido.status, pedido.deliveries),
    total: Number(pedido.total),
    subtotal: Number(pedido.subtotal),
    deliveryFee: taxaEntrega,
    discount: Math.max(0, Number(pedido.subtotal) + taxaEntrega - Number(pedido.total)),
    fulfillmentType: pedido.tipo,
    address: pedido.tipo === 'delivery' ? pedido.endereco : null,
    trackingToken: pedido.token,
    items: (pedido.pedido_itens || []).map((item) => ({
      name: item.nome,
      quantity: item.quantidade,
      unitPrice: Number(item.preco_unitario),
      subtotal: Number(item.subtotal),
      note: item.observacao,
      options: (item.pedido_item_opcoes || []).map((opcao) => ({
        group: opcao.grupo_nome,
        name: opcao.nome,
        price: Number(opcao.preco),
        quantity: opcao.quantidade,
      })),
    })),
  };

  return resposta({ pedido: detalhe });
}
