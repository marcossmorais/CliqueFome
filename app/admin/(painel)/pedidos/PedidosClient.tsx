'use client';

import { useCallback, useEffect, useState } from 'react';
import { criarClientNavegador } from '@/lib/supabase/client';
import { avancarStatus, buscarPedidos } from '@/lib/pedidos/acoes';
import { ordenarPorUrgencia } from '@/lib/pedidos/prioridade';
import { proximoStatus, type PedidoResumo, type StatusPedido } from '@/lib/pedidos/tipos';
import { CardPedido } from './CardPedido';
import { PainelDetalhePedido } from './PainelDetalhePedido';
import { ModalPedidoManual } from './ModalPedidoManual';
import type { ProdutoPicker } from './page';

type AbaId = 'pendente' | 'confirmado' | 'em_preparo' | 'pronto' | 'concluido' | 'cancelado';

// Cinco abas nomeadas como pedido, mais "Cancelados" no fim — sem tab pra
// ele o pedido cancelado não teria pra onde ir na tela, mas ele não some
// no meio das operacionais, fica por último e sem contagem em destaque.
// "Prontos" agrupa 'pronto' e 'saiu_entrega': da cozinha pra fora, os dois
// significam "já foi feito, só falta sair" — dentro da aba cada card
// continua avançando pelo status certo.
const ABAS: { id: AbaId; label: string; statuses: StatusPedido[] }[] = [
  { id: 'pendente', label: 'Pendentes', statuses: ['pendente'] },
  { id: 'confirmado', label: 'Confirmados', statuses: ['confirmado'] },
  { id: 'em_preparo', label: 'Em preparo', statuses: ['em_preparo'] },
  { id: 'pronto', label: 'Prontos', statuses: ['pronto', 'saiu_entrega'] },
  { id: 'concluido', label: 'Entregues/Retirados', statuses: ['concluido'] },
  { id: 'cancelado', label: 'Cancelados', statuses: ['cancelado'] },
];

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
  const [aba, setAba] = useState<AbaId>('pendente');
  const [pedidoAbertoId, setPedidoAbertoId] = useState<string | null>(null);
  const [modalManualAberto, setModalManualAberto] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  function mostrarMsg(texto: string, tipo: 'ok' | 'erro' = 'erro') {
    setMsg({ tipo, texto });
    if (tipo === 'ok') setTimeout(() => setMsg(null), 3500);
  }

  const recarregar = useCallback(async () => {
    try {
      const sb = criarClientNavegador();
      const dados = await buscarPedidos(sb, lojaId);
      setPedidos(dados);
    } catch (err) {
      mostrarMsg('Erro ao atualizar pedidos: ' + (err as Error).message);
    }
  }, [lojaId]);

  // Atualização automática — sem isso, um pedido novo do cardápio público
  // só apareceria depois de um F5 manual, o que numa cozinha corrida
  // significa pedido perdido. Intervalo curto o bastante pra parecer
  // "ao vivo", longo o bastante pra não pesar.
  useEffect(() => {
    const id = setInterval(recarregar, INTERVALO_ATUALIZACAO_MS);
    return () => clearInterval(id);
  }, [recarregar]);

  const contagem = Object.fromEntries(
    ABAS.map((a) => [a.id, pedidos.filter((p) => a.statuses.includes(p.status)).length])
  ) as Record<AbaId, number>;

  const abaAtual = ABAS.find((a) => a.id === aba)!;
  const listaBruta = pedidos.filter((p) => abaAtual.statuses.includes(p.status));
  // Abas operacionais ordenam por urgência (o pedido pede); histórico
  // (concluído/cancelado) ordena por mais recente — urgência não importa
  // mais depois que o pedido saiu do fluxo.
  const lista =
    aba === 'concluido' || aba === 'cancelado'
      ? [...listaBruta].sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime())
      : ordenarPorUrgencia(listaBruta);

  const pedidoAberto = pedidos.find((p) => p.id === pedidoAbertoId) || null;

  async function avancarRapido(p: PedidoResumo) {
    const proximo = proximoStatus(p);
    if (!proximo) return;
    try {
      const sb = criarClientNavegador();
      await avancarStatus(sb, p.id, proximo);
      await recarregar();
    } catch (err) {
      mostrarMsg('Erro ao avançar status: ' + (err as Error).message);
    }
  }

  return (
    <div className="area ativo">
      {msg && <div className={'msg msg-' + msg.tipo}>{msg.texto}</div>}

      <div className="cat-bar">
        <div className="cat-subtabs" style={{ flexWrap: 'wrap' }}>
          {ABAS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={'cat-subtab' + (aba === a.id ? ' ativo' : '')}
              onClick={() => setAba(a.id)}
            >
              {a.label} ({contagem[a.id] ?? 0})
            </button>
          ))}
        </div>
        <div className="cat-acoes">
          <button type="button" className="btn-primary btn-small" onClick={() => setModalManualAberto(true)}>
            + Pedido manual
          </button>
        </div>
      </div>

      {/* Lista à esquerda, detalhe fixo à direita — o detalhe não cobre a
          lista, então dá pra conferir um pedido sem perder de vista a fila.
          No mobile o painel vira drawer, porque as duas colunas não cabem. */}
      <div className={'pedidos-split' + (pedidoAberto ? ' com-painel' : '')}>
        <div className="pedidos-coluna">
          {lista.length === 0 ? (
            <div className="lista-vazia">Nenhum pedido nesta aba.</div>
          ) : (
            <div className="pedidos-lista">
              {lista.map((p) => (
                <CardPedido
                  key={p.id}
                  pedido={p}
                  selecionado={p.id === pedidoAbertoId}
                  onAbrir={() => setPedidoAbertoId(p.id)}
                  onAvancarRapido={() => avancarRapido(p)}
                />
              ))}
            </div>
          )}
        </div>

        {pedidoAberto ? (
          <PainelDetalhePedido
            pedido={pedidoAberto}
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
