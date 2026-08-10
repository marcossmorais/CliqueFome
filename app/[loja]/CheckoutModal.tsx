'use client';

import { useEffect, useRef, useState } from 'react';
import { extraDaLinha, formatarTelefone, formatBRL, subtotalLinha, type LinhaCarrinho } from '@/lib/cardapio/tipos';
import { formatarCep, type ConfigDeliveryPublica, type EnderecoEstruturado } from '@/lib/delivery/tipos';
import { useBuscaCep } from '@/lib/endereco/useBuscaCep';
import { useEscFechar } from '@/hooks/useEscFechar';
import {
  formasPagamentoPara,
  instrucaoPagamento,
  nomeFormaPagamento,
  type FormaPagamentoOffline,
} from '@/lib/pedidos/pagamento';

export type ModoEntrega = 'retirada' | 'entrega';
export type CotacaoEstado =
  | { status: 'idle' }
  | { status: 'calculando' }
  | { status: 'erro'; erro: string }
  | { status: 'ok'; taxa: number; distanciaKm: number | null; enderecoFormatado: string; token: string; expiraEm: string };

export type PedidoRegistrado = {
  pedido: {
    numero: number; token: string; status: string; pagamento_status: string; forma_pagamento: string;
    subtotal: number; taxa_entrega: number; total: number; tracking_url: string;
  };
  proximaAcao: { tipo: string; url: string } | null;
};

const ROTULOS_FORMA_PAGAMENTO: Record<FormaPagamentoOffline, string> = {
  dinheiro_entrega: 'Dinheiro',
  cartao_credito_entrega: 'Cartão de crédito',
  cartao_debito_entrega: 'Cartão de débito',
  pix_manual: 'Pix no WhatsApp',
  pagamento_retirada: 'Pagar no estabelecimento',
};

function IconeFormaPagamento({ forma }: { forma: FormaPagamentoOffline }) {
  if (forma === 'dinheiro_entrega') {
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

type Etapa = 'carrinho' | 'entrega';

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
 * (lista de itens) e o checkout (entrega/dados) eram duas sobreposições
 * independentes, cada uma com seu próprio backdrop. Empilhadas, a de trás
 * "vazava" atrás da da frente (o cabeçalho "Seu carrinho" aparecia por
 * cima do checkout num vão que o backdrop translúcido não cobria de
 * verdade) e ainda competiam por z-index. Uma só superfície resolve os
 * dois problemas de uma vez.
 */
export function CheckoutModal({
  aberto, linhas, nome, telefone, endereco, modo, formaPagamento, erro, enviando, pedidoRegistrado,
  deliveryConfig, taxaEstatica, cidadeEscolhida, cotacao, onFechar, onMudarQtd, onRemover,
  lojaAberta, deliveryAtivo, retiradaAtiva,
  onNome, onTelefone, onEndereco, onCidade, onCalcularFrete, onModo, onFormaPagamento, onFinalizar, onNovoPedido,
}: {
  aberto: boolean; linhas: LinhaCarrinho[]; nome: string; telefone: string;
  endereco: EnderecoEstruturado; modo: ModoEntrega; formaPagamento: FormaPagamentoOffline | ''; erro: string | null; enviando: boolean;
  pedidoRegistrado: PedidoRegistrado | null; deliveryConfig: ConfigDeliveryPublica | null;
  lojaAberta: boolean; deliveryAtivo: boolean; retiradaAtiva: boolean;
  taxaEstatica: number;
  cidadeEscolhida: string; cotacao: CotacaoEstado; onFechar: () => void;
  onMudarQtd: (lineId: string, delta: number) => void; onRemover: (lineId: string) => void;
  onNome: (v: string) => void; onTelefone: (v: string) => void;
  onEndereco: (v: EnderecoEstruturado) => void; onCidade: (v: string) => void;
  onCalcularFrete: () => void; onModo: (m: ModoEntrega) => void;
  onFormaPagamento: (forma: FormaPagamentoOffline | '') => void;
  onFinalizar: () => void; onNovoPedido: () => void;
}) {
  const [etapa, setEtapa] = useState<Etapa>('carrinho');
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const enderecoAtualRef = useRef(endereco);
  const buscaCep = useBuscaCep();

  // Reabrir sempre começa pelo carrinho — evita reabrir já em "Entrega" com
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
  const usaCotacaoDinamica = !!deliveryConfig?.configurada;
  const taxa = modo === 'entrega'
    ? usaCotacaoDinamica
      ? cotacao.status === 'ok' ? cotacao.taxa : 0
      : taxaEstatica
    : 0;
  const total = subtotal + taxa;

  useEscFechar(() => { if (!enviando) onFechar(); });

  useEffect(() => {
    enderecoAtualRef.current = endereco;
  }, [endereco]);

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
  const atualizar = (campo: keyof EnderecoEstruturado, valor: string) => onEndereco({ ...endereco, [campo]: valor });
  const alterarCep = (valor: string) => {
    const cep = formatarCep(valor);
    atualizar('cep', cep);
    void buscaCep.consultar(cep, (localizado) => {
      const atual = enderecoAtualRef.current;
      onEndereco({
        ...atual,
        cep: formatarCep(localizado.cep),
        logradouro: localizado.logradouro || atual.logradouro,
        bairro: localizado.bairro || atual.bairro,
        cidade: localizado.cidade,
        uf: localizado.uf,
      });
      if (deliveryConfig?.setor === 'avancado') onCidade(localizado.cidade);
    });
  };

  const titulo = pedidoRegistrado
    ? 'Pedido recebido'
    : etapa === 'carrinho'
      ? 'Seu carrinho'
      : 'Finalizar pedido';

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
          <h2 id="checkout-titulo" ref={tituloRef} tabIndex={-1}>{titulo}</h2>
          <button type="button" className="checkout-fechar" aria-label="Fechar" disabled={enviando} onClick={onFechar}>×</button>
        </header>

        {!pedidoRegistrado && (
          <div className="checkout-etapas" aria-label="Etapas do pedido">
            <span className={etapa === 'carrinho' ? 'ativa' : ''}><b>1</b> Carrinho</span><i />
            <span className={etapa === 'entrega' ? 'ativa' : ''}><b>2</b> Entrega</span>
          </div>
        )}

        {pedidoRegistrado ? (
          <div className="checkout-sucesso">
            <div className="checkout-sucesso-icone">✓</div>
            <h3>Pedido #{pedidoRegistrado.pedido.numero} registrado</h3>
            <p>Ele já entrou como pendente na gestão da loja.</p>
            <div className="checkout-pendente">
              <strong>Pagamento a receber · {nomeFormaPagamento(pedidoRegistrado.pedido.forma_pagamento)}</strong>
              <span>{instrucaoPagamento(pedidoRegistrado.pedido.forma_pagamento)}</span>
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
                {linhas.map((linha) => (
                  <div key={linha.lineId} className="checkout-item">
                    <div className="checkout-item-info">
                      <strong>{linha.nome}</strong>
                      {linha.complementos.length > 0 && (
                        <small>{linha.complementos.map((c) => c.quantidade > 1 ? `${c.quantidade}x ${c.nome}` : c.nome).join(', ')}</small>
                      )}
                      {linha.observacao && <small>Obs: {linha.observacao}</small>}
                      <span>{formatBRL(linha.precoUnit + extraDaLinha(linha))} un.</span>
                    </div>
                    <div className="checkout-item-qtd">
                      <button type="button" aria-label="Diminuir quantidade" onClick={() => onMudarQtd(linha.lineId, -1)}>−</button>
                      <b>{linha.qty}</b>
                      <button type="button" aria-label="Aumentar quantidade" onClick={() => onMudarQtd(linha.lineId, 1)}>+</button>
                    </div>
                    <span className="checkout-item-subtotal">{formatBRL(subtotalLinha(linha))}</span>
                    <button type="button" className="checkout-item-remover" aria-label={`Remover ${linha.nome}`} onClick={() => onRemover(linha.lineId)}>Remover</button>
                  </div>
                ))}
              </div>
            )}

            <div className="checkout-resumo"><div className="checkout-total"><span>Subtotal</span><strong>{formatBRL(subtotal)}</strong></div></div>
            {!lojaAberta && <p className="checkout-erro" role="status">A loja está fechada. Seu carrinho fica salvo para depois.</p>}
            {lojaAberta && !deliveryAtivo && !retiradaAtiva && <p className="checkout-erro" role="status">Delivery e retirada estão pausados no momento.</p>}
            <button type="button" className="btn-primary checkout-acao" disabled={linhas.length === 0 || !lojaAberta || (!deliveryAtivo && !retiradaAtiva)} onClick={() => setEtapa('entrega')}>
              Continuar pedido
            </button>
          </div>
        ) : (
          <div className="checkout-conteudo">
            <button type="button" className="checkout-voltar" onClick={() => setEtapa('carrinho')}>‹ Voltar ao carrinho</button>

            <section className="checkout-bloco">
              <h3>Como você quer receber?</h3>
              {!lojaAberta && <p className="checkout-erro" role="status">A loja está fechada e não está recebendo pedidos agora.</p>}
              {lojaAberta && !deliveryAtivo && retiradaAtiva && <p className="checkout-pagamento">Delivery pausado. A retirada continua disponível.</p>}
              <div className="checkout-opcoes">
                {deliveryAtivo && (
                  <button type="button" disabled={!lojaAberta} className={modo === 'entrega' ? 'selecionada' : ''} onClick={() => onModo('entrega')}>
                    <span>🛵</span><div><strong>Receber no meu endereço</strong><small>Calculamos a taxa antes de confirmar</small></div><b aria-hidden="true" />
                  </button>
                )}
                {retiradaAtiva && (
                  <button type="button" disabled={!lojaAberta} className={modo === 'retirada' ? 'selecionada' : ''} onClick={() => onModo('retirada')}>
                    <span>🚶</span><div><strong>Retirar no estabelecimento</strong><small>{deliveryConfig?.enderecoRetirada || 'Confirme o endereço com a loja'}</small></div><b aria-hidden="true" />
                  </button>
                )}
              </div>
            </section>

            {modo === 'entrega' && (
              <section className="checkout-bloco">
                <h3>Endereço de entrega</h3>
                {deliveryConfig?.setor === 'avancado' && (
                  <label className="checkout-campo checkout-largo">Cidade atendida<select value={cidadeEscolhida} onChange={(e) => onCidade(e.target.value)}><option value="">Selecione</option>{deliveryConfig.cidade && <option>{deliveryConfig.cidade}</option>}{deliveryConfig.cidades.map((c) => <option key={c.cidade}>{c.cidade}</option>)}</select></label>
                )}
                <div className="checkout-endereco-grid">
                  <label className="checkout-campo campo-cep">CEP<input inputMode="numeric" autoComplete="postal-code" value={formatarCep(endereco.cep)} onChange={(e) => alterarCep(e.target.value)} placeholder="00000-000" />{buscaCep.mensagem && <small className={`checkout-cep-status${buscaCep.status === 'erro' ? ' erro' : ''}`} aria-live="polite">{buscaCep.mensagem}</small>}</label>
                  <label className="checkout-campo campo-logradouro">Logradouro<input autoComplete="address-line1" maxLength={120} value={endereco.logradouro} onChange={(e) => atualizar('logradouro', e.target.value)} placeholder="Rua ou avenida" /></label>
                  <label className="checkout-campo campo-numero">Número<input maxLength={20} value={endereco.numero} onChange={(e) => atualizar('numero', e.target.value)} /></label>
                  <label className="checkout-campo campo-bairro">Bairro<input maxLength={80} value={endereco.bairro} onChange={(e) => atualizar('bairro', e.target.value)} /></label>
                  <label className="checkout-campo campo-cidade">Cidade<input autoComplete="address-level2" maxLength={100} value={endereco.cidade} readOnly={!!deliveryConfig?.cidade} onChange={(e) => atualizar('cidade', e.target.value)} /></label>
                  <label className="checkout-campo campo-uf">UF<input autoComplete="address-level1" maxLength={2} value={endereco.uf} onChange={(e) => atualizar('uf', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} placeholder="SP" /></label>
                  <label className="checkout-campo campo-complemento">Complemento (opcional)<input autoComplete="address-line2" maxLength={100} value={endereco.complemento || ''} onChange={(e) => atualizar('complemento', e.target.value)} placeholder="Apto, bloco, casa…" /></label>
                  <label className="checkout-campo campo-referencia">Ponto de referência (opcional)<input maxLength={120} value={endereco.referencia || ''} onChange={(e) => atualizar('referencia', e.target.value)} /></label>
                </div>
                {usaCotacaoDinamica ? (
                  <>
                    <button type="button" className="checkout-calcular" disabled={cotacao.status === 'calculando'} onClick={onCalcularFrete}>{cotacao.status === 'calculando' ? 'Calculando rota…' : 'Calcular taxa de entrega'}</button>
                    {cotacao.status === 'ok' && <div className="checkout-cotacao"><span>Taxa calculada</span><strong>{formatBRL(cotacao.taxa)}{cotacao.distanciaKm != null ? ` · ${cotacao.distanciaKm} km` : ''}</strong></div>}
                    {cotacao.status === 'erro' && <p className="delivery-erro" role="alert">{cotacao.erro}</p>}
                    <small className="checkout-atribuicao">Rotas por <a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer">Geoapify</a> · © OpenStreetMap contributors</small>
                  </>
                ) : (
                  <div className="checkout-cotacao"><span>Taxa fixa da loja</span><strong>{formatBRL(taxaEstatica)}</strong></div>
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
              <h3>{modo === 'entrega' ? 'Pagar na entrega' : 'Pagar na retirada'}</h3>
              <div className="checkout-formas-pagamento" role="radiogroup" aria-label="Forma de pagamento">
                {formasPagamentoPara(modo === 'entrega' ? 'delivery' : 'retirada').map((forma) => {
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
              {formaPagamento && <p className="checkout-pagamento">{instrucaoPagamento(formaPagamento)}</p>}
            </section>

            {erro && <p className="checkout-erro" role="alert">{erro}</p>}
            <div className="checkout-resumo"><div><span>Subtotal</span><span>{formatBRL(subtotal)}</span></div>{modo === 'entrega' && <div><span>Taxa de entrega</span><span>{cotacao.status === 'ok' ? formatBRL(taxa) : 'A calcular'}</span></div>}<div className="checkout-total"><span>Total</span><strong>{formatBRL(total)}</strong></div></div>
            <p className="checkout-pagamento"><strong>Pedido e pagamento são separados:</strong> seu pedido entra imediatamente na gestão da loja; o pagamento será confirmado manualmente pelo restaurante.</p>
            <button type="button" className="btn-primary checkout-acao" disabled={enviando || linhas.length === 0 || !formaPagamento || !lojaAberta || (modo === 'entrega' ? !deliveryAtivo : !retiradaAtiva)} onClick={onFinalizar}>{enviando && <span className="btn-spinner" aria-hidden="true" />}{enviando ? 'Registrando pedido…' : 'Confirmar e registrar pedido'}</button>
          </div>
        )}
      </section>
    </div>
  );
}
