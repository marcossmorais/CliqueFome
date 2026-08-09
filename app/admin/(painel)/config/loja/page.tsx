import { obterLojaAtual } from '@/lib/loja';
import { ShellPainel } from '@/components/admin/ShellPainel';
import { VoltarConfig } from '../VoltarConfig';
import { MinhaLojaForm } from './MinhaLojaForm';

export default async function MinhaLojaPage() {
  const { loja, souAdmin } = await obterLojaAtual();
  if (!loja) return null;

  return (
    <ShellPainel lojaNome={loja.nome} lojaSlug={loja.slug} souAdmin={souAdmin} titulo="Minha loja">
      <div className="area ativo">
        <VoltarConfig />
        <MinhaLojaForm loja={loja} />
      </div>
    </ShellPainel>
  );
}
