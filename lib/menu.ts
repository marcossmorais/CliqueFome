/**
 * Menu do painel — as 16 áreas.
 *
 * Agrupamento por PRONTIDÃO, não por tipo de funcionalidade: as telas que
 * já funcionam hoje ficam nos grupos de cima ("Essenciais" e "Sua loja"),
 * e tudo que ainda é placeholder cai junto no grupo "Em breve", no fim do
 * menu. O agrupamento antigo misturava pronto com placeholder dentro do
 * mesmo grupo — quem abria o
 * painel via "Mesas e comandas" antes de "Cardápio" só descobria que a
 * tela estava vazia depois de clicar.
 *
 * `pronta: false` desenha a bolinha de "em breve" e leva pra tela vazia.
 */
export type ItemMenu = {
  id: string;
  nome: string;
  icone: string;
  pronta?: boolean;
  desc?: string;
};

export const ICONES: Record<string, string> = {
  inicio: 'M3 11.5L12 4l9 7.5M5 10v10h14V10M9 20v-6h6v6',
  pedidos: 'M4 3h16v18H4zM8 8h8M8 12h8M8 16h5',
  mesas: 'M3 6h18v12H3zM7 6V4M17 6V4M3 11h18',
  kds: 'M3 4h18v13H3zM8 21h8M12 17v4M8 9l2 2 4-4',
  caixa: 'M3 7h18v12H3zM3 11h18M7 15h3M7 7V5h10v2',
  pdv: 'M3 7h18v12H3zM3 11h18M7 15h3M16 15h1M7 7V5h10v2',
  estoque: 'M4 7l8-4 8 4-8 4zM4 7v10l8 4 8-4V7M12 11v10',
  catalogo: 'M5 4h14v16H5zM9 8h6M9 12h6M9 16h3',
  links: 'M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1',
  desempenho: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  historico: 'M12 21a9 9 0 110-18 9 9 0 010 18zM12 7v5l3 3',
  financeiro: 'M12 21a9 9 0 110-18 9 9 0 010 18zM15 9.5c-.6-1-1.7-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 2 3 2 3 .9 3 2-1.3 2-3 2c-1.3 0-2.4-.5-3-1.5M12 6v12',
  fiscal: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  empresa: 'M3 21V9l9-6 9 6v12zM9 21v-7h6v7',
  config: 'M12 15a3 3 0 100-6 3 3 0 000 6zM5 12a7 7 0 01.1-1.1L3.3 9.5l2-3.4 2.1.9A7 7 0 019.3 5.8L9.6 3.6h4l.3 2.2a7 7 0 011.9 1.1l2.1-.9 2 3.4-1.8 1.4a7 7 0 010 2.3l1.8 1.4-2 3.4-2.1-.9a7 7 0 01-1.9 1.1l-.3 2.2h-4l-.3-2.2a7 7 0 01-1.9-1.1l-2.1.9-2-3.4 1.8-1.4A7 7 0 015 12z',
  avaliacoes: 'M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6.1-5.3-3-5.3 3 1.1-6.1L3.4 9.4l6-.8z',
  suporte: 'M12 21a9 9 0 110-18 9 9 0 010 18zM9.5 9.5a2.5 2.5 0 113.2 2.4c-.5.2-.7.6-.7 1.1v.5M12 17h.01',
};

export const MENU: { grupo: string; itens: ItemMenu[] }[] = [
  {
    grupo: 'Visão geral',
    itens: [
      { id: 'inicio', nome: 'Início', icone: 'inicio', pronta: true, desc: 'Central do dia com operação, vendas e pedidos.' },
    ],
  },
  {
    grupo: 'Operação',
    itens: [
      { id: 'pedidos', nome: 'Gestão de pedidos', icone: 'pedidos', pronta: true },
      { id: 'kds', nome: 'Cozinha', icone: 'kds', pronta: true },
      { id: 'cardapio', nome: 'Cardápio', icone: 'catalogo', pronta: true },
      { id: 'pdv', nome: 'PDV', icone: 'pdv', pronta: true, desc: 'Caixa, estoque e nota fiscal em um só lugar.' },
    ],
  },
  {
    grupo: 'Suporte',
    itens: [
      { id: 'suporte', nome: 'Ajuda e suporte', icone: 'suporte', pronta: true, desc: 'Central de ajuda, tutoriais e canais de suporte.' },
    ],
  },
  {
    grupo: 'Em breve',
    itens: [
      { id: 'mesas', nome: 'Mesas e comandas', icone: 'mesas', desc: 'Abrir mesa, lançar itens durante o consumo e fechar a conta com taxa de serviço.' },
      { id: 'desempenho', nome: 'Desempenho', icone: 'desempenho', desc: 'Faturamento, ticket médio, clientes e produtos mais vendidos por período.' },
      { id: 'financeiro', nome: 'Financeiro', icone: 'financeiro', desc: 'Contas a pagar e a receber, fluxo de caixa e categorias financeiras.' },
    ],
  },
];

const AREAS_INTERNAS: ItemMenu[] = [
  { id: 'links', nome: 'Links do cardápio', icone: 'links', pronta: true },
  { id: 'avaliacoes', nome: 'Avaliações', icone: 'avaliacoes', pronta: true },
  { id: 'config', nome: 'Configurações', icone: 'config', pronta: true },
  { id: 'historico', nome: 'Histórico de pedidos', icone: 'historico', pronta: true },
  { id: 'caixa', nome: 'Caixa', icone: 'caixa', desc: 'Abertura, fechamento, sangria e suprimento.' },
  { id: 'estoque', nome: 'Estoque', icone: 'estoque', desc: 'Controle de entradas, saídas e insumos.' },
  { id: 'fiscal', nome: 'Nota fiscal', icone: 'fiscal', desc: 'Emissão de notas dos pedidos.' },
];

export const TODAS_AREAS: ItemMenu[] = [...MENU.flatMap((g) => g.itens), ...AREAS_INTERNAS];
