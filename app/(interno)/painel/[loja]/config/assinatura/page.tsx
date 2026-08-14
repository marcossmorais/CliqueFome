import { obterLojaPorSlug } from '@/lib/loja';
import { criarClientServidor } from '@/lib/supabase/server';
import { normalizarPlano, NOMES_PLANOS } from '@/lib/assinaturas/tipos';
import { VoltarConfig } from '../VoltarConfig';

export default async function AssinaturaPage({
  params,
}: {
  params: Promise<{ loja: string }>;
}) {
  const { loja: slug } = await params;
  const { loja } = await obterLojaPorSlug(slug);
  if (!loja) return null;

  const sb = await criarClientServidor();
  const { data } = await sb.from('assinaturas').select('plano').eq('loja_id', loja.id).maybeSingle();
  const plano = normalizarPlano(data?.plano);

  return (
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
  );
}
