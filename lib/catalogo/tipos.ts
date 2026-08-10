export type Categoria = {
  id: string;
  loja_id: string;
  nome: string;
  emoji: string | null;
  icone: string | null;
  ativo: boolean;
  ordem: number;
};

export type Complemento = {
  id: string;
  grupo_id: string;
  nome: string;
  descricao: string | null;
  preco: number;
  qtd_max: number | null;
  imagem_url: string | null;
  ativo: boolean;
  ordem: number;
};

export type GrupoComplemento = {
  id: string;
  loja_id: string;
  nome: string;
  qtd_min: number;
  qtd_max: number;
  tipo_selecao: 'uma' | 'varias' | 'varias_repetir';
  modo_preco: 'soma' | 'media' | 'maior' | 'menor';
  tipos_pedido: string[];
  ativo: boolean;
  ordem: number;
  complementos: Complemento[];
};

export type Produto = {
  id: string;
  loja_id: string;
  categoria_id: string | null;
  nome: string;
  descricao: string | null;
  preco: number;
  preco_promocional: number | null;
  preco_custo: number | null;
  imagem_url: string | null;
  etiqueta: string | null;
  destaque: boolean;
  codigo_pdv: string | null;
  codigo_interno: number | null;
  unidade_medida: string | null;
  esconder_observacao: boolean;
  esconder_quantidade: boolean;
  dias_semana: number[];
  tipos_pedido: string[];
  ativo: boolean;
  ordem: number;
  produto_grupos: { grupo_id: string }[];
};

export const DIAS = [
  { id: '0', nome: 'Dom' },
  { id: '1', nome: 'Seg' },
  { id: '2', nome: 'Ter' },
  { id: '3', nome: 'Qua' },
  { id: '4', nome: 'Qui' },
  { id: '5', nome: 'Sex' },
  { id: '6', nome: 'Sáb' },
];

export const TIPOS_PEDIDO = [
  { id: 'delivery', nome: 'Delivery' },
  { id: 'retirada', nome: 'Retirada' },
  { id: 'balcao', nome: 'Balcão' },
  { id: 'mesa', nome: 'Mesa' },
  { id: 'encomenda', nome: 'Encomenda / agendamento' },
];

export const ETIQUETAS: Record<string, string> = {
  mais_pedido: 'Mais pedido',
  novidade: 'Novidade',
  recomendado: 'Recomendado',
  edicao_limitada: 'Edição limitada',
};

export const TIPO_SELECAO_TXT: Record<string, string> = {
  uma: 'Escolhe 1',
  varias: 'Escolhe várias',
  varias_repetir: 'Escolhe várias (pode repetir)',
};

export function formatBRL(v: number | string) {
  return 'R$ ' + Number(v).toFixed(2).replace('.', ',');
}

export function regraTexto(g: GrupoComplemento) {
  const sel = TIPO_SELECAO_TXT[g.tipo_selecao] || '';
  const obrig = g.qtd_min > 0 ? 'obrigatório' : 'opcional';
  return `${sel} · ${obrig} · min ${g.qtd_min} / máx ${g.qtd_max}`;
}
