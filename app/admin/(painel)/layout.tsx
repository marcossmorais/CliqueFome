import { redirect } from 'next/navigation';
import { criarClientServidor } from '@/lib/supabase/server';
import { obterLojaAtual } from '@/lib/loja';
import '../admin.css';

/**
 * Layout da área autenticada. O login fica FORA deste grupo de rotas — se
 * estivesse dentro, a checagem abaixo se aplicaria a ele e daria loop.
 *
 * A verificação aqui é redundante com o proxy.ts de propósito: se um dia o
 * matcher do proxy deixar uma rota de fora, a página ainda não renderiza
 * pra quem não está logado.
 *
 * A casca (menu lateral) fica em cada página e não aqui porque o título do
 * cabeçalho muda por área.
 */
export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const sb = await criarClientServidor();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/admin/login');

  const { loja } = await obterLojaAtual();
  if (!loja) redirect('/admin/criar-loja');

  return <>{children}</>;
}
