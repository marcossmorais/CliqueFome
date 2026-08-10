import { redirect } from 'next/navigation';
import { obterLojaPorSlug, obterUsuario } from '@/lib/loja';
import { ShellPainel } from '@/components/admin/ShellPainel';
import { VoltarConfig } from '../VoltarConfig';
import { PerfilForm } from './PerfilForm';

export default async function PerfilPage({
  params,
}: {
  params: Promise<{ loja: string }>;
}) {
  const { loja: slug } = await params;
  const [{ loja, souAdmin }, usuario] = await Promise.all([
    obterLojaPorSlug(slug),
    obterUsuario(),
  ]);
  if (!loja) return null;
  if (!usuario) redirect('/entrar');

  const meta = usuario.user_metadata as { nome?: string; telefone?: string; avatar_url?: string };

  return (
    <ShellPainel lojaNome={loja.nome} lojaSlug={loja.slug} souAdmin={souAdmin} titulo="Meu perfil">
      <div className="area ativo">
        <VoltarConfig lojaSlug={loja.slug} />
        <PerfilForm
          lojaId={loja.id}
          email={usuario.email ?? ''}
          nome={meta.nome ?? ''}
          telefone={meta.telefone ?? ''}
          avatarUrl={meta.avatar_url ?? null}
        />
      </div>
    </ShellPainel>
  );
}
