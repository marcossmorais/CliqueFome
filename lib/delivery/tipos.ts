/** 'fixa_mais_km' = taxa base cobrada sempre + valor por km rodado. */
export type TipoTaxaDelivery = 'fixa' | 'por_km' | 'fixa_mais_km';

/** 'facilitado' = uma taxa para a cidade da loja.
 *  'avancado'   = a cidade da loja mais cidades vizinhas, cada uma com a
 *                 sua taxa, escolhidas pelo cliente numa lista. */
export type SetorDelivery = 'facilitado' | 'avancado';

export type CidadeAtendida = { cidade: string; taxa: number };

export type EnderecoEstruturado = {
  cep: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  complemento?: string;
  referencia?: string;
};

export const ENDERECO_VAZIO: EnderecoEstruturado = {
  cep: '', logradouro: '', numero: '', bairro: '', cidade: '', uf: '', complemento: '', referencia: '',
};

export function formatarCep(valor: string) {
  const digitos = valor.replace(/\D/g, '').slice(0, 8);
  return digitos.length > 5 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
}

export function enderecoEmLinha(endereco: EnderecoEstruturado) {
  return [
    `${endereco.logradouro.trim()}, ${endereco.numero.trim()}`,
    endereco.bairro.trim(),
    endereco.complemento?.trim(),
    `${endereco.cidade.trim()} - ${endereco.uf.trim().toUpperCase()}`,
    `CEP ${formatarCep(endereco.cep)}`,
    endereco.referencia?.trim() ? `Referência: ${endereco.referencia.trim()}` : '',
  ].filter(Boolean).join(', ');
}

export function enderecoEstruturadoValido(endereco: EnderecoEstruturado) {
  return (
    endereco.cep.replace(/\D/g, '').length === 8 &&
    endereco.logradouro.trim().length >= 3 && endereco.logradouro.length <= 120 &&
    endereco.numero.trim().length >= 1 && endereco.numero.length <= 20 &&
    endereco.bairro.trim().length >= 2 && endereco.bairro.length <= 80 &&
    endereco.cidade.trim().length >= 2 && endereco.cidade.length <= 100 &&
    /^[A-Za-z]{2}$/.test(endereco.uf.trim()) &&
    (endereco.complemento?.length ?? 0) <= 100 &&
    (endereco.referencia?.length ?? 0) <= 120
  );
}

export type ConfigDeliveryPublica = {
  configurada: boolean;
  tipoTaxa: TipoTaxaDelivery;
  setor: SetorDelivery;
  cidade: string | null;
  enderecoRetirada: string | null;
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
  if (valor === 'por_km') return 'por_km';
  if (valor === 'fixa_mais_km') return 'fixa_mais_km';
  return 'fixa';
}

/** Traduz pro vocabulário da tabela v3, que é quem a cotação lê. */
export function paraCalculationType(tipo: TipoTaxaDelivery) {
  if (tipo === 'por_km') return 'PER_KM' as const;
  if (tipo === 'fixa_mais_km') return 'FIXED_PLUS_KM' as const;
  return 'FIXED' as const;
}

/** As duas modalidades que precisam de rota — e portanto de coordenada da loja. */
export function dependeDeRota(tipo: TipoTaxaDelivery) {
  return tipo === 'por_km' || tipo === 'fixa_mais_km';
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
