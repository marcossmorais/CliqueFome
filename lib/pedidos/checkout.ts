// Contrato do checkout público — o que o navegador pode mandar, e a forma
// canônica que vira o hash de idempotência. Tudo aqui é lógica pura (sem
// Supabase, sem crypto de segredo) pra dar pra testar sem banco.

export type ItemCheckoutEntrada = {
  produtoId: string;
  quantidade: number;
  observacao?: string;
  complementos?: { complementoId: string; quantidade?: number }[];
};

export type PedidoCheckoutEntrada = {
  idempotencyKey: string;
  clienteNome: string;
  clienteTelefone: string;
  tipo: 'delivery' | 'retirada';
  endereco?: string;
  observacao?: string;
  itens: ItemCheckoutEntrada[];
  totalEsperadoCentavos: number;
  captchaToken?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ErroValidacaoCheckout extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErroValidacaoCheckout';
  }
}

/** Só dígitos, e só o tamanho de um telefone brasileiro com DDD (10 ou 11
 * dígitos). A máscara do navegador é só visual — o servidor nunca confia
 * nela, refaz a limpeza do zero. */
export function normalizarTelefone(valor: unknown): string {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  if (digitos.length < 10 || digitos.length > 11) {
    throw new ErroValidacaoCheckout('Informe um telefone válido com DDD.');
  }
  return digitos;
}

function texto(valor: unknown, min: number, max: number, campo: string): string {
  const limpo = String(valor ?? '').trim();
  if (limpo.length < min || limpo.length > max) {
    throw new ErroValidacaoCheckout(`Campo "${campo}" inválido.`);
  }
  return limpo;
}

function inteiroPositivo(valor: unknown, max: number, campo: string): number {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1 || n > max) {
    throw new ErroValidacaoCheckout(`Campo "${campo}" inválido.`);
  }
  return n;
}

/**
 * Lê o payload bruto do POST e devolve só o que é permitido existir —
 * qualquer propriedade a mais (loja_id, preço, total, status...) é
 * silenciosamente ignorada aqui porque nunca é lida; o servidor nunca
 * repassa `corpo` inteiro adiante, só os campos que esta função extraiu.
 */
export function validarEntradaCheckout(corpo: unknown): PedidoCheckoutEntrada {
  if (!corpo || typeof corpo !== 'object') {
    throw new ErroValidacaoCheckout('Dados inválidos.');
  }
  const c = corpo as Record<string, unknown>;

  const idempotencyKey = String(c.idempotencyKey ?? '');
  if (!UUID_RE.test(idempotencyKey)) {
    throw new ErroValidacaoCheckout('Identificador de repetição inválido.');
  }

  const clienteNome = texto(c.clienteNome, 2, 80, 'nome');
  const clienteTelefone = normalizarTelefone(c.clienteTelefone);

  const tipo = c.tipo === 'delivery' ? 'delivery' : c.tipo === 'retirada' ? 'retirada' : null;
  if (!tipo) throw new ErroValidacaoCheckout('Tipo de pedido inválido.');

  const endereco = tipo === 'delivery' ? texto(c.endereco, 5, 300, 'endereço') : undefined;
  const observacao =
    c.observacao != null && String(c.observacao).trim() ? texto(c.observacao, 1, 500, 'observação') : undefined;

  const itensBrutos = Array.isArray(c.itens) ? c.itens : [];
  if (itensBrutos.length === 0) throw new ErroValidacaoCheckout('O pedido está vazio.');
  if (itensBrutos.length > 100) throw new ErroValidacaoCheckout('Pedido com itens demais.');

  const itens: ItemCheckoutEntrada[] = itensBrutos.map((item) => {
    const i = item as Record<string, unknown>;
    const produtoId = String(i.produtoId ?? '');
    if (!UUID_RE.test(produtoId)) throw new ErroValidacaoCheckout('Item de pedido inválido.');
    const quantidade = inteiroPositivo(i.quantidade, 99, 'quantidade');
    const observacaoItem =
      i.observacao != null && String(i.observacao).trim() ? texto(i.observacao, 1, 300, 'observação do item') : undefined;

    const complementosBrutos = Array.isArray(i.complementos) ? i.complementos : [];
    if (complementosBrutos.length > 50) throw new ErroValidacaoCheckout('Complementos demais em um item.');
    const complementos = complementosBrutos.map((op) => {
      const o = op as Record<string, unknown>;
      const complementoId = String(o.complementoId ?? '');
      if (!UUID_RE.test(complementoId)) throw new ErroValidacaoCheckout('Complemento inválido.');
      return { complementoId, quantidade: inteiroPositivo(o.quantidade ?? 1, 99, 'quantidade do complemento') };
    });

    return { produtoId, quantidade, observacao: observacaoItem, complementos };
  });

  const totalEsperadoCentavos = Number(c.totalEsperadoCentavos);
  if (!Number.isInteger(totalEsperadoCentavos) || totalEsperadoCentavos < 0 || totalEsperadoCentavos > 100_000_00) {
    throw new ErroValidacaoCheckout('Total informado é inválido.');
  }

  const captchaToken = typeof c.captchaToken === 'string' ? c.captchaToken.slice(0, 4000) : undefined;

  return { idempotencyKey, clienteNome, clienteTelefone, tipo, endereco, observacao, itens, totalEsperadoCentavos, captchaToken };
}

/**
 * Forma canônica do pedido pra virar hash de idempotência — mesma
 * tentativa (mesmo idempotencyKey) só pode reusar a chave se o CONTEÚDO
 * bater. Ordena complementos e itens por id pra o hash não mudar só porque
 * o navegador reordenou o array num retry.
 */
export function payloadCanonico(entrada: PedidoCheckoutEntrada): string {
  const itensOrdenados = [...entrada.itens]
    .map((item) => ({
      produtoId: item.produtoId,
      quantidade: item.quantidade,
      observacao: item.observacao ?? null,
      complementos: [...(item.complementos ?? [])]
        .map((c) => ({ complementoId: c.complementoId, quantidade: c.quantidade ?? 1 }))
        .sort((a, b) => a.complementoId.localeCompare(b.complementoId)),
    }))
    .sort((a, b) => a.produtoId.localeCompare(b.produtoId) || (a.observacao ?? '').localeCompare(b.observacao ?? ''));

  return JSON.stringify({
    clienteNome: entrada.clienteNome,
    clienteTelefone: entrada.clienteTelefone,
    tipo: entrada.tipo,
    endereco: entrada.endereco ?? null,
    observacao: entrada.observacao ?? null,
    itens: itensOrdenados,
    totalEsperadoCentavos: entrada.totalEsperadoCentavos,
  });
}

/** Itens no formato que criar_pedido() espera: produto_id/opcoes em
 * snake_case, sem os campos extras do contrato HTTP. */
export function itensParaRpc(itens: ItemCheckoutEntrada[]) {
  return itens.map((item) => ({
    produto_id: item.produtoId,
    quantidade: item.quantidade,
    observacao: item.observacao ?? null,
    opcoes: (item.complementos ?? []).map((c) => ({
      complemento_id: c.complementoId,
      quantidade: c.quantidade ?? 1,
    })),
  }));
}
