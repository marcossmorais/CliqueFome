import { NextRequest, NextResponse } from 'next/server';
import { criarClientPrivilegiado } from '@/lib/pedidos/servidor';
import { resolverSessaoCliente } from '@/lib/clientes/sessao-servidor';
import {
  STATUS_ANDAMENTO_CLIENTE,
  STATUS_TERMINAIS_CLIENTE,
  statusVisivelCliente,
  type PedidoClienteResumo,
} from '@/lib/clientes/pedidos-publicos';
import type { StatusPedido, TipoPedido } from '@/lib/pedidos/tipos';
import { logger } from '@/lib/observabilidade/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROTA = '/api/lojas/[slug]/meus-pedidos';
const POR_PAGINA = 10;
const SLUG_RE = /^[a-z0-9-]{1,80}$/;

type LinhaPedido = {
  numero: number;
  token: string;
  status: StatusPedido;
  total: number;
  tipo: TipoPedido;
  criado_em: string;
  pedido_itens: { nome: string; quantidade: number }[] | null;
  deliveries: { status: string }[] | null;
};

function resposta(dados: unknown, status = 200) {
  return NextResponse.json(dados, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return resposta({ erro: 'Loja não encontrada.' }, 404);

  let sb;
  try {
    sb = criarClientPrivilegiado();
  } catch {
    return resposta({ erro: 'Não foi possível carregar seus pedidos.' }, 503);
  }

  const { data: loja, error: erroLoja } = await sb.from('lojas').select('id').eq('slug', slug).maybeSingle();
  if (erroLoja) {
    logger.error({ rota: ROTA, lojaSlug: slug, codigo: erroLoja.code }, 'Falha ao resolver loja de Meus pedidos');
    return resposta({ erro: 'Não foi possível carregar seus pedidos.' }, 503);
  }
  if (!loja) return resposta({ erro: 'Loja não encontrada.' }, 404);

  const sessao = await resolverSessaoCliente(sb, request, { lojaId: loja.id, lojaSlug: slug });
  if (!sessao) return resposta({ sessao: false, pedidos: [], temMais: false });

  const aba = request.nextUrl.searchParams.get('aba') === 'historico' ? 'historico' : 'andamento';
  const pagina = aba === 'historico'
    ? Math.max(1, Math.min(10_000, Number.parseInt(request.nextUrl.searchParams.get('pagina') || '1', 10) || 1))
    : 1;
  const inicio = (pagina - 1) * POR_PAGINA;
  const statuses = aba === 'historico' ? STATUS_TERMINAIS_CLIENTE : STATUS_ANDAMENTO_CLIENTE;

  const { data, error, count } = await sb
    .from('pedidos')
    .select(
      'numero, token, status, total, tipo, criado_em, pedido_itens(nome, quantidade), deliveries(status)',
      { count: 'exact' }
    )
    .eq('loja_id', sessao.lojaId)
    .eq('cliente_telefone_normalizado', sessao.telefoneNormalizado)
    .in('status', statuses)
    .order('criado_em', { ascending: false })
    .range(inicio, inicio + POR_PAGINA - 1);

  if (error) {
    logger.error({ rota: ROTA, lojaSlug: slug, codigo: error.code }, 'Falha ao consultar pedidos da sessão do cliente');
    return resposta({ erro: 'Não foi possível carregar seus pedidos.' }, 503);
  }

  const pedidos: PedidoClienteResumo[] = ((data as unknown as LinhaPedido[]) || []).map((pedido) => ({
    orderNumber: pedido.numero,
    createdAt: pedido.criado_em,
    status: statusVisivelCliente(pedido.status, pedido.deliveries),
    total: Number(pedido.total),
    fulfillmentType: pedido.tipo,
    items: (pedido.pedido_itens || []).map((item) => ({ name: item.nome, quantity: item.quantidade })),
    trackingToken: pedido.token,
  }));

  return resposta({
    sessao: true,
    pedidos,
    temMais: aba === 'historico' && inicio + pedidos.length < (count ?? 0),
  });
}
