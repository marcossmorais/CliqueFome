import { nivelUrgencia, textoTempo } from '@/lib/pedidos/prioridade';
import { formatBRL, NOMES_ORIGEM, NOMES_TIPO, rotuloAvancar, type PedidoResumo } from '@/lib/pedidos/tipos';

export function CardPedido({
  pedido,
  selecionado,
  onAbrir,
  onAvancarRapido,
}: {
  pedido: PedidoResumo;
  selecionado: boolean;
  onAbrir: () => void;
  onAvancarRapido: () => void;
}) {
  const nivel = nivelUrgencia(pedido);
  const tempo = textoTempo(pedido);
  const rotulo = rotuloAvancar(pedido);
  const ativo = pedido.status !== 'concluido' && pedido.status !== 'cancelado';
  const qtdItens = pedido.pedido_itens?.length ?? 0;

  return (
    <div className={'pedido-card' + (selecionado ? ' selecionado' : '')} onClick={onAbrir}>
      <span className={'pedido-dot pedido-dot-' + nivel} title="Urgência" />
      <div className="pedido-card-corpo">
        <div className="pedido-card-topo">
          <span className="pedido-numero">#{pedido.numero}</span>
          <span className="pedido-cliente">{pedido.cliente_nome}</span>
          {pedido.origem !== 'site' && (
            <span className="tag tag-etiqueta">{NOMES_ORIGEM[pedido.origem]}</span>
          )}
        </div>
        <div className="pedido-card-meta">
          <span className="tag tag-inativo">{NOMES_TIPO[pedido.tipo]}</span>
          <span>
            {qtdItens} ite{qtdItens === 1 ? 'm' : 'ns'}
          </span>
          <span>{formatBRL(pedido.total)}</span>
          {pedido.pagamento_status === 'pendente' && pedido.forma_pagamento && (
            <span className="pedido-pagamento-pendente">pagamento pendente</span>
          )}
        </div>
        <div className="pedido-card-tempo">{tempo}</div>
      </div>
      {ativo && rotulo && (
        <button
          type="button"
          className="btn-primary btn-small"
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
