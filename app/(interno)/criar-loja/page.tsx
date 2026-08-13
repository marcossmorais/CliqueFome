import { redirect } from 'next/navigation';
import { obterPrimeiraLoja, obterUsuario } from '@/lib/loja';
import { SairDaConta } from './SairDaConta';
import { TemaAdmin } from '@/components/admin/TemaAdmin';

/**
 * Destino de quem está logado mas não tem loja.
 *
 * Fica FORA de `/painel` de propósito: sem loja não existe slug, então não
 * haveria URL possível lá dentro — e a rota que resolve o painel manda pra
 * cá justamente quando não acha loja nenhuma.
 *
 * Ainda NÃO tem formulário de criar loja: o modelo de onboarding (convite,
 * aprovação ou cadastro aberto), a quota por usuário e a reserva de slug
 * são decisões de produto em aberto. Hoje quem cria loja é o super admin.
 */
export default async function CriarLojaPage() {
  const user = await obterUsuario();
  if (!user) redirect('/entrar');

  // Se a loja apareceu (o super admin acabou de criar), esta página não
  // tem mais razão de existir.
  const { loja } = await obterPrimeiraLoja();
  if (loja) redirect(`/painel/${loja.slug}/inicio`);

  return (
    <main className="onboarding">
      <TemaAdmin flutuante />
      <div className="onboarding-caixa">
        <h1>Sua conta ainda não tem uma loja</h1>
        <p>
          O acesso está certo — o que falta é uma loja ligada a <strong>{user.email}</strong>. Quem
          cria a loja é a equipe da FlouFood.
        </p>
        <p className="onboarding-ajuda">
          Se você já pediu a criação, fale com quem está te atendendo e informe este e-mail. Assim
          que a loja existir, é só recarregar esta página.
        </p>
        <SairDaConta />
      </div>
    </main>
  );
}
