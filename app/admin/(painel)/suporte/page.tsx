import { ShellPainel } from '@/components/admin/ShellPainel';
import { obterLojaAtual } from '@/lib/loja';
import { CATEGORIAS_FAQ, PERGUNTAS_FREQUENTES, TUTORIAIS } from '@/lib/suporte/conteudo';
import { CentralAjuda } from './CentralAjuda';

export default async function SuportePage() {
  const { loja, souAdmin } = await obterLojaAtual();
  if (!loja) return null;

  return (
    <ShellPainel lojaNome={loja.nome} lojaSlug={loja.slug} souAdmin={souAdmin} titulo="Ajuda e suporte">
      <CentralAjuda
        categorias={CATEGORIAS_FAQ.map((categoria) => ({ ...categoria }))}
        perguntas={PERGUNTAS_FREQUENTES}
        tutoriais={TUTORIAIS}
      />
    </ShellPainel>
  );
}
