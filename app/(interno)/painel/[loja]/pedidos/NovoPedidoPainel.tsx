'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useEscFechar } from '@/hooks/useEscFechar';
import { criarClientNavegador } from '@/lib/supabase/client';
import { criarPedidoManual, type ItemPedidoManual } from '@/lib/pedidos/acoes';
import {
  apareceNoTipo,
  produtoApareceNoTipo,
  extraDaLinha,
  formatarTelefone,
  formatBRL,
  precoBase,
  precoMinimo,
  subtotalLinha,
  type CategoriaPublica,
  type EscolhaComplemento,
  type LinhaCarrinho,
  type ProdutoPublico,
} from '@/lib/cardapio/tipos';
import {
  formaPagamentoPermitida,
  formasPagamentoPara,
  instrucaoPagamento,
  type FormaPagamentoOffline,
} from '@/lib/pedidos/pagamento';
import { aplicarRespostaViaCep, formatarCep, validarEnderecoDelivery } from '@/lib/delivery/endereco';
import type { CotacaoDeliveryPublica, EnderecoDelivery } from '@/lib/delivery/tipos';
import { IconeBusca } from '@/components/admin/IconesCatalogo';
import { IconeFormaPagamento } from '@/components/pedidos/IconeFormaPagamento';
import { ModalDetalhesProdutoPedido } from './ModalDetalhesProdutoPedido';
import styles from './novoPedido.module.css';

type TipoManual = 'retirada' | 'balcao' | 'mesa' | 'encomenda' | 'delivery';

const NOMES_TIPO: Record<TipoManual, string> = {
  retirada: 'Retirada',
  balcao: 'Balcão',
  mesa: 'Mesa',
  encomenda: 'Encomenda',
  delivery: 'Delivery',
};

const ENDERECO_VAZIO: EnderecoDelivery = {
  cep: '', rua: '', numero: '', bairro: '', cidade: '', uf: '', complemento: null,
};

// Presencial (balcão/mesa) não exige telefone — cliente está ali na frente.
// Retirada/encomenda são pedidos à distância, onde o contato
// continua fazendo sentido pra loja conseguir avisar o cliente.
const TIPOS_PRESENCIAIS: TipoManual[] = ['balcao', 'mesa'];

const ROTULOS_FORMA_PAGAMENTO: Record<FormaPagamentoOffline, string> = {
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  pix_manual: 'Pix no WhatsApp',
  pagamento_retirada: 'Pagar no estabelecimento',
};

/**
 * Caixinha de forma de pagamento — mesma silhueta do `<select>` de tipo do
 * pedido, mas aberta por conta própria: `<option>` nativo não desenha ícone,
 * e o operador reconhece a forma pelo desenho antes de ler o texto.
 */
function SeletorFormaPagamento({
  formas,
  valor,
  onEscolher,
}: {
  formas: FormaPagamentoOffline[];
  valor: FormaPagamentoOffline | '';
  onEscolher: (forma: FormaPagamentoOffline) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora ou apertar Escape — sem isso a lista ficava aberta
  // por cima do carrinho enquanto o operador mexia em outro campo.
  useEffect(() => {
    if (!aberto) return;
    function aoApontar(evento: PointerEvent) {
      if (!caixa.current?.contains(evento.target as Node)) setAberto(false);
    }
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setAberto(false);
    }
    document.addEventListener('pointerdown', aoApontar);
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('pointerdown', aoApontar);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto]);

  return (
    <div className={styles.seletorPagamento} ref={caixa}>
      <button
        type="button"
        className={styles.seletorGatilho}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
        {valor ? (
          <>
            <span className={styles.formaIcone}><IconeFormaPagamento forma={valor} /></span>
            <strong>{ROTULOS_FORMA_PAGAMENTO[valor]}</strong>
          </>
        ) : (
          <strong className={styles.seletorVazio}>Escolha a forma de pagamento</strong>
        )}
        <span className={styles.seletorSeta} aria-hidden="true">⌄</span>
      </button>

      {aberto && (
        <div className={styles.seletorLista} role="listbox" aria-label="Forma de pagamento">
          {formas.map((forma) => (
            <button
              key={forma}
              type="button"
              role="option"
              aria-selected={valor === forma}
              className={valor === forma ? styles.seletorOpcaoAtiva : styles.seletorOpcao}
              onClick={() => {
                onEscolher(forma);
                setAberto(false);
              }}
            >
              <span className={styles.formaIcone}><IconeFormaPagamento forma={forma} /></span>
              <strong>{ROTULOS_FORMA_PAGAMENTO[forma]}</strong>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function IconeCaixaVazia() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8l9-5 9 5-9 5-9-5z" />
      <path d="M3 8v9l9 5 9-5V8" />
      <path d="M12 13v9" />
    </svg>
  );
}

export function NovoPedidoPainel({
  lojaSlug,
  categorias,
  produtos,
  onFechar,
  onCriado,
  onErro,
}: {
  lojaSlug: string;
  categorias: CategoriaPublica[];
  produtos: ProdutoPublico[];
  onFechar: () => void;
  onCriado: (numeroPedido: number) => Promise<void> | void;
  onErro: (msg: string) => void;
}) {
  useEscFechar(onFechar);

  const [categoriaId, setCategoriaId] = useState('todos');
  const [busca, setBusca] = useState('');
  const [produtoAberto, setProdutoAberto] = useState<ProdutoPublico | null>(null);
  const [linhas, setLinhas] = useState<LinhaCarrinho[]>([]);

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [tipo, setTipo] = useState<TipoManual>('balcao');
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamentoOffline | ''>('');
  const [dataHora, setDataHora] = useState('');
  const [observacao, setObservacao] = useState('');
  const [obsAberta, setObsAberta] = useState(false);
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Delivery: mesma mecânica do checkout público — o endereço vira uma
  // cotação no banco, e é ela que carrega a taxa. O formulário nunca decide
  // preço de entrega.
  const [endereco, setEndereco] = useState<EnderecoDelivery>(ENDERECO_VAZIO);
  const [cotacao, setCotacao] = useState<(CotacaoDeliveryPublica & { carrinho: string }) | null>(null);
  const [calculandoTaxa, setCalculandoTaxa] = useState(false);
  const [erroTaxa, setErroTaxa] = useState<string | null>(null);
  const [buscandoCep, setBuscandoCep] = useState(false);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return produtos.filter((p) => {
      if (categoriaId !== 'todos' && p.categoria_id !== categoriaId) return false;
      if (!produtoApareceNoTipo(p.tipos_pedido, tipo)) return false;
      if (termo && !`${p.nome} ${p.descricao || ''}`.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [produtos, busca, categoriaId, tipo]);

  const contagemPorCategoria = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const p of produtos) {
      if (!produtoApareceNoTipo(p.tipos_pedido, tipo)) continue;
      const chave = p.categoria_id ?? '__sem_categoria__';
      mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
    }
    return mapa;
  }, [produtos, tipo]);

  function idDaLinha(produtoId: string, escolhas: EscolhaComplemento[], obs: string) {
    const chave = escolhas.map((c) => `${c.complementoId}x${c.quantidade}`).sort().join(',');
    return `${produtoId}::${chave}::${obs}`;
  }

  function adicionarLinha(p: ProdutoPublico, escolhas: EscolhaComplemento[], obs: string, qtd: number) {
    if (!p.ativo || !produtoApareceNoTipo(p.tipos_pedido, tipo)) return;
    const lineId = idDaLinha(p.id, escolhas, obs);
    setLinhas((atual) => {
      const existente = atual.find((l) => l.lineId === lineId);
      if (existente) {
        return atual.map((l) => (l.lineId === lineId ? { ...l, qty: l.qty + qtd } : l));
      }
      return [
        ...atual,
        { lineId, produtoId: p.id, nome: p.nome, precoUnit: precoBase(p), complementos: escolhas, observacao: obs, qty: qtd },
      ];
    });
  }

  function aoClicarProduto(p: ProdutoPublico) {
    if (!p.ativo || !produtoApareceNoTipo(p.tipos_pedido, tipo)) return;
    if (p.grupos.some((g) => apareceNoTipo(g.tipos_pedido, tipo))) {
      setProdutoAberto(p);
      return;
    }
    adicionarLinha(p, [], '', 1);
  }

  async function buscarCep(valor: string) {
    const digitos = valor.replace(/\D/g, '');
    setEndereco((atual) => ({ ...atual, cep: valor }));
    if (digitos.length !== 8) return;
    setBuscandoCep(true);
    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${digitos}/json/`);
      const dados = await resposta.json();
      if (!dados?.erro || dados.erro === 'false') {
        setEndereco((atual) => aplicarRespostaViaCep({ ...atual, cep: valor }, dados));
      }
    } catch {
      // CEP é conveniência: sem ele o atendente digita o endereço na mão.
    } finally {
      setBuscandoCep(false);
    }
  }

  /** Mesma rota que o cardápio público usa (`/api/delivery/quote`): quem
   * calcula distância e taxa é o servidor, a partir do CEP. */
  async function calcularTaxa() {
    if (calculandoTaxa) return;
    let validado: EnderecoDelivery;
    try {
      validado = validarEnderecoDelivery(endereco);
    } catch {
      setErroTaxa('Preencha CEP, rua, número, bairro, cidade e UF.');
      return;
    }
    if (linhas.length === 0) {
      setErroTaxa('Adicione os itens antes de calcular a entrega — a taxa depende do pedido.');
      return;
    }

    const carrinhoPedido = assinaturaCarrinho;
    setCalculandoTaxa(true);
    setErroTaxa(null);
    try {
      const resposta = await fetch('/api/delivery/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lojaSlug,
          endereco: validado,
          itens: linhas.map((l) => ({
            produtoId: l.produtoId,
            quantidade: l.qty,
            observacao: l.observacao || undefined,
            complementos: l.complementos.map((c) => ({ complementoId: c.complementoId, quantidade: c.quantidade })),
          })),
        }),
      });
      const dados = await resposta.json().catch(() => null) as (CotacaoDeliveryPublica & { erro?: string }) | null;
      if (!resposta.ok || !dados?.quoteId || !Number.isInteger(dados.deliveryFeeCents)) {
        setErroTaxa(dados?.erro || 'Não foi possível calcular a taxa de entrega.');
        return;
      }
      setEndereco(dados.address);
      setCotacao({ ...dados, carrinho: carrinhoPedido });
    } catch {
      setErroTaxa('Não foi possível calcular a taxa de entrega.');
    } finally {
      setCalculandoTaxa(false);
    }
  }

  function mudarQtd(lineId: string, delta: number) {
    setLinhas((atual) =>
      atual.map((l) => (l.lineId === lineId ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0)
    );
  }

  function removerLinha(lineId: string) {
    setLinhas((atual) => atual.filter((l) => l.lineId !== lineId));
  }

  const subtotal = linhas.reduce((s, l) => s + subtotalLinha(l), 0);
  const totalItens = linhas.reduce((s, l) => s + l.qty, 0);

  // A cotação vale pro carrinho que a gerou: a RPC recusa se o subtotal mudou.
  // Derivar do carrinho (em vez de um contador incrementado à mão) garante que
  // nenhuma alteração passe batida.
  const assinaturaCarrinho = linhas.map((l) => `${l.lineId}x${l.qty}`).join('|');
  const cotacaoValida = cotacao?.carrinho === assinaturaCarrinho ? cotacao : null;
  const taxaEntrega = tipo === 'delivery' && cotacaoValida ? cotacaoValida.deliveryFeeCents / 100 : 0;
  const totalComTaxa = subtotal + taxaEntrega;
  const entregaPronta = tipo !== 'delivery' || !!cotacaoValida;

  async function salvar() {
    setErroLocal(null);
    if (!nome.trim()) {
      setErroLocal('Informe o nome do cliente.');
      return;
    }
    if (!TIPOS_PRESENCIAIS.includes(tipo) && !telefone.trim()) {
      setErroLocal('Informe o telefone do cliente.');
      return;
    }
    if (linhas.length === 0) {
      setErroLocal('Adicione pelo menos um item.');
      return;
    }
    if (!formaPagamento) {
      setErroLocal('Escolha a forma de pagamento.');
      return;
    }
    if (tipo === 'encomenda' && !dataHora) {
      setErroLocal('Informe a data e hora combinada da encomenda.');
      return;
    }
    if (tipo === 'delivery' && !cotacaoValida) {
      setErroLocal('Calcule a taxa de entrega antes de criar o pedido.');
      return;
    }

    const itens: ItemPedidoManual[] = linhas.map((l) => ({
      produto_id: l.produtoId,
      quantidade: l.qty,
      observacao: l.observacao || undefined,
      opcoes: l.complementos.map((c) => ({ complemento_id: c.complementoId, quantidade: c.quantidade })),
    }));

    setSalvando(true);
    try {
      const sb = criarClientNavegador();
      const resultado = await criarPedidoManual(sb, {
        lojaSlug,
        clienteNome: nome,
        clienteTelefone: telefone,
        tipo,
        observacao: observacao || undefined,
        formaPagamento,
        itens,
        dataHoraAgendada: tipo === 'encomenda' && dataHora ? new Date(dataHora).toISOString() : undefined,
        origem: 'telefone',
        statusInicial: 'confirmado',
        // A taxa e o endereço vêm da cotação no banco; daqui vai só o id.
        quoteId: tipo === 'delivery' ? cotacaoValida?.quoteId : undefined,
      });
      await onCriado(resultado.numero);
      onFechar();
    } catch (err) {
      const msg = 'Não foi possível criar o pedido: ' + (err as Error).message;
      setErroLocal(msg);
      onErro(msg);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className={styles.overlay} role="presentation">
      <div className={styles.janela} role="dialog" aria-modal="true" aria-labelledby="novoPedidoTitulo">
        <div className={styles.topo}>
          <h2 id="novoPedidoTitulo">Novo pedido</h2>
          <button type="button" aria-label="Fechar" onClick={onFechar}>
            ✕
          </button>
        </div>

        <div className={styles.corpo}>
          <nav className={styles.colCategorias} aria-label="Categorias">
            <h3>Categorias</h3>
            <button
              type="button"
              className={categoriaId === 'todos' ? styles.categoriaAtiva : styles.categoria}
              onClick={() => setCategoriaId('todos')}
            >
              <span>Todos os itens</span>
              <span>{produtos.filter((p) => produtoApareceNoTipo(p.tipos_pedido, tipo)).length}</span>
            </button>
            {categorias.map((c) => (
              <button
                type="button"
                key={c.id}
                className={categoriaId === c.id ? styles.categoriaAtiva : styles.categoria}
                onClick={() => setCategoriaId(c.id)}
              >
                <span>
                  {c.emoji ? c.emoji + ' ' : ''}
                  {c.nome}
                </span>
                <span>{contagemPorCategoria.get(c.id) ?? 0}</span>
              </button>
            ))}
          </nav>

          <section className={styles.colProdutos} aria-label="Produtos">
            <div className={styles.buscaProdutos}>
              <IconeBusca />
              <input
                type="text"
                placeholder="Encontre produtos por nome ou descrição"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>

            {filtrados.length === 0 ? (
              <p className={styles.produtosVazio}>Nenhum produto encontrado para {NOMES_TIPO[tipo].toLowerCase()}.</p>
            ) : (
              <div className={styles.grade}>
                {filtrados.map((p) => {
                  const minimo = precoMinimo(p);
                  const base = precoBase(p);
                  return (
                    <button
                      type="button"
                      key={p.id}
                      className={`${styles.cardProduto} ${!p.ativo ? styles.cardProdutoEsgotado : ''}`}
                      disabled={!p.ativo}
                      onClick={() => aoClicarProduto(p)}
                    >
                      <span className={styles.cardFoto}>
                        {p.imagem_url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- foto do catálogo, vinda do Storage
                          <img src={p.imagem_url} alt={p.nome} loading="lazy" />
                        ) : (
                          <span aria-hidden="true">🖼️</span>
                        )}
                      </span>
                      <span className={styles.cardInfo}>
                        <strong>{p.nome}</strong>
                        {!p.ativo && <small className={styles.etiquetaEsgotado}>Esgotado</small>}
                        <span>
                          {minimo > base && 'A partir de '}
                          {formatBRL(minimo > base ? minimo : base)}
                        </span>
                      </span>
                      {/* Marcador de "adicionar". Não é <button>: o card
                          inteiro já é o botão, e botão dentro de botão é HTML
                          inválido — o + existe pra deixar a ação óbvia. */}
                      {p.ativo && <span className={styles.cardAdicionar} aria-hidden="true">+</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <aside className={styles.colCarrinho} aria-label="Novo pedido">
            <div className={styles.clienteCampo}>
              <label htmlFor="npNome">Nome do cliente</label>
              <input id="npNome" type="text" placeholder="Como se chama o cliente?" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className={styles.clienteCampo}>
              <label htmlFor="npTelefone">
                Telefone{TIPOS_PRESENCIAIS.includes(tipo) ? ' (opcional)' : ''}
              </label>
              <input
                id="npTelefone"
                type="tel"
                maxLength={16}
                placeholder="(11) 91234-5678"
                value={telefone}
                onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
              />
            </div>

            <div className={styles.clienteCampo}>
              <label htmlFor="npTipo">Tipo do pedido</label>
              <select
                id="npTipo"
                value={tipo}
                onChange={(e) => {
                  const novoTipo = e.target.value as TipoManual;
                  setTipo(novoTipo);
                  setCategoriaId('todos');
                  setLinhas((atuais) => {
                    const permitidos = new Set(
                      produtos
                        .filter((produto) => produto.ativo && produtoApareceNoTipo(produto.tipos_pedido, novoTipo))
                        .map((produto) => produto.id)
                    );
                    return atuais.filter((linha) => permitidos.has(linha.produtoId));
                  });
                  // Delivery não aceita "pagar na retirada", e o resto do
                  // formulário muda de forma: zera a cotação junto.
                  const canal = novoTipo === 'delivery' ? 'delivery' : 'retirada';
                  setFormaPagamento((atual) => formaPagamentoPermitida(canal, atual) ? atual : '');
                  setCotacao(null);
                  setErroTaxa(null);
                }}
              >
                <option value="balcao">Balcão</option>
                <option value="mesa">Mesa</option>
                <option value="retirada">Retirada</option>
                <option value="delivery">Delivery</option>
                <option value="encomenda">Encomenda</option>
              </select>
            </div>

            {tipo === 'encomenda' && (
              <div className={styles.clienteCampo}>
                <label htmlFor="npDataHora">Data e hora combinada</label>
                <input id="npDataHora" type="datetime-local" value={dataHora} onChange={(e) => setDataHora(e.target.value)} />
              </div>
            )}

            {tipo === 'delivery' && (
              <div className={styles.blocoEntrega}>
                <label htmlFor="npCep">Endereço de entrega</label>
                <div className={styles.linhaEndereco}>
                  <input
                    id="npCep"
                    inputMode="numeric"
                    maxLength={9}
                    placeholder="CEP"
                    value={formatarCep(endereco.cep)}
                    onChange={(e) => buscarCep(e.target.value)}
                  />
                  <input
                    placeholder="Número"
                    value={endereco.numero}
                    onChange={(e) => setEndereco((a) => ({ ...a, numero: e.target.value }))}
                  />
                </div>
                {buscandoCep && <p className={styles.dicaEntrega}>Buscando o CEP…</p>}
                <input
                  placeholder="Rua"
                  value={endereco.rua}
                  onChange={(e) => setEndereco((a) => ({ ...a, rua: e.target.value }))}
                />
                <input
                  placeholder="Bairro"
                  value={endereco.bairro}
                  onChange={(e) => setEndereco((a) => ({ ...a, bairro: e.target.value }))}
                />
                <div className={styles.linhaEndereco}>
                  <input
                    placeholder="Cidade"
                    value={endereco.cidade}
                    onChange={(e) => setEndereco((a) => ({ ...a, cidade: e.target.value }))}
                  />
                  <input
                    placeholder="UF"
                    maxLength={2}
                    value={endereco.uf}
                    onChange={(e) => setEndereco((a) => ({ ...a, uf: e.target.value.toUpperCase() }))}
                  />
                </div>
                <input
                  placeholder="Complemento (opcional)"
                  value={endereco.complemento || ''}
                  onChange={(e) => setEndereco((a) => ({ ...a, complemento: e.target.value || null }))}
                />

                <button type="button" className={styles.calcularTaxa} disabled={calculandoTaxa} onClick={calcularTaxa}>
                  {calculandoTaxa ? 'Calculando…' : cotacaoValida ? 'Recalcular taxa' : 'Calcular taxa de entrega'}
                </button>
                {erroTaxa && <p className={styles.erro}>{erroTaxa}</p>}
                {cotacaoValida ? (
                  <p className={styles.taxaOk}>
                    Taxa de entrega: <strong>{formatBRL(cotacaoValida.deliveryFeeCents / 100)}</strong>
                  </p>
                ) : (
                  <p className={styles.dicaEntrega}>
                    A taxa depende do endereço e dos itens. Mudou o carrinho, recalcule.
                  </p>
                )}
              </div>
            )}

            <div className={styles.clienteCampo}>
              <label>Forma de pagamento</label>
              <SeletorFormaPagamento
                formas={formasPagamentoPara(tipo === 'delivery' ? 'delivery' : 'retirada')}
                valor={formaPagamento}
                onEscolher={setFormaPagamento}
              />
              {formaPagamento && <p className={styles.formaInstrucao}>{instrucaoPagamento(formaPagamento)}</p>}
            </div>

            <button type="button" className={styles.obsToggle} onClick={() => setObsAberta((v) => !v)}>
              <span>Observação do pedido</span>
              <span>{obsAberta ? '▲' : '▼'}</span>
            </button>
            {obsAberta && (
              <textarea
                className={styles.obsTexto}
                placeholder="Ex: troco para R$ 50, sem propaganda..."
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
              />
            )}

            <h3 className={styles.carrinhoTitulo}>Carrinho</h3>
            <div className={styles.carrinhoLista}>
              {linhas.length === 0 ? (
                <div className={styles.carrinhoVazio}>
                  <IconeCaixaVazia />
                  <span>Carrinho vazio</span>
                </div>
              ) : (
                linhas.map((l) => {
                  const precoUnit = l.precoUnit + extraDaLinha(l);
                  return (
                    <div key={l.lineId} className={styles.itemCarrinho}>
                      <div className={styles.itemCarrinhoInfo}>
                        <strong>{l.nome}</strong>
                        {l.complementos.length > 0 && (
                          <small>
                            {l.complementos.map((c) => (c.quantidade > 1 ? `${c.quantidade}x ${c.nome}` : c.nome)).join(', ')}
                          </small>
                        )}
                        <span>{formatBRL(precoUnit)} un.</span>
                      </div>
                      <div className={styles.itemCarrinhoQtd}>
                        <button type="button" aria-label="Diminuir" onClick={() => mudarQtd(l.lineId, -1)}>
                          −
                        </button>
                        <b>{l.qty}</b>
                        <button type="button" aria-label="Aumentar" onClick={() => mudarQtd(l.lineId, 1)}>
                          +
                        </button>
                      </div>
                      <button type="button" className={styles.itemCarrinhoRemover} onClick={() => removerLinha(l.lineId)} aria-label={`Remover ${l.nome}`}>
                        ✕
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {erroLocal && <p className={styles.erro}>{erroLocal}</p>}

            <div className={styles.rodapeCarrinho}>
              <div className={styles.rodapeTotalLinha}>
                <span>{totalItens} {totalItens === 1 ? 'item' : 'itens'}</span>
                <strong>{formatBRL(subtotal)}</strong>
              </div>
              {tipo === 'delivery' && (
                <div className={styles.rodapeTotalLinha}>
                  <span>Taxa de entrega</span>
                  <strong>{cotacaoValida ? formatBRL(taxaEntrega) : '—'}</strong>
                </div>
              )}
              <button
                type="button"
                className={styles.criarPedido}
                disabled={salvando || linhas.length === 0 || !formaPagamento || !entregaPronta}
                onClick={salvar}
              >
                {salvando && <span className="btn-spinner" aria-hidden="true" />}
                {salvando ? 'Criando pedido…' : `Criar pedido · ${formatBRL(totalComTaxa)}`}
              </button>
            </div>
          </aside>
        </div>
      </div>

      {produtoAberto && (
        <ModalDetalhesProdutoPedido
          produto={produtoAberto}
          tipoPedido={tipo}
          onFechar={() => setProdutoAberto(null)}
          onAdicionar={(escolhas, obs, qtd) => {
            adicionarLinha(produtoAberto, escolhas, obs, qtd);
            setProdutoAberto(null);
          }}
        />
      )}
    </div>
  );
}
