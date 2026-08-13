/**
 * Menu principal do painel, organizado por contexto de uso. `rota` permite
 * dar um nome mais claro a uma tela sem alterar sua URL nem seus fluxos.
 */
export type ItemMenu = {
  id: string;
  nome: string;
  icone: string;
  rota?: string;
  pronta?: boolean;
  desc?: string;
};

export const ICONES: Record<string, string> = {
  inicio: 'M3 11.5L12 4l9 7.5M5 10v10h14V10M9 20v-6h6v6',
  pedidos: 'M4 3h16v18H4zM8 8h8M8 12h8M8 16h5',
  delivery: 'M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z',
  mesas: 'M3 6h18v12H3zM7 6V4M17 6V4M3 11h18',
  kds: 'M3 4h18v13H3zM8 21h8M12 17v4M8 9l2 2 4-4',
  caixa: 'M3 7h18v12H3zM3 11h18M7 15h3M7 7V5h10v2',
  pdv: 'M3 7h18v12H3zM3 11h18M7 15h3M16 15h1M7 7V5h10v2',
  estoque: 'M4 7l8-4 8 4-8 4zM4 7v10l8 4 8-4V7M12 11v10',
  // Livro aberto, e não o retângulo com linhas de antes: aquele era quase
  // idêntico ao de `pedidos`, e na barra inferior do mobile — onde o ícone
  // carrega o significado, com o rótulo em 10px — os dois se confundiam.
  catalogo: 'M12 7c-1.8-1.3-4-2-6.5-2H3v13h2.5c2.5 0 4.7.7 6.5 2M12 7c1.8-1.3 4-2 6.5-2H21v13h-2.5c-2.5 0-4.7.7-6.5 2M12 7v13',
  links: 'M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1',
  desempenho: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  historico: 'M12 21a9 9 0 110-18 9 9 0 010 18zM12 7v5l3 3',
  financeiro: 'M12 21a9 9 0 110-18 9 9 0 010 18zM15 9.5c-.6-1-1.7-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 2 3 2 3 .9 3 2-1.3 2-3 2c-1.3 0-2.4-.5-3-1.5M12 6v12',
  fiscal: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  clientes: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  integracoes: 'M8 12h8M12 8v8M5 3h4v4H5zM15 3h4v4h-4zM5 17h4v4H5zM15 17h4v4h-4z',
  empresa: 'M3 21V9l9-6 9 6v12zM9 21v-7h6v7',
  config: 'M12 15a3 3 0 100-6 3 3 0 000 6zM5 12a7 7 0 01.1-1.1L3.3 9.5l2-3.4 2.1.9A7 7 0 019.3 5.8L9.6 3.6h4l.3 2.2a7 7 0 011.9 1.1l2.1-.9 2 3.4-1.8 1.4a7 7 0 010 2.3l1.8 1.4-2 3.4-2.1-.9a7 7 0 01-1.9 1.1l-.3 2.2h-4l-.3-2.2a7 7 0 01-1.9-1.1l-2.1.9-2-3.4 1.8-1.4A7 7 0 015 12z',
  avaliacoes: 'M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6.1-5.3-3-5.3 3 1.1-6.1L3.4 9.4l6-.8z',
  suporte: 'M12 21a9 9 0 110-18 9 9 0 010 18zM9.5 9.5a2.5 2.5 0 113.2 2.4c-.5.2-.7.6-.7 1.1v.5M12 17h.01',
};

export const MENU: { grupo: string; itens: ItemMenu[] }[] = [
  {
    grupo: 'Visão geral',
    itens: [
      { id: 'inicio', nome: 'Dashboard', icone: 'inicio', pronta: true, desc: 'Central do dia com operação, vendas e pedidos.' },
    ],
  },
  {
    grupo: 'Operação',
    itens: [
      { id: 'pedidos', nome: 'Gestão de pedidos', icone: 'pedidos', pronta: true },
      { id: 'kds', nome: 'Cozinha', icone: 'kds', pronta: true },
      { id: 'delivery', nome: 'Delivery', icone: 'delivery', pronta: true },
      { id: 'cardapio', nome: 'Cardápio', icone: 'catalogo', pronta: true },
      { id: 'pdv', nome: 'PDV', icone: 'pdv', pronta: true, desc: 'Caixa, estoque e nota fiscal em um só lugar.' },
    ],
  },
  {
    grupo: 'Relatórios',
    itens: [
      { id: 'vendas', rota: 'historico', nome: 'Vendas', icone: 'financeiro', pronta: true, desc: 'Histórico consolidado dos pedidos e vendas.' },
      { id: 'desempenho', nome: 'Desempenho', icone: 'desempenho', desc: 'Faturamento, ticket médio, clientes e produtos mais vendidos por período.' },
      { id: 'clientes', nome: 'Clientes', icone: 'clientes', desc: 'Base de clientes e recorrência de pedidos.' },
    ],
  },
  {
    grupo: 'Configurações',
    itens: [
      { id: 'config', nome: 'Configurações', icone: 'config', pronta: true },
      { id: 'links', nome: 'Links do cardápio', icone: 'links', pronta: true },
      { id: 'avaliacoes', nome: 'Avaliações', icone: 'avaliacoes', pronta: true },
      { id: 'integracoes', nome: 'Integrações', icone: 'integracoes', desc: 'Conecte a loja a serviços externos.' },
    ],
  },
];

const AREAS_INTERNAS: ItemMenu[] = [
  { id: 'historico', nome: 'Histórico de pedidos', icone: 'historico', pronta: true },
  { id: 'suporte', nome: 'Ajuda e suporte', icone: 'suporte', pronta: true, desc: 'Central de ajuda, tutoriais e canais de suporte.' },
  { id: 'mesas', nome: 'Mesas e comandas', icone: 'mesas', desc: 'Abrir mesa, lançar itens durante o consumo e fechar a conta com taxa de serviço.' },
  { id: 'financeiro', nome: 'Financeiro', icone: 'financeiro', desc: 'Contas a pagar e a receber, fluxo de caixa e categorias financeiras.' },
  { id: 'caixa', nome: 'Caixa', icone: 'caixa', desc: 'Abertura, fechamento, sangria e suprimento.' },
  { id: 'estoque', nome: 'Estoque', icone: 'estoque', desc: 'Controle de entradas, saídas e insumos.' },
  { id: 'fiscal', nome: 'Nota fiscal', icone: 'fiscal', desc: 'Emissão de notas dos pedidos.' },
];

export const TODAS_AREAS: ItemMenu[] = [...MENU.flatMap((g) => g.itens), ...AREAS_INTERNAS];
