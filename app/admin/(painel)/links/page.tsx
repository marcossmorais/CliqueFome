import { headers } from 'next/headers';
import { obterLojaAtual } from '@/lib/loja';
import { ShellPainel } from '@/components/admin/ShellPainel';
import { CaixaLink } from './CaixaLink';

export default async function LinksPage() {
  const { loja, souAdmin } = await obterLojaAtual();
  if (!loja) return null;

  // A URL base vem do host da requisição — assim o link sai certo em
  // localhost, preview da Vercel e domínio final, sem env var extra.
  const h = await headers();
  const host = h.get('host') ?? 'localhost:3000';
  const protocolo = host.startsWith('localhost') ? 'http' : 'https';
  const linkDelivery = `${protocolo}://${host}/${loja.slug}`;

  return (
    <ShellPainel
      lojaNome={loja.nome}
      lojaSlug={loja.slug}
      souAdmin={souAdmin}
      titulo="Links do cardápio"
    >
      <div className="area ativo">
        <div className="card">
          <h2>Links do cardápio</h2>
          <p className="sub">
            Compartilhe com seus clientes. O link muda junto se você trocar o endereço da loja.
          </p>
          <label>Cardápio de delivery</label>
          <CaixaLink url={linkDelivery} />
        </div>
      </div>
    </ShellPainel>
  );
}
