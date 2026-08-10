import { ShellPainel } from '@/components/admin/ShellPainel';
import { obterLojaPorSlug } from '@/lib/loja';
import { CATEGORIAS_FAQ, PERGUNTAS_FREQUENTES, TUTORIAIS } from '@/lib/suporte/conteudo';
import { CentralAjuda } from './CentralAjuda';

export default async function SuportePage({
  params,
}: {
  params: Promise<{ loja: string }>;
}) {
  const { loja: slug } = await params;
  const { loja, souAdmin } = await obterLojaPorSlug(slug);
  if (!loja) return null;

  return (
    <ShellPainel lojaNome={loja.nome} lojaSlug={loja.slug} souAdmin={souAdmin} titulo="Ajuda e suporte">
      <CentralAjuda
        lojaSlug={loja.slug}
        categorias={CATEGORIAS_FAQ.map((categoria) => ({ ...categoria }))}
        perguntas={PERGUNTAS_FREQUENTES}
        tutoriais={TUTORIAIS}
      />
    </ShellPainel>
  );
}
