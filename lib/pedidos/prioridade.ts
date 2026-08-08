import type { PedidoResumo } from './tipos';

/**
 * Critério de urgência — mesmo raciocínio pra pronta-entrega e encomenda.
 *
 * Cada pedido tem um "prazo": pra pronta-entrega ele é implícito (o tempo
 * que uma cozinha considera razoável desde que o pedido caiu); pra
 * encomenda, é a data/hora combinada com o cliente. A urgência é sempre
 * "quanto tempo falta até esse prazo" — quem tem menos tempo sobrando
 * aparece primeiro. Isso resolve os dois casos do pedido original com uma
 * regra só:
 *   - Pronta-entrega parada há 10 min → prazo em ~20 min (SLA de 30 min).
 *   - Encomenda pra daqui a 2h → prazo em 2h → fica atrás do primeiro.
 *   - Encomenda pra daqui a 3 dias → prazo em 3 dias → não sobe pro topo
 *     antes da hora.
 *
 * O SLA de pronta-entrega é o único número "mágico" aqui — 30 min é uma
 * estimativa razoável de tempo de preparo+entrega pra delivery/lanchonete;
 * ajuste SLA_PRONTA_ENTREGA_MIN pro seu tipo de negócio.
 */
export const SLA_PRONTA_ENTREGA_MIN = 30;

/** Prazo (Date) desse pedido — pronta-entrega usa criado_em + SLA;
 * encomenda usa a data/hora combinada. */
export function calcularPrazo(p: PedidoResumo): Date {
  if (p.tipo === 'encomenda' && p.data_hora_agendada) {
    return new Date(p.data_hora_agendada);
  }
  const criado = new Date(p.criado_em);
  return new Date(criado.getTime() + SLA_PRONTA_ENTREGA_MIN * 60_000);
}

/** Minutos até o prazo (negativo = já passou do prazo). */
export function minutosAteOPrazo(p: PedidoResumo, agora: Date = new Date()): number {
  return (calcularPrazo(p).getTime() - agora.getTime()) / 60_000;
}

/** Ordena do mais urgente (menos tempo sobrando) pro menos urgente. */
export function ordenarPorUrgencia(pedidos: PedidoResumo[]): PedidoResumo[] {
  const agora = new Date();
  return [...pedidos].sort((a, b) => minutosAteOPrazo(a, agora) - minutosAteOPrazo(b, agora));
}

export type NivelUrgencia = 'verde' | 'amarelo' | 'vermelho';

/**
 * Cor do indicador. Limites diferentes pra pronta-entrega (minutos) e
 * encomenda (horas) — faz sentido um pedido de balcão ficar vermelho em
 * 30 min parado, mas uma encomenda só precisa ficar vermelha quando o
 * prazo já está em cima (pouca janela pra reagir a um atraso).
 */
export function nivelUrgencia(p: PedidoResumo, agora: Date = new Date()): NivelUrgencia {
  if (p.tipo === 'encomenda') {
    const restante = minutosAteOPrazo(p, agora);
    if (restante <= 30) return 'vermelho';
    if (restante <= 4 * 60) return 'amarelo';
    return 'verde';
  }

  // Pronta-entrega usa tempo DECORRIDO desde que o pedido caiu (não tempo
  // restante) — é assim que o negócio pensa em termos de espera do
  // cliente: "verde até 15 min, amarelo até 30 min, vermelho acima".
  const decorrido = (agora.getTime() - new Date(p.criado_em).getTime()) / 60_000;
  if (decorrido >= SLA_PRONTA_ENTREGA_MIN) return 'vermelho';
  if (decorrido >= SLA_PRONTA_ENTREGA_MIN - 15) return 'amarelo';
  return 'verde';
}

/** Texto curto do tempo — "há 12 min" (pronta-entrega) ou "em 2h" / "hoje
 * às 18:30" (encomenda), pro card não precisar de muito espaço. */
export function textoTempo(p: PedidoResumo, agora: Date = new Date()): string {
  if (p.tipo === 'encomenda' && p.data_hora_agendada) {
    const alvo = new Date(p.data_hora_agendada);
    const diffMin = (alvo.getTime() - agora.getTime()) / 60_000;
    const hoje = alvo.toDateString() === agora.toDateString();
    const hora = alvo.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (diffMin < 0) return `atrasada · era ${hora}`;
    if (hoje) return `hoje às ${hora}`;
    return `${alvo.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${hora}`;
  }

  const min = Math.round((agora.getTime() - new Date(p.criado_em).getTime()) / 60_000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return `há ${h}h${min % 60 ? ' ' + (min % 60) + 'min' : ''}`;
}
