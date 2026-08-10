import { obterLojaPorSlug } from '@/lib/loja';
import { ShellPainel } from '@/components/admin/ShellPainel';
import { ConfigHub } from './ConfigHub';

export default async function ConfigPage({
  params,
}: {
  params: Promise<{ loja: string }>;
}) {
  const { loja: slug } = await params;
  const { loja, souAdmin } = await obterLojaPorSlug(slug);
  if (!loja) return null;

  return (
    <ShellPainel lojaNome={loja.nome} lojaSlug={loja.slug} souAdmin={souAdmin} titulo="Configurações">
      <div className="area ativo">
        <ConfigHub lojaSlug={loja.slug} />
      </div>
    </ShellPainel>
  );
}
