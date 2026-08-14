'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { criarClientNavegador } from '@/lib/supabase/client';
import { ConflitoDePedido, avancarStatus, buscarPedidos } from '@/lib/pedidos/acoes';
import { minutosAteOPrazo, ordenarPorUrgencia } from '@/lib/pedidos/prioridade';
import { NOMES_ORIGEM, NOMES_TIPO, proximoStatus, type OrigemPedido, type PedidoResumo, type StatusPedido, type TipoPedido } from '@/lib/pedidos/tipos';
import { useAgora } from '@/hooks/useAgora';
import { IconeBusca } from '@/components/admin/IconesCatalogo';
import { CardPedido } from './CardPedido';
import { LinhaPedido } from './LinhaPedido';
import { PainelDetalhePedido } from './PainelDetalhePedido';
import { NovoPedidoPainel } from './NovoPedidoPainel';
import type { CategoriaPublica, ProdutoPublico } from '@/lib/cardapio/tipos';
import { numeroPedido } from '@/lib/pedidos/numero';

/** No mobile, os cards operacionais continuam separados por etapa. No
 * desktop a mesma fila vira tabela, mantendo a seleção e o avanço no painel
 * lateral — sem arrastar pedidos, que é lento e propenso a erro na cozinha. */
const COLUNAS_MOBILE: { id: string; titulo: string; statuses: StatusPedido[] }[] = [
  { id: 'andamento', titulo: 'Em andamento', statuses: ['pendente', 'confirmado', 'em_preparo'] },
  { id: 'prontos', titulo: 'Prontos', statuses: ['pronto'] },
];

const STATUS_ATIVOS: StatusPedido[] = ['pendente', 'confirmado', 'em_preparo', 'pronto'];
type AbaPedidos = 'todos' | 'preparo' | 'prontos' | 'entrega' | 'atrasados';

const INTERVALO_ATUALIZACAO_MS = 20_000;

export function PedidosClient({
  lojaId,
  lojaSlug,
  pedidosIniciais,
  categorias,
  produtos,
}: {
  lojaId: string;
  lojaSlug: string;
  pedidosIniciais: PedidoResumo[];
  categorias: CategoriaPublica[];
  produtos: ProdutoPublico[];
}) {
  const [pedidos, setPedidos] = useState(pedidosIniciais);
  const [busca, setBusca] = useState('');
  const [aba, setAba] = useState<AbaPedidos>('todos');
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [tipoFiltro, setTipoFiltro] = useState<TipoPedido | 'todos'>('todos');
  const [origemFiltro, setOrigemFiltro] = useState<OrigemPedido | 'todas'>('todas');
  const [pedidoAbertoId, setPedidoAbertoId] = useState<string | null>(null);
  const [modalManualAberto, setModalManualAberto] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [novosIds, setNovosIds] = useState<Set<string>>(new Set());
  // Só o botão "Atualizar" usa este estado: as recargas automáticas não
  // devem piscar indicador de carregamento na tela da operação.
  const [atualizando, setAtualizando] = useState(false);

  // Ids já vistos, pra distinguir "pedido que acabou de chegar" de "pedido
  // que só mudou de status" — só o primeiro caso ganha o destaque visual.
  // Semeado com a lista inicial pra não marcar tudo como novo no 1º render.
  const idsConhecidosRef = useRef<Set<string>>(new Set(pedidosIniciais.map((p) => p.id)));

  // null no primeiro render pra servidor e cliente concordarem; depois
  // tica sozinho, mantendo "ha X min" vivo entre um fetch e outro.
  const agora = useAgora();

  function mostrarMsg(texto: string, tipo: 'ok' | 'erro' = 'erro') {
    setMsg({ tipo, texto });
    if (tipo === 'ok') setTimeout(() => setMsg(null), 3500);
  }

  // Evita duas requisições de recarga concorrentes — o realtime pode
  // disparar várias mudanças em rajada (pedido novo + item + opções, tudo
  // no mesmo INSERT em cascata) e cada uma pediria um recarregar() próprio.
  const carregandoRef = useRef(false);

  const recarregar = useCallback(async () => {
    if (carregandoRef.current) return;
    carregandoRef.current = true;
    try {
      const sb = criarClientNavegador();
      const lista = await buscarPedidos(sb, lojaId);
      const conhecidos = idsConhecidosRef.current;
      const chegaram = lista.filter((p) => !conhecidos.has(p.id)).map((p) => p.id);
      lista.forEach((p) => conhecidos.add(p.id));
      if (chegaram.length > 0) {
        setNovosIds((atual) => new Set([...atual, ...chegaram]));
        setTimeout(() => {
          setNovosIds((atual) => {
            const copia = new Set(atual);
            chegaram.forEach((id) => copia.delete(id));
            return copia;
          });
        }, 4000);
      }
      setPedidos(lista);
    } catch (err) {
      mostrarMsg('Erro ao atualizar pedidos: ' + (err as Error).message);
    } finally {
      carregandoRef.current = false;
    }
  }, [lojaId]);

  // Sem isso, um pedido novo do cardápio só apareceria depois de um F5 —
  // numa cozinha corrida, isso é pedido perdido. Fica como rede de
  // segurança mesmo com Realtime ligado: se o WebSocket cair, o polling
  // continua trazendo pedido novo em até 20s. Pausa quando a aba está em
  // segundo plano pra não gastar cota com quem nem está olhando a tela.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') recarregar();
    }, INTERVALO_ATUALIZACAO_MS);
    return () => clearInterval(id);
  }, [recarregar]);

  // O polling acima pula enquanto a aba está escondida, e nada corria atrás
  // do atraso na volta: quem trocava de aba e voltava via a lista velha até
  // o próximo tique — ou até um F5, que era o sintoma relatado. Voltar pra
  // aba e recuperar a rede sincronizam na hora, sem encurtar o intervalo.
  useEffect(() => {
    const sincronizar = () => {
      if (document.visibilityState === 'visible') recarregar();
    };
    document.addEventListener('visibilitychange', sincronizar);
    window.addEventListener('online', sincronizar);
    return () => {
      document.removeEventListener('visibilitychange', sincronizar);
      window.removeEventListener('online', sincronizar);
    };
  }, [recarregar]);

  // Realtime: qualquer INSERT/UPDATE em `pedidos` desta loja invalida a
  // lista. A autorização continua sendo a RLS de "pedidos_select_dono" —
  // o evento só avisa que algo mudou, não manda o payload como verdade;
  // quem decide o que a tela mostra é sempre o recarregar() (SELECT com
  // RLS), nunca o conteúdo bruto do evento do Postgres.
  useEffect(() => {
    const sb = criarClientNavegador();
    let pausa: ReturnType<typeof setTimeout> | null = null;
    const canal = sb
      .channel(`pedidos-loja-${lojaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos', filter: `loja_id=eq.${lojaId}` },
        () => {
          // Debounce curto: uma rajada de eventos vira uma única recarga.
          if (pausa) clearTimeout(pausa);
          pausa = setTimeout(recarregar, 400);
        }
      )
      // Sem observar o status, uma queda do WebSocket passava despercebida e
      // a tela ficava dependendo só do polling. Todo (re)ingresso no canal
      // puxa a lista, cobrindo o que tenha entrado enquanto estava fora.
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') recarregar();
      });

    return () => {
      if (pausa) clearTimeout(pausa);
      sb.removeChannel(canal);
    };
  }, [lojaId, recarregar]);

  const imagensPorProduto = useMemo(
    () => new Map(produtos.map((produto) => [produto.id, produto.imagem_url])),
    [produtos]
  );
  const pedidosParaExibir = useMemo(
    () => pedidos.map((pedido) => ({
      ...pedido,
      pedido_itens: pedido.pedido_itens.map((item) => ({
        ...item,
        produto: { imagem_url: item.produto_id ? imagensPorProduto.get(item.produto_id) || null : null },
      })),
    })),
    [imagensPorProduto, pedidos]
  );
  const termo = busca.trim().toLowerCase();
  const termoNumerico = termo.replace(/\D/g, '');
  const ativos = pedidosParaExibir.filter((pedido) => STATUS_ATIVOS.includes(pedido.status));
  const emPreparo = ativos.filter((pedido) => ['pendente', 'confirmado', 'em_preparo'].includes(pedido.status));
  const prontos = ativos.filter((pedido) => pedido.status === 'pronto' && pedido.tipo !== 'delivery');
  const emEntrega = ativos.filter((pedido) => pedido.status === 'pronto' && pedido.tipo === 'delivery');
  const atrasados = agora ? emPreparo.filter((pedido) => minutosAteOPrazo(pedido, agora) < 0) : [];

  const listaFiltrada = useMemo(() => {
    const daAba = ativos.filter((pedido) => {
      if (aba === 'preparo') return ['pendente', 'confirmado', 'em_preparo'].includes(pedido.status);
      if (aba === 'prontos') return pedido.status === 'pronto' && pedido.tipo !== 'delivery';
      if (aba === 'entrega') return pedido.status === 'pronto' && pedido.tipo === 'delivery';
      if (aba === 'atrasados') {
        return ['pendente', 'confirmado', 'em_preparo'].includes(pedido.status)
          && Boolean(agora && minutosAteOPrazo(pedido, agora) < 0);
      }
      return true;
    });

    return ordenarPorUrgencia(
      daAba.filter((pedido) => {
        const correspondeBusca = !termo
          || pedido.cliente_nome.toLowerCase().includes(termo)
          || (termoNumerico.length > 0 && pedido.cliente_telefone.replace(/\D/g, '').includes(termoNumerico))
          || String(pedido.numero).includes(termo.replace(/^#?0*/, ''))
          || numeroPedido(pedido.numero).includes(termo);
        const correspondeTipo = tipoFiltro === 'todos' || pedido.tipo === tipoFiltro;
        const correspondeOrigem = origemFiltro === 'todas' || pedido.origem === origemFiltro;
        return correspondeBusca && correspondeTipo && correspondeOrigem;
      })
    );
  }, [aba, agora, ativos, origemFiltro, termo, termoNumerico, tipoFiltro]);

  const pedidoAberto = pedidosParaExibir.find((p) => p.id === pedidoAbertoId) || null;

  // Sincronização manual: rede oscilando, Realtime caído ou simplesmente a
  // vontade de conferir. Busca só a lista de pedidos — nada de recarregar a
  // página, e o indicador fica no próprio botão.
  async function atualizarAgora() {
    setAtualizando(true);
    try {
      await recarregar();
    } finally {
      setAtualizando(false);
    }
  }

  async function avancarRapido(p: PedidoResumo) {
    const proximo = proximoStatus(p);
    if (!proximo) return;
    try {
      const sb = criarClientNavegador();
      await avancarStatus(sb, p.id, p.status, proximo);
      await recarregar();
    } catch (err) {
      // Conflito não é falha: outra aba já mexeu. Recarrega e mostra o
      // estado real em vez de deixar o operador achar que o clique falhou.
      if (err instanceof ConflitoDePedido) {
        mostrarMsg(err.message);
        await recarregar();
        return;
      }
      mostrarMsg('Erro ao avançar status: ' + (err as Error).message);
    }
  }

  return (
    <div className="area ativo pedidos-area">
      {msg && <div className={'msg msg-' + msg.tipo}>{msg.texto}</div>}

      <div className="pedidos-metricas">
        <article className="pedidos-metrica-card">
          <strong>{ativos.length}</strong><span>Total de pedidos</span><small>Na operação</small>
        </article>
        <article className="pedidos-metrica-card preparo">
          <strong>{emPreparo.length}</strong><span>Em preparo</span><small>Agora</small>
        </article>
        <article className="pedidos-metrica-card prontos">
          <strong>{prontos.length}</strong><span>Prontos</span><small>Agora</small>
        </article>
        <article className="pedidos-metrica-card entrega">
          <strong>{emEntrega.length}</strong><span>Entrega</span><small>Aguardando saída</small>
        </article>
        <article className={'pedidos-metrica-card atrasados' + (atrasados.length ? ' tem-alerta' : '')}>
          <strong>{atrasados.length}</strong><span>Atrasados</span><small>{atrasados.length ? 'Atenção' : 'Tudo em dia'}</small>
        </article>
      </div>

      <div className="pedidos-topo">
        <div className="cat-busca pedidos-busca">
          <IconeBusca />
          <input
            type="text"
            placeholder="Buscar por cliente, telefone ou nº do pedido..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <button
          type="button"
          className={'btn-ghost btn-small pedidos-botao-filtro' + (filtrosAbertos ? ' ativo' : '')}
          onClick={() => setFiltrosAbertos((valor) => !valor)}
          aria-expanded={filtrosAbertos}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          Filtros
        </button>
        <button
          type="button"
          className="btn-ghost btn-small pedidos-atualizar"
          onClick={atualizarAgora}
          disabled={atualizando}
          title="Buscar os pedidos novamente"
          aria-label={atualizando ? 'Atualizando pedidos' : 'Atualizar pedidos'}
        >
          <span aria-hidden="true">↻</span>
        </button>
        <button type="button" className="btn-primary btn-small pedidos-novo" onClick={() => setModalManualAberto(true)}>
          <span aria-hidden="true">＋</span> Novo pedido
        </button>
      </div>

      {filtrosAbertos && (
        <div className="pedidos-filtros">
          <label>
            Tipo do pedido
            <select value={tipoFiltro} onChange={(evento) => setTipoFiltro(evento.target.value as TipoPedido | 'todos')}>
              <option value="todos">Todos</option>
              {Object.entries(NOMES_TIPO).map(([valor, nome]) => <option key={valor} value={valor}>{nome}</option>)}
            </select>
          </label>
          <label>
            Origem
            <select value={origemFiltro} onChange={(evento) => setOrigemFiltro(evento.target.value as OrigemPedido | 'todas')}>
              <option value="todas">Todas</option>
              {Object.entries(NOMES_ORIGEM).map(([valor, nome]) => <option key={valor} value={valor}>{nome}</option>)}
            </select>
          </label>
          <button type="button" className="btn-ghost btn-small" onClick={() => { setTipoFiltro('todos'); setOrigemFiltro('todas'); }}>
            Limpar filtros
          </button>
        </div>
      )}

      <div className={'pedidos-split' + (pedidoAberto ? ' com-painel' : '')}>
        <section className="pedidos-listagem">
          <nav className="pedidos-abas" aria-label="Filtrar pedidos por situação">
            {([
              ['todos', 'Todos', ativos.length],
              ['preparo', 'Em preparo', emPreparo.length],
              ['prontos', 'Prontos', prontos.length],
              ['entrega', 'Entrega', emEntrega.length],
              ['atrasados', 'Atrasados', atrasados.length],
            ] as const).map(([id, nome, quantidade]) => (
              <button type="button" key={id} className={aba === id ? 'ativo' : ''} onClick={() => setAba(id)}>
                {nome} <span>{quantidade}</span>
              </button>
            ))}
          </nav>

          <div className="pedidos-tabela" role="table" aria-label="Pedidos da operação">
            <div className="pedido-tabela-cabecalho" role="row">
              <span>Pedido</span><span>Cliente</span><span>Tipo</span><span>Pagamento</span><span>Status</span><span>Tempo</span><span>Total</span><span />
            </div>
            <div className="pedido-tabela-corpo">
              {listaFiltrada.length ? listaFiltrada.map((pedido) => (
                <LinhaPedido
                  key={pedido.id}
                  pedido={pedido}
                  selecionado={pedido.id === pedidoAbertoId}
                  novo={novosIds.has(pedido.id)}
                  agora={agora}
                  onAbrir={() => setPedidoAbertoId(pedido.id)}
                />
              )) : <p className="pedidos-vazio">Nenhum pedido encontrado neste filtro.</p>}
            </div>
          </div>

          <div className="pedidos-mobile-colunas">
            {COLUNAS_MOBILE.map((coluna) => {
              const lista = listaFiltrada.filter((pedido) => coluna.statuses.includes(pedido.status));
              return (
                <div key={coluna.id} className="pedidos-coluna">
                  <div className="pedidos-coluna-topo">
                    <span>{coluna.titulo}</span>
                    <span className="pedidos-coluna-contagem">{lista.length}</span>
                  </div>
                  {lista.length ? (
                    <div className="pedidos-lista">
                      {lista.map((pedido) => (
                        <CardPedido
                          key={pedido.id}
                          pedido={pedido}
                          selecionado={pedido.id === pedidoAbertoId}
                          novo={novosIds.has(pedido.id)}
                          agora={agora}
                          onAbrir={() => setPedidoAbertoId(pedido.id)}
                          onAvancarRapido={() => avancarRapido(pedido)}
                        />
                      ))}
                    </div>
                  ) : <p className="pedidos-vazio">Nenhum pedido nesta etapa.</p>}
                </div>
              );
            })}
          </div>

          <Link href={`/painel/${lojaSlug}/pedidos/historico`} className="pedidos-ver-todos">
            Ver todos os pedidos <span aria-hidden="true">⌄</span>
          </Link>
        </section>

        {pedidoAberto ? (
          <PainelDetalhePedido
            pedido={pedidoAberto}
            agora={agora}
            onFechar={() => setPedidoAbertoId(null)}
            onAtualizado={recarregar}
            onErro={(m) => mostrarMsg(m, 'erro')}
          />
        ) : (
          <aside className="pedido-painel pedido-painel-vazio">
            <p>Selecione um pedido para ver os detalhes.</p>
          </aside>
        )}
      </div>

      {modalManualAberto && (
        <NovoPedidoPainel
          lojaSlug={lojaSlug}
          categorias={categorias}
          produtos={produtos}
          onFechar={() => setModalManualAberto(false)}
          onErro={(m) => mostrarMsg(m, 'erro')}
          onCriado={async (numero) => {
            mostrarMsg(`Pedido #${numero} criado.`, 'ok');
            await recarregar();
          }}
        />
      )}
    </div>
  );
}
