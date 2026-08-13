'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { formatarTelefone, formatBRL, precoBase, subtotalLinha, type LinhaCarrinho, type ProdutoPublico } from '@/lib/cardapio/tipos';
import { useEscFechar } from '@/hooks/useEscFechar';
import {
  formasPagamentoPara,
  instrucaoPagamento,
  nomeFormaPagamento,
  type FormaPagamentoOffline,
} from '@/lib/pedidos/pagamento';
import { aplicarRespostaViaCep, formatarCep, validarEnderecoDelivery } from '@/lib/delivery/endereco';
import { numeroPedido } from '@/lib/pedidos/numero';
import type {
  CotacaoDeliveryPublica,
  EnderecoDelivery,
  ModalidadePedido,
} from '@/lib/delivery/tipos';

export type PedidoRegistrado = {
  pedido: {
    numero: number; token: string; status: string; pagamento_status: string; forma_pagamento: string;
    subtotal: number; total: number; tracking_url: string; tipo: ModalidadePedido;
  };
  proximaAcao: { tipo: string; url: string } | null;
};

export type SugestaoComplementoCarrinho = {
  lineId: string;
  produtoNome: string;
  grupoId: string;
  complementoId: string;
  nome: string;
  preco: number;
  imagemUrl: string | null;
};

const ROTULOS_FORMA_PAGAMENTO: Record<FormaPagamentoOffline, string> = {
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  pix_manual: 'Pix no WhatsApp',
  pagamento_retirada: 'Pagar no estabelecimento',
};

const ENDERECO_VAZIO: EnderecoDelivery = {
  cep: '', rua: '', numero: '', bairro: '', cidade: '', uf: '', complemento: null,
};

type CotacaoCheckout = CotacaoDeliveryPublica & { versaoCarrinho: number };

function instrucaoPagamentoCheckout(forma: string, modalidade: ModalidadePedido) {
  return instrucaoPagamento(forma, modalidade);
}

function IconeFormaPagamento({ forma }: { forma: FormaPagamentoOffline }) {
  if (forma === 'dinheiro') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="2.5" y="5" width="19" height="14" rx="2" />
        <circle cx="12" cy="12" r="3" />
        <path d="M6 8.5h.01M18 15.5h.01" />
      </svg>
    );
  }
  if (forma === 'pix_manual') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m8.2 5.2 2.1-2.1a2.4 2.4 0 0 1 3.4 0l2.1 2.1M18.8 8.2l2.1 2.1a2.4 2.4 0 0 1 0 3.4l-2.1 2.1M15.8 18.8l-2.1 2.1a2.4 2.4 0 0 1-3.4 0l-2.1-2.1M5.2 15.8l-2.1-2.1a2.4 2.4 0 0 1 0-3.4l2.1-2.1" />
        <path d="m7.5 12 2.7 2.7a2.6 2.6 0 0 0 3.6 0l2.7-2.7-2.7-2.7a2.6 2.6 0 0 0-3.6 0L7.5 12Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.5" y="4.5" width="19" height="15" rx="2" />
      <path d="M3 9h18M6 15h5" />
    </svg>
  );
}

type Etapa = 'carrinho' | 'dados';

/**
 * 'fechado' não renderiza nada; os outros três controlam a classe CSS que
 * anima entrada/saída (cardapio.css, bloco "Entrada/saída do checkout").
 * Existir 'saindo' é o que permite a saída animar antes de desmontar —
 * sem isso, `if (!aberto) return null` some o modal na hora, sem dar
 * tempo da transição CSS rodar (mesmo padrão "state-driven transition"
 * do motion-cookbook.md §11 do skill design-motion-principles).
 */
type EstadoModal = 'fechado' | 'entrando' | 'aberto' | 'saindo';

/**
 * Um modal só, com o carrinho como primeira etapa — antes disso o carrinho
 * (lista de itens) e o checkout (retirada/dados) eram duas sobreposições
 * independentes, cada uma com seu próprio backdrop. Empilhadas, a de trás
 * "vazava" atrás da da frente (o cabeçalho "Seu carrinho" aparecia por
 * cima do checkout num vão que o backdrop translúcido não cobria de
 * verdade) e ainda competiam por z-index. Uma só superfície resolve os
 * dois problemas de uma vez.
 */
export function CheckoutModal({
  aberto, linhas, nome, telefone, formaPagamento, erro, enviando, pedidoRegistrado,
  onFechar, onMudarQtd, onRemover,
  sugestoes, sugestoesComplementos, onAdicionarSugestao, onAdicionarComplemento,
  lojaAberta, retiradaAtiva, deliveryAtiva, lojaSlug, modalidade, versaoCarrinho,
  lojaNome, lojaLogoUrl, pedidoMinimo, tempoPreparoMin, tempoPreparoMax, imagensPorProduto,
  onNome, onTelefone, onFormaPagamento, onModalidade, onFinalizar, onNovoPedido,
}: {
  aberto: boolean; linhas: LinhaCarrinho[]; nome: string; telefone: string;
  formaPagamento: FormaPagamentoOffline | ''; erro: string | null; enviando: boolean;
  pedidoRegistrado: PedidoRegistrado | null;
  lojaAberta: boolean; retiradaAtiva: boolean; deliveryAtiva: boolean;
  lojaSlug: string; modalidade: ModalidadePedido; versaoCarrinho: number;
  lojaNome: string; lojaLogoUrl: string | null; pedidoMinimo: number;
  tempoPreparoMin: number | null; tempoPreparoMax: number | null;
  /** A linha do carrinho guarda só o id do produto — a miniatura vem daqui.
   *  Carrinho salvo antes desta tela existir continua funcionando: produto
   *  sem entrada no mapa simplesmente não mostra imagem. */
  imagensPorProduto: Record<string, string | null>;
  onFechar: () => void;
  sugestoes: { titulo: string; produtos: ProdutoPublico[] }[];
  sugestoesComplementos: SugestaoComplementoCarrinho[];
  onAdicionarSugestao: (produto: ProdutoPublico) => void;
  onAdicionarComplemento: (sugestao: SugestaoComplementoCarrinho) => void;
  onMudarQtd: (lineId: string, delta: number) => void; onRemover: (lineId: string) => void;
  onNome: (v: string) => void; onTelefone: (v: string) => void;
  onFormaPagamento: (forma: FormaPagamentoOffline | '') => void;
  onModalidade: (modalidade: ModalidadePedido) => void;
  onFinalizar: (cotacao: CotacaoDeliveryPublica | null) => void; onNovoPedido: () => void;
}) {
  const [etapa, setEtapa] = useState<Etapa>('carrinho');
  const [endereco, setEndereco] = useState<EnderecoDelivery>(ENDERECO_VAZIO);
  const [cotacao, setCotacao] = useState<CotacaoCheckout | null>(null);
  const [enderecoConfirmado, setEnderecoConfirmado] = useState(false);
  const [consultandoCep, setConsultandoCep] = useState(false);
  const [calculandoEntrega, setCalculandoEntrega] = useState(false);
  const [erroCep, setErroCep] = useState<string | null>(null);
  const [erroEntrega, setErroEntrega] = useState<string | null>(null);
  const ultimoCepConsultado = useRef('');
  const versaoEndereco = useRef(0);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const sheetRef = useRef<HTMLElement>(null);

  // Reabrir sempre começa pelo carrinho — evita reabrir já nos dados com
  // o cliente sem ter revisado os itens. Padrão documentado do React pra
  // "resetar estado quando uma prop muda": compara com uma cópia da prop
  // guardada em estado (não em ref — ref não pode ser lido durante o
  // render), e ajusta antes de terminar de renderizar. Nada disso entra
  // num useEffect: setState direto no corpo de um efeito dispara uma
  // renderização em cascata desnecessária.
  const [estado, setEstado] = useState<EstadoModal>(aberto ? 'entrando' : 'fechado');
  if (aberto && (estado === 'fechado' || estado === 'saindo')) {
    setEstado('entrando');
    setEtapa('carrinho');
  }
  if (!aberto && (estado === 'entrando' || estado === 'aberto')) {
    setEstado('saindo');
  }

  // 'entrando' → 'aberto' um frame depois de montar, pra o navegador pintar
  // o estado inicial (opacity 0) antes da classe que dispara a transição —
  // sem o frame de intervalo, CSS não anima (troca de estado "no mesmo
  // instante" não conta como transição). 'saindo' → 'fechado' (desmonta de
  // verdade) só depois da duração da transição — instantâneo se
  // prefers-reduced-motion estiver ativo, porque aí a saída não é visível
  // mesmo, e não faz sentido segurar o desmonte.
  useEffect(() => {
    if (estado === 'entrando') {
      const raf = requestAnimationFrame(() => setEstado('aberto'));
      return () => cancelAnimationFrame(raf);
    }
    if (estado === 'saindo') {
      const semAnimacao = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const t = setTimeout(() => setEstado('fechado'), semAnimacao ? 0 : 220);
      return () => clearTimeout(t);
    }
  }, [estado]);
  const subtotal = linhas.reduce((s, linha) => s + subtotalLinha(linha), 0);
  const cotacaoAtual = cotacao?.versaoCarrinho === versaoCarrinho ? cotacao : null;
  const enderecoEstaConfirmado = enderecoConfirmado && !!cotacaoAtual;
  const taxaEntrega = modalidade === 'delivery' && cotacaoAtual
    ? cotacaoAtual.deliveryFeeCents / 100
    : 0;
  const total = subtotal + taxaEntrega;

  useEffect(() => {
    const cep = endereco.cep.replace(/\D/g, '');
    if (modalidade !== 'delivery') return;
    if (cep.length !== 8) {
      ultimoCepConsultado.current = '';
      return;
    }
    if (ultimoCepConsultado.current === cep) return;
    ultimoCepConsultado.current = cep;

    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), 5_000);
    let ativo = true;
    setConsultandoCep(true);
    setErroCep(null);

    void fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      signal: controlador.signal,
      headers: { Accept: 'application/json' },
    })
      .then(async (resposta) => {
        if (!resposta.ok) throw new Error('VIACEP_INDISPONIVEL');
        return await resposta.json() as {
          erro?: boolean;
          logradouro?: string;
          bairro?: string;
          localidade?: string;
          uf?: string;
        };
      })
      .then((dados) => {
        if (!ativo) return;
        if (dados.erro) {
          setErroCep('Não encontramos o CEP. Preencha o endereço manualmente.');
          return;
        }
        versaoEndereco.current += 1;
        setEndereco((atual) => aplicarRespostaViaCep(atual, dados));
        setCotacao(null);
        setEnderecoConfirmado(false);
      })
      .catch(() => {
        if (ativo) setErroCep('Não encontramos o CEP. Preencha o endereço manualmente.');
      })
      .finally(() => {
        clearTimeout(temporizador);
        if (ativo) setConsultandoCep(false);
      });

    return () => {
      ativo = false;
      clearTimeout(temporizador);
      controlador.abort();
    };
  }, [endereco.cep, modalidade]);

  function alterarEndereco(campo: keyof EnderecoDelivery, valor: string) {
    let normalizado: string | null = valor;
    if (campo === 'cep') normalizado = formatarCep(valor);
    if (campo === 'uf') normalizado = valor.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 2);
    if (campo === 'complemento') normalizado = valor || null;
    versaoEndereco.current += 1;
    setEndereco((atual) => ({ ...atual, [campo]: normalizado }));
    setCotacao(null);
    setEnderecoConfirmado(false);
    setErroEntrega(null);
    if (campo === 'cep') setConsultandoCep(false);
  }

  function editarEndereco() {
    versaoEndereco.current += 1;
    setCotacao(null);
    setEnderecoConfirmado(false);
    setErroEntrega(null);
  }

  function enderecoPronto() {
    try {
      validarEnderecoDelivery(endereco);
      return true;
    } catch {
      return false;
    }
  }

  async function calcularEntrega() {
    if (calculandoEntrega || modalidade !== 'delivery') return;
    let enderecoValidado: EnderecoDelivery;
    try {
      enderecoValidado = validarEnderecoDelivery(endereco);
    } catch {
      setErroEntrega('Preencha CEP, rua, número, bairro, cidade e UF.');
      return;
    }

    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), 16_000);
    const versaoSolicitada = versaoEndereco.current;
    setCalculandoEntrega(true);
    setErroEntrega(null);
    setEnderecoConfirmado(false);
    try {
      const resposta = await fetch('/api/delivery/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controlador.signal,
        body: JSON.stringify({
          lojaSlug,
          endereco: enderecoValidado,
          itens: linhas.map((linha) => ({
            produtoId: linha.produtoId,
            quantidade: linha.qty,
            observacao: linha.observacao || undefined,
            complementos: linha.complementos.map((complemento) => ({
              complementoId: complemento.complementoId,
              quantidade: complemento.quantidade,
            })),
          })),
        }),
      });
      const dados = await resposta.json().catch(() => null) as (CotacaoDeliveryPublica & { erro?: string }) | null;
      if (versaoEndereco.current !== versaoSolicitada) return;
      if (!resposta.ok || !dados?.quoteId || !dados.address || !Number.isInteger(dados.deliveryFeeCents)) {
        setErroEntrega(dados?.erro || 'Não foi possível calcular a taxa de entrega. Tente novamente.');
        return;
      }
      setEndereco(dados.address);
      setCotacao({ ...dados, versaoCarrinho });
    } catch {
      if (versaoEndereco.current === versaoSolicitada) {
        setErroEntrega('Não foi possível calcular a taxa de entrega. Tente novamente.');
      }
    } finally {
      clearTimeout(temporizador);
      setCalculandoEntrega(false);
    }
  }

  function selecionarModalidade(novaModalidade: ModalidadePedido) {
    versaoEndereco.current += 1;
    setCotacao(null);
    setEnderecoConfirmado(false);
    setConsultandoCep(false);
    if (novaModalidade === 'delivery' && formaPagamento === 'pagamento_retirada') {
      onFormaPagamento('');
    }
    onModalidade(novaModalidade);
  }

  useEscFechar(() => { if (!enviando) onFechar(); });

  // Só quando o modal ABRE (não a cada tecla): trava o scroll de fundo e
  // manda o foco pro título. O bug original era ter `onFechar` (uma arrow
  // function nova a cada render do componente pai) na lista de
  // dependências — o efeito refazia a cada letra digitada em QUALQUER
  // campo, e `tituloRef.current?.focus()` arrancava o foco de volta pro
  // <h2>, fechando o teclado do celular no meio da digitação.
  useEffect(() => {
    if (estado === 'fechado') return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    tituloRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir/fechar, não a cada troca 'entrando'->'aberto'
  }, [estado === 'fechado']);

  // Tab preso dentro do modal e Esc pra fechar — como efeito à parte, lendo
  // `enviando`/`onFechar` sempre atuais via closure de módulo (não entra na
  // lista de deps do efeito de foco acima).
  useEffect(() => {
    if (estado === 'fechado') return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focaveis = sheetRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled)');
      if (!focaveis?.length) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [estado]);

  if (estado === 'fechado') return null;

  const titulo = pedidoRegistrado
    ? 'Pedido recebido'
    : etapa === 'carrinho'
      ? 'Seu carrinho'
      : 'Finalizar pedido';

  // Os grupos de sugestão viram uma lista só: o desenho mostra uma faixa
  // contínua de cartões, não uma seção por categoria.
  const produtosSugeridos = sugestoes.flatMap((grupo) => grupo.produtos);

  // "30–50 min" só quando a loja cadastrou os dois tempos; com um só, mostra
  // o que existe. Sem nenhum, o chip inteiro some em vez de exibir vazio.
  const tempoEstimado = tempoPreparoMin && tempoPreparoMax
    ? `${tempoPreparoMin}–${tempoPreparoMax} min`
    : tempoPreparoMin
      ? `a partir de ${tempoPreparoMin} min`
      : tempoPreparoMax
        ? `até ${tempoPreparoMax} min`
        : null;

  return (
    <div
      className={'checkout-modal' + (estado === 'aberto' ? ' aberto' : '') + (estado === 'saindo' ? ' saindo' : '')}
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-titulo"
    >
      <button type="button" className="checkout-backdrop" aria-label="Fechar" onClick={enviando ? undefined : onFechar} />
      <section className="checkout-sheet" ref={sheetRef}>
        <header className="checkout-header">
          <div className="checkout-loja">
            {lojaLogoUrl
              ? <Image className="checkout-loja-logo" src={lojaLogoUrl} alt="" width={34} height={34} />
              : <span className="checkout-loja-logo checkout-loja-logo-vazio" aria-hidden="true" />}
            {/* Nome em duas linhas: a primeira palavra em destaque e o resto
                abaixo. Nome de uma palavra só ocupa uma linha e nada quebra. */}
            <span className="checkout-loja-nome" title={lojaNome}>
              <strong>{lojaNome.split(' ')[0]}</strong>
              {lojaNome.split(' ').slice(1).join(' ') && (
                <small>{lojaNome.split(' ').slice(1).join(' ')}</small>
              )}
            </span>
          </div>

          <div className="checkout-header-fim">
            {tempoEstimado && (
              <span className="checkout-modalidade-chip">
                <span className="checkout-modalidade-icone" aria-hidden="true">
                  {modalidade === 'delivery' ? '🛵' : '🛍'}
                </span>
                <span>
                  <b>{modalidade === 'delivery' ? 'Entrega' : 'Retirada'}</b>
                  <small>{tempoEstimado}</small>
                </span>
              </span>
            )}
            <button type="button" className="checkout-fechar" aria-label="Fechar" disabled={enviando} onClick={onFechar}>×</button>
          </div>
        </header>

        <h2 id="checkout-titulo" ref={tituloRef} tabIndex={-1} className="checkout-titulo">{titulo}</h2>

        {!pedidoRegistrado && (
          // Três marcos com progressão: o que já passou fica com ✓ e o traço
          // até ele preenchido. Pagamento não é uma tela separada — é a última
          // coisa que a pessoa escolhe antes de confirmar, então acende quando
          // ela escolhe a forma. Nenhum marco acende antes da hora.
          <ol className="checkout-etapas" aria-label="Etapas do pedido">
            {[
              { id: 'carrinho', rotulo: 'Carrinho' },
              { id: 'entrega', rotulo: modalidade === 'delivery' ? 'Entrega' : 'Retirada' },
              { id: 'pagamento', rotulo: 'Pagamento' },
            ].map((marco, i) => {
              const atual = etapa === 'carrinho' ? 0 : formaPagamento ? 2 : 1;
              const estado = i < atual ? 'concluida' : i === atual ? 'ativa' : '';
              return (
                <li key={marco.id} className={estado} aria-current={i === atual ? 'step' : undefined}>
                  {i > 0 && <i className={i <= atual ? 'preenchido' : ''} />}
                  <span>
                    <b>{i < atual ? '✓' : i + 1}</b>
                    {marco.rotulo}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {pedidoRegistrado ? (
          <div className="checkout-sucesso">
            <div className="checkout-sucesso-icone">✓</div>
            <h3>Pedido {numeroPedido(pedidoRegistrado.pedido.numero)} registrado</h3>
            <p>Ele já entrou como pendente na gestão da loja.</p>
            <div className="checkout-pendente">
              <strong>Pagamento a receber · {nomeFormaPagamento(pedidoRegistrado.pedido.forma_pagamento)}</strong>
              <span>{instrucaoPagamentoCheckout(pedidoRegistrado.pedido.forma_pagamento, pedidoRegistrado.pedido.tipo)}</span>
            </div>
            <div className="checkout-total"><span>Total</span><strong>{formatBRL(pedidoRegistrado.pedido.total)}</strong></div>
            {pedidoRegistrado.proximaAcao?.tipo === 'whatsapp' && (
              pedidoRegistrado.pedido.forma_pagamento === 'pix_manual' ? (
                <a className="btn-primary checkout-acao" href={pedidoRegistrado.proximaAcao.url} target="_blank" rel="noopener noreferrer">Continuar no WhatsApp pra fazer o Pix</a>
              ) : (
                <a className="btn-continue" href={pedidoRegistrado.proximaAcao.url} target="_blank" rel="noopener noreferrer">Abrir WhatsApp (opcional)</a>
              )
            )}
            <a className="btn-continue" href={pedidoRegistrado.pedido.tracking_url}>Acompanhar meu pedido</a>
            <button type="button" className="btn-continue" onClick={onNovoPedido}>Fechar e fazer novo pedido</button>
          </div>
        ) : etapa === 'carrinho' ? (
          <div className="checkout-conteudo">
            {linhas.length === 0 ? (
              <p className="checkout-carrinho-vazio">Seu carrinho está vazio.</p>
            ) : (
              <div className="checkout-itens">
                {linhas.map((linha) => {
                  const imagem = imagensPorProduto[linha.produtoId];
                  return (
                    <div key={linha.lineId} className="checkout-item">
                      {imagem
                        ? <Image className="checkout-item-foto" src={imagem} alt="" width={150} height={150} />
                        : <span className="checkout-item-foto checkout-item-foto-vazia" aria-hidden="true" />}

                      <div className="checkout-item-info">
                        <strong>{linha.nome}</strong>
                        {linha.complementos.length > 0 && (
                          <small>{linha.complementos.map((c) => c.quantidade > 1 ? `${c.quantidade}x ${c.nome}` : c.nome).join(', ')}</small>
                        )}
                        {linha.observacao && <small>Obs: {linha.observacao}</small>}
                        <span className="checkout-item-preco">{formatBRL(subtotalLinha(linha))}</span>
                      </div>

                      <div className="checkout-item-acoes">
                        <div className="checkout-item-qtd">
                          <button type="button" aria-label="Diminuir quantidade" onClick={() => onMudarQtd(linha.lineId, -1)}>−</button>
                          <b>{linha.qty}</b>
                          <button type="button" aria-label="Aumentar quantidade" onClick={() => onMudarQtd(linha.lineId, 1)}>+</button>
                        </div>
                        <button type="button" className="checkout-item-remover" aria-label={`Remover ${linha.nome}`} onClick={() => onRemover(linha.lineId)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {linhas.length > 0 && produtosSugeridos.length > 0 && (
              <section className="checkout-sugestoes" aria-label="Sugestões">
                <div className="checkout-sugestoes-topo">
                  <h3>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 3l2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.4l6.1-.8L12 3z" />
                    </svg>
                    Sugestões para turbinar seu pedido
                  </h3>
                  {produtosSugeridos.length > 1 && (
                    <button type="button" className="checkout-add-tudo" onClick={() => produtosSugeridos.forEach(onAdicionarSugestao)}>
                      Adicionar tudo
                    </button>
                  )}
                </div>
                <div className="checkout-sugestoes-lista">
                  {produtosSugeridos.map((produto) => (
                    <article key={produto.id} className="checkout-sugestao">
                      {produto.imagem_url
                        ? <Image className="checkout-sugestao-foto" src={produto.imagem_url} alt="" width={200} height={200} />
                        : <span className="checkout-sugestao-foto checkout-sugestao-foto-vazia" aria-hidden="true" />}
                      <div className="checkout-sugestao-txt">
                        <strong>{produto.nome}</strong>
                        {produto.descricao && <small>{produto.descricao}</small>}
                      </div>
                      <div className="checkout-sugestao-fim">
                        <span>{formatBRL(precoBase(produto))}</span>
                        <button type="button" className="checkout-mais" aria-label={`Adicionar ${produto.nome}`} onClick={() => onAdicionarSugestao(produto)}>+</button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {linhas.length > 0 && sugestoesComplementos.length > 0 && (
              <section className="checkout-sugestoes" aria-label="Complementos">
                <div className="checkout-sugestoes-topo"><h3>Complementos para os seus itens</h3></div>
                <div className="checkout-sugestoes-lista">
                  {sugestoesComplementos.map((sugestao) => (
                    <article key={`${sugestao.lineId}-${sugestao.complementoId}`} className="checkout-sugestao">
                      <span className="checkout-sugestao-foto checkout-sugestao-foto-vazia" aria-hidden="true" />
                      <div className="checkout-sugestao-txt">
                        <strong>{sugestao.nome}</strong>
                        <small>{sugestao.produtoNome}</small>
                      </div>
                      <div className="checkout-sugestao-fim">
                        <span>{formatBRL(sugestao.preco)}</span>
                        <button type="button" className="checkout-mais" aria-label={`Adicionar ${sugestao.nome}`} onClick={() => onAdicionarComplemento(sugestao)}>+</button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {!lojaAberta && <p className="checkout-erro" role="status">A loja está fechada. Seu carrinho fica salvo para depois.</p>}
            {lojaAberta && !retiradaAtiva && !deliveryAtiva && <p className="checkout-erro" role="status">Os pedidos estão pausados no momento.</p>}

            <div className="checkout-rodape">
              {/* Só no desktop: no celular ocupa metade da tela sem acrescentar
                  decisão nenhuma que o cliente precise tomar agora. */}
              <div className="checkout-rodape-info">
                {pedidoMinimo > 0 && (
                  <div><span>Pedido mínimo</span><b>{formatBRL(pedidoMinimo)}</b></div>
                )}
                <div><span>Entrega/Retirada</span><b>{modalidade === 'delivery' ? 'Entrega' : 'Retirada'}</b></div>
                {tempoEstimado && <div><span>Tempo estimado</span><b>{tempoEstimado}</b></div>}
              </div>

              <div className="checkout-resumo">
                <div><span>Subtotal</span><span>{formatBRL(subtotal)}</span></div>
                <div className="checkout-total"><span>Total</span><strong>{formatBRL(subtotal)}</strong></div>
              </div>

              <div className="checkout-rodape-acao">
                <button type="button" className="btn-primary checkout-acao" disabled={linhas.length === 0 || !lojaAberta || (!retiradaAtiva && !deliveryAtiva)} onClick={() => setEtapa('dados')}>
                  Continuar pedido
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h13M13 6l6 6-6 6" />
                  </svg>
                </button>
                <p className="checkout-seguro">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="5" y="11" width="14" height="9" rx="2" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                  </svg>
                  Ambiente 100% seguro
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="checkout-conteudo">
            <button type="button" className="checkout-voltar" onClick={() => setEtapa('carrinho')}>‹ Voltar ao carrinho</button>

            <section className="checkout-bloco">
              <h3>{modalidade === 'delivery' ? 'Entrega' : 'Retirada'}</h3>
              {!lojaAberta && <p className="checkout-erro" role="status">A loja está fechada e não está recebendo pedidos agora.</p>}
              <div className="checkout-opcoes" role="radiogroup" aria-label="Modalidade do pedido">
                {retiradaAtiva && <button type="button" role="radio" aria-checked={modalidade === 'retirada'} className={'checkout-retirada' + (modalidade === 'retirada' ? ' selecionada' : '')} onClick={() => selecionarModalidade('retirada')}>
                  <span>🚶</span><div><strong>Retirar no estabelecimento</strong><small>Confirme o endereço com a loja</small></div><b aria-hidden="true" />
                </button>}
                {deliveryAtiva && <button type="button" role="radio" aria-checked={modalidade === 'delivery'} className={'checkout-retirada' + (modalidade === 'delivery' ? ' selecionada' : '')} onClick={() => selecionarModalidade('delivery')}>
                  <span>🛵</span><div><strong>Receber por Delivery</strong><small>Calcule a taxa pelo seu endereço</small></div><b aria-hidden="true" />
                </button>}
              </div>
            </section>

            {modalidade === 'delivery' && (
              <section className="checkout-bloco checkout-delivery">
                <h3>Endereço de entrega</h3>
                {cotacaoAtual ? (
                  <div className="checkout-cotacao">
                    <div>
                      <strong>{cotacaoAtual.address.rua}, {cotacaoAtual.address.numero}</strong>
                      <span>{cotacaoAtual.address.bairro}</span>
                      <span>{cotacaoAtual.address.cidade} - {cotacaoAtual.address.uf}</span>
                      {cotacaoAtual.address.complemento && <span>{cotacaoAtual.address.complemento}</span>}
                    </div>
                    <div className="checkout-cotacao-taxa"><span>Taxa de entrega</span><strong>{formatBRL(cotacaoAtual.deliveryFeeCents / 100)}</strong></div>
                    <div className="checkout-cotacao-acoes">
                      <button type="button" className="btn-continue" onClick={editarEndereco}>Editar</button>
                      {!enderecoEstaConfirmado && <button type="button" className="btn-primary" onClick={() => setEnderecoConfirmado(true)}>Confirmar endereço</button>}
                    </div>
                    {enderecoEstaConfirmado && <p className="checkout-endereco-confirmado" role="status">✓ Endereço confirmado</p>}
                  </div>
                ) : (
                  <>
                    <div className="checkout-endereco-grid">
                      <label className="checkout-campo">CEP *<input inputMode="numeric" autoComplete="postal-code" maxLength={9} value={formatarCep(endereco.cep)} onChange={(e) => alterarEndereco('cep', e.target.value)} placeholder="00000-000" /></label>
                      <label className="checkout-campo checkout-campo-rua">Rua *<input autoComplete="address-line1" maxLength={120} value={endereco.rua} onChange={(e) => alterarEndereco('rua', e.target.value)} /></label>
                      <label className="checkout-campo">Número *<input autoComplete="address-line2" maxLength={20} value={endereco.numero} onChange={(e) => alterarEndereco('numero', e.target.value)} /></label>
                      <label className="checkout-campo">Bairro *<input maxLength={80} value={endereco.bairro} onChange={(e) => alterarEndereco('bairro', e.target.value)} /></label>
                      <label className="checkout-campo checkout-campo-cidade">Cidade *<input autoComplete="address-level2" maxLength={80} value={endereco.cidade} onChange={(e) => alterarEndereco('cidade', e.target.value)} /></label>
                      <label className="checkout-campo">UF *<input autoComplete="address-level1" inputMode="text" maxLength={2} value={endereco.uf} onChange={(e) => alterarEndereco('uf', e.target.value)} /></label>
                      <label className="checkout-campo checkout-campo-complemento">Complemento<input autoComplete="address-line3" maxLength={120} value={endereco.complemento || ''} onChange={(e) => alterarEndereco('complemento', e.target.value)} /></label>
                    </div>
                    {consultandoCep && <p className="checkout-ajuda" role="status">Consultando CEP…</p>}
                    {erroCep && <p className="checkout-erro" role="status">{erroCep}</p>}
                    {erroEntrega && <p className="checkout-erro" role="alert">{erroEntrega}</p>}
                    <button type="button" className="btn-continue checkout-calcular" disabled={!enderecoPronto() || consultandoCep || calculandoEntrega} onClick={calcularEntrega}>
                      {calculandoEntrega && <span className="btn-spinner" aria-hidden="true" />}{calculandoEntrega ? 'Calculando…' : 'Calcular entrega'}
                    </button>
                  </>
                )}
              </section>
            )}

            <section className="checkout-bloco">
              <h3>Seus dados</h3>
              <div className="checkout-dados-grid">
                <label className="checkout-campo">Nome<input autoComplete="name" maxLength={80} value={nome} onChange={(e) => onNome(e.target.value)} /></label>
                <label className="checkout-campo">Telefone com DDD<input type="tel" autoComplete="tel" maxLength={16} value={telefone} onChange={(e) => onTelefone(formatarTelefone(e.target.value))} placeholder="(11) 91234-5678" /></label>
              </div>
            </section>

            <section className="checkout-bloco">
              <h3>{modalidade === 'delivery' ? 'Pagamento' : 'Pagar na retirada'}</h3>
              <div className="checkout-formas-pagamento" role="radiogroup" aria-label="Forma de pagamento">
                {formasPagamentoPara(modalidade).map((forma) => {
                  const selecionada = formaPagamento === forma;
                  return (
                    <button
                      key={forma}
                      type="button"
                      role="radio"
                      aria-checked={selecionada}
                      className={selecionada ? 'selecionada' : ''}
                      onClick={() => onFormaPagamento(forma)}
                    >
                      <span className="checkout-forma-icone"><IconeFormaPagamento forma={forma} /></span>
                      <strong>{ROTULOS_FORMA_PAGAMENTO[forma]}</strong>
                      <span className="checkout-forma-marcador" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
              {formaPagamento && <p className="checkout-pagamento">{instrucaoPagamentoCheckout(formaPagamento, modalidade)}</p>}
            </section>

            {erro && <p className="checkout-erro" role="alert">{erro}</p>}
            <div className="checkout-resumo"><div><span>Subtotal</span><span>{formatBRL(subtotal)}</span></div>{modalidade === 'delivery' && <div><span>Taxa de entrega</span><span>{cotacaoAtual ? formatBRL(taxaEntrega) : '—'}</span></div>}<div className="checkout-total"><span>Total</span><strong>{formatBRL(total)}</strong></div></div>
            <p className="checkout-pagamento"><strong>Pedido e pagamento são separados:</strong> seu pedido entra imediatamente na gestão da loja; o pagamento será confirmado manualmente pelo restaurante.</p>
            <button type="button" className="btn-primary checkout-acao" disabled={enviando || linhas.length === 0 || !formaPagamento || !lojaAberta || (modalidade === 'retirada' ? !retiradaAtiva : !deliveryAtiva || !enderecoEstaConfirmado)} onClick={() => onFinalizar(modalidade === 'delivery' ? cotacaoAtual : null)}>{enviando && <span className="btn-spinner" aria-hidden="true" />}{enviando ? 'Registrando pedido…' : 'Confirmar e registrar pedido'}</button>
          </div>
        )}
      </section>
    </div>
  );
}
