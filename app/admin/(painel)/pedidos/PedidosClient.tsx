'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { criarClientNavegador } from '@/lib/supabase/client';
import { ConflitoDePedido, avancarStatus, buscarPedidos } from '@/lib/pedidos/acoes';
import { minutosAteOPrazo, ordenarPorUrgencia } from '@/lib/pedidos/prioridade';
import { proximoStatus, type PedidoResumo, type StatusPedido } from '@/lib/pedidos/tipos';
import { useAgora } from '@/hooks/useAgora';
import { IconeBusca } from '@/components/admin/IconesCatalogo';
import { CardPedido } from './CardPedido';
import { PainelDetalhePedido } from './PainelDetalhePedido';
import { NovoPedidoPainel } from './NovoPedidoPainel';
import type { CategoriaPublica, ProdutoPublico } from '@/lib/cardapio/tipos';

/**
 * Colunas fixas por status, como na referência — e não Kanban de arrastar:
 * numa cozinha corrida, arrastar é lento e erra fácil. O pedido anda pelo
 * botão do card ou do painel de detalhe.
 */
const COLUNAS: { id: string; titulo: string; statuses: StatusPedido[] }[] = [
  { id: 'andamento', titulo: 'Em andamento', statuses: ['pendente', 'confirmado', 'em_preparo'] },
  { id: 'prontos', titulo: 'Prontos / saindo', statuses: ['pronto', 'saiu_entrega'] },
];

// Aba separada pro histórico: concluído e cancelado não disputam espaço com
// a operação do momento, mas continuam acessíveis.
const HISTORICO: StatusPedido[] = ['concluido', 'cancelado'];

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
  const [verHistorico, setVerHistorico] = useState(false);
  const [pedidoAbertoId, setPedidoAbertoId] = useState<string | null>(null);
  const [modalManualAberto, setModalManualAberto] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [novosIds, setNovosIds] = useState<Set<string>>(new Set());

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
      .subscribe();

    return () => {
      if (pausa) clearTimeout(pausa);
      sb.removeChannel(canal);
    };
  }, [lojaId, recarregar]);

  const termo = busca.trim().toLowerCase();
  const filtrados = useMemo(
    () =>
      !termo
        ? pedidos
        : pedidos.filter(
            (p) =>
              p.cliente_nome.toLowerCase().includes(termo) ||
              String(p.numero).includes(termo)
          ),
    [pedidos, termo]
  );

  // Métricas da faixa superior: espera média de quem ainda está na fila.
  const emAndamento = pedidos.filter((p) => COLUNAS[0].statuses.includes(p.status));
  const prontos = pedidos.filter((p) => COLUNAS[1].statuses.includes(p.status));
  const esperaMedia = (lista: PedidoResumo[]) => {
    if (!agora || lista.length === 0) return 0;
    const soma = lista.reduce(
      (s, p) => s + Math.max(0, (agora.getTime() - new Date(p.criado_em).getTime()) / 60_000),
      0
    );
    return Math.round(soma / lista.length);
  };
  // Quantos já estouraram o prazo — é o número que decide se a cozinha está
  // no vermelho, mais útil que o total bruto.
  const atrasados = agora ? emAndamento.filter((p) => minutosAteOPrazo(p, agora) < 0).length : 0;

  const pedidoAberto = pedidos.find((p) => p.id === pedidoAbertoId) || null;

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

  const historico = ordenarPorUrgencia(filtrados.filter((p) => HISTORICO.includes(p.status)));


  return (
    <div className="area ativo">
      {msg && <div className={'msg msg-' + msg.tipo}>{msg.texto}</div>}

      <div className="pedidos-topo">
        <div className="cat-busca pedidos-busca">
          <IconeBusca />
          <input
            type="text"
            placeholder="Pesquise por cliente ou número do pedido"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <button type="button" className="btn-primary btn-small" onClick={() => setModalManualAberto(true)}>
          + Novo pedido
        </button>
        <button
          type="button"
          className={'btn-ghost btn-small' + (verHistorico ? ' ativo' : '')}
          onClick={() => setVerHistorico((v) => !v)}
        >
          {verHistorico ? 'Voltar à operação' : 'Histórico'}
        </button>
      </div>

      <div className="pedidos-metricas">
        <span className="metrica">
          <b>{esperaMedia(emAndamento)} min</b> espera média
        </span>
        <span className="metrica">
          <b>{prontos.length}</b> aguardando saída
        </span>
        {atrasados > 0 && (
          <span className="metrica metrica-alerta">
            <b>{atrasados}</b> fora do prazo
          </span>
        )}
      </div>

      <div className={'pedidos-split' + (pedidoAberto ? ' com-painel' : '')}>
        <div className="pedidos-colunas">
          {verHistorico ? (
            <div className="pedidos-coluna">
              <div className="pedidos-coluna-topo">
                <span>Histórico</span>
                <span className="pedidos-coluna-contagem">{historico.length}</span>
              </div>
              {historico.length === 0 ? (
                <p className="pedidos-vazio">Nenhum pedido no histórico.</p>
              ) : (
                <div className="pedidos-lista">
                  {historico.map((p) => (
                    <CardPedido
                      key={p.id}
                      pedido={p}
                      selecionado={p.id === pedidoAbertoId}
                      agora={agora}
                      onAbrir={() => setPedidoAbertoId(p.id)}
                      onAvancarRapido={() => avancarRapido(p)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            COLUNAS.map((coluna) => {
              const lista = ordenarPorUrgencia(
                filtrados.filter((p) => coluna.statuses.includes(p.status))
              );
              return (
                <div key={coluna.id} className="pedidos-coluna">
                  <div className="pedidos-coluna-topo">
                    <span>{coluna.titulo}</span>
                    <span className="pedidos-coluna-contagem">{lista.length}</span>
                  </div>
                  {lista.length === 0 ? (
                    <p className="pedidos-vazio">
                      {coluna.id === 'andamento'
                        ? 'Seus pedidos aparecerão aqui.'
                        : 'Nada pronto no momento.'}
                    </p>
                  ) : (
                    <div className="pedidos-lista">
                      {lista.map((p) => (
                        <CardPedido
                          key={p.id}
                          pedido={p}
                          selecionado={p.id === pedidoAbertoId}
                          novo={novosIds.has(p.id)}
                          agora={agora}
                          onAbrir={() => setPedidoAbertoId(p.id)}
                          onAvancarRapido={() => avancarRapido(p)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

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
            <p>Selecione um pedido pra ver os detalhes.</p>
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
