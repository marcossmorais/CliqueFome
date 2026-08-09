export const CATEGORIAS_FAQ = [
  { id: 'todos', nome: 'Todas' },
  { id: 'inicio', nome: 'Primeiros passos' },
  { id: 'catalogo', nome: 'Catálogo' },
  { id: 'pedidos', nome: 'Pedidos' },
  { id: 'loja', nome: 'Minha loja' },
  { id: 'conta', nome: 'Conta e privacidade' },
] as const;

export type CategoriaFaq = Exclude<(typeof CATEGORIAS_FAQ)[number]['id'], 'todos'>;

export type PerguntaFrequente = {
  id: string;
  categoria: CategoriaFaq;
  pergunta: string;
  resposta: string;
  passos?: string[];
  observacao?: string;
  palavrasChave: string[];
};

export const PERGUNTAS_FREQUENTES: PerguntaFrequente[] = [
  {
    id: 'primeiro-acesso',
    categoria: 'inicio',
    pergunta: 'O que acontece no meu primeiro acesso?',
    resposta:
      'Se a sua conta ainda não tiver uma loja, o sistema abre a etapa de criação. Depois disso, você entra no painel e já pode configurar a empresa e montar o catálogo.',
    passos: [
      'Informe o nome da loja, o nicho e o WhatsApp solicitado na criação.',
      'Abra “Minha empresa” para completar a identidade visual e as regras de entrega.',
      'Abra “Catálogo” para cadastrar categorias, produtos e complementos.',
      'Use “Links do cardápio” para copiar e testar o endereço público da sua loja.',
    ],
    palavrasChave: ['cadastro', 'criar loja', 'começar', 'onboarding', 'primeiro acesso'],
  },
  {
    id: 'publicar-cardapio',
    categoria: 'inicio',
    pergunta: 'Como acesso e divulgo meu cardápio?',
    resposta:
      'Abra “Links do cardápio”, copie o endereço exibido e teste em uma janela anônima antes de divulgar. O link pode ser usado na bio das redes sociais, no Google ou enviado pelo WhatsApp.',
    observacao:
      'Ao alterar produtos ou dados da loja, abra novamente o link público e confira o resultado como um cliente faria.',
    palavrasChave: ['link', 'divulgar', 'instagram', 'bio', 'cardápio público', 'publicar'],
  },
  {
    id: 'produto-categoria',
    categoria: 'catalogo',
    pergunta: 'Como cadastro uma categoria e um produto?',
    resposta:
      'No Catálogo, crie primeiro a categoria e depois o produto. O produto pode receber nome, descrição, preço, imagem, disponibilidade e listas de complementos.',
    passos: [
      'Entre em “Catálogo” e selecione “+ Categoria”.',
      'Dê um nome claro, salve e selecione a nova categoria.',
      'Clique em “+ Novo produto”, preencha os campos obrigatórios e vincule as listas desejadas.',
      'Salve e confira o item no cardápio público.',
    ],
    palavrasChave: ['produto', 'categoria', 'item', 'preço', 'imagem', 'foto', 'novo produto'],
  },
  {
    id: 'complementos',
    categoria: 'catalogo',
    pergunta: 'Qual é a diferença entre lista de complementos e opção?',
    resposta:
      'A lista define a regra de escolha — por exemplo “Escolha o tamanho” ou “Adicionais”. As opções são as escolhas dentro dela, como Pequeno, Médio, Bacon ou Queijo, cada uma com seu preço e disponibilidade.',
    passos: [
      'Na subaba “Complementos”, crie a lista e configure mínimo, máximo e regra de preço.',
      'Cadastre as opções da lista, seus acréscimos e disponibilidade.',
      'Vincule a lista aos produtos que devem oferecê-la.',
      'Simule combinações no cardápio para conferir regra e total.',
    ],
    palavrasChave: ['complemento', 'opção', 'adicional', 'tamanho', 'sabor', 'mínimo', 'máximo'],
  },
  {
    id: 'ocultar-item',
    categoria: 'catalogo',
    pergunta: 'Como pauso um item ou escondo uma categoria?',
    resposta:
      'Use o controle de disponibilidade do produto para sinalizar que ele não pode ser comprado. Para retirar um conjunto inteiro da navegação, desative a categoria no Catálogo.',
    observacao:
      'Depois de mudar a disponibilidade, confira o cardápio público. Produtos indisponíveis podem continuar visíveis com indicação de esgotado, enquanto categorias desativadas deixam de ser exibidas.',
    palavrasChave: ['pausar', 'ocultar', 'esgotado', 'inativo', 'disponibilidade', 'categoria'],
  },
  {
    id: 'pedido-whatsapp',
    categoria: 'pedidos',
    pergunta: 'Como o pedido feito no cardápio chega à loja?',
    resposta:
      'No fluxo público atual, o cliente monta o carrinho e finaliza pelo WhatsApp configurado em “Minha empresa”. A mensagem leva os itens, complementos, quantidades, tipo de atendimento e total calculado.',
    observacao:
      'Confira se o WhatsApp da loja está correto antes de divulgar o cardápio. A gravação automática de todo pedido público no painel depende da integração de pedidos contratada e habilitada.',
    palavrasChave: ['whatsapp', 'cliente', 'carrinho', 'mensagem', 'finalizar', 'pedido público'],
  },
  {
    id: 'pedido-manual',
    categoria: 'pedidos',
    pergunta: 'Como registro um pedido recebido por telefone ou balcão?',
    resposta:
      'Na Gestão de pedidos, use “+ Novo pedido”. Informe o cliente, a origem, o tipo do pedido e os itens. Depois de salvar, abra o card para conferir os detalhes e conduzir o atendimento.',
    observacao:
      'O pedido manual atual trabalha melhor com produtos sem complementos obrigatórios. Quando houver uma escolha obrigatória, confirme os detalhes com o cliente e revise o pedido antes de salvar.',
    palavrasChave: ['manual', 'telefone', 'balcão', 'instagram', 'novo pedido', 'origem'],
  },
  {
    id: 'status-pedido',
    categoria: 'pedidos',
    pergunta: 'O que significam os status dos pedidos?',
    resposta:
      'Os status registram o avanço operacional. Em geral, um pedido passa por Pendente, Confirmado, Em preparo e Pronto. Pedidos de entrega ainda podem seguir para Saiu para entrega; no fim, ficam Concluídos ou Cancelados.',
    passos: [
      'Abra o pedido para revisar cliente, itens, observações, pagamento e destino.',
      'Use o botão principal para avançar somente quando a etapa real tiver sido cumprida.',
      'Se outra aba já tiver alterado o pedido, o painel atualiza o estado para evitar uma transição desatualizada.',
      'Use o Histórico para consultar pedidos concluídos e cancelados.',
    ],
    palavrasChave: ['status', 'pendente', 'confirmado', 'preparo', 'pronto', 'entrega', 'concluído'],
  },
  {
    id: 'dados-loja',
    categoria: 'loja',
    pergunta: 'Onde altero nome, logo, WhatsApp e regras de entrega?',
    resposta:
      'Abra “Configurações”. Em “Minha loja” ficam nome, logo, capa, cor da marca, WhatsApp e cidade; em “Funcionamento” ficam pedido mínimo, tempo de preparo e se a loja aceita retirada e/ou delivery. A taxa de entrega em si fica em “Áreas de entrega”.',
    observacao:
      'Salve cada bloco e confira o cardápio público. Use um número de WhatsApp com DDD e revise se o tempo mínimo é menor ou igual ao máximo.',
    palavrasChave: ['logo', 'capa', 'cor', 'whatsapp', 'taxa', 'pedido mínimo', 'tempo', 'empresa', 'loja', 'configurações'],
  },
  {
    id: 'privacidade-cliente',
    categoria: 'conta',
    pergunta: 'Quem é responsável pelos dados dos clientes da minha loja?',
    resposta:
      'Em regra, a loja decide por que e como usa os dados dos próprios clientes e atua como controladora. O CliqueFome processa os dados necessários para prestar a plataforma, conforme o contrato e as instruções aplicáveis. Cada caso deve respeitar a LGPD e as obrigações de informação ao titular.',
    observacao:
      'Evite copiar dados de clientes para planilhas ou canais sem proteção e mantenha o acesso ao painel restrito a pessoas autorizadas.',
    palavrasChave: ['LGPD', 'privacidade', 'cliente', 'controlador', 'operador', 'dados pessoais'],
  },
  {
    id: 'acesso-conta',
    categoria: 'conta',
    pergunta: 'Como protejo o acesso ao painel?',
    resposta:
      'Use uma senha exclusiva, não compartilhe a mesma conta entre pessoas e sempre saia do painel em computadores compartilhados. Nunca envie senha ou código de acesso por mensagens.',
    observacao:
      'A recuperação de senha e a criação de acessos separados serão documentadas aqui quando esses fluxos estiverem disponíveis no painel.',
    palavrasChave: ['senha', 'login', 'segurança', 'conta', 'acesso', 'sair'],
  },
  {
    id: 'suporte',
    categoria: 'conta',
    pergunta: 'Como falo com o suporte?',
    resposta:
      'A base de ajuda já pode ser consultada e pesquisada nesta página. O chatbot e o atendimento humano estão sinalizados como “Em breve” porque os canais ainda não foram habilitados.',
    observacao:
      'Enquanto os canais não forem publicados, não envie dados pessoais, senhas ou informações de pagamento para contatos não confirmados pelo CliqueFome.',
    palavrasChave: ['ajuda', 'chatbot', 'humano', 'atendimento', 'falar', 'contato'],
  },
];

export type PassoTutorial = {
  titulo: string;
  descricao: string;
  rota?: string;
};

export type Tutorial = {
  id: string;
  titulo: string;
  resumo: string;
  nivel: 'Essencial' | 'Operação';
  duracao: string;
  passos: PassoTutorial[];
  palavrasChave: string[];
};

export const TUTORIAIS: Tutorial[] = [
  {
    id: 'configurar-loja',
    titulo: 'Configure a identidade e os dados da loja',
    resumo: 'Prepare o visual, o WhatsApp e as regras que o cliente verá no cardápio.',
    nivel: 'Essencial',
    duracao: '5 min',
    passos: [
      { titulo: 'Abra Configurações', descricao: 'Use o menu lateral para acessar Configurações → Minha loja.', rota: '/admin/config' },
      { titulo: 'Ajuste a aparência', descricao: 'Envie logo e capa, escolha a cor da marca e salve o bloco.' },
      { titulo: 'Revise os dados', descricao: 'Confira nome, nicho e WhatsApp com DDD.' },
      { titulo: 'Defina as regras', descricao: 'Em Funcionamento, preencha pedido mínimo, tempo de preparo e retirada/delivery.' },
      { titulo: 'Valide como cliente', descricao: 'Abra o cardápio público e confira texto, imagens e legibilidade no celular.' },
    ],
    palavrasChave: ['empresa', 'loja', 'configurações', 'logo', 'capa', 'cor', 'whatsapp', 'entrega'],
  },
  {
    id: 'montar-catalogo',
    titulo: 'Monte o primeiro catálogo',
    resumo: 'Organize categorias e produtos e publique um cardápio simples para teste.',
    nivel: 'Essencial',
    duracao: '10 min',
    passos: [
      { titulo: 'Crie as categorias', descricao: 'Separe os itens como o cliente procura: Lanches, Bebidas, Sobremesas.', rota: '/admin/catalogo' },
      { titulo: 'Cadastre os produtos', descricao: 'Use nomes objetivos, descrição curta, preço correto e imagem nítida.' },
      { titulo: 'Defina disponibilidade', descricao: 'Mantenha ativos apenas os itens realmente vendáveis.' },
      { titulo: 'Ordene o catálogo', descricao: 'Arraste categorias e produtos para colocar os mais importantes primeiro.' },
      { titulo: 'Faça um pedido de teste', descricao: 'Abra o link público, adicione itens e confira o resumo enviado ao WhatsApp.' },
    ],
    palavrasChave: ['catálogo', 'categoria', 'produto', 'preço', 'ordem', 'publicar'],
  },
  {
    id: 'configurar-complementos',
    titulo: 'Crie tamanhos, sabores e adicionais',
    resumo: 'Configure escolhas obrigatórias ou opcionais sem duplicar produtos.',
    nivel: 'Essencial',
    duracao: '8 min',
    passos: [
      { titulo: 'Planeje a escolha', descricao: 'Defina se a lista representa tamanho, sabor, borda ou adicionais.' },
      { titulo: 'Crie a lista', descricao: 'Na subaba Complementos, informe mínimo, máximo, repetição e regra de preço.', rota: '/admin/catalogo' },
      { titulo: 'Cadastre as opções', descricao: 'Adicione cada escolha com preço extra e quantidade máxima quando aplicável.' },
      { titulo: 'Vincule aos produtos', descricao: 'Edite os produtos e selecione a lista recém-criada.' },
      { titulo: 'Teste os limites', descricao: 'No cardápio, tente salvar abaixo do mínimo, acima do máximo e com combinações diferentes.' },
    ],
    palavrasChave: ['complementos', 'adicionais', 'sabores', 'tamanhos', 'opções'],
  },
  {
    id: 'divulgar-link',
    titulo: 'Copie e teste o link do cardápio',
    resumo: 'Encontre o endereço público e valide a experiência antes de divulgar.',
    nivel: 'Essencial',
    duracao: '3 min',
    passos: [
      { titulo: 'Abra Links do cardápio', descricao: 'O painel mostra o endereço público associado ao slug da loja.', rota: '/admin/links' },
      { titulo: 'Clique em Abrir', descricao: 'Revise o cardápio em uma nova aba e faça o teste no celular.' },
      { titulo: 'Simule o checkout', descricao: 'Monte um carrinho e confirme número, itens, totais e destino da mensagem.' },
      { titulo: 'Copie o endereço', descricao: 'Depois da validação, use o botão Copiar para divulgar o link.' },
    ],
    palavrasChave: ['link', 'cardápio', 'abrir', 'copiar', 'divulgar', 'teste'],
  },
  {
    id: 'operar-pedidos',
    titulo: 'Receba e avance um pedido',
    resumo: 'Use o detalhe do pedido como referência única para a operação.',
    nivel: 'Operação',
    duracao: '5 min',
    passos: [
      { titulo: 'Abra Gestão de pedidos', descricao: 'A fila separa pedidos em andamento dos prontos e do histórico.', rota: '/admin/pedidos' },
      { titulo: 'Selecione um pedido', descricao: 'Confira cliente, tipo, itens, observações, pagamento e total no painel detalhado.' },
      { titulo: 'Avance com cuidado', descricao: 'Mude o status apenas após cumprir a etapa indicada pelo botão.' },
      { titulo: 'Trate conflitos', descricao: 'Se outra aba alterar o pedido, leia o aviso e trabalhe com o estado atualizado.' },
      { titulo: 'Conclua e consulte', descricao: 'Finalize o fluxo e use o Histórico quando precisar localizar o pedido depois.' },
    ],
    palavrasChave: ['pedidos', 'status', 'fila', 'detalhe', 'histórico', 'operação'],
  },
  {
    id: 'pedido-manual',
    titulo: 'Registre um pedido manual',
    resumo: 'Inclua no painel pedidos recebidos fora do fluxo digital integrado.',
    nivel: 'Operação',
    duracao: '4 min',
    passos: [
      { titulo: 'Inicie um novo pedido', descricao: 'Na Gestão de pedidos, clique em “+ Novo pedido”.', rota: '/admin/pedidos' },
      { titulo: 'Identifique o atendimento', descricao: 'Preencha cliente, contato, origem e tipo correto: entrega, retirada, balcão ou encomenda.' },
      { titulo: 'Adicione os itens', descricao: 'Busque os produtos, informe quantidades e revise os valores.' },
      { titulo: 'Confira antes de salvar', descricao: 'Valide destino, endereço quando necessário, pagamento e observações.' },
      { titulo: 'Abra o detalhe', descricao: 'Depois de salvar, confirme que as informações chegaram completas à fila.' },
    ],
    palavrasChave: ['pedido manual', 'telefone', 'balcão', 'origem', 'novo pedido'],
  },
];
