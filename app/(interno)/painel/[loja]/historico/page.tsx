import { obterLojaPorSlug } from '@/lib/loja';
import { criarClientServidor } from '@/lib/supabase/server';
import { ShellPainel } from '@/components/admin/ShellPainel';
import {
  fimExclusivoIso,
  inicioDoDiaIso,
  resolverPeriodo,
  sanitizarBuscaHistorico,
  type AtalhoPeriodo,
  type FiltrosHistorico,
  type PedidoHistorico,
} from '@/lib/pedidos/historico';
import { HistoricoClient } from './HistoricoClient';

const POR_PAGINA = 20;
const LOTE_RESUMO = 1000;

type SearchParams = Record<string, string | string[] | undefined>;

function unico(valor: string | string[] | undefined) {
  return Array.isArray(valor) ? valor[0] ?? '' : valor ?? '';
}

function valorPermitido<T extends string>(valor: string, permitidos: readonly T[]): T | '' {
  return permitidos.includes(valor as T) ? (valor as T) : '';
}

export default async function HistoricoPage({
  params: paramsRota,
  searchParams,
}: {
  params: Promise<{ loja: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { loja: slug } = await paramsRota;
  const { loja, souAdmin } = await obterLojaPorSlug(slug);
  if (!loja) return null;
  const lojaId = loja.id;

  const params = await searchParams;
  const atalho = valorPermitido(unico(params.periodo), ['hoje', '7dias', 'mes'] as const) as AtalhoPeriodo;
  const periodo = resolverPeriodo(unico(params.inicio), unico(params.fim), atalho);
  const filtros: FiltrosHistorico = {
    ...periodo,
    status: valorPermitido(unico(params.status), ['concluido', 'cancelado'] as const),
    origem: valorPermitido(unico(params.origem), ['site', 'instagram', 'telefone', 'balcao', 'outro'] as const),
    tipo: valorPermitido(unico(params.tipo), ['pronta_entrega', 'encomenda'] as const),
    pagamento: sanitizarBuscaHistorico(unico(params.pagamento)),
    busca: sanitizarBuscaHistorico(unico(params.busca)),
  };
  const pagina = Math.max(1, Math.min(100_000, Number.parseInt(unico(params.pagina), 10) || 1));
  const inicio = (pagina - 1) * POR_PAGINA;

  const sb = await criarClientServidor();

  function consultaLista() {
    let consulta = sb
      .from('pedidos')
      .select('*, pedido_itens(id)', { count: 'exact' })
      .eq('loja_id', lojaId)
      .is('historico_oculto_em', null)
      .in('status', ['concluido', 'cancelado']);

    if (filtros.status) consulta = consulta.eq('status', filtros.status);
    if (filtros.origem === 'balcao') consulta = consulta.eq('tipo', 'balcao');
    else if (filtros.origem) consulta = consulta.eq('origem', filtros.origem);
    if (filtros.tipo === 'encomenda') consulta = consulta.eq('tipo', 'encomenda');
    if (filtros.tipo === 'pronta_entrega') consulta = consulta.neq('tipo', 'encomenda');
    if (filtros.pagamento) consulta = consulta.ilike('forma_pagamento', `%${filtros.pagamento}%`);
    if (filtros.busca) {
      const clausulas = [
        `cliente_nome.ilike.%${filtros.busca}%`,
        `cliente_telefone.ilike.%${filtros.busca}%`,
      ];
      if (/^\d+$/.test(filtros.busca)) clausulas.push(`numero.eq.${Number(filtros.busca)}`);
      consulta = consulta.or(clausulas.join(','));
    }
    const de = inicioDoDiaIso(filtros.inicio);
    const ate = fimExclusivoIso(filtros.fim);
    if (de) consulta = consulta.gte('criado_em', de);
    if (ate) consulta = consulta.lt('criado_em', ate);

    return consulta.order('criado_em', { ascending: false }).range(inicio, inicio + POR_PAGINA - 1);
  }

  // O PostgREST não oferece SUM de forma portátil em todos os projetos.
  // Para manter o resumo exato sem migration, trazemos só a coluna numérica
  // em lotes — a lista completa continua paginada em 20 registros.
  async function somarTotais() {
    let soma = 0;
    let deslocamento = 0;

    while (true) {
      let consulta = sb
        .from('pedidos')
        .select('id, total')
        .eq('loja_id', lojaId)
        .is('historico_oculto_em', null)
        .in('status', ['concluido', 'cancelado']);

      if (filtros.status) consulta = consulta.eq('status', filtros.status);
      if (filtros.origem === 'balcao') consulta = consulta.eq('tipo', 'balcao');
      else if (filtros.origem) consulta = consulta.eq('origem', filtros.origem);
      if (filtros.tipo === 'encomenda') consulta = consulta.eq('tipo', 'encomenda');
      if (filtros.tipo === 'pronta_entrega') consulta = consulta.neq('tipo', 'encomenda');
      if (filtros.pagamento) consulta = consulta.ilike('forma_pagamento', `%${filtros.pagamento}%`);
      if (filtros.busca) {
        const clausulas = [
          `cliente_nome.ilike.%${filtros.busca}%`,
          `cliente_telefone.ilike.%${filtros.busca}%`,
        ];
        if (/^\d+$/.test(filtros.busca)) clausulas.push(`numero.eq.${Number(filtros.busca)}`);
        consulta = consulta.or(clausulas.join(','));
      }
      const de = inicioDoDiaIso(filtros.inicio);
      const ate = fimExclusivoIso(filtros.fim);
      if (de) consulta = consulta.gte('criado_em', de);
      if (ate) consulta = consulta.lt('criado_em', ate);

      const { data, error } = await consulta
        .order('criado_em', { ascending: false })
        .order('id', { ascending: false })
        .range(deslocamento, deslocamento + LOTE_RESUMO - 1);
      if (error) throw new Error('Não foi possível calcular o resumo do histórico.');

      const lote = data ?? [];
      soma += lote.reduce((total, pedido) => total + Number(pedido.total), 0);
      if (lote.length < LOTE_RESUMO) return soma;
      deslocamento += LOTE_RESUMO;
    }
  }

  const [resultado, valorTotal] = await Promise.all([consultaLista(), somarTotais()]);
  if (resultado.error) throw new Error('Não foi possível carregar o histórico de pedidos.');

  const quantidade = resultado.count ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(quantidade / POR_PAGINA));

  return (
    <ShellPainel lojaNome={loja.nome} lojaSlug={loja.slug} souAdmin={souAdmin} titulo="Gestão de pedidos · Histórico">
      <HistoricoClient
        lojaId={lojaId}
        lojaSlug={loja.slug}
        pedidos={(resultado.data as PedidoHistorico[]) ?? []}
        filtros={filtros}
        pagina={pagina}
        totalPaginas={totalPaginas}
        quantidade={quantidade}
        valorTotal={valorTotal}
      />
    </ShellPainel>
  );
}
