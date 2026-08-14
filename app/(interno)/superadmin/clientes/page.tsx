import Link from 'next/link';
import { criarClientServidor } from '@/lib/supabase/server';
import { NOMES_PLANOS } from '@/lib/assinaturas/tipos';
import {
  NOMES_CICLO,
  NOMES_STATUS_ASSINATURA,
  temAcessoLiberado,
  type Assinatura,
} from '@/lib/assinaturas/tipos';
import styles from '../superadmin.module.css';

const DINHEIRO = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function classeStatus(status: Assinatura['status']) {
  return status === 'ativa' ? 'tag tag-ativo' : status === 'cancelada' ? 'tag tag-inativo' : 'tag tag-etiqueta';
}

export default async function ClientesPage() {
  const sb = await criarClientServidor();

  const [{ data: lojas }, { data: assinaturas }] = await Promise.all([
    sb.from('lojas').select('id, slug, nome, cidade, created_at').order('created_at'),
    sb.from('assinaturas').select('*'),
  ]);

  const porLoja = new Map((((assinaturas as Assinatura[]) ?? [])).map((a) => [a.loja_id, a]));
  const linhas = ((lojas as { id: string; slug: string; nome: string; cidade: string | null; created_at: string }[]) ?? []).map(
    (loja) => ({ loja, assinatura: porLoja.get(loja.id) ?? null })
  );

  return (
    <div className={`area ativo ${styles.pagina}`}>
      <header className={styles.cabecalho}>
        <span>Plataforma</span>
        <h2>Clientes</h2>
        <p>Restaurantes na plataforma. Entrar no painel de um cliente fica registrado em auditoria.</p>
      </header>

      {linhas.length === 0 ? (
        <div className={styles.vazio}>
          <strong>Nenhuma loja cadastrada</strong>
          <p>Quando existir a primeira loja, ela aparece aqui com plano e status da assinatura.</p>
        </div>
      ) : (
        <div className={styles.lista}>
          {linhas.map(({ loja, assinatura }) => (
            <div key={loja.id} className={styles.linha}>
              <div>
                <strong>{loja.nome}</strong>
                <small>
                  /{loja.slug}
                  {loja.cidade ? ` · ${loja.cidade}` : ''}
                </small>
              </div>
              <span className="tag tag-etiqueta">
                {assinatura ? NOMES_PLANOS[assinatura.plano] : 'Sem assinatura'}
              </span>
              <span className={assinatura ? classeStatus(assinatura.status) : 'tag tag-inativo'}>
                {assinatura ? NOMES_STATUS_ASSINATURA[assinatura.status] : '—'}
              </span>
              <span className={styles.valor}>
                {assinatura ? DINHEIRO.format(Number(assinatura.valor)) : '—'}
                {assinatura && (
                  <small style={{ fontWeight: 500 }}>
                    {NOMES_CICLO[assinatura.ciclo]}
                    {temAcessoLiberado(assinatura) ? ' · cortesia ativa' : ''}
                  </small>
                )}
              </span>
              {/* Rota (não Link direto pro painel) porque a entrada precisa
                  gravar o evento de auditoria antes de redirecionar. */}
              <Link href={`/superadmin/clientes/${loja.id}/entrar`} className="btn-ghost btn-small" prefetch={false}>
                Ver painel desta loja
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
