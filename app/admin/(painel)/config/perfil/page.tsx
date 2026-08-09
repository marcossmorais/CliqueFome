import { redirect } from 'next/navigation';
import { obterLojaAtual, obterUsuario } from '@/lib/loja';
import { ShellPainel } from '@/components/admin/ShellPainel';
import { VoltarConfig } from '../VoltarConfig';
import { PerfilForm } from './PerfilForm';

export default async function PerfilPage() {
  const [{ loja, souAdmin }, usuario] = await Promise.all([obterLojaAtual(), obterUsuario()]);
  if (!loja) return null;
  if (!usuario) redirect('/admin/login');

  const meta = usuario.user_metadata as { nome?: string; telefone?: string; avatar_url?: string };

  return (
    <ShellPainel lojaNome={loja.nome} lojaSlug={loja.slug} souAdmin={souAdmin} titulo="Meu perfil">
      <div className="area ativo">
        <VoltarConfig />
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
