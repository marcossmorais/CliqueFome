import { obterLojaPorSlug } from '@/lib/loja';
import { VoltarConfig } from '../VoltarConfig';
import { FuncionamentoForm } from './FuncionamentoForm';

export default async function FuncionamentoPage({
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
      <FuncionamentoForm loja={loja} />
    </div>
  );
}
