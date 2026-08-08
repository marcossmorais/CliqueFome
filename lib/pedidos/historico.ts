import type { PedidoResumo } from './tipos';

export type AtalhoPeriodo = 'hoje' | '7dias' | 'mes' | '';

export type FiltrosHistorico = {
  inicio: string;
  fim: string;
  status: '' | 'concluido' | 'cancelado';
  origem: '' | 'site' | 'instagram' | 'telefone' | 'balcao' | 'outro';
  tipo: '' | 'pronta_entrega' | 'encomenda';
  pagamento: string;
  busca: string;
};

export type PedidoHistorico = PedidoResumo & {
  // O schema atual ainda não registra motivo. O campo opcional permite
  // mostrá-lo automaticamente quando a migration dessa informação chegar.
  motivo_cancelamento?: string | null;
};

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function dataEmSaoPaulo(agora: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
}

function deslocarData(data: string, dias: number) {
  const [ano, mes, dia] = data.split('-').map(Number);
  const valor = new Date(Date.UTC(ano, mes - 1, dia + dias));
  return valor.toISOString().slice(0, 10);
}

export function resolverPeriodo(
  inicioRecebido: string,
  fimRecebido: string,
  atalho: AtalhoPeriodo,
  agora: Date = new Date()
) {
  const hoje = dataEmSaoPaulo(agora);

  if (atalho === 'hoje') return { inicio: hoje, fim: hoje };
  if (atalho === '7dias') return { inicio: deslocarData(hoje, -6), fim: hoje };
  if (atalho === 'mes') return { inicio: `${hoje.slice(0, 7)}-01`, fim: hoje };

  return {
    inicio: DATA_ISO.test(inicioRecebido) ? inicioRecebido : '',
    fim: DATA_ISO.test(fimRecebido) ? fimRecebido : '',
  };
}

/**
 * `.or()` do PostgREST recebe uma expressão textual. Removemos caracteres
 * da gramática do filtro antes de interpolar a busca, sem destruir letras
 * acentuadas, espaços, + e hífen usados em nomes e telefones.
 */
export function sanitizarBuscaHistorico(valor: string) {
  return valor
    .replace(/[,().:%*"'\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function inicioDoDiaIso(data: string) {
  return DATA_ISO.test(data) ? `${data}T00:00:00-03:00` : null;
}

export function fimExclusivoIso(data: string) {
  return DATA_ISO.test(data) ? `${deslocarData(data, 1)}T00:00:00-03:00` : null;
}
