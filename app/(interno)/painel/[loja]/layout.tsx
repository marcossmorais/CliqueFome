import { notFound, redirect } from 'next/navigation';
import { obterLojaPorSlug, obterUsuario } from '@/lib/loja';
import { OperacaoProvider } from '@/components/admin/StatusOperacional';

/**
 * Layout do painel de UMA loja. O login fica fora desta subárvore — se
 * estivesse dentro, a checagem abaixo se aplicaria a ele e daria loop.
 *
 * A verificação aqui é redundante com o proxy.ts de propósito: se um dia o
 * matcher do proxy deixar uma rota de fora, a página ainda não renderiza
 * pra quem não está logado. Como obterUsuario/obterLojaPorSlug são
 * memoizados por requisição, essa redundância não custa round-trip extra —
 * a página filha reaproveita o mesmo resultado.
 *
 * É AQUI que um estabelecimento é impedido de abrir o de outro: o slug da
 * URL só resolve pra uma loja se ela for do usuário logado (super admin é
 * a exceção, pra suporte). Slug inexistente e slug de terceiro devolvem o
 * MESMO 404, pra não confirmar quais lojas existem. A fronteira de
 * segurança de verdade continua sendo a RLS no banco.
 *
 * A casca (menu lateral) fica em cada página e não aqui porque o título do
 * cabeçalho muda por área.
 */
export default async function PainelLojaLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ loja: string }>;
}) {
  const user = await obterUsuario();
  if (!user) redirect('/entrar');

  const { loja: slug } = await params;
  const { loja } = await obterLojaPorSlug(slug);
  if (!loja) notFound();

  return (
    <OperacaoProvider
      lojaId={loja.id}
      estadoInicial={{
        lojaAberta: loja.recebendo_encomendas,
        delivery: loja.delivery_ativo,
        retirada: loja.retirada_ativa,
      }}
    >
      {children}
    </OperacaoProvider>
  );
}
