const FUSO_OPERACAO = 'America/Sao_Paulo';

export type PedidoDashboard = {
  id: string;
  status: string;
  pagamento_status: string;
  total: number;
  criado_em: string;
};

export type ItemDashboard = {
  nome: string;
  quantidade: number;
};

export type PontoVenda = {
  data: string;
  rotulo: string;
  valor: number;
};

export type FaixaHorario = {
  hora: number;
  rotulo: string;
  pedidos: number;
};

export type ResumoDashboard = {
  vendasHoje: number;
  pedidosHoje: number;
  ticketMedio: number;
  emAndamento: number;
  aguardando: number;
  concluidos: number;
  cancelados: number;
  pagamentosPendentes: number;
  valorPendente: number;
  vendas7Dias: number;
  variacaoVendasHoje: number | null;
  variacaoPedidosHoje: number | null;
  variacao7Dias: number | null;
  serieVendas: PontoVenda[];
  horarios: FaixaHorario[];
  horarioPico: FaixaHorario | null;
  maisVendidos: { nome: string; quantidade: number }[];
};

function partesData(data: Date) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_OPERACAO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(data);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value || '';
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

export function dataNaOperacao(data: Date | string) {
  return partesData(typeof data === 'string' ? new Date(data) : data);
}

export function moverData(data: string, dias: number) {
  const [ano, mes, dia] = data.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

export function intervaloDashboard(agora: Date = new Date()) {
  const hoje = dataNaOperacao(agora);
  return {
    hoje,
    amanha: moverData(hoje, 1),
    ontem: moverData(hoje, -1),
    inicio7Dias: moverData(hoje, -6),
    inicio7DiasAnteriores: moverData(hoje, -13),
  };
}

export function inicioDiaIso(data: string) {
  return `${data}T00:00:00-03:00`;
}

function horaNaOperacao(data: string) {
  return Number(new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO_OPERACAO,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(data)));
}

function percentual(atual: number, anterior: number) {
  if (anterior === 0) return atual === 0 ? 0 : null;
  return ((atual - anterior) / anterior) * 100;
}

function naoCancelado(pedido: PedidoDashboard) {
  return pedido.status !== 'cancelado';
}

export function montarResumoDashboard(
  pedidos: PedidoDashboard[],
  itensHoje: ItemDashboard[],
  agora: Date = new Date()
): ResumoDashboard {
  const periodo = intervaloDashboard(agora);
  const pedidosHoje = pedidos.filter((p) => dataNaOperacao(p.criado_em) === periodo.hoje);
  const pedidosOntem = pedidos.filter((p) => dataNaOperacao(p.criado_em) === periodo.ontem);
  const validosHoje = pedidosHoje.filter(naoCancelado);
  const validosOntem = pedidosOntem.filter(naoCancelado);

  const total = (lista: PedidoDashboard[]) => lista.reduce((soma, p) => soma + Number(p.total), 0);
  const vendasHoje = total(validosHoje);
  const vendasOntem = total(validosOntem);
  const emAndamento = pedidosHoje.filter((p) => ['confirmado', 'em_preparo', 'pronto'].includes(p.status)).length;
  const aguardando = pedidosHoje.filter((p) => p.status === 'pendente').length;
  const concluidos = pedidosHoje.filter((p) => p.status === 'concluido').length;
  const cancelados = pedidosHoje.filter((p) => p.status === 'cancelado').length;
  const pendentes = pedidosHoje.filter((p) => p.status !== 'cancelado' && p.pagamento_status === 'pendente');

  const datas7Dias = Array.from({ length: 7 }, (_, indice) => moverData(periodo.inicio7Dias, indice));
  const serieVendas = datas7Dias.map((data) => {
    const valor = total(pedidos.filter((p) => naoCancelado(p) && dataNaOperacao(p.criado_em) === data));
    const [ano, mes, dia] = data.split('-').map(Number);
    const rotulo = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'short',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(ano, mes - 1, dia))).replace('.', '');
    return { data, rotulo, valor };
  });

  const vendas7Dias = serieVendas.reduce((soma, ponto) => soma + ponto.valor, 0);
  const vendas7DiasAnteriores = total(pedidos.filter((p) => {
    const data = dataNaOperacao(p.criado_em);
    return naoCancelado(p) && data >= periodo.inicio7DiasAnteriores && data < periodo.inicio7Dias;
  }));

  const porHora = new Map<number, number>();
  validosHoje.forEach((pedido) => {
    const hora = horaNaOperacao(pedido.criado_em);
    porHora.set(hora, (porHora.get(hora) || 0) + 1);
  });
  let horarios = [...porHora.entries()].map(([hora, quantidade]) => ({
    hora,
    rotulo: `${String(hora).padStart(2, '0')}h`,
    pedidos: quantidade,
  }));
  if (horarios.length > 8) {
    horarios = [...horarios].sort((a, b) => b.pedidos - a.pedidos).slice(0, 8);
  }
  horarios.sort((a, b) => a.hora - b.hora);
  const horarioPico = horarios.reduce<FaixaHorario | null>(
    (maior, atual) => (!maior || atual.pedidos > maior.pedidos ? atual : maior),
    null
  );

  const produtos = new Map<string, number>();
  itensHoje.forEach((item) => produtos.set(item.nome, (produtos.get(item.nome) || 0) + Number(item.quantidade)));
  const maisVendidos = [...produtos.entries()]
    .map(([nome, quantidade]) => ({ nome, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, 4);

  return {
    vendasHoje,
    pedidosHoje: pedidosHoje.length,
    ticketMedio: validosHoje.length ? vendasHoje / validosHoje.length : 0,
    emAndamento,
    aguardando,
    concluidos,
    cancelados,
    pagamentosPendentes: pendentes.length,
    valorPendente: total(pendentes),
    vendas7Dias,
    variacaoVendasHoje: percentual(vendasHoje, vendasOntem),
    variacaoPedidosHoje: percentual(pedidosHoje.length, pedidosOntem.length),
    variacao7Dias: percentual(vendas7Dias, vendas7DiasAnteriores),
    serieVendas,
    horarios,
    horarioPico,
    maisVendidos,
  };
}
