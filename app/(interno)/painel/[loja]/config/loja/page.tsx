import { obterLojaPorSlug } from '@/lib/loja';
import { VoltarConfig } from '../VoltarConfig';
import { MinhaLojaForm } from './MinhaLojaForm';

export default async function MinhaLojaPage({
  params,
}: {
  params: Promise<{ loja: string }>;
}) {
  const { loja: slug } = await params;
  const { loja } = await obterLojaPorSlug(slug);
  if (!loja) return null;

  return (
    <div className="area ativo">
      <VoltarConfig lojaSlug={loja.slug} />
      <MinhaLojaForm loja={loja} />
    </div>
  );
}
