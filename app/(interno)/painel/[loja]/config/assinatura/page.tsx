import { obterLojaPorSlug } from '@/lib/loja';
import { criarClientServidor } from '@/lib/supabase/server';
import { ShellPainel } from '@/components/admin/ShellPainel';
import { normalizarPlano, NOMES_PLANOS } from '@/lib/avaliacoes/tipos';
import { VoltarConfig } from '../VoltarConfig';

export default async function AssinaturaPage({
  params,
}: {
  params: Promise<{ loja: string }>;
}) {
  const { loja: slug } = await params;
  const { loja, souAdmin } = await obterLojaPorSlug(slug);
  if (!loja) return null;

  const sb = await criarClientServidor();
  const { data } = await sb.from('loja_planos').select('plano').eq('loja_id', loja.id).maybeSingle();
  const plano = normalizarPlano(data?.plano);

  return (
    <ShellPainel lojaNome={loja.nome} lojaSlug={loja.slug} souAdmin={souAdmin} titulo="Plano e assinatura">
      <div className="area ativo">
        <VoltarConfig lojaSlug={loja.slug} />
        <div className="card">
          <h2>Plano atual</h2>
          <p className="sub">{NOMES_PLANOS[plano]}</p>
          <p className="dica">Gerenciamento de assinatura em breve.</p>
          <a className="btn-ghost btn-small" href="/#planos" target="_blank" rel="noopener noreferrer">
            Ver planos
          </a>
        </div>
      </div>
    </ShellPainel>
  );
}
