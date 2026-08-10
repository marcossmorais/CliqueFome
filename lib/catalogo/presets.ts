export type TipoEstabelecimentoPreset = 'pizzaria' | 'hamburgueria' | 'acaiteria' | 'restaurante' | 'lanchonete' | 'bebidas';
export type ItemPreset = { nome: string; imagemUrl: string; precoSugerido: number };
export type GrupoPreset = {
  id: string;
  tipos: TipoEstabelecimentoPreset[];
  nome: string;
  tipoSelecao: 'uma' | 'varias' | 'varias_repetir';
  qtdMin: number;
  qtdMax: number;
  itens: ItemPreset[];
};
export type ProdutoPreset = { nome: string; volume: string; imagemUrl: string; categoria: 'Bebidas'; precoSugerido: number };

const img = (slug: string) => `/catalogo-presets/itens/${slug}.webp`;
const item = (nome: string, slug: string, precoSugerido: number): ItemPreset => ({ nome, imagemUrl: img(slug), precoSugerido });

/** Biblioteca compartilhada: as lojas referenciam estes arquivos, sem copiar uploads. */
export const GRUPOS_PRESET: GrupoPreset[] = [
  { id: 'bordas-pizza', tipos: ['pizzaria'], nome: 'Escolha a borda', tipoSelecao: 'uma', qtdMin: 0, qtdMax: 1, itens: [
    item('Sem borda recheada', 'mussarela', 0), item('Borda de catupiry', 'borda-catupiry', 8), item('Borda de cheddar', 'borda-cheddar', 8),
    item('Borda de cream cheese', 'borda-catupiry', 9), item('Borda de chocolate', 'cheddar', 9), item('Borda de doce de leite', 'leite-condensado', 9),
  ] },
  { id: 'adicionais-pizza', tipos: ['pizzaria'], nome: 'Adicionais da pizza', tipoSelecao: 'varias_repetir', qtdMin: 0, qtdMax: 8, itens: [
    item('Mussarela extra', 'mussarela', 5), item('Bacon', 'bacon', 5), item('Frango', 'frango', 5), item('Calabresa', 'bacon', 5),
    item('Catupiry', 'maionese', 5), item('Cheddar', 'cheddar', 5), item('Ovo', 'ovo', 3), item('Cebola', 'mussarela', 2),
    item('Azeitona', 'granola', 2), item('Milho', 'granola', 2), item('Tomate', 'morango', 2), item('Orégano extra', 'granola', 1),
  ] },
  { id: 'adicionais-lanche', tipos: ['hamburgueria', 'lanchonete'], nome: 'Adicionais', tipoSelecao: 'varias_repetir', qtdMin: 0, qtdMax: 10, itens: [
    item('Bacon', 'bacon', 5), item('Ovo', 'ovo', 3), item('Queijo mussarela', 'mussarela', 4), item('Cheddar', 'cheddar', 4),
    item('Catupiry', 'maionese', 4), item('Frango', 'frango', 5), item('Hambúrguer extra', 'bacon', 8), item('Cebola caramelizada', 'barbecue', 3),
    item('Picles', 'granola', 2), item('Tomate', 'morango', 2), item('Alface', 'granola', 1), item('Milho', 'granola', 2),
  ] },
  { id: 'molhos', tipos: ['pizzaria', 'hamburgueria', 'lanchonete', 'restaurante'], nome: 'Molhos', tipoSelecao: 'varias', qtdMin: 0, qtdMax: 6, itens: [
    item('Ketchup', 'ketchup', 1), item('Maionese', 'maionese', 1), item('Maionese da casa', 'maionese', 2), item('Molho barbecue', 'barbecue', 2),
    item('Molho cheddar', 'cheddar', 3), item('Molho de alho', 'maionese', 2), item('Mostarda', 'cheddar', 1), item('Molho picante', 'ketchup', 2),
  ] },
  { id: 'frutas-acai', tipos: ['acaiteria'], nome: 'Frutas', tipoSelecao: 'varias_repetir', qtdMin: 0, qtdMax: 8, itens: [
    item('Banana', 'banana', 2), item('Morango', 'morango', 3), item('Kiwi', 'morango', 3), item('Manga', 'banana', 3), item('Uva', 'morango', 3),
  ] },
  { id: 'cremes-acai', tipos: ['acaiteria'], nome: 'Cremes e caldas', tipoSelecao: 'varias_repetir', qtdMin: 0, qtdMax: 8, itens: [
    item('Leite condensado', 'leite-condensado', 2), item('Leite em pó', 'leite-po', 2), item('Creme de avelã', 'barbecue', 4),
    item('Doce de leite', 'leite-condensado', 3), item('Creme de amendoim', 'barbecue', 3), item('Calda de chocolate', 'barbecue', 2),
    item('Calda de morango', 'ketchup', 2), item('Mel', 'leite-condensado', 2),
  ] },
  { id: 'crocantes-acai', tipos: ['acaiteria'], nome: 'Crocantes e confeitos', tipoSelecao: 'varias_repetir', qtdMin: 0, qtdMax: 10, itens: [
    item('Granola', 'granola', 2), item('Granulado de chocolate', 'granulado', 2), item('Paçoca', 'granola', 2), item('Confete de chocolate', 'granulado', 3),
    item('Flocos de milho', 'granola', 2), item('Chocoball', 'granulado', 3), item('Amendoim', 'granola', 2), item('Coco ralado', 'leite-po', 2),
    item('Gotas de chocolate', 'granulado', 3), item('Jujuba', 'granulado', 3),
  ] },
  { id: 'acompanhamentos', tipos: ['restaurante'], nome: 'Acompanhamentos', tipoSelecao: 'varias', qtdMin: 0, qtdMax: 5, itens: [
    item('Arroz', 'granola', 4), item('Feijão', 'barbecue', 4), item('Batata frita', 'borda-cheddar', 6), item('Salada', 'granola', 4),
    item('Farofa', 'granola', 3), item('Purê de batata', 'maionese', 5), item('Macarrão', 'frango', 5), item('Legumes', 'granola', 5),
  ] },
  { id: 'proteinas', tipos: ['restaurante'], nome: 'Proteína extra', tipoSelecao: 'varias_repetir', qtdMin: 0, qtdMax: 4, itens: [
    item('Frango', 'frango', 8), item('Ovo', 'ovo', 3), item('Bacon', 'bacon', 5), item('Linguiça', 'bacon', 7), item('Carne bovina', 'bacon', 10),
  ] },
];

export const BEBIDAS_PRESET: ProdutoPreset[] = [
  { nome: 'Coca-Cola Original', volume: '350 ml', imagemUrl: img('coca-cola-350'), categoria: 'Bebidas', precoSugerido: 6 },
  { nome: 'Coca-Cola Sem Açúcar', volume: '350 ml', imagemUrl: img('coca-cola-zero-350'), categoria: 'Bebidas', precoSugerido: 6 },
  { nome: 'Coca-Cola Original', volume: '600 ml', imagemUrl: img('coca-cola-600'), categoria: 'Bebidas', precoSugerido: 9 },
  { nome: 'Coca-Cola Original', volume: '2 L', imagemUrl: img('coca-cola-2l'), categoria: 'Bebidas', precoSugerido: 14 },
  { nome: 'Guaraná Antarctica', volume: '350 ml', imagemUrl: img('guarana-antarctica-350'), categoria: 'Bebidas', precoSugerido: 6 },
  { nome: 'Guaraná Antarctica', volume: '2 L', imagemUrl: img('guarana-antarctica-2l'), categoria: 'Bebidas', precoSugerido: 13 },
  { nome: 'Fanta Laranja', volume: '350 ml', imagemUrl: img('fanta-laranja-350'), categoria: 'Bebidas', precoSugerido: 6 },
  { nome: 'Fanta Laranja', volume: '2 L', imagemUrl: img('fanta-laranja-2l'), categoria: 'Bebidas', precoSugerido: 13 },
  { nome: 'Kuat Guaraná', volume: '350 ml', imagemUrl: img('kuat-350'), categoria: 'Bebidas', precoSugerido: 5 },
  { nome: 'Monster Energy Original', volume: '473 ml', imagemUrl: img('monster-473'), categoria: 'Bebidas', precoSugerido: 12 },
  { nome: 'Red Bull Energy Drink', volume: '250 ml', imagemUrl: img('red-bull-250'), categoria: 'Bebidas', precoSugerido: 12 },
  { nome: 'Baly Energy Drink', volume: '473 ml', imagemUrl: img('baly-473'), categoria: 'Bebidas', precoSugerido: 9 },
];

export function gruposParaNicho(nicho: string | null | undefined) {
  const n = (nicho || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const tipo: TipoEstabelecimentoPreset = n.includes('pizza') ? 'pizzaria' : n.includes('hamburg') ? 'hamburgueria' : n.includes('acai') ? 'acaiteria' : n.includes('restaurante') ? 'restaurante' : 'lanchonete';
  return GRUPOS_PRESET.filter((grupo) => grupo.tipos.includes(tipo));
}
