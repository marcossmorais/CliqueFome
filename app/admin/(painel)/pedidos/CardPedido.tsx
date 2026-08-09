import { nivelUrgencia, textoTempo } from '@/lib/pedidos/prioridade';
import { formatBRL, NOMES_ORIGEM, NOMES_TIPO, rotuloAvancar, type PedidoResumo } from '@/lib/pedidos/tipos';

/**
 * Card da coluna de pedidos. Layout vertical (e não em linha) porque as
 * colunas são estreitas: em linha, o botão de avançar atropelava o nome e
 * o preço assim que a tela apertava.
 */
export function CardPedido({
  pedido,
  selecionado,
  novo,
  agora,
  onAbrir,
  onAvancarRapido,
}: {
  pedido: PedidoResumo;
  selecionado: boolean;
  /** Acabou de chegar (poll/Realtime trouxe um id que a tela não tinha
   * visto ainda) — ganha destaque visual por alguns segundos. */
  novo?: boolean;
  /** null enquanto não hidratou — ver useAgora. */
  agora: Date | null;
  onAbrir: () => void;
  onAvancarRapido: () => void;
}) {
  const nivel = agora ? nivelUrgencia(pedido, agora) : 'verde';
  const rotulo = rotuloAvancar(pedido);
  const ativo = pedido.status !== 'concluido' && pedido.status !== 'cancelado';
  const qtdItens = pedido.pedido_itens?.length ?? 0;

  return (
    <div
      className={'pedido-card' + (selecionado ? ' selecionado' : '') + (novo ? ' novo' : '')}
      onClick={onAbrir}
    >
      <div className="pedido-card-linha1">
        <span className={'pedido-dot pedido-dot-' + nivel} title="Urgência" />
        <span className="pedido-numero">#{pedido.numero}</span>
        <span className="pedido-cliente">{pedido.cliente_nome}</span>
        <span className="pedido-total">{formatBRL(pedido.total)}</span>
      </div>

      <div className="pedido-card-linha2">
        <span className="pedido-chip">{NOMES_TIPO[pedido.tipo]}</span>
        {pedido.origem !== 'site' && <span className="pedido-chip">{NOMES_ORIGEM[pedido.origem]}</span>}
        <span className="pedido-card-tempo">
          {qtdItens} ite{qtdItens === 1 ? 'm' : 'ns'}
          {agora ? ' · ' + textoTempo(pedido, agora) : ''}
        </span>
      </div>

      {pedido.pagamento_status === 'pendente' && pedido.forma_pagamento && (
        <span className="pedido-pagamento-pendente">pagamento a receber</span>
      )}

      {ativo && rotulo && (
        <button
          type="button"
          className="btn-primary btn-small pedido-card-acao"
          onClick={(e) => {
            e.stopPropagation();
            onAvancarRapido();
          }}
        >
          {rotulo}
        </button>
      )}
    </div>
  );
}
