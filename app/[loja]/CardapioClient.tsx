'use client';

import { useMemo, useState } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { usePedidoAcompanhado } from '@/hooks/usePedidoAcompanhado';
import { HeroLoja } from './HeroLoja';
import { ModalProduto } from './ModalProduto';
import { CartaoProduto } from './CartaoProduto';
import { CheckoutModal, type CotacaoEstado, type ModoEntrega, type PedidoRegistrado } from './CheckoutModal';
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
import type { ConfigDeliveryPublica } from '@/lib/delivery/tipos';
import { ENDERECO_VAZIO, enderecoEmLinha, enderecoEstruturadoValido, type EnderecoEstruturado } from '@/lib/delivery/tipos';
import { formaPagamentoPermitida, type FormaPagamentoOffline } from '@/lib/pedidos/pagamento';
import { IconeCategoria } from '@/components/cardapio/IconeCategoria';

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

const COTACAO_INICIAL: CotacaoEstado = { status: 'idle' };

export function CardapioClient({
  loja,
  categorias,
  produtos,
  deliveryConfig,
}: {
  loja: LojaPublica;
  categorias: CategoriaPublica[];
  produtos: ProdutoPublico[];
  deliveryConfig: ConfigDeliveryPublica | null;
}) {
  const [linhasSalvas, setLinhas] = useLocalStorage<LinhaCarrinho[]>(
    chaveCarrinho(loja.slug),
    VAZIO,
    ehCarrinhoValido
  );
  const [busca, setBusca] = useState('');
  const [categoriaId, setCategoriaId] = useState('todos');
  const [produtoAberto, setProdutoAberto] = useState<ProdutoPublico | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [nome, setNome] = useLocalStorage<string>(CHAVE_NOME, '');
  const [telefone, setTelefone] = useLocalStorage<string>(CHAVE_TELEFONE, '');
  const [endereco, setEndereco] = useState('');
  const [enderecoDetalhado, setEnderecoDetalhado] = useState<EnderecoEstruturado>({
    ...ENDERECO_VAZIO,
    cidade: deliveryConfig?.cidade || '',
  });
  const [modo, setModo] = useState<ModoEntrega>(() => loja.retirada_ativa ? 'retirada' : 'entrega');
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamentoOffline | ''>('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pedidoRegistrado, setPedidoRegistrado] = useState<PedidoRegistrado | null>(null);
  // Uma chave por tentativa de checkout: sobrevive a retry (clique de novo
  // depois de erro de rede) e só é trocada depois que um pedido é
  // efetivamente criado — é o que garante que duplo clique ou timeout não
  // viram dois pedidos (a garantia real é o índice único no banco; isto
  // aqui só evita gerar chave nova a cada tentativa da mesma compra).
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const usaCotacaoDinamica = !!deliveryConfig?.configurada;
  const [cidadeEscolhida, setCidadeEscolhida] = useState(deliveryConfig?.cidade || '');
  const [cotacao, setCotacao] = useState<CotacaoEstado>(COTACAO_INICIAL);
  const { ativo: pedidoAcompanhado, registrar: registrarAcompanhamento } = usePedidoAcompanhado(loja.slug);

  function mudarEndereco(v: string) {
    setEndereco(v);
    // Qualquer edição no endereço invalida a cotação anterior: usar a taxa
    // velha pra um endereço novo é exatamente o bug de "frete errado" que
    // a spec pediu pra evitar.
    if (cotacao.status !== 'idle') setCotacao(COTACAO_INICIAL);
  }

  function mudarEnderecoDetalhado(valor: EnderecoEstruturado) {
    setEnderecoDetalhado(valor);
    mudarEndereco(enderecoEmLinha(valor));
  }

  function mudarCidade(v: string) {
    setCidadeEscolhida(v);
    if (cotacao.status !== 'idle') setCotacao(COTACAO_INICIAL);
  }

  async function calcularFrete() {
    setErro(null);
    if (!enderecoEstruturadoValido(enderecoDetalhado)) {
      setErro('Preencha CEP, logradouro, número, bairro, cidade e UF para calcular o frete.');
      return;
    }
    if (deliveryConfig?.setor === 'avancado' && !cidadeEscolhida) {
      setErro('Escolha a cidade da entrega.');
      return;
    }
    setCotacao({ status: 'calculando' });
    try {
      const resposta = await fetch('/api/delivery/cotacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lojaSlug: loja.slug,
          endereco: enderecoDetalhado,
          cidade: deliveryConfig?.setor === 'avancado' ? cidadeEscolhida : undefined,
        }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok) {
        setCotacao({ status: 'erro', erro: corpo.erro || 'Não foi possível calcular o frete.' });
        return;
      }
      setCotacao({
        status: 'ok',
        taxa: Number(corpo.taxa),
        distanciaKm: corpo.distanciaKm ?? null,
        enderecoFormatado: corpo.enderecoFormatado,
        token: corpo.token,
        expiraEm: corpo.expiraEm,
      });
    } catch {
      setCotacao({ status: 'erro', erro: 'Falha de conexão ao calcular o frete. Tente novamente.' });
    }
  }

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
  }

  // Vocabulário do banco (pedidos.tipo), não o rótulo da tela.
  const tipoPedido = modo === 'entrega' ? 'delivery' : 'retirada';

  // A vitrine nasce de uma lista única. Isso evita o mesmo produto aparecer
  // em Destaques, Mais pedidos e novamente na categoria, que era uma das
  // principais fontes de confusão no desenho anterior.
  const produtosPorTipo = useMemo(
    () => produtos.filter((p) => produtoApareceNoTipo(p.tipos_pedido, tipoPedido)),
    [produtos, tipoPedido]
  );

  const termoBusca = busca.trim().toLowerCase();
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

  const tituloVitrine = termoBusca
    ? `Resultados para “${busca.trim()}”`
    : categoriaId === 'promocoes'
      ? 'Promoções'
      : categoriaId === 'todos'
        ? 'Destaques do cardápio'
        : categoriasVisiveis.find((c) => c.id === categoriaId)?.nome || 'Cardápio';

  const totalItens = linhas.reduce((s, l) => s + l.qty, 0);
  const subtotal = linhas.reduce((s, l) => s + subtotalLinha(l), 0);
  // Loja sem delivery facilitado configurado cai na taxa fixa antiga, que
  // já existia antes desta funcionalidade — nenhuma loja fica sem taxa por
  // não ter migrado ainda.
  const taxaEstatica = Number(loja.taxa_entrega) || 0;
  const taxa = usaCotacaoDinamica ? (cotacao.status === 'ok' ? cotacao.taxa : 0) : taxaEstatica;
  const totalGeral = subtotal + (modo === 'entrega' && linhas.length > 0 ? taxa : 0);

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

  async function finalizar() {
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
    if (modo === 'entrega' && !endereco.trim()) {
      setErro('Informe o endereço de entrega.');
      return;
    }
    const minimo = Number(loja.pedido_minimo) || 0;
    if (modo === 'entrega' && minimo > 0 && subtotal < minimo) {
      setErro(`Pedido mínimo pra entrega é ${formatBRL(minimo)}.`);
      return;
    }
    if (modo === 'entrega' && !loja.delivery_ativo) {
      setErro('A loja não está aceitando entregas no momento.');
      return;
    }
    if (modo === 'retirada' && !loja.retirada_ativa) {
      setErro('A retirada está indisponível no momento.');
      return;
    }
    if (modo === 'entrega' && usaCotacaoDinamica && cotacao.status !== 'ok') {
      setErro('Calcule o frete antes de finalizar o pedido.');
      return;
    }
    if (!formaPagamentoPermitida(tipoPedido, formaPagamento)) {
      setErro('Escolha como deseja pagar.');
      return;
    }

    const enderecoFinal =
      modo === 'entrega' && cotacao.status === 'ok' ? cotacao.enderecoFormatado : endereco.trim();

    setEnviando(true);
    try {
      const resposta = await fetch(`/api/lojas/${loja.slug}/pedidos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey,
          clienteNome: nome.trim(),
          clienteTelefone: telefone,
          tipo: modo === 'entrega' ? 'delivery' : 'retirada',
          formaPagamento,
          endereco: modo === 'entrega' ? enderecoFinal : undefined,
          enderecoCotacao: modo === 'entrega' ? enderecoEmLinha(enderecoDetalhado) : undefined,
          cotacaoToken: modo === 'entrega' && cotacao.status === 'ok' ? cotacao.token : undefined,
          totalEsperadoCentavos: Math.round(totalGeral * 100),
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
        setErro(corpo.erro || 'Não foi possível registrar seu pedido. Tente novamente.');
        setEnviando(false);
        return;
      }

      // Só depois do commit no banco: limpa o carrinho e troca a chave de
      // idempotência pra próxima compra ser uma tentativa nova.
      atualizar(() => []);
      setIdempotencyKey(crypto.randomUUID());
      setPedidoRegistrado({ pedido: corpo.pedido, proximaAcao: corpo.proxima_acao });
      registrarAcompanhamento({ token: corpo.pedido.token, numero: corpo.pedido.numero });
      setEnviando(false);
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
      setEnviando(false);
    }
  }

  const numeroWhats = (loja.whatsapp_numero || '').replace(/\D/g, '');

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
          <span>Acompanhando o pedido #{pedidoAcompanhado.numero}</span>
          <span className="acompanhar-barra-cta">Ver andamento →</span>
        </a>
      )}
      <div className="cardapio-app" style={{ ['--marca' as string]: loja.cor_marca || '#1E7A4E' }}>
      <aside className="menu-sidebar" aria-label="Navegação da loja">
        <div className="sidebar-marca">
          <span
            className="sidebar-logo"
            style={loja.logo_url ? { ['--logo' as string]: `url("${loja.logo_url}")` } : undefined}
            aria-hidden="true"
          />
          <strong>{loja.nome}</strong>
        </div>

        <nav className="sidebar-nav">
          <button type="button" className="ativo" onClick={() => selecionarCategoria('todos')}><span>▦</span> Cardápio</button>
          <button type="button" onClick={() => selecionarCategoria('promocoes')}><span>◇</span> Promoções</button>
          <button type="button" disabled title="Em breve"><span>☆</span> Avaliações</button>
        </nav>

        <div id="info-loja" className="sidebar-info">
          <strong className={loja.recebendo_encomendas && (loja.delivery_ativo || loja.retirada_ativa) ? 'aberto' : 'fechado'}>
            <i /> {loja.recebendo_encomendas && (loja.delivery_ativo || loja.retirada_ativa) ? 'Aceitando pedidos' : 'Loja fechada'}
          </strong>
          {loja.tempo_entrega_min && loja.tempo_entrega_max && (
            <p><span>Tempo de entrega</span>{loja.tempo_entrega_min}–{loja.tempo_entrega_max} min</p>
          )}
          <p><span>Taxa de entrega</span>{Number(loja.taxa_entrega) > 0 ? formatBRL(Number(loja.taxa_entrega)) : 'Grátis'}</p>
        </div>

        {numeroWhats && (
          <div className="sidebar-ajuda">
            <span>Precisa de ajuda?</span>
            <a href={`https://wa.me/${numeroWhats}`} target="_blank" rel="noopener noreferrer">◉ Falar no WhatsApp</a>
          </div>
        )}
      </aside>

      <section id="cardapio" className="menu-section">
        <HeroLoja loja={loja} />

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
            {categoriasVisiveis.map((c) => (
              <button key={`icone-${c.id}`} type="button" className={'filter-btn' + (categoriaId === c.id && !termoBusca ? ' active' : '')} onClick={() => selecionarCategoria(c.id)}>
                <span className="filter-emoji"><IconeCategoria nome={c.nome} icone={c.icone} /></span><span>{c.nome}</span>
              </button>
            ))}
          </nav>

          <div className="menu-vitrine-topo">
            <h2>{tituloVitrine}{categoriaId === 'todos' && !termoBusca ? ' 🔥' : ''}</h2>
            <span>{produtosExibidos.length} {produtosExibidos.length === 1 ? 'item' : 'itens'}</span>
          </div>

          <div className="menu-list" aria-live="polite">
            {produtosExibidos.length === 0 ? (
              <p className="menu-status">Nenhum item encontrado.</p>
            ) : produtosExibidos.map((p) => (
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
        endereco={enderecoDetalhado}
        modo={modo}
        formaPagamento={formaPagamento}
        erro={erro}
        enviando={enviando}
        pedidoRegistrado={pedidoRegistrado}
        deliveryConfig={deliveryConfig}
        lojaAberta={loja.recebendo_encomendas}
        deliveryAtivo={loja.delivery_ativo}
        retiradaAtiva={loja.retirada_ativa}
        taxaEstatica={taxaEstatica}
        cidadeEscolhida={cidadeEscolhida}
        cotacao={cotacao}
        onFechar={() => setModalAberto(false)}
        onMudarQtd={mudarQtd}
        onRemover={(lineId) => atualizar((a) => a.filter((l) => l.lineId !== lineId))}
        onNome={setNome}
        onTelefone={setTelefone}
        onEndereco={mudarEnderecoDetalhado}
        onCidade={(v) => {
          mudarCidade(v);
          setEnderecoDetalhado((atual) => ({ ...atual, cidade: v }));
        }}
        onCalcularFrete={calcularFrete}
        onModo={(m) => {
          setModo(m);
          setFormaPagamento((atual) => formaPagamentoPermitida(m === 'entrega' ? 'delivery' : 'retirada', atual) ? atual : '');
          setErro(null);
        }}
        onFormaPagamento={(forma) => { setFormaPagamento(forma); setErro(null); }}
        onFinalizar={finalizar}
        onNovoPedido={() => {
          setPedidoRegistrado(null);
          setModalAberto(false);
        }}
      />
      </div>
    </>
  );
}
