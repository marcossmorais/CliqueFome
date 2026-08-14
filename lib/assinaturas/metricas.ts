import { calcularMrr, type Assinatura, type PagamentoAssinatura, type PlanoLoja } from './tipos';

export type ResumoPlataforma = {
  receitaMes: number;
  /** Houve algum pagamento registrado? Enquanto não há gateway, não. */
  temPagamentos: boolean;
  mrr: number;
  clientesAtivos: number;
  novosNoMes: number;
  inadimplentes: number;
  cancelamentosNoMes: number;
  porPlano: Record<PlanoLoja, number>;
  totalLojas: number;
};

/** Primeiro instante do mês corrente em São Paulo, como ISO com offset. */
export function inicioDoMesSaoPaulo(agora: Date) {
  const aaaaMm = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  })
    .format(agora)
    .slice(0, 7);
  return `${aaaaMm}-01T00:00:00-03:00`;
}

/**
 * Números da plataforma.
 *
 * `receitaMes` sai de pagamentos CONFIRMADOS, não de assinaturas ativas —
 * são coisas diferentes: assinatura ativa é promessa de receita, pagamento
 * é dinheiro que entrou. Enquanto não houver gateway alimentando
 * `assinatura_pagamentos`, isto fica em zero, e `temPagamentos` existe pra
 * a tela poder dizer "aguardando integração" em vez de exibir R$ 0,00 como
 * se fosse um mês ruim.
 */
export function montarResumoPlataforma(
  assinaturas: Assinatura[],
  pagamentos: PagamentoAssinatura[],
  agora: Date = new Date()
): ResumoPlataforma {
  const inicioMes = inicioDoMesSaoPaulo(agora);

  const pagos = pagamentos.filter((p) => p.status === 'pago');
  const receitaMes = pagos
    .filter((p) => (p.pago_em ?? p.criado_em) >= inicioMes)
    .reduce((soma, p) => soma + Number(p.valor), 0);

  const porPlano: Record<PlanoLoja, number> = { basico: 0, pro: 0, pro_plus: 0 };
  for (const a of assinaturas) porPlano[a.plano] += 1;

  return {
    receitaMes,
    temPagamentos: pagamentos.length > 0,
    mrr: calcularMrr(assinaturas),
    clientesAtivos: assinaturas.filter((a) => a.status === 'ativa').length,
    novosNoMes: assinaturas.filter((a) => a.criado_em >= inicioMes).length,
    inadimplentes: assinaturas.filter((a) => a.status === 'atrasada').length,
    cancelamentosNoMes: assinaturas.filter(
      (a) => a.status === 'cancelada' && (a.cancelada_em ?? '') >= inicioMes
    ).length,
    porPlano,
    totalLojas: assinaturas.length,
  };
}
