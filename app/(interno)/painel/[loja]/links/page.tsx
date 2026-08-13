import { headers } from 'next/headers';
import { obterLojaPorSlug } from '@/lib/loja';
import { CaixaLink } from './CaixaLink';

export default async function LinksPage({
  params,
}: {
  params: Promise<{ loja: string }>;
}) {
  const { loja: slug } = await params;
  const { loja } = await obterLojaPorSlug(slug);
  if (!loja) return null;

  // A URL base vem do host da requisição — assim o link sai certo em
  // localhost, preview da Vercel e domínio final, sem env var extra.
  const h = await headers();
  const host = h.get('host') ?? 'localhost:3000';
  const protocolo = host.startsWith('localhost') ? 'http' : 'https';
  const linkCardapio = `${protocolo}://${host}/${loja.slug}`;

  return (
    <div className="area ativo">
      <div className="card">
        <h2>Links do cardápio</h2>
        <p className="sub">
          Compartilhe com seus clientes. O link muda junto se você trocar o endereço da loja.
        </p>
        <label>Cardápio público</label>
        <CaixaLink url={linkCardapio} />
      </div>
    </div>
  );
}
