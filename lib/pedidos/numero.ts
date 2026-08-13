/**
 * Número operacional do pedido — o que a cozinha grita, o cliente confere e o
 * entregador procura.
 *
 * Ele reinicia a cada dia operacional (04:00, por loja), então é curto por
 * construção: quase sempre um a três dígitos. Os zeros à esquerda existem pra
 * dar largura constante na lista e na etiqueta; passando de 999 o número segue
 * natural, sem truncar nada.
 *
 * Não identifica um pedido: dois dias diferentes têm o seu #042. Quem
 * identifica é o `id` (uuid) no banco e o `token` na URL de acompanhamento —
 * e é por isso que este número nunca serve de autorização em API nenhuma.
 */
export function numeroPedido(numero: number) {
  return `#${String(numero).padStart(3, '0')}`;
}

/**
 * O mesmo número com data e hora ao lado: `#042 · 13/08/2026 · 19:37`.
 * Usado onde pedidos de dias diferentes aparecem juntos — no histórico o
 * número sozinho seria ambíguo.
 */
export function numeroPedidoComData(numero: number, criadoEm: string | Date) {
  const data = new Date(criadoEm);
  const dia = data.toLocaleDateString('pt-BR');
  const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${numeroPedido(numero)} · ${dia} · ${hora}`;
}
