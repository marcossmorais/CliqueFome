import { redirect } from 'next/navigation';
import { obterPrimeiraLoja, obterUsuario } from '@/lib/loja';

/**
 * Entrada do painel sem slug. Existe porque quem chega aqui não tem como
 * saber o slug: o link "Acessar conta" da landing, o destino padrão
 * depois do login e qualquer atalho antigo caem neste ponto, que resolve
 * a loja e redireciona pra /painel/<slug>/inicio.
 *
 * Super admin sem loja própria vai pro /superadmin — senão cairia em
 * "crie sua loja", que não é o caso dele.
 */
export default async function PainelPage() {
  const user = await obterUsuario();
  if (!user) redirect('/entrar?proximo=/painel');

  const { loja, souAdmin } = await obterPrimeiraLoja();
  if (loja) redirect(`/painel/${loja.slug}/inicio`);
  if (souAdmin) redirect('/superadmin');
  redirect('/criar-loja');
}
