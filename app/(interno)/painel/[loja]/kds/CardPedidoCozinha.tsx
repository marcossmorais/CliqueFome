import {
  NOMES_ORIGEM,
  NOMES_STATUS,
  NOMES_TIPO,
} from '@/lib/pedidos/tipos';
import {
  acaoDisponivelNaCozinha,
  destinoDoPedido,
  type PedidoCozinha,
} from '@/lib/cozinha/tipos';
import styles from './cozinha.module.css';

export function CardPedidoCozinha({
  pedido,
  agora,
  salvando,
  outraAcaoEmCurso,
  onAcao,
}: {
  pedido: PedidoCozinha;
  agora: Date | null;
  salvando: boolean;
  outraAcaoEmCurso: boolean;
  onAcao: () => void;
}) {
  const acao = acaoDisponivelNaCozinha(pedido);
  const destino = destinoDoPedido(pedido);
  const tituloId = 'pedido-cozinha-' + pedido.id;

  return (
    <article className={styles.ticket} aria-labelledby={tituloId}>
      <div className={styles.ticketTopo}>
        <div>
          <span className={styles.numero} id={tituloId}>
            Pedido #{pedido.numero}
          </span>
          <span className={styles.tempo}>
            {textoTempo(pedido.criado_em, agora)}
          </span>
        </div>
        <span
          className={
            styles.estado +
            ' ' +
            styles['estado_' + pedido.status]
          }
        >
          {NOMES_STATUS[pedido.status]}
        </span>
      </div>

      <div className={styles.identificacao}>
        <strong>{pedido.cliente_nome}</strong>
        <div className={styles.chips}>
          <span>{NOMES_TIPO[pedido.tipo]}</span>
          <span>{NOMES_ORIGEM[pedido.origem]}</span>
          <span className={styles['destino_' + destino.id]}>
            {destino.rotulo}
          </span>
        </div>
      </div>

      {pedido.data_hora_agendada && (
        <p className={styles.agendamento}>
          Agendado para {formatarAgendamento(pedido.data_hora_agendada)}
        </p>
      )}

      <div className={styles.itens}>
        <h3>Itens</h3>
        {pedido.itens.length === 0 ? (
          <p className={styles.semItens}>
            Nenhum item foi retornado para este pedido.
          </p>
        ) : (
          <ul className={styles.listaItens}>
            {pedido.itens.map((item) => (
              <li key={item.id}>
                <div className={styles.itemPrincipal}>
                  <strong>{item.quantidade}×</strong>
                  <span>{item.nome}</span>
                </div>

                {item.opcoes.length > 0 && (
                  <ul className={styles.opcoes}>
                    {item.opcoes.map((opcao) => (
                      <li key={opcao.id}>
                        {opcao.quantidade > 1
                          ? opcao.quantidade + '× '
                          : ''}
                        {opcao.nome}
                        <span> · {opcao.grupo}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {item.observacao && (
                  <p className={styles.observacaoItem}>
                    <strong>Observação:</strong> {item.observacao}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {pedido.observacao && (
        <div className={styles.observacaoPedido}>
          <strong>Observação do pedido</strong>
          <p>{pedido.observacao}</p>
        </div>
      )}

      {pedido.status === 'pronto' && (
        <div className={styles.encaminhamento}>
          <strong>{destino.rotulo}</strong>
          <span>{destino.instrucao}</span>
        </div>
      )}

      {acao && (
        <button
          type="button"
          className={'btn-primary ' + styles.acao}
          disabled={salvando || outraAcaoEmCurso}
          onClick={onAcao}
        >
          {salvando ? 'Salvando...' : acao.rotulo}
        </button>
      )}
    </article>
  );
}

function textoTempo(criadoEm: string, agora: Date | null) {
  if (!agora) return 'Tempo calculando...';

  const minutos = Math.max(
    0,
    Math.round(
      (agora.getTime() - new Date(criadoEm).getTime()) / 60_000
    )
  );

  if (minutos < 1) return 'Agora';
  if (minutos < 60) return 'Há ' + minutos + ' min';

  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return 'Há ' + horas + 'h' + (resto ? ' ' + resto + 'min' : '');
}

function formatarAgendamento(valor: string) {
  return new Date(valor).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
