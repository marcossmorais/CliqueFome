import { redirect } from 'next/navigation';
import { obterLojaAtual, obterUsuario } from '@/lib/loja';
import { SairDaConta } from './SairDaConta';
import { TemaAdmin } from '@/components/admin/TemaAdmin';
import '../admin.css';

/**
 * Destino de quem está logado mas não tem loja.
 *
 * Fica FORA do grupo `(painel)` de propósito: o layout de lá redireciona
 * pra cá justamente quando não há loja, e a rota dentro do grupo entraria
 * em laço. Antes esta rota nem existia — o painel mandava o usuário pra um
 * 404 e não havia saída nenhuma da conta.
 *
 * Ainda NÃO tem formulário de criar loja: o modelo de onboarding (convite,
 * aprovação ou cadastro aberto), a quota por usuário e a reserva de slug
 * são decisões de produto em aberto. Hoje quem cria loja é o super admin.
 */
export default async function CriarLojaPage() {
  const user = await obterUsuario();
  if (!user) redirect('/admin/login');

  // Se a loja apareceu (super admin acabou de criar, ou o cookie foi
  // corrigido), esta página não tem mais razão de existir.
  const { loja } = await obterLojaAtual();
  if (loja) redirect('/admin/inicio');

  return (
    <main className="onboarding">
      <TemaAdmin flutuante />
      <div className="onboarding-caixa">
        <h1>Sua conta ainda não tem uma loja</h1>
        <p>
          O acesso está certo — o que falta é uma loja ligada a <strong>{user.email}</strong>. Quem
          cria a loja é a equipe do CliqueFome.
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
