'use client';

import { useMemo, useState } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { HeroLoja } from './HeroLoja';
import { ModalProduto } from './ModalProduto';
import { CheckoutModal, type CotacaoEstado, type ModoEntrega, type PedidoRegistrado } from './CheckoutModal';
import {
  apareceNoTipo,
  ehCarrinhoValido,
  formatBRL,
  precoBase,
  precoMinimo,
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

const TEXTO_AVISO: Record<string, string> = {
  removido: 'saiu do cardápio',
  pausado: 'está esgotado',
  'opcao-indisponivel': 'tinha uma opção que saiu do cardápio',
  reprecificado: 'mudou de preço',
};

const ETIQUETAS: Record<string, string> = {
  mais_pedido: 'Mais pedido',
  novidade: 'Novidade',
  recomendado: 'Recomendado',
  edicao_limitada: 'Edição limitada',
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
  const [modo, setModo] = useState<ModoEntrega>('retirada');
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

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return produtos.filter((p) => {
      if (categoriaId !== 'todos' && p.categoria_id !== categoriaId) return false;
      if (!apareceNoTipo(p.tipos_pedido, tipoPedido)) return false;
      if (termo && !`${p.nome} ${p.descricao || ''}`.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [produtos, busca, categoriaId, tipoPedido]);

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

  function aoClicarProduto(p: ProdutoPublico) {
    // Esgotado não abre nem entra no carrinho. A trava fica aqui, no
    // comportamento — não só no CSS, senão bastava um clique pra furar.
    if (!p.ativo) return;
    // Lista restrita a outro tipo de pedido não conta pra decidir se abre o
    // modal: senão o cliente vê um modal sem nenhuma opção.
    if (p.grupos.some((g) => apareceNoTipo(g.tipos_pedido, tipoPedido))) {
      setProdutoAberto(p);
      return;
    }
    adicionar(p, [], '', 1);
    setModalAberto(true);
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
      setEnviando(false);
    } catch {
      setErro('Falha de conexão ao enviar seu pedido. Seu carrinho continua salvo — tente de novo.');
      setEnviando(false);
    }
  }

  return (
    <div style={{ ['--marca' as string]: loja.cor_marca || '#1E7A4E' }}>
      <section id="cardapio" className="menu-section">
        <HeroLoja loja={loja} />

        {avisos.length > 0 && (
          <div className="carrinho-avisos" role="status">
            <strong>Seu carrinho mudou desde a última visita</strong>
            <ul>
              {avisos.map((a, i) => (
                <li key={`${a.nome}-${a.motivo}-${i}`}>
                  {a.nome} {TEXTO_AVISO[a.motivo]}.
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="menu-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder="Buscar no cardápio"
            aria-label="Buscar no cardápio"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        <div className="menu-filters" role="group" aria-label="Filtrar cardápio por categoria">
          <button
            type="button"
            className={'filter-btn' + (categoriaId === 'todos' ? ' active' : '')}
            onClick={() => setCategoriaId('todos')}
          >
            Todos
          </button>
          {categorias.map((c) => (
            <button
              key={c.id}
              type="button"
              className={'filter-btn' + (categoriaId === c.id ? ' active' : '')}
              onClick={() => setCategoriaId(c.id)}
            >
              {c.emoji ? c.emoji + ' ' : ''}
              {c.nome}
            </button>
          ))}
        </div>

        <div className="menu-list">
          {filtrados.length === 0 ? (
            <p className="menu-status">Nenhum item encontrado.</p>
          ) : (
            filtrados.map((p) => {
              const esgotado = !p.ativo;
              const minimo = precoMinimo(p);
              const base = precoBase(p);
              return (
                <article
                  key={p.id}
                  className={'menu-card' + (esgotado ? ' esgotado' : '')}
                  onClick={() => aoClicarProduto(p)}
                >
                  <div className="menu-card-photo">
                    {p.imagem_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- foto do catálogo da loja
                      <img src={p.imagem_url} alt={p.nome} loading="lazy" />
                    ) : (
                      <span className="menu-emoji">🖼️</span>
                    )}
                    {esgotado && (
                      <div className="fita-esgotado">
                        <span>Esgotado</span>
                      </div>
                    )}
                  </div>
                  <div className="menu-card-body">
                    <h3>{p.nome}</h3>
                    {p.etiqueta && ETIQUETAS[p.etiqueta] && (
                      <span className="menu-etiqueta">{ETIQUETAS[p.etiqueta]}</span>
                    )}
                    {p.descricao && <p className="menu-desc">{p.descricao}</p>}
                    <div className="menu-card-footer">
                      <span className="menu-price">
                        {minimo > base && <span className="desde">A partir de</span>}
                        {formatBRL(minimo > base ? minimo : base)}
                      </span>
                      {!esgotado && (
                        <span className="btn-add" aria-hidden="true">
                          +
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })
          )}
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
        </button>
      )}

      {produtoAberto && (
        <ModalProduto
          produto={produtoAberto}
          tipoPedido={tipoPedido}
          onFechar={() => setProdutoAberto(null)}
          onAdicionar={(escolhas, obs, qtd) => {
            adicionar(produtoAberto, escolhas, obs, qtd);
            setModalAberto(true);
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
  );
}
