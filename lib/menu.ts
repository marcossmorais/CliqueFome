/**
 * Menu do painel — as 16 áreas, na mesma ordem e agrupamento do admin.html.
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
  pedidos: 'M4 3h16v18H4zM8 8h8M8 12h8M8 16h5',
  mesas: 'M3 6h18v12H3zM7 6V4M17 6V4M3 11h18',
  kds: 'M3 4h18v13H3zM8 21h8M12 17v4M8 9l2 2 4-4',
  caixa: 'M3 7h18v12H3zM3 11h18M7 15h3M7 7V5h10v2',
  catalogo: 'M5 4h14v16H5zM9 8h6M9 12h6M9 16h3',
  links: 'M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1',
  delivery: 'M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  entregadores: 'M8.5 18h7M13 18V7h3l3 5v6M4 8h6M8.5 18a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM20.5 18a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z',
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
    grupo: 'Operação',
    itens: [
      { id: 'pedidos', nome: 'Gestão de pedidos', icone: 'pedidos', desc: 'Pedidos de delivery, retirada e balcão numa tela só, avançando por status até a conclusão.' },
      { id: 'mesas', nome: 'Mesas e comandas', icone: 'mesas', desc: 'Abrir mesa, lançar itens durante o consumo e fechar a conta com taxa de serviço.' },
      { id: 'kds', nome: 'KDS — cozinha', icone: 'kds', desc: 'A cozinha vê o que preparar e marca item por item como pronto.' },
      { id: 'caixa', nome: 'Caixa', icone: 'caixa', desc: 'Abertura e fechamento com conferência, sangria, suprimento e resumo do movimento do dia.' },
    ],
  },
  {
    grupo: 'Cardápio',
    itens: [
      { id: 'catalogo', nome: 'Catálogo', icone: 'catalogo', pronta: true },
      { id: 'links', nome: 'Links do cardápio', icone: 'links', pronta: true },
    ],
  },
  {
    grupo: 'Entrega',
    itens: [
      { id: 'delivery', nome: 'Áreas de entrega', icone: 'delivery', desc: 'Áreas por raio, polígono ou bairro, cada uma com taxa e tempo de entrega próprios.' },
      { id: 'entregadores', nome: 'Entregadores', icone: 'entregadores', desc: 'Cadastro dos seus motoboys pra vincular ao pedido na hora da entrega.' },
    ],
  },
  {
    grupo: 'Gestão',
    itens: [
      { id: 'desempenho', nome: 'Desempenho', icone: 'desempenho', desc: 'Faturamento, ticket médio, clientes e produtos mais vendidos por período.' },
      { id: 'historico', nome: 'Histórico de pedidos', icone: 'historico', desc: 'Todos os pedidos já feitos, com busca por cliente ou número e filtros avançados.' },
      { id: 'financeiro', nome: 'Financeiro', icone: 'financeiro', desc: 'Contas a pagar e a receber, fluxo de caixa e categorias financeiras.' },
      { id: 'fiscal', nome: 'Fiscal', icone: 'fiscal', desc: 'Emissão de notas dos pedidos direto pelo sistema.' },
    ],
  },
  {
    grupo: 'Configuração',
    itens: [
      { id: 'empresa', nome: 'Minha empresa', icone: 'empresa', pronta: true },
      { id: 'config', nome: 'Configurações', icone: 'config', desc: 'Impressão, agendamentos e integrações do sistema.' },
      { id: 'avaliacoes', nome: 'Avaliações', icone: 'avaliacoes', desc: 'Veja o que os clientes acharam dos pedidos.' },
      { id: 'suporte', nome: 'Dúvidas e suporte', icone: 'suporte', desc: 'Central de ajuda e canal de suporte.' },
    ],
  },
];

export const TODAS_AREAS: ItemMenu[] = MENU.flatMap((g) => g.itens);
