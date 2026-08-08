'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAgora } from '@/hooks/useAgora';
import {
  buscarFilaCozinha,
  executarAcaoCozinha,
} from '@/lib/cozinha/acoes';
import {
  acaoDisponivelNaCozinha,
  destinoDoPedido,
  type PedidoCozinha,
} from '@/lib/cozinha/tipos';
import { criarClientNavegador } from '@/lib/supabase/client';
import { CardPedidoCozinha } from './CardPedidoCozinha';
import styles from './cozinha.module.css';

const INTERVALO_ATUALIZACAO_MS = 15_000;

type Mensagem = {
  tipo: 'ok' | 'erro';
  texto: string;
};

export function CozinhaClient({
  lojaId,
  pedidosIniciais,
}: {
  lojaId: string;
  pedidosIniciais: PedidoCozinha[];
}) {
  const [pedidos, setPedidos] = useState(pedidosIniciais);
  const [pedidoEmAcao, setPedidoEmAcao] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null);
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);
  const sequenciaRequisicao = useRef(0);
  const recargaEmAndamento = useRef<Promise<boolean> | null>(null);
  const acaoEmCurso = useRef(false);
  const agora = useAgora();

  const recarregar = useCallback(
    async ({
      silencioso = false,
      garantirNova = false,
    }: {
      silencioso?: boolean;
      garantirNova?: boolean;
    } = {}) => {
      const existente = recargaEmAndamento.current;
      if (existente) {
        const resultadoExistente = await existente;
        if (!garantirNova) return resultadoExistente;
      }

      const sequencia = ++sequenciaRequisicao.current;
      const tarefa = (async () => {
        setAtualizando(true);

        try {
          const sb = criarClientNavegador();
          const novaFila = await buscarFilaCozinha(sb, lojaId);

          if (sequencia === sequenciaRequisicao.current) {
            setPedidos(novaFila);
            setUltimaAtualizacao(new Date());
          }
          return true;
        } catch (error) {
          console.error('[cozinha] Falha ao atualizar a fila.', error);
          if (sequencia === sequenciaRequisicao.current && !silencioso) {
            setMensagem({
              tipo: 'erro',
              texto:
                'Não foi possível atualizar a fila. Os pedidos atuais foram mantidos. Tente novamente.',
            });
          }
          return false;
        } finally {
          if (sequencia === sequenciaRequisicao.current) {
            setAtualizando(false);
          }
        }
      })();

      recargaEmAndamento.current = tarefa;
      try {
        return await tarefa;
      } finally {
        if (recargaEmAndamento.current === tarefa) {
          recargaEmAndamento.current = null;
        }
      }
    },
    [lojaId]
  );

  useEffect(() => {
    const atualizarSeVisivel = () => {
      if (document.visibilityState === 'visible') void recarregar();
    };

    const intervalo = window.setInterval(
      atualizarSeVisivel,
      INTERVALO_ATUALIZACAO_MS
    );
    document.addEventListener('visibilitychange', atualizarSeVisivel);

    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', atualizarSeVisivel);
      sequenciaRequisicao.current += 1;
    };
  }, [recarregar]);

  const filas = useMemo(
    () => ({
      receber: pedidos.filter((pedido) => pedido.status === 'confirmado'),
      preparo: pedidos.filter((pedido) => pedido.status === 'em_preparo'),
      prontos: pedidos.filter((pedido) => pedido.status === 'pronto'),
    }),
    [pedidos]
  );

  async function executarAcao(pedido: PedidoCozinha) {
    const acao = acaoDisponivelNaCozinha(pedido);
    if (!acao || acaoEmCurso.current) return;

    acaoEmCurso.current = true;
    setPedidoEmAcao(pedido.id);
    setMensagem(null);

    try {
      const sb = criarClientNavegador();
      await executarAcaoCozinha(sb, pedido.id, acao);

      const atualizou = await recarregar({
        silencioso: true,
        garantirNova: true,
      });
      const complemento =
        acao.novoStatus === 'pronto'
          ? ' ' + destinoDoPedido(pedido).instrucao
          : ' O pedido está em preparo.';

      setMensagem({
        tipo: 'ok',
        texto:
          'Pedido #' +
          pedido.numero +
          ' atualizado.' +
          complemento +
          (atualizou ? '' : ' Atualize a fila para confirmar a posição.'),
      });
    } catch (error) {
      console.error(
        '[cozinha] Falha ao executar a ação do pedido.',
        error
      );
      void recarregar({ silencioso: true, garantirNova: true });
      setMensagem({
        tipo: 'erro',
        texto:
          'Não foi possível atualizar o pedido #' +
          pedido.numero +
          '. Ele pode ter sido alterado em outro dispositivo. Atualize a fila e tente novamente.',
      });
    } finally {
      acaoEmCurso.current = false;
      setPedidoEmAcao(null);
    }
  }

  const horarioAtualizacao = ultimaAtualizacao
    ? ultimaAtualizacao.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : 'dados iniciais';

  return (
    <div
      className={'area ativo ' + styles.root}
      aria-busy={atualizando}
    >
      <header className={styles.topo}>
        <div>
          <p className={styles.sobretitulo}>Fila operacional</p>
          <h2>Pedidos da cozinha</h2>
          <p className={styles.introducao}>
            Receba o pedido, acompanhe os itens e encaminhe quando estiver
            pronto.
          </p>
        </div>

        <div className={styles.atualizacao}>
          <span>Atualizado às {horarioAtualizacao}</span>
          <button
            type="button"
            className="btn-ghost btn-small"
            disabled={atualizando}
            onClick={() => void recarregar()}
          >
            {atualizando ? 'Atualizando...' : 'Atualizar fila'}
          </button>
        </div>
      </header>

      <div className={styles.metricas} aria-label="Resumo da cozinha">
        <div className={styles.metrica}>
          <strong>{filas.receber.length}</strong>
          <span>A receber</span>
        </div>
        <div className={styles.metrica}>
          <strong>{filas.preparo.length}</strong>
          <span>Em preparo</span>
        </div>
        <div className={styles.metrica}>
          <strong>{filas.prontos.length}</strong>
          <span>Prontos para saída</span>
        </div>
      </div>

      {mensagem && (
        <div
          className={
            styles.mensagem +
            ' ' +
            (mensagem.tipo === 'erro'
              ? styles.mensagemErro
              : styles.mensagemOk)
          }
          role={mensagem.tipo === 'erro' ? 'alert' : 'status'}
        >
          {mensagem.texto}
        </div>
      )}

      <div className={styles.quadro}>
        <FilaCozinha
          id="cozinha-receber"
          titulo="A receber"
          descricao="Pedidos confirmados aguardando a cozinha."
          vazio="Nenhum pedido aguardando recebimento."
          pedidos={filas.receber}
          agora={agora}
          pedidoEmAcao={pedidoEmAcao}
          onAcao={executarAcao}
        />
        <FilaCozinha
          id="cozinha-preparo"
          titulo="Em preparo"
          descricao="Pedidos que já foram recebidos pela equipe."
          vazio="Nenhum pedido em preparo."
          pedidos={filas.preparo}
          agora={agora}
          pedidoEmAcao={pedidoEmAcao}
          onAcao={executarAcao}
        />
        <FilaCozinha
          id="cozinha-prontos"
          titulo="Prontos para encaminhamento"
          descricao="Pedidos prontos aguardando o próximo destino."
          vazio="Nenhum pedido pronto no momento."
          pedidos={filas.prontos}
          agora={agora}
          pedidoEmAcao={pedidoEmAcao}
          onAcao={executarAcao}
        />
      </div>
    </div>
  );
}

function FilaCozinha({
  id,
  titulo,
  descricao,
  vazio,
  pedidos,
  agora,
  pedidoEmAcao,
  onAcao,
}: {
  id: string;
  titulo: string;
  descricao: string;
  vazio: string;
  pedidos: PedidoCozinha[];
  agora: Date | null;
  pedidoEmAcao: string | null;
  onAcao: (pedido: PedidoCozinha) => void;
}) {
  return (
    <section className={styles.fila} aria-labelledby={id}>
      <div className={styles.filaTopo}>
        <div>
          <h2 id={id}>{titulo}</h2>
          <p>{descricao}</p>
        </div>
        <span className={styles.contagem} aria-label={pedidos.length + ' pedidos'}>
          {pedidos.length}
        </span>
      </div>

      {pedidos.length === 0 ? (
        <p className={styles.vazio}>{vazio}</p>
      ) : (
        <div className={styles.lista}>
          {pedidos.map((pedido) => (
            <CardPedidoCozinha
              key={pedido.id}
              pedido={pedido}
              agora={agora}
              salvando={pedidoEmAcao === pedido.id}
              outraAcaoEmCurso={
                pedidoEmAcao !== null && pedidoEmAcao !== pedido.id
              }
              onAcao={() => onAcao(pedido)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
