import { ShellPainel } from '@/components/admin/ShellPainel';
import { obterLojaAtual } from '@/lib/loja';

export default async function CozinhaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { loja, souAdmin } = await obterLojaAtual();
  if (!loja) return null;

  return (
    <ShellPainel
      lojaNome={loja.nome}
      lojaSlug={loja.slug}
      souAdmin={souAdmin}
      titulo="Cozinha"
    >
      {children}
    </ShellPainel>
  );
}
