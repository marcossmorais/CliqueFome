import { criarClientServidor } from '@/lib/supabase/server';
import { NOMES_PLANOS, type PlanoLoja } from '@/lib/avaliacoes/tipos';
import { montarResumoPlataforma } from '@/lib/assinaturas/metricas';
import type { Assinatura, PagamentoAssinatura } from '@/lib/assinaturas/tipos';
import styles from './superadmin.module.css';

const DINHEIRO = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const ORDEM_PLANOS: PlanoLoja[] = ['basico', 'pro', 'pro_plus'];

export default async function SuperAdminDashboard() {
  const sb = await criarClientServidor();

  // A RLS já limita estas tabelas a admin; o layout garante que só admin
  // chega aqui. Não é preciso client privilegiado.
  const [{ data: assinaturas }, { data: pagamentos }] = await Promise.all([
    sb.from('assinaturas').select('*'),
    sb.from('assinatura_pagamentos').select('*'),
  ]);

  const resumo = montarResumoPlataforma(
    (assinaturas as Assinatura[]) ?? [],
    (pagamentos as PagamentoAssinatura[]) ?? []
  );

  return (
    <div className={`area ativo ${styles.pagina}`}>
      <header className={styles.cabecalho}>
        <span>Plataforma</span>
        <h2>Visão do negócio</h2>
        <p>Faturamento da FlouFood — separado do financeiro de cada restaurante.</p>
      </header>

      {!resumo.temPagamentos && (
        <div className={styles.aviso} role="status">
          <span aria-hidden="true">⚠</span>
          <div>
            <strong>Nenhum pagamento registrado ainda</strong>
            Sem integração de gateway, nada alimenta os pagamentos da plataforma. Receita recebida
            fica em zero de propósito — não é um mês ruim, é dado que ainda não existe. MRR e
            contagem de clientes já valem, porque saem das assinaturas cadastradas.
          </div>
        </div>
      )}

      <section className={styles.kpis} aria-label="Indicadores da plataforma">
        <article className={styles.kpi}>
          <span>Receita recebida este mês</span>
          <strong>{DINHEIRO.format(resumo.receitaMes)}</strong>
          {resumo.temPagamentos ? (
            <small>Só pagamentos confirmados</small>
          ) : (
            <small className={styles.aguardando}>Aguardando integração do gateway</small>
          )}
        </article>
        <article className={styles.kpi}>
          <span>MRR</span>
          <strong>{DINHEIRO.format(resumo.mrr)}</strong>
          <small>Assinaturas ativas, normalizadas por mês</small>
        </article>
        <article className={styles.kpi}>
          <span>Clientes ativos</span>
          <strong>{resumo.clientesAtivos}</strong>
          <small>de {resumo.totalLojas} lojas cadastradas</small>
        </article>
        <article className={styles.kpi}>
          <span>Novos este mês</span>
          <strong>{resumo.novosNoMes}</strong>
          <small>Assinaturas criadas no mês</small>
        </article>
        <article className={styles.kpi}>
          <span>Inadimplentes</span>
          <strong>{resumo.inadimplentes}</strong>
          <small>Assinaturas marcadas como atrasadas</small>
        </article>
        <article className={styles.kpi}>
          <span>Cancelamentos este mês</span>
          <strong>{resumo.cancelamentosNoMes}</strong>
          <small>Renovação cancelada no mês</small>
        </article>
      </section>

      <div className="card">
        <h2>Clientes por plano</h2>
        <p className="sub">Distribuição da carteira entre os três planos.</p>
        <div className={styles.planos}>
          {ORDEM_PLANOS.map((plano) => {
            const total = resumo.porPlano[plano];
            const proporcao = resumo.totalLojas ? (total / resumo.totalLojas) * 100 : 0;
            return (
              <div key={plano} className={styles.planoLinha}>
                <span>{NOMES_PLANOS[plano]}</span>
                <div className={styles.barra} aria-hidden="true">
                  <i style={{ width: `${proporcao}%` }} />
                </div>
                <b>
                  {total} {total === 1 ? 'cliente' : 'clientes'}
                </b>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
