import { redirect } from 'next/navigation';
import { obterLojaAtual, obterUsuario } from '@/lib/loja';
import { OperacaoProvider } from '@/components/admin/StatusOperacional';

/**
 * Layout da área autenticada. O login fica FORA deste grupo de rotas — se
 * estivesse dentro, a checagem abaixo se aplicaria a ele e daria loop.
 *
 * A verificação aqui é redundante com o proxy.ts de propósito: se um dia o
 * matcher do proxy deixar uma rota de fora, a página ainda não renderiza
 * pra quem não está logado. Como obterUsuario/obterLojaAtual são memoizados
 * por requisição, essa redundância não custa round-trip extra — a página
 * filha reaproveita o mesmo resultado.
 *
 * A casca (menu lateral) fica em cada página e não aqui porque o título do
 * cabeçalho muda por área.
 */
export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const user = await obterUsuario();
  if (!user) redirect('/admin/login');

  const { loja } = await obterLojaAtual();
  if (!loja) redirect('/admin/criar-loja');

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
