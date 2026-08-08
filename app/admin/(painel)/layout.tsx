import { redirect } from 'next/navigation';
import { criarClientServidor } from '@/lib/supabase/server';
import '../admin.css';

/**
 * Layout da área autenticada. O login fica FORA deste grupo de rotas —
 * se estivesse dentro, a checagem abaixo se aplicaria a ele e daria loop.
 *
 * A verificação aqui é redundante com o proxy.ts de propósito: se um dia
 * o matcher do proxy mudar e deixar uma rota de fora, a página ainda não
 * renderiza pra quem não está logado.
 */
export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const sb = await criarClientServidor();
  const { data: { user } } = await sb.auth.getUser();

  if (!user) redirect('/admin/login');

  return <>{children}</>;
}
