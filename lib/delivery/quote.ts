import type {
  ConfiguracaoCalculoDelivery,
  Coordenadas,
  EnderecoDelivery,
  ItemDeliveryEntrada,
} from './tipos';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ErroCalculoDelivery extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErroCalculoDelivery';
  }
}

function inteiroPositivo(valor: unknown) {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1 || numero > 99) {
    throw new ErroCalculoDelivery('Quantidade inválida.');
  }
  return numero;
}

export function validarItensDelivery(valor: unknown): ItemDeliveryEntrada[] {
  if (!Array.isArray(valor) || valor.length === 0) {
    throw new ErroCalculoDelivery('O pedido está vazio.');
  }
  if (valor.length > 100) throw new ErroCalculoDelivery('Pedido com itens demais.');

  return valor.map((bruto) => {
    if (!bruto || typeof bruto !== 'object') throw new ErroCalculoDelivery('Item inválido.');
    const item = bruto as Record<string, unknown>;
    const produtoId = String(item.produtoId ?? '');
    if (!UUID_RE.test(produtoId)) throw new ErroCalculoDelivery('Item inválido.');

    const observacaoLimpa = String(item.observacao ?? '').trim();
    if (observacaoLimpa.length > 300) throw new ErroCalculoDelivery('Observação inválida.');
    const complementosBrutos = Array.isArray(item.complementos) ? item.complementos : [];
    if (complementosBrutos.length > 50) throw new ErroCalculoDelivery('Complementos demais.');

    return {
      produtoId,
      quantidade: inteiroPositivo(item.quantidade),
      observacao: observacaoLimpa || undefined,
      complementos: complementosBrutos.map((brutoComplemento) => {
        if (!brutoComplemento || typeof brutoComplemento !== 'object') {
          throw new ErroCalculoDelivery('Complemento inválido.');
        }
        const complemento = brutoComplemento as Record<string, unknown>;
        const complementoId = String(complemento.complementoId ?? '');
        if (!UUID_RE.test(complementoId)) throw new ErroCalculoDelivery('Complemento inválido.');
        return { complementoId, quantidade: inteiroPositivo(complemento.quantidade ?? 1) };
      }),
    };
  });
}

export function itensDeliveryParaRpc(itens: ItemDeliveryEntrada[]) {
  return itens.map((item) => ({
    produto_id: item.produtoId,
    quantidade: item.quantidade,
    observacao: item.observacao ?? null,
    opcoes: (item.complementos ?? []).map((complemento) => ({
      complemento_id: complemento.complementoId,
      quantidade: complemento.quantidade,
    })),
  }));
}

function centavosValidos(valor: number | null): valor is number {
  return valor !== null && Number.isInteger(valor) && valor >= 0;
}

export function entregaEhGratis(
  subtotalCentavos: number,
  limiteGratisCentavos: number | null,
) {
  return centavosValidos(limiteGratisCentavos) && subtotalCentavos >= limiteGratisCentavos;
}

export function calcularTaxaSemRota(
  configuracao: ConfiguracaoCalculoDelivery,
  subtotalCentavos: number,
): number | null {
  if (!Number.isInteger(subtotalCentavos) || subtotalCentavos < 0) {
    throw new ErroCalculoDelivery('Subtotal inválido.');
  }
  if (entregaEhGratis(subtotalCentavos, configuracao.freeDeliveryThresholdCents)) return 0;
  if (configuracao.feeMode !== 'FIXED') return null;
  if (!centavosValidos(configuracao.fixedFeeCents)) {
    throw new ErroCalculoDelivery('Taxa fixa não configurada.');
  }
  return configuracao.fixedFeeCents;
}

export function calcularTaxaPorKm(distanciaMetros: number, valorPorKmCentavos: number | null) {
  if (!Number.isInteger(distanciaMetros) || distanciaMetros < 0 ||
      !centavosValidos(valorPorKmCentavos)) {
    throw new ErroCalculoDelivery('Taxa por KM não configurada.');
  }
  return Math.round(distanciaMetros * valorPorKmCentavos / 1_000);
}

export async function calcularCotacaoDelivery({
  endereco,
  configuracao,
  subtotalCentavos,
  origem,
  geocodificar,
  rotear,
}: {
  endereco: EnderecoDelivery;
  configuracao: ConfiguracaoCalculoDelivery;
  subtotalCentavos: number;
  origem: Coordenadas | null;
  geocodificar: (endereco: EnderecoDelivery) => Promise<Coordenadas>;
  rotear: (origem: Coordenadas, destino: Coordenadas) => Promise<number>;
}) {
  const destino = await geocodificar(endereco);
  const taxaSemRota = calcularTaxaSemRota(configuracao, subtotalCentavos);
  if (taxaSemRota !== null) {
    return { destino, distanciaMetros: null, taxaEntregaCentavos: taxaSemRota };
  }
  if (!origem) throw new ErroCalculoDelivery('Origem não configurada.');
  const distanciaMetros = await rotear(origem, destino);
  return {
    destino,
    distanciaMetros,
    taxaEntregaCentavos: calcularTaxaPorKm(distanciaMetros, configuracao.pricePerKmCents),
  };
}
