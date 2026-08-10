import { criarClientServidor } from '@/lib/supabase/server';
import type { Assinatura } from '@/lib/assinaturas/tipos';
import { AssinaturasClient, type LinhaAssinatura } from './AssinaturasClient';
import styles from '../superadmin.module.css';

type SearchParams = Record<string, string | string[] | undefined>;

function unico(valor: string | string[] | undefined) {
  return Array.isArray(valor) ? valor[0] ?? '' : valor ?? '';
}

function permitido<T extends string>(valor: string, opcoes: readonly T[]): T | '' {
  return opcoes.includes(valor as T) ? (valor as T) : '';
}

export default async function AssinaturasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  // Whitelist antes de chegar na query — mesmo padrão do histórico de pedidos.
  const filtros = {
    status: permitido(unico(params.status), ['ativa', 'pendente', 'atrasada', 'cancelada'] as const),
    plano: permitido(unico(params.plano), ['basico', 'pro', 'pro_plus'] as const),
    ciclo: permitido(unico(params.ciclo), ['mensal', 'semestral', 'anual'] as const),
  };

  const sb = await criarClientServidor();
  let consulta = sb.from('assinaturas').select('*');
  if (filtros.status) consulta = consulta.eq('status', filtros.status);
  if (filtros.plano) consulta = consulta.eq('plano', filtros.plano);
  if (filtros.ciclo) consulta = consulta.eq('ciclo', filtros.ciclo);

  const [{ data: assinaturas }, { data: lojas }] = await Promise.all([
    consulta.order('criado_em', { ascending: false }),
    sb.from('lojas').select('id, nome, slug'),
  ]);

  const nomes = new Map(
    (((lojas as { id: string; nome: string; slug: string }[]) ?? [])).map((l) => [l.id, l])
  );

  const linhas: LinhaAssinatura[] = (((assinaturas as Assinatura[]) ?? [])).map((a) => ({
    assinatura: a,
    lojaNome: nomes.get(a.loja_id)?.nome ?? 'Loja removida',
    lojaSlug: nomes.get(a.loja_id)?.slug ?? '',
  }));

  return (
    <div className={`area ativo ${styles.pagina}`}>
      <header className={styles.cabecalho}>
        <span>Plataforma</span>
        <h2>Assinaturas</h2>
        <p>Plano, ciclo e situação de cada cliente. Toda alteração fica registrada em auditoria.</p>
      </header>

      <AssinaturasClient linhas={linhas} filtros={filtros} />
    </div>
  );
}
