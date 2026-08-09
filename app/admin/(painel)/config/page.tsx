import { obterLojaAtual } from '@/lib/loja';
import { ShellPainel } from '@/components/admin/ShellPainel';
import { ConfigHub } from './ConfigHub';

export default async function ConfigPage() {
  const { loja, souAdmin } = await obterLojaAtual();
  if (!loja) return null;

  return (
    <ShellPainel lojaNome={loja.nome} lojaSlug={loja.slug} souAdmin={souAdmin} titulo="Configurações">
      <div className="area ativo">
        <ConfigHub />
      </div>
    </ShellPainel>
  );
}
