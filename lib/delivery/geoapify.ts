const GEOCODING_URL = 'https://api.geoapify.com/v1/geocode/search';
const ROUTING_URL = 'https://api.geoapify.com/v1/routing';

export class ErroGeoapify extends Error {
  constructor(
    public readonly codigo:
      | 'ENDERECO_NAO_ENCONTRADO'
      | 'ENDERECO_IMPRECISO'
      | 'ROTA_NAO_ENCONTRADA'
      | 'SERVICO_INDISPONIVEL',
  ) {
    super(codigo);
    this.name = 'ErroGeoapify';
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
  if (!chave) throw new ErroGeoapify('SERVICO_INDISPONIVEL');
  return chave;
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
  if (!resposta.ok) throw new ErroGeoapify('SERVICO_INDISPONIVEL');
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
  if (!resposta.ok) throw new ErroGeoapify('SERVICO_INDISPONIVEL');
  const corpo = (await resposta.json()) as {
    features?: Array<{ properties?: { distance?: number } }>;
  };
  const distancia = corpo.features?.[0]?.properties?.distance;
  if (!Number.isFinite(distancia) || Number(distancia) < 0) {
    throw new ErroGeoapify('ROTA_NAO_ENCONTRADA');
  }
  return Number(distancia);
}
