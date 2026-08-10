import { redirect } from 'next/navigation';
import { obterPrimeiraLoja, obterUsuario } from '@/lib/loja';

/**
 * Entrada do painel sem slug. Existe porque quem chega aqui não tem como
 * saber o slug: o link "Acessar conta" da landing, o destino padrão
 * depois do login e qualquer atalho antigo caem neste ponto, que resolve
 * a loja e redireciona pra /painel/<slug>/inicio.
 *
 * Quem não tem loja nenhuma vai pra /criar-loja. Quando o /superadmin
 * existir (Fase B), o super admin sem loja própria passa a cair lá.
 */
export default async function PainelPage() {
  const user = await obterUsuario();
  if (!user) redirect('/entrar?proximo=/painel');

  const { loja } = await obterPrimeiraLoja();
  if (loja) redirect(`/painel/${loja.slug}/inicio`);
  redirect('/criar-loja');
}
