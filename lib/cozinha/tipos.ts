import type {
  OrigemPedido,
  StatusPedido,
  TipoPedido,
} from '../pedidos/tipos';

export const STATUS_FILA_COZINHA = [
  'confirmado',
  'em_preparo',
  'pronto',
] as const satisfies readonly StatusPedido[];

export type StatusFilaCozinha = (typeof STATUS_FILA_COZINHA)[number];

export type OpcaoItemCozinha = {
  id: string;
  grupo: string;
  nome: string;
  quantidade: number;
};

export type ItemCozinha = {
  id: string;
  nome: string;
  quantidade: number;
  observacao: string | null;
  opcoes: OpcaoItemCozinha[];
};

export type PedidoCozinha = {
  id: string;
  numero: number;
  cliente_nome: string;
  tipo: TipoPedido;
  endereco: string | null;
  observacao: string | null;
  status: StatusFilaCozinha;
  data_hora_agendada: string | null;
  origem: OrigemPedido;
  criado_em: string;
  itens: ItemCozinha[];
};

export type DestinoCozinha =
  | 'entrega'
  | 'retirada'
  | 'balcao'
  | 'salao';

export type InstrucaoDestino = {
  id: DestinoCozinha;
  rotulo: string;
  acaoAoFicarPronto: string;
  instrucao: string;
};

const DESTINOS: Record<DestinoCozinha, InstrucaoDestino> = {
  entrega: {
    id: 'entrega',
    rotulo: 'Entrega',
    acaoAoFicarPronto: 'Pedido pronto — enviar para entrega',
    instrucao: 'Encaminhar para a expedição de entrega.',
  },
  retirada: {
    id: 'retirada',
    rotulo: 'Retirada local',
    acaoAoFicarPronto: 'Pedido pronto — retirada local',
    instrucao: 'Aguardar a retirada do cliente no local.',
  },
  balcao: {
    id: 'balcao',
    rotulo: 'Balcão',
    acaoAoFicarPronto: 'Pedido pronto — enviar ao balcão',
    instrucao: 'Enviar o pedido para o balcão.',
  },
  salao: {
    id: 'salao',
    rotulo: 'Salão / mesa',
    acaoAoFicarPronto: 'Pedido pronto — enviar ao salão',
    instrucao: 'Enviar o pedido para o salão ou para a mesa.',
  },
};

/**
 * O canal que originou o pedido (site, Instagram, telefone) não define
 * onde ele será entregue. O encaminhamento da cozinha depende do tipo de
 * atendimento e, no caso de encomenda, da presença de endereço.
 */
export function destinoDoPedido(
  pedido: Pick<PedidoCozinha, 'tipo' | 'endereco'>
): InstrucaoDestino {
  if (
    pedido.tipo === 'delivery' ||
    (pedido.tipo === 'encomenda' && Boolean(pedido.endereco?.trim()))
  ) {
    return DESTINOS.entrega;
  }

  if (pedido.tipo === 'balcao') return DESTINOS.balcao;
  if (pedido.tipo === 'mesa') return DESTINOS.salao;
  return DESTINOS.retirada;
}

export type AcaoCozinha = {
  statusEsperado: StatusFilaCozinha;
  novoStatus: StatusFilaCozinha;
  rotulo: string;
};

/**
 * A Gestão confirma o pedido antes de enviá-lo à cozinha. Nesta tela,
 * receber significa começar o preparo. Marcar pronto não significa que o
 * entregador saiu ou que o cliente retirou; essas confirmações pertencem
 * às áreas de expedição/atendimento.
 */
export function acaoDisponivelNaCozinha(
  pedido: Pick<PedidoCozinha, 'status' | 'tipo' | 'endereco'>
): AcaoCozinha | null {
  if (pedido.status === 'confirmado') {
    return {
      statusEsperado: 'confirmado',
      novoStatus: 'em_preparo',
      rotulo: 'Receber pedido',
    };
  }

  if (pedido.status === 'em_preparo') {
    return {
      statusEsperado: 'em_preparo',
      novoStatus: 'pronto',
      rotulo: destinoDoPedido(pedido).acaoAoFicarPronto,
    };
  }

  return null;
}

/**
 * Contrato versionado esperado da RPC transicionar_pedido. Qualquer retorno
 * diferente de { ok: true, status: novoStatus } é falha; a interface nunca
 * deve anunciar sucesso por receber null, void ou um objeto inesperado.
 */
export function validarRespostaTransicaoCozinha(
  resposta: unknown,
  novoStatus: StatusFilaCozinha
) {
  if (
    resposta &&
    typeof resposta === 'object' &&
    !Array.isArray(resposta)
  ) {
    const valor = resposta as Record<string, unknown>;

    if (valor.ok === false) {
      throw new Error(
        typeof valor.message === 'string'
          ? valor.message
          : 'Este pedido já foi atualizado em outro dispositivo.'
      );
    }

    if (valor.ok === true && valor.status === novoStatus) return;
  }

  throw new Error(
    'A transição não retornou a confirmação esperada do servidor.'
  );
}

/**
 * Pronta-entrega usa a entrada na fila. Encomenda usa o horário combinado:
 * uma encomenda distante não pode ficar à frente de um pedido imediato,
 * enquanto uma encomenda atrasada deve subir para o começo.
 */
export function ordenarPorPrioridadeCozinha<
  T extends Pick<
    PedidoCozinha,
    'id' | 'tipo' | 'data_hora_agendada' | 'criado_em'
  >,
>(pedidos: T[]): T[] {
  const instanteOperacional = (pedido: T) => {
    const referencia =
      pedido.tipo === 'encomenda' && pedido.data_hora_agendada
        ? pedido.data_hora_agendada
        : pedido.criado_em;
    const valor = new Date(referencia).getTime();
    return Number.isFinite(valor) ? valor : Number.MAX_SAFE_INTEGER;
  };

  return [...pedidos].sort((a, b) => {
    const porPrazo = instanteOperacional(a) - instanteOperacional(b);
    if (porPrazo !== 0) return porPrazo;
    return a.id.localeCompare(b.id);
  });
}
