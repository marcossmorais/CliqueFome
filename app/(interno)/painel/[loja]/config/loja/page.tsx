import { obterLojaPorSlug } from '@/lib/loja';
import { ShellPainel } from '@/components/admin/ShellPainel';
import { VoltarConfig } from '../VoltarConfig';
import { MinhaLojaForm } from './MinhaLojaForm';

export default async function MinhaLojaPage({
  params,
}: {
  params: Promise<{ loja: string }>;
}) {
  const { loja: slug } = await params;
  const { loja, souAdmin } = await obterLojaPorSlug(slug);
  if (!loja) return null;

  return (
    <ShellPainel lojaNome={loja.nome} lojaSlug={loja.slug} souAdmin={souAdmin} titulo="Minha loja">
      <div className="area ativo">
        <VoltarConfig lojaSlug={loja.slug} />
        <MinhaLojaForm loja={loja} />
      </div>
    </ShellPainel>
  );
}
