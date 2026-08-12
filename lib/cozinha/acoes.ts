import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type AcaoCozinha,
  type ItemCozinha,
  type PedidoCozinha,
  ordenarPorPrioridadeCozinha,
  validarRespostaTransicaoCozinha,
} from './tipos';

const TAMANHO_PAGINA = 100;
const MAXIMO_PEDIDOS_OPERACIONAIS = 1_000;
const PEDIDOS_POR_LOTE_DE_ITENS = 50;
const MAXIMO_ITENS_POR_LOTE = 5_000;
const TIPOS_PEDIDO = new Set([
  'retirada',
  'delivery',
  'balcao',
  'mesa',
  'encomenda',
]);
const ORIGENS_PEDIDO = new Set([
  'site',
  'instagram',
  'telefone',
  'outro',
]);
const STATUS_COZINHA = new Set(['confirmado', 'em_preparo', 'pronto']);

const CAMPOS_PEDIDO_COZINHA = [
  'id',
  'numero',
  'cliente_nome',
  'tipo',
  'endereco',
  'observacao',
  'status',
  'data_hora_agendada',
  'origem',
  'criado_em',
].join(',');

type PedidoRow = Omit<PedidoCozinha, 'itens'>;

type OpcaoRow = {
  id: string;
  grupo_nome: string;
  nome: string;
  quantidade: number;
};

type ItemRow = {
  id: string;
  pedido_id: string;
  nome: string;
  quantidade: number;
  observacao: string | null;
  pedido_item_opcoes: OpcaoRow[] | null;
};

/**
 * Busca apenas a fila operacional e os campos que a cozinha utiliza.
 * A paginação vai até o fim da fila; limites de segurança geram erro
 * explícito em vez de ocultar silenciosamente um pedido.
 */
export async function buscarFilaCozinha(
  sb: SupabaseClient,
  lojaId: string
): Promise<PedidoCozinha[]> {
  const linhasOperacionais = await buscarPedidosOperacionais(sb, lojaId);
  const filaAtiva = ordenarPorPrioridadeCozinha(
    linhasOperacionais.filter((pedido) => pedido.status !== 'pronto')
  );
  const prontos = linhasOperacionais
    .filter((pedido) => pedido.status === 'pronto')
    .sort(
      (a, b) =>
        new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime() ||
        a.id.localeCompare(b.id)
    );
  const linhas = [...filaAtiva, ...prontos];

  if (linhas.length === 0) return [];

  const itensPorPedido = new Map<string, ItemCozinha[]>();
  const itens = await buscarItensDosPedidos(
    sb,
    linhas.map((pedido) => pedido.id)
  );

  for (const item of itens) {
    const atual = itensPorPedido.get(item.pedido_id) ?? [];
    atual.push({
      id: item.id,
      nome: item.nome,
      quantidade: item.quantidade,
      observacao: item.observacao,
      opcoes: (item.pedido_item_opcoes ?? [])
        .map((opcao) => ({
          id: opcao.id,
          grupo: opcao.grupo_nome,
          nome: opcao.nome,
          quantidade: opcao.quantidade,
        }))
        .sort(
          (a, b) =>
            a.grupo.localeCompare(b.grupo, 'pt-BR') ||
            a.nome.localeCompare(b.nome, 'pt-BR') ||
            a.id.localeCompare(b.id)
        ),
    });
    atual.sort(
      (a, b) =>
        a.nome.localeCompare(b.nome, 'pt-BR') ||
        a.id.localeCompare(b.id)
    );
    itensPorPedido.set(item.pedido_id, atual);
  }

  return linhas.map((pedido) => ({
    ...pedido,
    itens: itensPorPedido.get(pedido.id) ?? [],
  }));
}

async function buscarPedidosOperacionais(
  sb: SupabaseClient,
  lojaId: string
): Promise<PedidoRow[]> {
  const filtroStatus = ['confirmado', 'em_preparo', 'pronto'];
  const contagem = await sb
    .from('pedidos')
    .select('id', { count: 'exact', head: true })
    .eq('loja_id', lojaId)
    .in('status', filtroStatus);

  if (contagem.error) throw contagem.error;
  if (
    contagem.count !== null &&
    contagem.count > MAXIMO_PEDIDOS_OPERACIONAIS
  ) {
    throw new Error(
      'A fila excedeu o limite operacional seguro. Finalize pedidos antigos antes de continuar.'
    );
  }

  const pedidos: PedidoRow[] = [];

  for (
    let inicio = 0;
    inicio < MAXIMO_PEDIDOS_OPERACIONAIS;
    inicio += TAMANHO_PAGINA
  ) {
    const pagina = await sb
      .from('pedidos')
      .select(CAMPOS_PEDIDO_COZINHA)
      .eq('loja_id', lojaId)
      .in('status', filtroStatus)
      .order('criado_em', { ascending: true })
      .order('id', { ascending: true })
      .range(inicio, inicio + TAMANHO_PAGINA - 1);

    if (pagina.error) throw pagina.error;

    const dados = normalizarPedidos(pagina.data);
    pedidos.push(...dados);

    if (dados.length < TAMANHO_PAGINA) return pedidos;
    if (contagem.count !== null && pedidos.length >= contagem.count) {
      return pedidos;
    }
  }

  throw new Error(
    'A fila atingiu o limite operacional sem retornar todos os pedidos.'
  );
}

async function buscarItensDosPedidos(
  sb: SupabaseClient,
  pedidoIds: string[]
): Promise<ItemRow[]> {
  const todosOsItens: ItemRow[] = [];

  for (
    let inicioLote = 0;
    inicioLote < pedidoIds.length;
    inicioLote += PEDIDOS_POR_LOTE_DE_ITENS
  ) {
    const loteIds = pedidoIds.slice(
      inicioLote,
      inicioLote + PEDIDOS_POR_LOTE_DE_ITENS
    );
    let itensNoLote = 0;

    for (
      let inicioPagina = 0;
      inicioPagina < MAXIMO_ITENS_POR_LOTE;
      inicioPagina += TAMANHO_PAGINA
    ) {
      const pagina = await sb
        .from('pedido_itens')
        .select(
          'id,pedido_id,nome,quantidade,observacao,pedido_item_opcoes(id,grupo_nome,nome,quantidade)'
        )
        .in('pedido_id', loteIds)
        .order('id', { ascending: true })
        .range(inicioPagina, inicioPagina + TAMANHO_PAGINA - 1);

      if (pagina.error) throw pagina.error;

      const dados = normalizarItens(pagina.data);
      todosOsItens.push(...dados);
      itensNoLote += dados.length;

      if (dados.length < TAMANHO_PAGINA) break;
      if (itensNoLote >= MAXIMO_ITENS_POR_LOTE) {
        throw new Error(
          'Um lote da cozinha excedeu o limite seguro de itens.'
        );
      }
    }
  }

  return todosOsItens;
}

function normalizarPedidos(valor: unknown): PedidoRow[] {
  if (!Array.isArray(valor)) throw erroFormatoIncompativel();

  return valor.map((linha) => {
    const pedido = lerObjeto(linha);
    const tipo = lerTexto(pedido.tipo);
    const origem = lerTexto(pedido.origem);
    const status = lerTexto(pedido.status);
    const numero = lerInteiroPositivo(pedido.numero);

    if (
      !TIPOS_PEDIDO.has(tipo) ||
      !ORIGENS_PEDIDO.has(origem) ||
      !STATUS_COZINHA.has(status)
    ) {
      throw erroFormatoIncompativel();
    }

    return {
      id: lerTexto(pedido.id),
      numero,
      cliente_nome: lerTexto(pedido.cliente_nome),
      tipo: tipo as PedidoRow['tipo'],
      endereco: lerTextoOuNulo(pedido.endereco),
      observacao: lerTextoOuNulo(pedido.observacao),
      status: status as PedidoRow['status'],
      data_hora_agendada: lerTextoOuNulo(pedido.data_hora_agendada),
      origem: origem as PedidoRow['origem'],
      criado_em: lerTexto(pedido.criado_em),
    };
  });
}

function normalizarItens(valor: unknown): ItemRow[] {
  if (!Array.isArray(valor)) throw erroFormatoIncompativel();

  return valor.map((linha) => {
    const item = lerObjeto(linha);
    const opcoesBrutas = item.pedido_item_opcoes;

    if (opcoesBrutas !== null && !Array.isArray(opcoesBrutas)) {
      throw erroFormatoIncompativel();
    }

    return {
      id: lerTexto(item.id),
      pedido_id: lerTexto(item.pedido_id),
      nome: lerTexto(item.nome),
      quantidade: lerInteiroPositivo(item.quantidade),
      observacao: lerTextoOuNulo(item.observacao),
      pedido_item_opcoes: (opcoesBrutas ?? []).map((linhaOpcao) => {
        const opcao = lerObjeto(linhaOpcao);
        return {
          id: lerTexto(opcao.id),
          grupo_nome: lerTexto(opcao.grupo_nome),
          nome: lerTexto(opcao.nome),
          quantidade: lerInteiroPositivo(opcao.quantidade),
        };
      }),
    };
  });
}

function lerObjeto(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    throw erroFormatoIncompativel();
  }
  return valor as Record<string, unknown>;
}

function lerTexto(valor: unknown): string {
  if (typeof valor !== 'string') throw erroFormatoIncompativel();
  return valor;
}

function lerTextoOuNulo(valor: unknown): string | null {
  if (valor === null) return null;
  return lerTexto(valor);
}

function lerInteiroPositivo(valor: unknown): number {
  if (
    typeof valor !== 'number' ||
    !Number.isInteger(valor) ||
    valor < 1
  ) {
    throw erroFormatoIncompativel();
  }
  return valor;
}

function erroFormatoIncompativel() {
  return new Error(
    'O banco retornou um formato incompatível com a fila da cozinha.'
  );
}

/**
 * Ponto único de integração com a RPC CAS criada pela remediação de
 * segurança. Esta feature não usa UPDATE direto em pedidos.
 */
export async function executarAcaoCozinha(
  sb: SupabaseClient,
  pedidoId: string,
  acao: AcaoCozinha
) {
  const { data, error } = await sb.rpc('transicionar_pedido', {
    p_pedido_id: pedidoId,
    p_status_esperado: acao.statusEsperado,
    p_novo_status: acao.novoStatus,
  });

  if (error) throw error;

  validarRespostaTransicaoCozinha(data, acao.novoStatus);
}
