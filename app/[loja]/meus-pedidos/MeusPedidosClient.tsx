'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatBRL } from '@/lib/pedidos/tipos';
import {
  ROTULOS_STATUS_CLIENTE,
  type PedidoClienteDetalhe,
  type PedidoClienteResumo,
  type StatusPedidoCliente,
} from '@/lib/clientes/pedidos-publicos';
import { numeroPedido } from '@/lib/pedidos/numero';
import { normalizarTelefoneBrasil } from '@/lib/clientes/telefone';
import { useEscFechar } from '@/hooks/useEscFechar';
import { NavegacaoCliente } from '../NavegacaoCliente';

type Aba = 'andamento' | 'historico';
type LojaPedidos = {
  slug: string;
  nome: string;
  logo_url: string | null;
  cor_marca: string | null;
  whatsapp_numero: string | null;
};

function linkWhatsappPedido(telefoneLoja: string | null, numero: number) {
  const telefone = normalizarTelefoneBrasil(telefoneLoja)?.slice(1);
  if (!telefone) return null;
  const mensagem = `Olá! Quero falar sobre o pedido #${numeroPedido(numero)}.`;
  return `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`;
}

function IconeWhatsapp() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M20 11.6a8 8 0 0 1-11.8 7L4 20l1.4-4A8 8 0 1 1 20 11.6Z" />
      <path d="M8.7 8.2c.2-.5.5-.5.8-.5h.4c.1 0 .3 0 .4.3l.9 2c.1.2 0 .4-.1.6l-.5.7c-.2.2-.1.4 0 .6.5.9 1.2 1.6 2.1 2.1.2.1.4.2.6 0l.8-1c.2-.2.4-.2.6-.1l1.9.9c.2.1.3.2.3.4 0 .3-.2 1.4-.9 2-.5.5-1.2.7-2 .5-1.1-.2-2.5-.7-4.2-2.2-1.4-1.3-2.4-2.9-2.7-4-.3-.8 0-1.7.6-2.3Z" />
    </svg>
  );
}

function formatarData(valor: string) {
  const data = new Date(valor);
  const hoje = new Date();
  const dataLocal = data.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const hojeLocal = hoje.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const hora = data.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });
  return dataLocal === hojeLocal ? `Hoje · ${hora}` : `${dataLocal} · ${hora}`;
}

function rotuloEntrega(tipo: string) {
  return tipo === 'delivery' ? 'Entrega' : tipo === 'retirada' ? 'Retirada' : 'Atendimento na loja';
}

const ORDEM_STATUS: Record<Exclude<StatusPedidoCliente, 'cancelado'>, number> = {
  pendente: 0,
  confirmado: 1,
  em_preparo: 2,
  pronto: 3,
  saiu_entrega: 4,
  concluido: 5,
};

function AcompanhamentoPedido({
  status,
  tipo,
}: {
  status: StatusPedidoCliente;
  tipo: string;
}) {
  if (status === 'cancelado') {
    return <p className="pedido-cliente-cancelado">Este pedido foi cancelado.</p>;
  }

  const delivery = tipo === 'delivery';
  const etapas = delivery
    ? [
        { rotulo: 'Recebido', limite: 0 },
        { rotulo: 'Em preparo', limite: 2 },
        { rotulo: 'Saiu para entrega', limite: 4 },
        { rotulo: 'Entregue', limite: 5 },
      ]
    : [
        { rotulo: 'Recebido', limite: 0 },
        { rotulo: 'Em preparo', limite: 2 },
        { rotulo: 'Pronto', limite: 3 },
        { rotulo: 'Retirado', limite: 5 },
      ];
  const ordemAtual = ORDEM_STATUS[status];
  const indiceAtual = etapas.reduce(
    (indice, etapa, atual) => ordemAtual >= etapa.limite ? atual : indice,
    0
  );

  return (
    <ol className="pedido-cliente-etapas" aria-label={`Andamento: ${ROTULOS_STATUS_CLIENTE[status]}`}>
      {etapas.map((etapa, indice) => (
        <li
          key={etapa.rotulo}
          className={(indice <= indiceAtual ? 'alcancada' : '') + (indice === indiceAtual ? ' atual' : '')}
          aria-current={indice === indiceAtual ? 'step' : undefined}
        >
          <span className="pedido-cliente-etapa-icone" aria-hidden="true">
            {indice < indiceAtual ? '✓' : indice + 1}
          </span>
          <span>{etapa.rotulo}</span>
        </li>
      ))}
    </ol>
  );
}

function DetalhePedido({
  pedido,
  carregando,
  erro,
  onFechar,
}: {
  pedido: PedidoClienteDetalhe | null;
  carregando: boolean;
  erro: string | null;
  onFechar: () => void;
}) {
  useEscFechar(onFechar);

  return (
    <div className="pedido-cliente-fundo" role="presentation" onMouseDown={(evento) => evento.target === evento.currentTarget && onFechar()}>
      <section className="pedido-cliente-detalhe" role="dialog" aria-modal="true" aria-labelledby="pedido-cliente-detalhe-titulo">
        <button type="button" className="pedido-cliente-fechar" onClick={onFechar} aria-label="Fechar detalhes">×</button>
        {carregando ? (
          <p className="pedidos-cliente-carregando">Carregando pedido…</p>
        ) : erro ? (
          <div className="pedidos-cliente-erro" role="alert">{erro}</div>
        ) : pedido && (
          <>
            <header>
              <span>{formatarData(pedido.createdAt)}</span>
              <h2 id="pedido-cliente-detalhe-titulo">Pedido {numeroPedido(pedido.orderNumber)}</h2>
              <strong className={`pedido-cliente-status status-${pedido.status}`}>
                {ROTULOS_STATUS_CLIENTE[pedido.status]}
              </strong>
            </header>

            <div className="pedido-cliente-itens">
              <h3>Itens</h3>
              {pedido.items.map((item, indice) => (
                <div className="pedido-cliente-item" key={`${item.name}-${indice}`}>
                  <div><strong>{item.quantity}× {item.name}</strong><span>{formatBRL(item.subtotal)}</span></div>
                  {item.options.map((opcao, opcaoIndice) => (
                    <small key={`${opcao.name}-${opcaoIndice}`}>{opcao.quantity}× {opcao.name}</small>
                  ))}
                  {item.note && <small>Observação: {item.note}</small>}
                </div>
              ))}
            </div>

            <dl className="pedido-cliente-totais">
              <div><dt>Subtotal</dt><dd>{formatBRL(pedido.subtotal)}</dd></div>
              {pedido.deliveryFee > 0 && <div><dt>Taxa de entrega</dt><dd>{formatBRL(pedido.deliveryFee)}</dd></div>}
              {pedido.discount > 0 && <div><dt>Desconto</dt><dd>− {formatBRL(pedido.discount)}</dd></div>}
              <div className="total"><dt>Total</dt><dd>{formatBRL(pedido.total)}</dd></div>
            </dl>

            <div className="pedido-cliente-entrega">
              <strong>{rotuloEntrega(pedido.fulfillmentType)}</strong>
              {pedido.address && <p>{pedido.address}</p>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export function MeusPedidosClient({ loja }: { loja: LojaPedidos }) {
  const [aba, setAba] = useState<Aba>('andamento');
  const [pedidos, setPedidos] = useState<PedidoClienteResumo[]>([]);
  const [paginaHistorico, setPaginaHistorico] = useState(1);
  const [temMais, setTemMais] = useState(false);
  const [temSessao, setTemSessao] = useState<boolean | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [tokenAberto, setTokenAberto] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<PedidoClienteDetalhe | null>(null);
  const [erroDetalhe, setErroDetalhe] = useState<string | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const requisicaoRef = useRef<AbortController | null>(null);

  const buscarPedidos = useCallback(async (abaSolicitada: Aba, pagina: number, acumular = false) => {
    requisicaoRef.current?.abort();
    const controlador = new AbortController();
    requisicaoRef.current = controlador;
    if (!acumular) setCarregando(true);
    setErro(null);
    try {
      const resposta = await fetch(
        `/api/lojas/${loja.slug}/meus-pedidos?aba=${abaSolicitada}&pagina=${pagina}`,
        { cache: 'no-store', signal: controlador.signal }
      );
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.erro || 'Não foi possível carregar seus pedidos.');
      setTemSessao(corpo.sessao === true);
      const recebidos = (corpo.pedidos || []) as PedidoClienteResumo[];
      setPedidos((atuais) => acumular ? [...atuais, ...recebidos] : recebidos);
      setTemMais(corpo.temMais === true);
    } catch (falha) {
      if (controlador.signal.aborted) return;
      setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar seus pedidos.');
    } finally {
      if (requisicaoRef.current === controlador) {
        requisicaoRef.current = null;
        setCarregando(false);
      }
    }
  }, [loja.slug]);

  useEffect(() => {
    const cargaInicial = window.setTimeout(() => void buscarPedidos(aba, 1), 0);
    const intervalo = aba === 'andamento'
      ? window.setInterval(() => {
          if (document.visibilityState === 'visible') void buscarPedidos('andamento', 1);
        }, 10_000)
      : null;
    return () => {
      window.clearTimeout(cargaInicial);
      if (intervalo) window.clearInterval(intervalo);
      requisicaoRef.current?.abort();
    };
  }, [aba, buscarPedidos]);

  function mudarAba(novaAba: Aba) {
    if (novaAba === aba) return;
    setPedidos([]);
    setPaginaHistorico(1);
    setTemMais(false);
    setCarregando(true);
    setAba(novaAba);
  }

  async function abrirDetalhe(token: string) {
    setTokenAberto(token);
    setDetalhe(null);
    setErroDetalhe(null);
    setCarregandoDetalhe(true);
    try {
      const resposta = await fetch(`/api/lojas/${loja.slug}/meus-pedidos/${token}`, { cache: 'no-store' });
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.erro || 'Não foi possível abrir o pedido.');
      setDetalhe(corpo.pedido as PedidoClienteDetalhe);
    } catch (falha) {
      setErroDetalhe(falha instanceof Error ? falha.message : 'Não foi possível abrir o pedido.');
    } finally {
      setCarregandoDetalhe(false);
    }
  }

  function carregarMais() {
    const proxima = paginaHistorico + 1;
    setPaginaHistorico(proxima);
    void buscarPedidos('historico', proxima, true);
  }

  return (
    <>
    <div className="pedidos-cliente-pagina" style={{ ['--marca' as string]: loja.cor_marca || '#1E7A4E' }}>
      <header className="pedidos-cliente-topo">
        <Link href={`/${loja.slug}`} aria-label={`Voltar ao cardápio de ${loja.nome}`}>
          <span className="pedidos-cliente-logo">
            {loja.logo_url && <Image src={loja.logo_url} alt="" width={46} height={46} />}
          </span>
          <span><small>Cardápio de</small><strong>{loja.nome}</strong></span>
        </Link>
      </header>

      <main className="pedidos-cliente-conteudo">
        <div className="pedidos-cliente-titulo">
          <span className="pedidos-cliente-titulo-icone" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h4" /></svg>
          </span>
          <div><h1>Meus pedidos</h1><p>Acompanhe o preparo e consulte compras anteriores.</p></div>
        </div>

        <div className="pedidos-cliente-abas" role="tablist" aria-label="Tipos de pedido">
          <button type="button" role="tab" aria-selected={aba === 'andamento'} className={aba === 'andamento' ? 'ativo' : ''} onClick={() => mudarAba('andamento')}>Em andamento</button>
          <button type="button" role="tab" aria-selected={aba === 'historico'} className={aba === 'historico' ? 'ativo' : ''} onClick={() => mudarAba('historico')}>Histórico</button>
        </div>

        {carregando ? (
          <p className="pedidos-cliente-carregando" role="status">Carregando seus pedidos…</p>
        ) : erro ? (
          <div className="pedidos-cliente-erro" role="alert">
            <strong>Não foi possível atualizar agora.</strong><p>{erro}</p>
            <button type="button" onClick={() => void buscarPedidos(aba, 1)}>Tentar novamente</button>
          </div>
        ) : temSessao === false ? (
          <div className="pedidos-cliente-vazio">
            <span aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h4" /></svg>
            </span>
            <h2>Seus pedidos aparecerão aqui</h2>
            <p>Depois que você fizer o primeiro pedido neste navegador, poderá acompanhar tudo por aqui.</p>
            <Link href={`/${loja.slug}`}>Voltar ao cardápio</Link>
          </div>
        ) : pedidos.length === 0 ? (
          <div className="pedidos-cliente-vazio compacto">
            <h2>{aba === 'andamento' ? 'Nenhum pedido em andamento' : 'Seu histórico está vazio'}</h2>
            <p>{aba === 'andamento' ? 'Quando fizer um novo pedido, o andamento aparecerá aqui.' : 'Pedidos entregues ou cancelados aparecerão nesta aba.'}</p>
            {aba === 'andamento' && <Link href={`/${loja.slug}`}>Escolher algo no cardápio</Link>}
          </div>
        ) : (
          <section className="pedidos-cliente-lista" aria-live="polite">
            {pedidos.map((pedido) => (
              <article className="pedido-cliente-card" key={pedido.trackingToken}>
                <div className="pedido-cliente-card-topo">
                  <div><strong>Pedido {numeroPedido(pedido.orderNumber)}</strong><span>{formatarData(pedido.createdAt)}</span></div>
                  <span className={`pedido-cliente-status status-${pedido.status}`}>{ROTULOS_STATUS_CLIENTE[pedido.status]}</span>
                </div>
                {aba === 'andamento' && (
                  <AcompanhamentoPedido status={pedido.status} tipo={pedido.fulfillmentType} />
                )}
                <p className="pedido-cliente-resumo">
                  {pedido.items.slice(0, 2).map((item) => `${item.quantity}× ${item.name}`).join(' · ')}
                  {pedido.items.length > 2 && ` · +${pedido.items.length - 2}`}
                </p>
                <div className="pedido-cliente-card-rodape">
                  <div><small>{rotuloEntrega(pedido.fulfillmentType)}</small><strong>{formatBRL(pedido.total)}</strong></div>
                  {aba === 'andamento' ? (
                    linkWhatsappPedido(loja.whatsapp_numero, pedido.orderNumber) && (
                      <a
                        className="pedido-cliente-whatsapp"
                        href={linkWhatsappPedido(loja.whatsapp_numero, pedido.orderNumber) || undefined}
                        aria-label={`Falar no WhatsApp sobre o pedido ${numeroPedido(pedido.orderNumber)}`}
                      >
                        <IconeWhatsapp /> WhatsApp
                      </a>
                    )
                  ) : (
                    <button type="button" onClick={() => void abrirDetalhe(pedido.trackingToken)}>
                      Ver detalhes <span aria-hidden="true">→</span>
                    </button>
                  )}
                </div>
              </article>
            ))}
            {aba === 'historico' && temMais && (
              <button type="button" className="pedidos-cliente-carregar" onClick={carregarMais}>Carregar mais</button>
            )}
          </section>
        )}
      </main>

      {tokenAberto && (
        <DetalhePedido
          pedido={detalhe}
          carregando={carregandoDetalhe}
          erro={erroDetalhe}
          onFechar={() => setTokenAberto(null)}
        />
      )}
    </div>
    <NavegacaoCliente lojaSlug={loja.slug} corMarca={loja.cor_marca} />
    </>
  );
}
