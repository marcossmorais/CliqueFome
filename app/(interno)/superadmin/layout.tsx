import { notFound, redirect } from 'next/navigation';
import { obterUsuario } from '@/lib/loja';
import { criarClientServidor } from '@/lib/supabase/server';
import { ShellSuperAdmin } from '@/components/superadmin/ShellSuperAdmin';

/**
 * Área da plataforma — não do lojista. Aqui ficam faturamento do SaaS,
 * assinaturas e clientes.
 *
 * Esta é a primeira checagem do app que RESTRINGE por is_admin(): em todo
 * o resto do código `souAdmin` só amplia acesso (super admin enxerga
 * qualquer loja). Sem isto, qualquer dono de restaurante logado abriria o
 * MRR e a carteira de clientes inteira.
 *
 * `notFound()` em vez de uma mensagem de "sem permissão" — não confirma
 * pra quem não é da equipe que esta área existe. Quem barra de verdade é
 * a RLS: as tabelas de faturamento só têm policy de leitura pra admin.
 */
export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await obterUsuario();
  if (!user) redirect('/entrar?proximo=/superadmin');

  const sb = await criarClientServidor();
  const { data: ehAdmin } = await sb.rpc('is_admin');
  if (!ehAdmin) notFound();

  return <ShellSuperAdmin email={user.email ?? ''}>{children}</ShellSuperAdmin>;
}
