import type { PlanoLoja } from '@/lib/avaliacoes/tipos';

export type CicloCobranca = 'mensal' | 'semestral' | 'anual';
export type StatusAssinatura = 'ativa' | 'pendente' | 'atrasada' | 'cancelada';
export type StatusPagamento = 'pago' | 'pendente' | 'falhou' | 'estornado';

export type Assinatura = {
  id: string;
  loja_id: string;
  plano: PlanoLoja;
  ciclo: CicloCobranca;
  status: StatusAssinatura;
  /** PostgREST devolve `numeric` como string. Sempre Number() antes de somar. */
  valor: string | number;
  iniciada_em: string | null;
  proxima_cobranca_em: string | null;
  cancelada_em: string | null;
  liberado_ate: string | null;
  criado_em: string;
};

export type PagamentoAssinatura = {
  id: string;
  loja_id: string;
  valor: string | number;
  status: StatusPagamento;
  plano: PlanoLoja;
  ciclo: CicloCobranca;
  competencia: string | null;
  pago_em: string | null;
  criado_em: string;
};

export const NOMES_CICLO: Record<CicloCobranca, string> = {
  mensal: 'Mensal',
  semestral: 'Semestral',
  anual: 'Anual',
};

export const NOMES_STATUS_ASSINATURA: Record<StatusAssinatura, string> = {
  ativa: 'Ativa',
  pendente: 'Pendente',
  atrasada: 'Atrasada',
  cancelada: 'Cancelada',
};

export const NOMES_STATUS_PAGAMENTO: Record<StatusPagamento, string> = {
  pago: 'Pago',
  pendente: 'Pendente',
  falhou: 'Falhou',
  estornado: 'Estornado',
};

/** Quantos meses cada ciclo cobre — base pra normalizar o MRR. */
export const MESES_POR_CICLO: Record<CicloCobranca, number> = {
  mensal: 1,
  semestral: 6,
  anual: 12,
};

/**
 * Preço de tabela por plano e ciclo.
 *
 * Semestral e anual são o mensal multiplicado pelos meses, SEM desconto:
 * qual desconto dar em cada ciclo é decisão de produto que ainda não foi
 * tomada, e chutar um número aqui viraria preço de verdade na tela. O
 * valor cobrado de cada loja fica gravado em `assinaturas.valor` (snapshot),
 * então dar desconto pra um cliente específico já funciona hoje.
 */
export const PRECOS: Record<PlanoLoja, Record<CicloCobranca, number>> = {
  basico: { mensal: 34.9, semestral: 34.9 * 6, anual: 34.9 * 12 },
  pro: { mensal: 64.9, semestral: 64.9 * 6, anual: 64.9 * 12 },
  pro_plus: { mensal: 129.9, semestral: 129.9 * 6, anual: 129.9 * 12 },
};

/**
 * Receita recorrente mensal: cada assinatura ativa vale o que foi
 * combinado, dividido pelos meses que o ciclo cobre. Sem isso um plano
 * anual entraria como se fosse receita de um mês só.
 *
 * Só conta 'ativa' — pendente é quem ainda não começou a pagar, atrasada
 * é dinheiro que não entrou. Contar essas duas inflaria o número.
 */
export function calcularMrr(assinaturas: Pick<Assinatura, 'status' | 'ciclo' | 'valor'>[]) {
  return assinaturas
    .filter((a) => a.status === 'ativa')
    .reduce((soma, a) => soma + Number(a.valor) / MESES_POR_CICLO[a.ciclo], 0);
}

/** Está dentro de uma liberação administrativa (cortesia/trial) agora? */
export function temAcessoLiberado(assinatura: Pick<Assinatura, 'liberado_ate'>, agora = new Date()) {
  return !!assinatura.liberado_ate && new Date(assinatura.liberado_ate) > agora;
}
