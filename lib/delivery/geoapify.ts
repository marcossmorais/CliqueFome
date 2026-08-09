const GEOCODING_URL = 'https://api.geoapify.com/v1/geocode/search';
const AUTOCOMPLETE_URL = 'https://api.geoapify.com/v1/geocode/autocomplete';
const ROUTING_URL = 'https://api.geoapify.com/v1/routing';

export type CodigoErroGeoapify =
  | 'ENDERECO_NAO_ENCONTRADO'
  | 'ENDERECO_IMPRECISO'
  | 'ROTA_NAO_ENCONTRADA'
  | 'CHAVE_AUSENTE'
  | 'CHAVE_RECUSADA'
  | 'LIMITE_ATINGIDO'
  | 'SERVICO_INDISPONIVEL';

export class ErroGeoapify extends Error {
  readonly codigo: CodigoErroGeoapify;

  constructor(codigo: CodigoErroGeoapify) {
    super(codigo);
    this.name = 'ErroGeoapify';
    this.codigo = codigo;
  }
}

export type EnderecoGeocodificado = {
  latitude: number;
  longitude: number;
  formatado: string;
  cidade: string | null;
  confianca: number;
};

function chaveGeoapify() {
  const chave = process.env.GEOAPIFY_API_KEY?.trim();
  if (!chave) throw new ErroGeoapify('CHAVE_AUSENTE');
  return chave;
}

function validarResposta(resposta: Response) {
  if (resposta.ok) return;
  if (resposta.status === 401 || resposta.status === 403) throw new ErroGeoapify('CHAVE_RECUSADA');
  if (resposta.status === 429) throw new ErroGeoapify('LIMITE_ATINGIDO');
  throw new ErroGeoapify('SERVICO_INDISPONIVEL');
}

async function fetchComTimeout(url: string, timeoutMs = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, cache: 'no-store' });
  } catch {
    throw new ErroGeoapify('SERVICO_INDISPONIVEL');
  } finally {
    clearTimeout(timer);
  }
}

export async function geocodificarEndereco(endereco: string): Promise<EnderecoGeocodificado> {
  const url = new URL(GEOCODING_URL);
  url.searchParams.set('text', endereco);
  url.searchParams.set('filter', 'countrycode:br');
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('lang', 'pt');
  url.searchParams.set('apiKey', chaveGeoapify());

  const resposta = await fetchComTimeout(url.toString());
  validarResposta(resposta);
  const corpo = (await resposta.json()) as {
    results?: Array<{
      lat?: number;
      lon?: number;
      formatted?: string;
      city?: string;
      county?: string;
      rank?: { confidence?: number; confidence_city_level?: number };
    }>;
  };
  const resultado = corpo.results?.[0];
  if (!resultado || !Number.isFinite(resultado.lat) || !Number.isFinite(resultado.lon)) {
    throw new ErroGeoapify('ENDERECO_NAO_ENCONTRADO');
  }
  const confianca = Number(resultado.rank?.confidence ?? resultado.rank?.confidence_city_level ?? 0);
  if (!Number.isFinite(confianca) || confianca < 0.55) {
    throw new ErroGeoapify('ENDERECO_IMPRECISO');
  }

  return {
    latitude: Number(resultado.lat),
    longitude: Number(resultado.lon),
    formatado: resultado.formatted || endereco,
    cidade: resultado.city || resultado.county || null,
    confianca,
  };
}

export type SugestaoEndereco = {
  formatado: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  latitude: number;
  longitude: number;
};

/**
 * Autocomplete de verdade (não geocoding de texto livre): devolve uma
 * LISTA de endereços reais pra pessoa escolher, em vez de tentar adivinhar
 * um único resultado a partir do que foi digitado. É o que evita o erro
 * "endereço não encontrado" no salvar — só chega ao formulário estruturado
 * um endereço que a Geoapify já confirmou que existe.
 */
export async function autocompletarEndereco(texto: string): Promise<SugestaoEndereco[]> {
  const url = new URL(AUTOCOMPLETE_URL);
  url.searchParams.set('text', texto);
  url.searchParams.set('filter', 'countrycode:br');
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '5');
  url.searchParams.set('lang', 'pt');
  url.searchParams.set('apiKey', chaveGeoapify());

  const resposta = await fetchComTimeout(url.toString());
  validarResposta(resposta);
  const corpo = (await resposta.json()) as {
    results?: Array<{
      lat?: number;
      lon?: number;
      formatted?: string;
      street?: string;
      housenumber?: string;
      suburb?: string;
      district?: string;
      city?: string;
      county?: string;
      state_code?: string;
      postcode?: string;
      result_type?: string;
    }>;
  };

  return (corpo.results || [])
    // "amenity"/"building" isolados sem rua não servem pra entrega — o
    // filtro mantém só resultado com endereço de verdade (rua, no mínimo).
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon) && r.street)
    .map((r) => ({
      formatado: r.formatted || '',
      logradouro: r.street || '',
      numero: r.housenumber || '',
      bairro: r.suburb || r.district || '',
      cidade: r.city || r.county || '',
      uf: (r.state_code || '').toUpperCase(),
      cep: r.postcode || '',
      latitude: Number(r.lat),
      longitude: Number(r.lon),
    }));
}

export async function calcularDistanciaDeRota(
  origem: { latitude: number; longitude: number },
  destino: { latitude: number; longitude: number },
) {
  const url = new URL(ROUTING_URL);
  url.searchParams.set(
    'waypoints',
    `${origem.latitude},${origem.longitude}|${destino.latitude},${destino.longitude}`,
  );
  url.searchParams.set('mode', 'drive');
  url.searchParams.set('format', 'geojson');
  url.searchParams.set('apiKey', chaveGeoapify());

  const resposta = await fetchComTimeout(url.toString());
  validarResposta(resposta);
  const corpo = (await resposta.json()) as {
    features?: Array<{ properties?: { distance?: number } }>;
  };
  const distancia = corpo.features?.[0]?.properties?.distance;
  if (!Number.isFinite(distancia) || Number(distancia) < 0) {
    throw new ErroGeoapify('ROTA_NAO_ENCONTRADA');
  }
  return Number(distancia);
}
