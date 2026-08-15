import { redirect } from 'next/navigation';
import { obterPrimeiraLoja, obterUsuario } from '@/lib/loja';
import { resolverEtapa } from '@/lib/onboarding/dados';

/**
 * Endereço antigo de quem estava logado sem loja.
 *
 * Enquanto criar loja era trabalho do super admin, esta página só explicava a
 * espera. Agora o dono cria a própria loja em `/cadastro`, então aqui só
 * sobrou o redirecionamento — a rota continua existindo porque ela está em
 * link salvo, no proxy e no histórico de quem já passou por ela.
 */
export default async function CriarLojaPage() {
  const user = await obterUsuario();
  if (!user) redirect('/entrar');

  const { loja } = await obterPrimeiraLoja();
  if (loja && resolverEtapa({ temSessao: true, loja }) === 'DONE') {
    redirect(`/painel/${loja.slug}/inicio`);
  }
  redirect('/cadastro');
}
