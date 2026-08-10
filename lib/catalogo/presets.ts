export type TipoEstabelecimentoPreset = 'pizzaria' | 'hamburgueria' | 'acaiteria' | 'cafeteria' | 'lanchonete' | 'bebidas';
export type PresetCatalogo = { tipo: TipoEstabelecimentoPreset; categorias: string[]; complementos: { grupo: string; nome: string; precoSugerido: number }[] };
export const PRESETS_CATALOGO: PresetCatalogo[] = [
  { tipo: 'pizzaria', categorias: ['Pizzas', 'Bebidas', 'Porções', 'Sobremesas'], complementos: [{ grupo: 'Bordas', nome: 'Borda de catupiry', precoSugerido: 8 }, { grupo: 'Bordas', nome: 'Borda cheddar', precoSugerido: 8 }, { grupo: 'Adicionais', nome: 'Bacon', precoSugerido: 5 }, { grupo: 'Adicionais', nome: 'Azeitona', precoSugerido: 3 }] },
  { tipo: 'hamburgueria', categorias: ['Hambúrgueres', 'Porções', 'Bebidas', 'Sobremesas'], complementos: [{ grupo: 'Adicionais', nome: 'Bacon', precoSugerido: 5 }, { grupo: 'Adicionais', nome: 'Ovo', precoSugerido: 3 }, { grupo: 'Molhos', nome: 'Maionese da casa', precoSugerido: 2 }, { grupo: 'Molhos', nome: 'Barbecue', precoSugerido: 2 }] },
  { tipo: 'acaiteria', categorias: ['Açaí', 'Bebidas', 'Sobremesas'], complementos: [{ grupo: 'Frutas', nome: 'Banana', precoSugerido: 2 }, { grupo: 'Frutas', nome: 'Morango', precoSugerido: 3 }, { grupo: 'Crocantes', nome: 'Granola', precoSugerido: 2 }, { grupo: 'Crocantes', nome: 'Paçoca', precoSugerido: 2 }] },
  { tipo: 'cafeteria', categorias: ['Cafés', 'Bebidas', 'Sobremesas'], complementos: [{ grupo: 'Leites', nome: 'Leite vegetal', precoSugerido: 3 }, { grupo: 'Coberturas', nome: 'Chantilly', precoSugerido: 2 }] },
  { tipo: 'lanchonete', categorias: ['Lanches', 'Porções', 'Bebidas', 'Sobremesas'], complementos: [{ grupo: 'Molhos', nome: 'Ketchup', precoSugerido: 1 }, { grupo: 'Molhos', nome: 'Maionese', precoSugerido: 1 }] },
  { tipo: 'bebidas', categorias: ['Bebidas', 'Porções'], complementos: [] },
];
export function obterPresetCatalogo(tipo: string | null | undefined) { return PRESETS_CATALOGO.find((preset) => preset.tipo === tipo) ?? null; }
