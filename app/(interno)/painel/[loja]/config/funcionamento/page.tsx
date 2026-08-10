import { obterLojaPorSlug } from '@/lib/loja';
import { ShellPainel } from '@/components/admin/ShellPainel';
import { VoltarConfig } from '../VoltarConfig';
import { FuncionamentoForm } from './FuncionamentoForm';

export default async function FuncionamentoPage({
  params,
}: {
  params: Promise<{ loja: string }>;
}) {
  const { loja: slug } = await params;
  const { loja, souAdmin } = await obterLojaPorSlug(slug);
  if (!loja) return null;

  return (
    <ShellPainel lojaNome={loja.nome} lojaSlug={loja.slug} souAdmin={souAdmin} titulo="Funcionamento">
      <div className="area ativo">
        <VoltarConfig lojaSlug={loja.slug} />
        <FuncionamentoForm loja={loja} />
      </div>
    </ShellPainel>
  );
}
