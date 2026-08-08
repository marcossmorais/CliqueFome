export type PlanoLoja = 'basico' | 'pro' | 'pro_plus';

export type ConfiguracaoAvaliacoes = {
  produtosAtivos: boolean;
  marcaAtiva: boolean;
};

export const NOMES_PLANOS: Record<PlanoLoja, string> = {
  basico: 'Plano Básico',
  pro: 'Plano Pro',
  pro_plus: 'Plano Pro+',
};

export function normalizarPlano(valor: unknown): PlanoLoja {
  return valor === 'pro' || valor === 'pro_plus' ? valor : 'basico';
}

export function podeConfigurarAvaliacoes(plano: PlanoLoja) {
  return plano === 'pro' || plano === 'pro_plus';
}

/**
 * O Básico inclui avaliações permanentemente. Esta regra também existe no
 * banco; mantê-la aqui evita que um dado legado inconsistente engane a tela.
 */
export function obterConfiguracaoEfetiva(
  plano: PlanoLoja,
  configuracao: ConfiguracaoAvaliacoes,
): ConfiguracaoAvaliacoes {
  if (plano === 'basico') {
    return { produtosAtivos: true, marcaAtiva: true };
  }

  return configuracao;
}
