import { obterLojaAtual } from '@/lib/loja';
import { ShellPainel } from '@/components/admin/ShellPainel';

/**
 * Placeholder do catálogo — a migração da tela inteira é o próximo passo.
 * Já usa a casca definitiva pra o menu ficar navegável desde agora.
 */
export default async function CatalogoPage() {
  const { loja, souAdmin } = await obterLojaAtual();
  if (!loja) return null;

  return (
    <ShellPainel lojaNome={loja.nome} lojaSlug={loja.slug} souAdmin={souAdmin} titulo="Catálogo">
      <div className="area ativo">
        <div className="card em-breve">
          <h2>Catálogo</h2>
          <p>Esta tela é a próxima da fila de migração.</p>
        </div>
      </div>
    </ShellPainel>
  );
}
