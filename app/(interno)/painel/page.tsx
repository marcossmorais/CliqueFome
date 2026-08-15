import { redirect } from 'next/navigation';
import { obterPrimeiraLoja, obterUsuario } from '@/lib/loja';
import { resolverEtapa } from '@/lib/onboarding/dados';

/**
 * Entrada do painel sem slug. Existe porque quem chega aqui não tem como
 * saber o slug: o link "Acessar conta" da landing, o destino padrão
 * depois do login e qualquer atalho antigo caem neste ponto, que resolve
 * a loja e redireciona pra /painel/<slug>/inicio.
 *
 * Superadmin sempre vai primeiro para a área da plataforma, tenha ou não uma
 * loja associada à conta. O acesso temporário a uma loja parte da lista de
 * clientes e oferece um caminho explícito de volta.
 */
export default async function PainelPage() {
  const user = await obterUsuario();
  if (!user) redirect('/entrar?proximo=/painel');

  const { loja, souAdmin } = await obterPrimeiraLoja();
  if (souAdmin) redirect('/superadmin');
  // Loja com cadastro pela metade volta pro passo que faltou, não pro painel:
  // sem endereço não há de onde sair entrega nem onde o cliente retirar.
  if (loja) {
    const etapa = resolverEtapa({ temSessao: true, loja });
    redirect(etapa === 'DONE' ? `/painel/${loja.slug}/inicio` : '/cadastro');
  }
  redirect('/cadastro');
}
