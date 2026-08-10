import { ShellPainel } from '@/components/admin/ShellPainel';
import { obterLojaPorSlug } from '@/lib/loja';

export default async function CozinhaLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ loja: string }>;
}) {
  const { loja: slug } = await params;
  const { loja, souAdmin } = await obterLojaPorSlug(slug);
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
