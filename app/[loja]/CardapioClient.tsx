'use client';

import { useMemo, useState } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { usePedidoAcompanhado } from '@/hooks/usePedidoAcompanhado';
import { HeroLoja } from './HeroLoja';
import { ModalProduto } from './ModalProduto';
import { CartaoProduto } from './CartaoProduto';
import { CheckoutModal, type PedidoRegistrado, type SugestaoComplementoCarrinho } from './CheckoutModal';
import {
  apareceNoTipo,
  produtoApareceNoTipo,
  ehCarrinhoValido,
  formatBRL,
  precoBase,
  reconciliarCarrinho,
  subtotalLinha,
  type CategoriaPublica,
  type EscolhaComplemento,
  type LinhaCarrinho,
  type LojaPublica,
  type ProdutoPublico,
} from '@/lib/cardapio/tipos';
import { formaPagamentoPermitida, type FormaPagamentoOffline } from '@/lib/pedidos/pagamento';
import { IconeCategoria } from '@/components/cardapio/IconeCategoria';
import type { CotacaoDeliveryPublica, ModalidadePedido } from '@/lib/delivery/tipos';
import { numeroPedido } from '@/lib/pedidos/numero';
import { NavegacaoCliente } from './NavegacaoCliente';
import { CarrinhoLateral } from './CarrinhoLateral';

const TEXTO_AVISO: Record<string, string> = {
  removido: 'saiu do cardápio',
  pausado: 'está esgotado',
  'opcao-indisponivel': 'tinha uma opção que saiu do cardápio',
  reprecificado: 'mudou de preço',
};

// Carrinho por loja: sem o slug na chave, abrir o cardápio de outra loja
// herdaria os itens da anterior.
const chaveCarrinho = (slug: string) => `cf_carrinho_${slug}`;
const CHAVE_NOME = 'cf_nome_cliente';
const CHAVE_TELEFONE = 'cf_telefone_cliente';

// Constante fora do componente: passar [] literal faria o snapshot do
// servidor mudar de identidade a cada render.
const VAZIO: LinhaCarrinho[] = [];

export function CardapioClient({
  loja,
  categorias,
  produtos,
  deliveryAtiva,
}: {
  loja: LojaPublica;
  categorias: CategoriaPublica[];
  produtos: ProdutoPublico[];
  deliveryAtiva: boolean;
}) {
  const [linhasSalvas, setLinhas] = useLocalStorage<LinhaCarrinho[]>(
    chaveCarrinho(loja.slug),
    VAZIO,
    ehCarrinhoValido
  );
  const [busca, setBusca] = useState('');
  const [categoriaId, setCategoriaId] = useState('todos');
  const [produtoAberto, setProdutoAberto] = useState<ProdutoPublico | null>(null);
  const [retornarAoCarrinho, setRetornarAoCarrinho] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [nome, setNome] = useLocalStorage<string>(CHAVE_NOME, '');
  const [telefone, setTelefone] = useLocalStorage<string>(CHAVE_TELEFONE, '');
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamentoOffline | ''>('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pedidoRegistrado, setPedidoRegistrado] = useState<PedidoRegistrado | null>(null);
  const [modalidade, setModalidade] = useState<ModalidadePedido>(() =>
    loja.retirada_ativa ? 'retirada' : 'delivery'
  );
  const [versaoCarrinho, setVersaoCarrinho] = useState(0);
  // Uma chave por tentativa de checkout: sobrevive a retry (clique de novo
  // depois de erro de rede) e só é trocada depois que um pedido é
  // efetivamente criado — é o que garante que duplo clique ou timeout não
  // viram dois pedidos (a garantia real é o índice único no banco; isto
  // aqui só evita gerar chave nova a cada tentativa da mesma compra).
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const { ativo: pedidoAcompanhado, registrar: registrarAcompanhamento } = usePedidoAcompanhado(loja.slug);

  // O carrinho exibido é sempre o conferido contra o catálogo que acabou de
  // chegar do servidor — nunca o retrato salvo no navegador.
  const { linhas, avisos } = useMemo(
    () => reconciliarCarrinho(linhasSalvas, produtos),
    [linhasSalvas, produtos]
  );

  /** Toda alteração parte do carrinho já conferido: é isso que faz a
   * reconciliação virar permanente na primeira mexida do cliente. */
  function atualizar(fn: (atual: LinhaCarrinho[]) => LinhaCarrinho[]) {
    setLinhas(fn(linhas));
    setVersaoCarrinho((atual) => atual + 1);
  }

  const tipoPedido = 'retirada';

  // A vitrine nasce de uma lista única. Isso evita o mesmo produto aparecer
  // em Destaques, Mais pedidos e novamente na categoria, que era uma das
  // principais fontes de confusão no desenho anterior.
  const produtosPorTipo = useMemo(
    () => produtos.filter((p) => produtoApareceNoTipo(p.tipos_pedido, tipoPedido)),
    [produtos, tipoPedido]
  );

  // O carrinho guarda só o id do produto (a linha é persistida em
  // localStorage, e engordá-la quebraria carrinho salvo antes disso). A
  // miniatura de cada item sai deste mapa, montado do catálogo já carregado.
  const imagensPorProduto = useMemo(
    () => Object.fromEntries(produtos.map((p) => [p.id, p.imagem_url])),
    [produtos]
  );

  const sugestoesCarrinho = useMemo(() => {
    if (linhas.length === 0) return [];
    const categoriasPorId = new Map(categorias.map((categoria) => [categoria.id, categoria.nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()]));
    const idsNoCarrinho = new Set(linhas.map((linha) => linha.produtoId));
    const ehBebida = (produto: ProdutoPublico) => produto.sugestao_carrinho === 'bebida' || (categoriasPorId.get(produto.categoria_id || '') || '').includes('bebida');
    const produtosNoCarrinho = produtosPorTipo.filter((produto) => idsNoCarrinho.has(produto.id));
    const temComida = produtosNoCarrinho.some((produto) => !ehBebida(produto));
    if (!temComida) return [];
    const temBebida = produtosNoCarrinho.some(ehBebida);
    const temAcompanhamento = produtosNoCarrinho.some((produto) => produto.sugestao_carrinho === 'acompanhamento');
    const grupos: { titulo: string; produtos: ProdutoPublico[] }[] = [];
    if (!temBebida) {
      grupos.push({ titulo: 'Algo para beber', produtos: produtosPorTipo.filter((produto) => produto.ativo && !idsNoCarrinho.has(produto.id) && produto.sugestao_carrinho === 'bebida').slice(0, 4) });
    }
    if (!temAcompanhamento) {
      grupos.push({ titulo: 'Um acompanhamento', produtos: produtosPorTipo.filter((produto) => produto.ativo && !idsNoCarrinho.has(produto.id) && produto.sugestao_carrinho === 'acompanhamento').slice(0, 4) });
    }
    return grupos.filter((grupo) => grupo.produtos.length > 0);
  }, [categorias, linhas, produtosPorTipo]);

  const sugestoesComplementos = useMemo<SugestaoComplementoCarrinho[]>(() => {
    const produtosPorId = new Map(produtosPorTipo.map((produto) => [produto.id, produto]));
    return linhas.flatMap((linha) => {
      const produto = produtosPorId.get(linha.produtoId);
      if (!produto) return [];
      return produto.grupos.flatMap((grupo) => {
        const atuais = linha.complementos.filter((escolha) => escolha.grupoId === grupo.id);
        const quantidadeAtual = atuais.reduce((total, escolha) => total + (escolha.quantidade || 1), 0);
        if (quantidadeAtual >= grupo.qtd_max) return [];
        return grupo.complementos.filter((opcao) => {
          if (!opcao.ativo || !opcao.sugestao_carrinho) return false;
          const existente = atuais.find((escolha) => escolha.complementoId === opcao.id);
          if (!existente) return true;
          return grupo.tipo_selecao === 'varias_repetir' && (opcao.qtd_max == null || existente.quantidade < opcao.qtd_max);
        }).map((opcao) => ({
          lineId: linha.lineId,
          produtoNome: linha.nome,
          grupoId: grupo.id,
          complementoId: opcao.id,
          nome: opcao.nome,
          preco: Number(opcao.preco),
          imagemUrl: opcao.imagem_url,
        }));
      });
    }).slice(0, 8);
  }, [linhas, produtosPorTipo]);

  const termoBusca = busca.trim().toLowerCase();
  // O chip só existe quando há o que mostrar — senão levaria a uma tela vazia.
  const temPromocoes = useMemo(
    () => produtosPorTipo.some((p) => p.preco_promocional != null),
    [produtosPorTipo]
  );
  const categoriasVisiveis = useMemo(
    () => categorias.filter((c) => produtosPorTipo.some((p) => p.categoria_id === c.id)),
    [categorias, produtosPorTipo]
  );
  const produtosExibidos = useMemo(() => {
    const lista = produtosPorTipo.filter((p) => {
      if (termoBusca) return `${p.nome} ${p.descricao || ''}`.toLowerCase().includes(termoBusca);
      if (categoriaId === 'promocoes') return p.preco_promocional != null;
      if (categoriaId !== 'todos') return p.categoria_id === categoriaId;
      return true;
    });
    return [...lista].sort(
      (a, b) => Number(b.destaque) - Number(a.destaque) || Number(b.etiqueta === 'mais_pedido') - Number(a.etiqueta === 'mais_pedido') || a.ordem - b.ordem
    );
  }, [produtosPorTipo, termoBusca, categoriaId]);

  /**
   * Em "todos" o cardápio vira uma seção por categoria, cada uma com o
   * próprio título — antes era uma lista só, com sanduíche, bebida e
   * sobremesa embaralhados por destaque, e o cliente não tinha como saber
   * onde uma coisa terminava e outra começava.
   *
   * O destaque ganha a primeira seção, e o item sai da categoria dele. É a
   * única marcação que muda o produto de lugar, justamente porque é a que o
   * dono liga quando quer aquele item na frente de tudo. Repetir o mesmo
   * produto em Destaques e de novo na categoria era o desenho antigo, e
   * confundia — além de fazer o contador de itens somar duas vezes.
   *
   * Dentro das outras seções a ordem cadastrada pelo dono é respeitada.
   *
   * Busca, promoções e categoria específica continuam em lista única: ali o
   * recorte já é o assunto, e um título por categoria só faria ruído. Nelas
   * o destaque volta a ser só ordenação, no topo da lista.
   */
  const secoes = useMemo(() => {
    const listaUnica = [{ id: 'unica', titulo: null as string | null, produtos: produtosExibidos }];
    if (termoBusca || categoriaId !== 'todos') return listaUnica;

    const destaques = produtosExibidos.filter((p) => p.destaque);
    const idsEmDestaque = new Set(destaques.map((p) => p.id));
    const restante = produtosExibidos.filter((p) => !idsEmDestaque.has(p.id));

    const porCategoria = categoriasVisiveis
      .map((categoria) => ({
        id: categoria.id,
        titulo: categoria.nome,
        produtos: restante
          .filter((p) => p.categoria_id === categoria.id)
          .sort((a, b) => a.ordem - b.ordem),
      }))
      .filter((secao) => secao.produtos.length > 0);

    // Produto sem categoria, ou de categoria que sumiu do cardápio, cairia
    // fora de todas as seções e simplesmente não apareceria.
    const idsAgrupados = new Set(porCategoria.flatMap((s) => s.produtos.map((p) => p.id)));
    const soltos = restante.filter((p) => !idsAgrupados.has(p.id));
    if (soltos.length > 0) porCategoria.push({ id: 'outros', titulo: 'Outros', produtos: soltos });

    const comDestaques = destaques.length > 0
      ? [{ id: 'destaques', titulo: 'Destaques 🔥', produtos: destaques }, ...porCategoria]
      : porCategoria;

    return comDestaques.length > 0 ? comDestaques : listaUnica;
  }, [produtosExibidos, categoriasVisiveis, termoBusca, categoriaId]);

  const tituloVitrine = termoBusca
    ? `Resultados para “${busca.trim()}”`
    : categoriaId === 'promocoes'
      ? 'Promoções'
      : categoriaId === 'todos'
        ? 'Cardápio'
        : categoriasVisiveis.find((c) => c.id === categoriaId)?.nome || 'Cardápio';

  const totalItens = linhas.reduce((s, l) => s + l.qty, 0);
  const subtotal = linhas.reduce((s, l) => s + subtotalLinha(l), 0);
  const totalGeral = subtotal;

  function idDaLinha(produtoId: string, escolhas: EscolhaComplemento[], obs: string) {
    // A quantidade entra na chave: 2x bacon é uma linha diferente de 1x
    // bacon, senão as duas se fundiriam e o preço sairia errado.
    const chave = escolhas
      .map((c) => `${c.complementoId}x${c.quantidade}`)
      .sort()
      .join(',');
    return `${produtoId}::${chave}::${obs}`;
  }

  function adicionar(p: ProdutoPublico, escolhas: EscolhaComplemento[], obs: string, qtd: number) {
    const lineId = idDaLinha(p.id, escolhas, obs);
    atualizar((atual) => {
      const existente = atual.find((l) => l.lineId === lineId);
      if (existente) {
        return atual.map((l) => (l.lineId === lineId ? { ...l, qty: l.qty + qtd } : l));
      }
      return [
        ...atual,
        {
          lineId,
          produtoId: p.id,
          nome: p.nome,
          precoUnit: precoBase(p),
          complementos: escolhas,
          observacao: obs,
          qty: qtd,
        },
      ];
    });
    setProdutoAberto(null);
    if (retornarAoCarrinho) {
      setRetornarAoCarrinho(false);
      setModalAberto(true);
    }
  }

  function abrirProduto(p: ProdutoPublico) {
    // Esgotado não abre nem entra no carrinho. A trava fica aqui, no
    // comportamento — não só no CSS, senão bastava um clique pra furar.
    if (!p.ativo) return;
    setProdutoAberto(p);
  }

  function adicionarRapido(p: ProdutoPublico) {
    if (!p.ativo) return;
    if (p.grupos.some((g) => apareceNoTipo(g.tipos_pedido, tipoPedido))) {
      setProdutoAberto(p);
      return;
    }
    adicionar(p, [], '', 1);
  }

  function adicionarSugestao(p: ProdutoPublico) {
    if (p.grupos.some((grupo) => apareceNoTipo(grupo.tipos_pedido, tipoPedido))) {
      setRetornarAoCarrinho(true);
      setModalAberto(false);
      setProdutoAberto(p);
      return;
    }
    adicionar(p, [], '', 1);
  }

  function adicionarComplementoSugerido(sugestao: SugestaoComplementoCarrinho) {
    atualizar((atual) => {
      const linha = atual.find((item) => item.lineId === sugestao.lineId);
      const produto = linha ? produtosPorTipo.find((item) => item.id === linha.produtoId) : null;
      const grupo = produto?.grupos.find((item) => item.id === sugestao.grupoId);
      const opcao = grupo?.complementos.find((item) => item.id === sugestao.complementoId && item.ativo && item.sugestao_carrinho);
      if (!linha || !grupo || !opcao) return atual;
      const escolhasDoGrupo = linha.complementos.filter((item) => item.grupoId === grupo.id);
      const totalAtual = escolhasDoGrupo.reduce((total, item) => total + (item.quantidade || 1), 0);
      if (totalAtual >= grupo.qtd_max) return atual;
      const existente = linha.complementos.find((item) => item.complementoId === opcao.id);
      let complementos: EscolhaComplemento[];
      if (existente) {
        if (grupo.tipo_selecao !== 'varias_repetir' || (opcao.qtd_max != null && existente.quantidade >= opcao.qtd_max)) return atual;
        complementos = linha.complementos.map((item) => item.complementoId === opcao.id ? { ...item, quantidade: item.quantidade + 1 } : item);
      } else {
        complementos = [...linha.complementos, {
          complementoId: opcao.id,
          grupoId: grupo.id,
          grupoNome: grupo.nome,
          nome: opcao.nome,
          preco: Number(opcao.preco),
          quantidade: 1,
          modoPreco: grupo.modo_preco,
        }];
      }
      const novoId = idDaLinha(linha.produtoId, complementos, linha.observacao);
      const duplicada = atual.find((item) => item.lineId === novoId && item.lineId !== linha.lineId);
      if (duplicada) return atual.filter((item) => item.lineId !== linha.lineId).map((item) => item.lineId === novoId ? { ...item, qty: item.qty + linha.qty } : item);
      return atual.map((item) => item.lineId === linha.lineId ? { ...item, lineId: novoId, complementos } : item);
    });
  }

  function quantidadeSimples(produtoId: string) {
    return linhas
      .filter((l) => l.produtoId === produtoId && l.complementos.length === 0 && !l.observacao)
      .reduce((s, l) => s + l.qty, 0);
  }

  function diminuirProdutoSimples(produtoId: string) {
    const linha = linhas.find((l) => l.produtoId === produtoId && l.complementos.length === 0 && !l.observacao);
    if (linha) mudarQtd(linha.lineId, -1);
  }

  function mudarQtd(lineId: string, delta: number) {
    atualizar((atual) =>
      atual
        .map((l) => (l.lineId === lineId ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0)
    );
  }

  async function finalizar(cotacao: CotacaoDeliveryPublica | null) {
    setErro(null);
    if (linhas.length === 0 || enviando) return;

    if (!loja.recebendo_encomendas) {
      setErro('A loja está fechada e não está recebendo pedidos no momento.');
      return;
    }

    if (!nome.trim()) {
      setErro('Informe seu nome.');
      return;
    }
    if (telefone.replace(/\D/g, '').length < 10) {
      setErro('Informe um telefone válido com DDD.');
      return;
    }
    if (modalidade === 'retirada' && !loja.retirada_ativa) {
      setErro('A retirada está indisponível no momento.');
      return;
    }
    if (modalidade === 'delivery' && !deliveryAtiva) {
      setErro('O Delivery está indisponível no momento.');
      return;
    }
    if (modalidade === 'delivery' && !cotacao) {
      setErro('Calcule e confirme a taxa de entrega.');
      return;
    }
    const minimo = Number(loja.pedido_minimo) || 0;
    if (minimo > 0 && subtotal < minimo) {
      setErro(`O pedido mínimo é de ${formatBRL(minimo)}.`);
      return;
    }
    if (!formaPagamentoPermitida(modalidade, formaPagamento)) {
      setErro('Escolha como deseja pagar.');
      return;
    }

    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), 20_000);
    setEnviando(true);
    try {
      const resposta = await fetch(`/api/lojas/${loja.slug}/pedidos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controlador.signal,
        body: JSON.stringify({
          idempotencyKey,
          clienteNome: nome.trim(),
          clienteTelefone: telefone,
          tipo: modalidade,
          quoteId: modalidade === 'delivery' ? cotacao?.quoteId : undefined,
          formaPagamento,
          totalEsperadoCentavos: Math.round(totalGeral * 100) +
            (modalidade === 'delivery' ? cotacao?.deliveryFeeCents || 0 : 0),
          itens: linhas.map((l) => ({
            produtoId: l.produtoId,
            quantidade: l.qty,
            observacao: l.observacao || undefined,
            complementos: l.complementos.map((c) => ({
              complementoId: c.complementoId,
              quantidade: c.quantidade,
            })),
          })),
        }),
      });
      const corpo = await resposta.json();

      if (!resposta.ok) {
        if (corpo.codigo === 'DELIVERY_QUOTE_STALE') {
          setVersaoCarrinho((atual) => atual + 1);
        }
        setErro(corpo.erro || 'Não foi possível registrar seu pedido. Tente novamente.');
        return;
      }

      // Só depois do commit no banco: limpa o carrinho e troca a chave de
      // idempotência pra próxima compra ser uma tentativa nova.
      atualizar(() => []);
      setIdempotencyKey(crypto.randomUUID());
      setPedidoRegistrado({ pedido: corpo.pedido, proximaAcao: corpo.proxima_acao });
      registrarAcompanhamento({ token: corpo.pedido.token, numero: corpo.pedido.numero });
      // Pix no WhatsApp é o único caminho pra fechar o pagamento — tenta
      // abrir sozinho. Pode ser bloqueado como popup (Safari/Chrome mobile
      // bloqueiam window.open fora de um clique síncrono, e este roda
      // depois do fetch), por isso o botão continua visível na tela de
      // sucesso como caminho manual de volta.
      if (corpo.pedido.forma_pagamento === 'pix_manual' && corpo.proxima_acao?.tipo === 'whatsapp') {
        window.open(corpo.proxima_acao.url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      setErro('Falha de conexão ao enviar seu pedido. Seu carrinho continua salvo — tente de novo.');
    } finally {
      clearTimeout(temporizador);
      setEnviando(false);
    }
  }

  function selecionarCategoria(id: string) {
    setBusca('');
    setCategoriaId(id);
  }

  return (
    <>
      {pedidoAcompanhado && !modalAberto && (
        <a
          className="acompanhar-barra"
          href={`/pedido/${pedidoAcompanhado.token}`}
          style={{ ['--marca' as string]: loja.cor_marca || '#1E7A4E' }}
        >
          <span>Acompanhando o pedido {numeroPedido(pedidoAcompanhado.numero)}</span>
          <span className="acompanhar-barra-cta">Ver andamento →</span>
        </a>
      )}
      <div className="cardapio-app" style={{ ['--marca' as string]: loja.cor_marca || '#1E7A4E' }}>
      {/* A barra lateral do desktop saiu: ela empurrava a capa pra 3/4 da
          largura e repetia o que o cabeçalho já diz (logo, nome, status,
          tempo de preparo) — o WhatsApp e o resto vivem em "Mais
          informações", que existe nos dois tamanhos de tela. O único item
          que só existia lá era Promoções, agora um chip entre as
          categorias, onde o celular também alcança. */}
      <section id="cardapio" className="menu-section">
        <HeroLoja loja={loja} deliveryAtiva={deliveryAtiva} />

        <div id="cardapio-conteudo" className="menu-conteudo">

          {avisos.length > 0 && (
            <div className="carrinho-avisos" role="status">
              <strong>Seu carrinho mudou desde a última visita</strong>
              <ul>
                {avisos.map((a, i) => (
                  <li key={`${a.nome}-${a.motivo}-${i}`}>{a.nome} {TEXTO_AVISO[a.motivo]}.</li>
                ))}
              </ul>
            </div>
          )}

          <div className="menu-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            <input type="search" placeholder="Buscar no cardápio..." aria-label="Buscar no cardápio" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>

          <nav className="menu-filters" aria-label="Categorias do cardápio">
            <button type="button" className={'filter-btn' + (categoriaId === 'todos' && !termoBusca ? ' active' : '')} onClick={() => selecionarCategoria('todos')}>
              <span className="filter-emoji">▦</span><span>Todos</span>
            </button>
            {categoriasVisiveis.map((c) => (
              <button key={c.id} type="button" className={'filter-btn' + (categoriaId === c.id && !termoBusca ? ' active' : '')} onClick={() => selecionarCategoria(c.id)}>
                <span className="filter-emoji">{c.emoji || '•'}</span><span>{c.nome}</span>
              </button>
            ))}
          </nav>

          <nav className="menu-filters menu-filters-with-icons" aria-label="Categorias do cardápio">
            <button type="button" className={'filter-btn' + (categoriaId === 'todos' && !termoBusca ? ' active' : '')} onClick={() => selecionarCategoria('todos')}>
              <span className="filter-emoji"><IconeCategoria nome="Todos" icone="generico" /></span><span>Todos</span>
            </button>
            {temPromocoes && (
              <button type="button" className={'filter-btn' + (categoriaId === 'promocoes' && !termoBusca ? ' active' : '')} onClick={() => selecionarCategoria('promocoes')}>
                <span className="filter-emoji">%</span><span>Promoções</span>
              </button>
            )}
            {categoriasVisiveis.map((c) => (
              <button key={`icone-${c.id}`} type="button" className={'filter-btn' + (categoriaId === c.id && !termoBusca ? ' active' : '')} onClick={() => selecionarCategoria(c.id)}>
                <span className="filter-emoji"><IconeCategoria nome={c.nome} icone={c.icone} /></span><span>{c.nome}</span>
              </button>
            ))}
          </nav>

          <div className="cardapio-layout">
            <div className="cardapio-produtos">
              <div className="menu-vitrine-topo">
                <h2>{tituloVitrine}</h2>
                <span>{produtosExibidos.length} {produtosExibidos.length === 1 ? 'item' : 'itens'}</span>
              </div>

              <div aria-live="polite">
                {produtosExibidos.length === 0 ? (
                  <p className="menu-status">Nenhum item encontrado.</p>
                ) : secoes.map((secao) => (
                  <section key={secao.id} className="menu-secao" aria-label={secao.titulo || undefined}>
                    {secao.titulo && <h3 className="menu-secao-titulo">{secao.titulo}</h3>}
                    <div className="menu-list">
                      {secao.produtos.map((p) => (
                        <CartaoProduto
                          key={p.id}
                          produto={p}
                          quantidade={quantidadeSimples(p.id)}
                          onAbrir={() => abrirProduto(p)}
                          onAdicionar={() => adicionarRapido(p)}
                          onDiminuir={() => diminuirProdutoSimples(p.id)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>

            <CarrinhoLateral
              linhas={linhas}
              imagensPorProduto={imagensPorProduto}
              subtotal={subtotal}
              onMudarQtd={mudarQtd}
              onRemover={(lineId) => atualizar((atuais) => atuais.filter((linha) => linha.lineId !== lineId))}
              onContinuar={() => setModalAberto(true)}
            />
          </div>
        </div>
      </section>

      {totalItens > 0 && (
        <button type="button" className="floating-cart" aria-label="Ver carrinho" onClick={() => setModalAberto(true)}>
          <span className="floating-cart-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="9" cy="21" r="1" />
              <circle cx="19" cy="21" r="1" />
              <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
            </svg>
            <span className="badge cart-count">{totalItens}</span>
          </span>
          <span className="floating-cart-label">
            Ver carrinho · {totalItens} {totalItens === 1 ? 'item' : 'itens'}
          </span>
          <span className="floating-cart-total">{formatBRL(totalGeral)}</span>
          <span className="floating-cart-cta">Continuar pedido</span>
        </button>
      )}

      {produtoAberto && (
        <ModalProduto
          produto={produtoAberto}
          tipoPedido={tipoPedido}
          onFechar={() => setProdutoAberto(null)}
          onAdicionar={(escolhas, obs, qtd) => {
            adicionar(produtoAberto, escolhas, obs, qtd);
          }}
        />
      )}

      <CheckoutModal
        aberto={modalAberto}
        linhas={linhas}
        nome={nome}
        telefone={telefone}
        formaPagamento={formaPagamento}
        erro={erro}
        enviando={enviando}
        pedidoRegistrado={pedidoRegistrado}
        lojaAberta={loja.recebendo_encomendas}
        retiradaAtiva={loja.retirada_ativa}
        deliveryAtiva={deliveryAtiva}
        lojaSlug={loja.slug}
        modalidade={modalidade}
        versaoCarrinho={versaoCarrinho}
        lojaNome={loja.nome}
        lojaLogoUrl={loja.logo_url}
        pedidoMinimo={loja.pedido_minimo}
        tempoPreparoMin={loja.tempo_preparo_min}
        tempoPreparoMax={loja.tempo_preparo_max}
        imagensPorProduto={imagensPorProduto}
        sugestoes={sugestoesCarrinho}
        sugestoesComplementos={sugestoesComplementos}
        onAdicionarSugestao={adicionarSugestao}
        onAdicionarComplemento={adicionarComplementoSugerido}
        onFechar={() => setModalAberto(false)}
        onMudarQtd={mudarQtd}
        onRemover={(lineId) => atualizar((a) => a.filter((l) => l.lineId !== lineId))}
        onNome={setNome}
        onTelefone={setTelefone}
        onFormaPagamento={(forma) => { setFormaPagamento(forma); setErro(null); }}
        onModalidade={(novaModalidade) => { setModalidade(novaModalidade); setErro(null); }}
        onFinalizar={finalizar}
        onNovoPedido={() => {
          setPedidoRegistrado(null);
          setModalAberto(false);
        }}
      />
      <NavegacaoCliente lojaSlug={loja.slug} />
      </div>
    </>
  );
}
