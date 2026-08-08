export type TipoTaxaDelivery = 'fixa' | 'por_km';

/** 'facilitado' = uma taxa para a cidade da loja.
 *  'avancado'   = a cidade da loja mais cidades vizinhas, cada uma com a
 *                 sua taxa, escolhidas pelo cliente numa lista. */
export type SetorDelivery = 'facilitado' | 'avancado';

export type CidadeAtendida = { cidade: string; taxa: number };

export type ConfigDeliveryPublica = {
  configurada: boolean;
  tipoTaxa: TipoTaxaDelivery;
  setor: SetorDelivery;
  cidade: string | null;
  /** Só vem preenchida no modo avançado. */
  cidades: CidadeAtendida[];
};

export function normalizarSetor(valor: unknown): SetorDelivery {
  return valor === 'avancado' ? 'avancado' : 'facilitado';
}

export type CotacaoDelivery = {
  taxa: number;
  distanciaKm: number | null;
  enderecoFormatado: string;
  expiraEm: string;
  token: string;
};

export function normalizarTipoTaxa(valor: unknown): TipoTaxaDelivery {
  return valor === 'por_km' ? 'por_km' : 'fixa';
}

export function calcularTaxaPorDistancia(distanciaMetros: number, valorPorKm: number) {
  if (!Number.isFinite(distanciaMetros) || distanciaMetros < 0) throw new Error('DISTANCIA_INVALIDA');
  if (!Number.isFinite(valorPorKm) || valorPorKm < 0) throw new Error('VALOR_KM_INVALIDO');
  return Math.round((distanciaMetros / 1000) * valorPorKm * 100) / 100;
}

export function validarLimitesDaCotacao({
  distanciaMetros,
  taxa,
  distanciaMaximaKm,
  taxaMaxima,
}: {
  distanciaMetros: number | null;
  taxa: number;
  distanciaMaximaKm: number;
  taxaMaxima: number;
}) {
  if (!Number.isFinite(taxa) || taxa < 0) return 'TAXA_INVALIDA' as const;
  if (taxa > taxaMaxima) return 'TAXA_ACIMA_LIMITE' as const;
  if (distanciaMetros != null && distanciaMetros / 1000 > distanciaMaximaKm) {
    return 'FORA_DA_AREA' as const;
  }
  return null;
}

export function normalizarTexto(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
