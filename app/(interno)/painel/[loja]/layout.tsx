import { notFound, redirect } from 'next/navigation';
import { obterLojaPorSlug, obterUsuario } from '@/lib/loja';
import { etapaDaLoja } from '@/lib/onboarding/dados';
import { OperacaoProvider } from '@/components/admin/StatusOperacional';
import { ShellPainel } from '@/components/admin/ShellPainel';

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
 * A casca fica neste layout para sobreviver às navegações entre áreas. O
 * título é resolvido no cliente pelo pathname; assim sidebar, cabeçalho,
 * estado do drawer e controles operacionais não são remontados a cada clique.
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
  const { loja, souAdmin } = await obterLojaPorSlug(slug);
  if (!loja) notFound();

  // Cadastro pela metade não abre o painel: a loja existe, mas sem endereço
  // confirmado o cardápio não sabe de onde sai a entrega. O super admin passa
  // — ele entra em loja de terceiro justamente pra dar suporte, inclusive
  // quando o dono empacou no cadastro.
  //
  // Passa por etapaDaLoja() e não por uma comparação direta: a função devolve
  // 'DONE' pra qualquer valor que não reconheça, inclusive `undefined`. É o
  // que mantém o painel de pé no intervalo entre o deploy e a migration ser
  // rodada no SQL Editor — sem isso, a coluna ausente trancaria todo mundo
  // fora até alguém abrir o Supabase.
  if (!souAdmin && etapaDaLoja(loja.onboarding_etapa) !== 'DONE') redirect('/cadastro');

  return (
    <OperacaoProvider
      lojaId={loja.id}
      estadoInicial={{
        lojaAberta: loja.recebendo_encomendas,
        retirada: loja.retirada_ativa,
      }}
    >
      <ShellPainel lojaNome={loja.nome} lojaSlug={loja.slug} souAdmin={souAdmin}>
        {children}
      </ShellPainel>
    </OperacaoProvider>
  );
}
