import { obterLojaAtual } from '@/lib/loja';
import { ShellPainel } from '@/components/admin/ShellPainel';
import { VoltarConfig } from '../VoltarConfig';
import { FuncionamentoForm } from './FuncionamentoForm';

export default async function FuncionamentoPage() {
  const { loja, souAdmin } = await obterLojaAtual();
  if (!loja) return null;

  return (
    <ShellPainel lojaNome={loja.nome} lojaSlug={loja.slug} souAdmin={souAdmin} titulo="Funcionamento">
      <div className="area ativo">
        <VoltarConfig />
        <FuncionamentoForm loja={loja} />
      </div>
    </ShellPainel>
  );
}
