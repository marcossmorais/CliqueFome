export type LojaPublica = {
  id: string;
  slug: string;
  nome: string;
  logo_url: string | null;
  banner_url: string | null;
  cor_marca: string;
  cidade: string | null;
  sobre: string | null;
  whatsapp_numero: string | null;
  tempo_entrega_min: number | null;
  tempo_entrega_max: number | null;
  taxa_entrega: number;
  pedido_minimo: number;
  delivery_ativo: boolean;
  recebendo_encomendas: boolean;
};

export type CategoriaPublica = { id: string; nome: string; emoji: string | null; ordem: number };

export type ComplementoPublico = {
  id: string;
  nome: string;
  preco: number;
  imagem_url: string | null;
  ativo: boolean;
  ordem: number;
};

export type GrupoPublico = {
  id: string;
  nome: string;
  qtd_min: number;
  qtd_max: number;
  tipo_selecao: 'uma' | 'varias' | 'varias_repetir';
  modo_preco: 'soma' | 'media' | 'maior' | 'menor';
  ordem: number;
  complementos: ComplementoPublico[];
};

export type ProdutoPublico = {
  id: string;
  categoria_id: string | null;
  nome: string;
  descricao: string | null;
  preco: number;
  preco_promocional: number | null;
  imagem_url: string | null;
  etiqueta: string | null;
  destaque: boolean;
  esconder_observacao: boolean;
  esconder_quantidade: boolean;
  ativo: boolean;
  ordem: number;
  /** Já achatado e ordenado no servidor — o HTML antigo fazia isso no
   * cliente a cada render. */
  grupos: GrupoPublico[];
};

/** Uma opção escolhida dentro de um grupo, já com o nome pra exibição. */
export type EscolhaComplemento = {
  complementoId: string;
  grupoId: string;
  grupoNome: string;
  nome: string;
  preco: number;
};

export type LinhaCarrinho = {
  /** Identidade da linha: produto + complementos + observação. Duas
   * escolhas diferentes do mesmo produto viram linhas separadas. */
  lineId: string;
  produtoId: string;
  nome: string;
  precoUnit: number;
  complementos: EscolhaComplemento[];
  observacao: string;
  qty: number;
};

export function formatBRL(v: number) {
  return 'R$ ' + Number(v).toFixed(2).replace('.', ',');
}

/** Preço que vale na venda — promocional tem precedência. */
export function precoBase(p: ProdutoPublico) {
  return p.preco_promocional != null ? Number(p.preco_promocional) : Number(p.preco);
}

/**
 * Menor preço possível do produto: base + o mínimo obrigatório de cada
 * grupo. É o que vira "A partir de R$ X" no card.
 */
export function precoMinimo(p: ProdutoPublico) {
  let extra = 0;
  p.grupos.forEach((g) => {
    if (g.qtd_min > 0 && g.complementos.length > 0) {
      const maisBarato = Math.min(...g.complementos.map((c) => Number(c.preco)));
      extra += maisBarato * g.qtd_min;
    }
  });
  return precoBase(p) + extra;
}

/**
 * Quanto os complementos escolhidos somam, respeitando o modo de preço do
 * grupo. Espelha a conta que criar_pedido() faz no banco — o valor daqui é
 * só pra exibição; quem cobra é o servidor.
 */
export function extraDoGrupo(g: GrupoPublico, escolhidos: ComplementoPublico[]) {
  if (escolhidos.length === 0) return 0;
  const precos = escolhidos.map((c) => Number(c.preco));
  switch (g.modo_preco) {
    case 'media':
      return precos.reduce((s, x) => s + x, 0) / precos.length;
    case 'maior':
      return Math.max(...precos);
    case 'menor':
      return Math.min(...precos);
    default:
      return precos.reduce((s, x) => s + x, 0);
  }
}

export function subtotalLinha(linha: LinhaCarrinho) {
  const extra = linha.complementos.reduce((s, c) => s + c.preco, 0);
  return (linha.precoUnit + extra) * linha.qty;
}

export function regraTextoGrupo(g: GrupoPublico) {
  if (g.qtd_min > 0 && g.qtd_max === g.qtd_min) return `Obrigatório · escolha ${g.qtd_min}`;
  if (g.qtd_min > 0) return `Obrigatório · escolha até ${g.qtd_max}`;
  return `Opcional · escolha até ${g.qtd_max}`;
}

/**
 * O item aparece hoje? Respeita dias da semana e o "ativo" (que vira
 * "Esgotado" na vitrine, e não sumiço).
 */
export function disponivelHoje(diasSemana: number[] | null, agora: Date) {
  if (!diasSemana || diasSemana.length === 0) return true;
  return diasSemana.includes(agora.getDay());
}
