'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { criarClientNavegador } from '@/lib/supabase/client';
import { ConflitoDePedido, avancarStatus, buscarPedidos } from '@/lib/pedidos/acoes';
import { minutosAteOPrazo, ordenarPorUrgencia } from '@/lib/pedidos/prioridade';
import { proximoStatus, type PedidoResumo, type StatusPedido } from '@/lib/pedidos/tipos';
import { useAgora } from '@/hooks/useAgora';
import { IconeBusca } from '@/components/admin/IconesCatalogo';
import { CardPedido } from './CardPedido';
import { PainelDetalhePedido } from './PainelDetalhePedido';
import { ModalPedidoManual } from './ModalPedidoManual';
import type { ProdutoPicker } from './page';

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
  produtos,
}: {
  lojaId: string;
  lojaSlug: string;
  pedidosIniciais: PedidoResumo[];
  produtos: ProdutoPicker[];
}) {
  const [pedidos, setPedidos] = useState(pedidosIniciais);
  const [busca, setBusca] = useState('');
  const [verHistorico, setVerHistorico] = useState(false);
  const [pedidoAbertoId, setPedidoAbertoId] = useState<string | null>(null);
  const [modalManualAberto, setModalManualAberto] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  // null no primeiro render pra servidor e cliente concordarem; depois
  // tica sozinho, mantendo "ha X min" vivo entre um fetch e outro.
  const agora = useAgora();

  function mostrarMsg(texto: string, tipo: 'ok' | 'erro' = 'erro') {
    setMsg({ tipo, texto });
    if (tipo === 'ok') setTimeout(() => setMsg(null), 3500);
  }

  const recarregar = useCallback(async () => {
    try {
      const sb = criarClientNavegador();
      setPedidos(await buscarPedidos(sb, lojaId));
    } catch (err) {
      mostrarMsg('Erro ao atualizar pedidos: ' + (err as Error).message);
    }
  }, [lojaId]);

  // Sem isso, um pedido novo do cardápio só apareceria depois de um F5 —
  // numa cozinha corrida, isso é pedido perdido.
  useEffect(() => {
    const id = setInterval(recarregar, INTERVALO_ATUALIZACAO_MS);
    return () => clearInterval(id);
  }, [recarregar]);

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
        <ModalPedidoManual
          lojaSlug={lojaSlug}
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
