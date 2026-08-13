import { CATEGORIAS_FAQ, PERGUNTAS_FREQUENTES, TUTORIAIS } from '@/lib/suporte/conteudo';
import { CentralAjuda } from './CentralAjuda';

export default async function SuportePage({
  params,
}: {
  params: Promise<{ loja: string }>;
}) {
  const { loja: slug } = await params;

  return (
    <CentralAjuda
      lojaSlug={slug}
      categorias={CATEGORIAS_FAQ.map((categoria) => ({ ...categoria }))}
      perguntas={PERGUNTAS_FREQUENTES}
      tutoriais={TUTORIAIS}
    />
  );
}
