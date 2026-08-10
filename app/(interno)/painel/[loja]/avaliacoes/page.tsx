import { ShellPainel } from '@/components/admin/ShellPainel';
import {
  normalizarPlano,
  obterConfiguracaoEfetiva,
  type ConfiguracaoAvaliacoes,
} from '@/lib/avaliacoes/tipos';
import { obterLojaPorSlug } from '@/lib/loja';
import { criarClientServidor } from '@/lib/supabase/server';
import { ConfiguracaoAvaliacoesForm } from './ConfiguracaoAvaliacoesForm';

export default async function AvaliacoesPage({
  params,
}: {
  params: Promise<{ loja: string }>;
}) {
  const { loja: slug } = await params;
  const { loja, souAdmin } = await obterLojaPorSlug(slug);
  if (!loja) return null;

  const sb = await criarClientServidor();
  const [resultadoPlano, resultadoConfiguracao] = await Promise.all([
    sb.from('loja_planos').select('plano').eq('loja_id', loja.id).maybeSingle(),
    sb
      .from('configuracoes_avaliacoes')
      .select('avaliacoes_produtos_ativas, avaliacoes_marca_ativas')
      .eq('loja_id', loja.id)
      .maybeSingle(),
  ]);

  const plano = normalizarPlano(resultadoPlano.data?.plano);
  const configuracaoSalva: ConfiguracaoAvaliacoes = {
    produtosAtivos: resultadoConfiguracao.data?.avaliacoes_produtos_ativas ?? true,
    marcaAtiva: resultadoConfiguracao.data?.avaliacoes_marca_ativas ?? true,
  };
  const configuracao = obterConfiguracaoEfetiva(plano, configuracaoSalva);
  const configuracaoDisponivel = !resultadoPlano.error && !resultadoConfiguracao.error;

  return (
    <ShellPainel lojaNome={loja.nome} lojaSlug={loja.slug} souAdmin={souAdmin} titulo="Avaliações">
      <ConfiguracaoAvaliacoesForm
        lojaId={loja.id}
        plano={plano}
        configuracaoInicial={configuracao}
        configuracaoDisponivel={configuracaoDisponivel}
      />
    </ShellPainel>
  );
}
