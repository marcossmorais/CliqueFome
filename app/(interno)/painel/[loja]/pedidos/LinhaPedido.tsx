import Image from 'next/image';
import { textoTempo } from '@/lib/pedidos/prioridade';
import { numeroPedido } from '@/lib/pedidos/numero';
import { nomeFormaPagamento } from '@/lib/pedidos/pagamento';
import { IconeFormaPagamento } from '@/components/pedidos/IconeFormaPagamento';
import {
  COR_STATUS,
  formatBRL,
  NOMES_ORIGEM,
  NOMES_STATUS,
  NOMES_TIPO,
  type PedidoResumo,
} from '@/lib/pedidos/tipos';

function Icone({ tipo }: { tipo: 'tipo' | 'tempo' | 'avancar' }) {
  const paths = {
    tipo: 'M6 8h12l-1 12H7L6 8zM9 8V6a3 3 0 016 0v2',
    tempo: 'M12 21a9 9 0 110-18 9 9 0 010 18zM12 7v5l3 2',
    avancar: 'M9 18l6-6-6-6',
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[tipo]} />
    </svg>
  );
}

function Miniaturas({ pedido }: { pedido: PedidoResumo }) {
  const itens = pedido.pedido_itens.slice(0, 3);
  if (!itens.length) return null;

  return (
    <span className="pedido-tabela-miniaturas" aria-label={`${pedido.pedido_itens.length} itens no pedido`}>
      {itens.map((item) => (
        <span className="pedido-tabela-miniatura" key={item.id} title={item.nome}>
          {item.produto?.imagem_url ? (
            <Image src={item.produto.imagem_url} alt="" fill sizes="30px" />
          ) : (
            <span aria-hidden="true">{item.nome?.slice(0, 1).toUpperCase() || '•'}</span>
          )}
        </span>
      ))}
      {pedido.pedido_itens.length > 3 && <small>+{pedido.pedido_itens.length - 3}</small>}
    </span>
  );
}

export function LinhaPedido({
  pedido,
  selecionado,
  novo,
  agora,
  onAbrir,
}: {
  pedido: PedidoResumo;
  selecionado: boolean;
  novo?: boolean;
  agora: Date | null;
  onAbrir: () => void;
}) {
  const horario = new Date(pedido.criado_em).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <button
      type="button"
      className={'pedido-tabela-linha' + (selecionado ? ' selecionado' : '') + (novo ? ' novo' : '')}
      onClick={onAbrir}
      aria-label={`Abrir pedido ${numeroPedido(pedido.numero)} de ${pedido.cliente_nome}`}
    >
      <span className="pedido-tabela-pedido">
        <strong>{numeroPedido(pedido.numero)}</strong>
        <small>{horario}</small>
        <Miniaturas pedido={pedido} />
      </span>
      <span className="pedido-tabela-cliente">
        <strong>{pedido.cliente_nome}</strong>
        <small>{pedido.cliente_telefone}</small>
      </span>
      <span className="pedido-tabela-tipo">
        <span><Icone tipo="tipo" />{NOMES_TIPO[pedido.tipo]}</span>
        <small>{NOMES_ORIGEM[pedido.origem]}</small>
      </span>
      <span className="pedido-tabela-pagamento">
        <span>
          {pedido.forma_pagamento && <IconeFormaPagamento forma={pedido.forma_pagamento} />}
          {nomeFormaPagamento(pedido.forma_pagamento)}
        </span>
        {/* Só o que muda a conduta de quem opera: pago já era, pendente é
            dinheiro a receber na entrega/retirada. */}
        <small className={pedido.pagamento_status === 'confirmado' ? 'pago' : 'a-receber'}>
          {pedido.pagamento_status === 'confirmado' ? 'Pago' : 'A receber'}
        </small>
      </span>
      <span>
        <span className="pedido-chip-status" style={{ ['--cor-status' as string]: COR_STATUS[pedido.status] }}>
          {NOMES_STATUS[pedido.status]}
        </span>
      </span>
      <span className="pedido-tabela-tempo">
        <Icone tipo="tempo" />
        {agora ? textoTempo(pedido, agora) : '—'}
      </span>
      <strong className="pedido-tabela-total">{formatBRL(pedido.total)}</strong>
      <span className="pedido-tabela-seta"><Icone tipo="avancar" /></span>
    </button>
  );
}
