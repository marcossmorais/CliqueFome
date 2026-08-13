import Link from 'next/link';
import { criarClientServidor } from '@/lib/supabase/server';
import { NOMES_PLANOS } from '@/lib/avaliacoes/tipos';
import {
  NOMES_CICLO,
  NOMES_STATUS_PAGAMENTO,
  type PagamentoAssinatura,
  type StatusPagamento,
} from '@/lib/assinaturas/tipos';
import styles from '../superadmin.module.css';

const DINHEIRO = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const STATUS: readonly StatusPagamento[] = ['pago', 'pendente', 'falhou', 'estornado'];

type SearchParams = Record<string, string | string[] | undefined>;

function classeStatus(status: StatusPagamento) {
  return status === 'pago' ? 'tag tag-ativo' : status === 'estornado' ? 'tag tag-etiqueta' : status === 'falhou' ? 'tag tag-inativo' : 'tag tag-etiqueta';
}

export default async function PagamentosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const bruto = Array.isArray(params.status) ? params.status[0] ?? '' : params.status ?? '';
  const filtro = (STATUS as readonly string[]).includes(bruto) ? (bruto as StatusPagamento) : '';

  const sb = await criarClientServidor();
  let consulta = sb.from('assinatura_pagamentos').select('*');
  if (filtro) consulta = consulta.eq('status', filtro);

  const [{ data: pagamentos }, { data: lojas }] = await Promise.all([
    consulta.order('criado_em', { ascending: false }).limit(200),
    sb.from('lojas').select('id, nome'),
  ]);

  const nomes = new Map((((lojas as { id: string; nome: string }[]) ?? [])).map((l) => [l.id, l.nome]));
  const linhas = ((pagamentos as PagamentoAssinatura[]) ?? []);

  return (
    <div className={`area ativo ${styles.pagina}`}>
      <header className={styles.cabecalho}>
        <span>Plataforma</span>
        <h2>Pagamentos</h2>
        <p>
          Mensalidades que os restaurantes pagam à FlouFood. Não tem nada a ver com os pagamentos
          dos pedidos, que vão do cliente final pro restaurante.
        </p>
      </header>

      <div className={styles.aviso} role="status">
        <span aria-hidden="true">⚠</span>
        <div>
          <strong>Sem integração de gateway ainda</strong>
          Esta lista só é preenchida por confirmação do gateway, via webhook. Não existe (e não vai
          existir) botão de “marcar como pago” aqui: marcar na mão faria o sistema dizer que recebeu
          um dinheiro que o extrato não tem. Para dar cortesia ou estender acesso, use
          <strong> Liberar acesso</strong> em Assinaturas.
        </div>
      </div>

      <form className={styles.filtros} method="get">
        <label>
          Situação
          <select name="status" defaultValue={filtro}>
            <option value="">Todas</option>
            {STATUS.map((s) => (
              <option key={s} value={s}>{NOMES_STATUS_PAGAMENTO[s]}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-primary btn-small">Aplicar</button>
        <Link href="/superadmin/pagamentos" className="btn-ghost btn-small">Limpar</Link>
      </form>

      {linhas.length === 0 ? (
        <div className={styles.vazio}>
          <strong>Nenhum pagamento registrado</strong>
          <p>
            Assim que o gateway estiver integrado, cada cobrança confirmada aparece aqui com loja,
            plano, valor e situação.
          </p>
        </div>
      ) : (
        <div className={styles.lista}>
          {linhas.map((pagamento) => (
            <div key={pagamento.id} className={styles.linha}>
              <div>
                <strong>{nomes.get(pagamento.loja_id) ?? 'Loja removida'}</strong>
                <small>
                  {new Date(pagamento.pago_em ?? pagamento.criado_em).toLocaleDateString('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                  })}
                </small>
              </div>
              <span className="tag tag-etiqueta">{NOMES_PLANOS[pagamento.plano]}</span>
              <span className={classeStatus(pagamento.status)}>
                {NOMES_STATUS_PAGAMENTO[pagamento.status]}
              </span>
              <span className={styles.valor}>
                {DINHEIRO.format(Number(pagamento.valor))}
                <small style={{ fontWeight: 500 }}>{NOMES_CICLO[pagamento.ciclo]}</small>
              </span>
              <span />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
