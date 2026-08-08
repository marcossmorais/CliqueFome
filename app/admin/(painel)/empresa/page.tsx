import { obterLojaAtual } from '@/lib/loja';
import { ShellPainel } from '@/components/admin/ShellPainel';
import { AparenciaForm } from './AparenciaForm';
import { DadosLojaForm } from './DadosLojaForm';

/**
 * Minha empresa: aparência do cardápio (logo, capa, cor da marca) e dados
 * da loja. O card "Status da loja" (delivery ativo / recebendo encomendas)
 * do admin.html original fica de fora por enquanto — a pedido do usuário,
 * essa parte vai ser repensada antes de migrar.
 */
export default async function EmpresaPage() {
  const { loja, souAdmin } = await obterLojaAtual();
  if (!loja) return null;

  return (
    <ShellPainel lojaNome={loja.nome} lojaSlug={loja.slug} souAdmin={souAdmin} titulo="Minha empresa">
      <div className="area ativo">
        <AparenciaForm loja={loja} />
        <DadosLojaForm loja={loja} />
      </div>
    </ShellPainel>
  );
}
