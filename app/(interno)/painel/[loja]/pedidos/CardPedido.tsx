import { nivelUrgencia, textoTempo } from '@/lib/pedidos/prioridade';
import { numeroPedido } from '@/lib/pedidos/numero';
import {
  COR_STATUS,
  formatBRL,
  ICONE_STATUS,
  NOMES_ORIGEM,
  NOMES_STATUS,
  NOMES_TIPO,
  rotuloAvancar,
  type PedidoResumo,
} from '@/lib/pedidos/tipos';

function IconeStatus({ status }: { status: PedidoResumo['status'] }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONE_STATUS[status]} />
    </svg>
  );
}

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
        <span className="pedido-numero">{numeroPedido(pedido.numero)}</span>
        <span className="pedido-cliente">{pedido.cliente_nome}</span>
        <span className="pedido-total">{formatBRL(pedido.total)}</span>
      </div>

      <div className="pedido-card-linha2">
        <span className="pedido-chip-status" style={{ ['--cor-status' as string]: COR_STATUS[pedido.status] }}>
          <IconeStatus status={pedido.status} />
          {NOMES_STATUS[pedido.status]}
        </span>
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
