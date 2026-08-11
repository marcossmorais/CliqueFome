import type { DeliveryAddress, OpcoesAutocomplete } from './endereco';

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

async function fetchComTimeout(url: string, timeoutMs = 6500, externo?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Um cancelamento vindo de fora (request substituída por uma digitação
  // mais nova) precisa abortar o fetch de verdade, não só ser ignorado na
  // volta — senão a conexão fica aberta consumindo cota do provedor.
  const repassar = () => controller.abort();
  externo?.addEventListener('abort', repassar, { once: true });
  try {
    return await fetch(url, { signal: controller.signal, cache: 'no-store' });
  } catch {
    throw new ErroGeoapify('SERVICO_INDISPONIVEL');
  } finally {
    clearTimeout(timer);
    externo?.removeEventListener('abort', repassar);
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

/**
 * Campos da resposta oficial da Geoapify (`format=json`) que o Delivery usa.
 * Não é a resposta inteira de propósito: só o que é mapeado abaixo.
 *
 * No Brasil, `suburb` é o bairro e `district` é a subprefeitura/zona — daí a
 * ordem do fallback. `state_code` é a UF de duas letras; `state` viria por
 * extenso ("São Paulo") e não serve pro campo UF.
 */
type ResultadoGeoapify = {
  lat?: number;
  lon?: number;
  formatted?: string;
  street?: string;
  housenumber?: string;
  suburb?: string;
  district?: string;
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  state_code?: string;
  postcode?: string;
  result_type?: string;
  rank?: { confidence?: number; confidence_city_level?: number };
};

/** Único ponto do projeto que conhece o formato bruto da Geoapify. */
function mapearParaEndereco(r: ResultadoGeoapify): DeliveryAddress {
  return {
    formattedAddress: r.formatted || '',
    street: r.street || '',
    number: r.housenumber || '',
    neighborhood: r.suburb || r.district || '',
    city: r.city || r.town || r.village || r.county || '',
    state: (r.state_code || '').toUpperCase(),
    postalCode: (r.postcode || '').replace(/\D/g, ''),
    latitude: Number.isFinite(r.lat) ? Number(r.lat) : null,
    longitude: Number.isFinite(r.lon) ? Number(r.lon) : null,
  };
}

/**
 * Autocomplete de verdade (não geocoding de texto livre): devolve uma
 * LISTA de endereços reais pra pessoa escolher, em vez de tentar adivinhar
 * um único resultado a partir do que foi digitado. É o que evita o erro
 * "endereço não encontrado" no salvar — só chega ao formulário estruturado
 * um endereço que a Geoapify já confirmou que existe.
 *
 * `bias=proximity` é o que torna o resultado utilizável no celular: sem ele,
 * "rua joão pessoa" traz a de qualquer capital do país; com a coordenada da
 * loja, traz a do bairro de quem está pedindo. É bias e não `filter=circle`
 * porque filtro rígido esconderia um endereço legítimo logo além do raio.
 */
export async function autocompletarEndereco(
  texto: string,
  opcoes: OpcoesAutocomplete = {},
): Promise<DeliveryAddress[]> {
  const url = new URL(AUTOCOMPLETE_URL);
  url.searchParams.set('text', texto);
  url.searchParams.set('filter', 'countrycode:br');
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', String(opcoes.limite ?? 5));
  url.searchParams.set('lang', 'pt');
  if (opcoes.bias) {
    // A Geoapify espera lon,lat nessa ordem — invertido, o bias aponta pro
    // oceano e piora o resultado em vez de melhorar.
    url.searchParams.set('bias', `proximity:${opcoes.bias.longitude},${opcoes.bias.latitude}`);
  }
  url.searchParams.set('apiKey', chaveGeoapify());

  const resposta = await fetchComTimeout(url.toString(), 6500, opcoes.signal);
  validarResposta(resposta);
  const corpo = (await resposta.json()) as { results?: ResultadoGeoapify[] };

  return (corpo.results || [])
    // "amenity"/"building" isolados sem rua não servem pra entrega — o
    // filtro mantém só resultado com endereço de verdade (rua, no mínimo).
    .filter((r) => r.street)
    .map(mapearParaEndereco);
}

/**
 * Geocodificação final, depois que a pessoa informou o número — é o que
 * transforma "Rua X, s/n" (coordenada do meio da rua) na coordenada da porta.
 * Chamada UMA vez por endereço, nunca a cada tecla.
 */
export async function geocodificarParaEndereco(texto: string): Promise<DeliveryAddress> {
  const url = new URL(GEOCODING_URL);
  url.searchParams.set('text', texto);
  url.searchParams.set('filter', 'countrycode:br');
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('lang', 'pt');
  url.searchParams.set('apiKey', chaveGeoapify());

  const resposta = await fetchComTimeout(url.toString());
  validarResposta(resposta);
  const corpo = (await resposta.json()) as { results?: ResultadoGeoapify[] };
  const resultado = corpo.results?.[0];
  if (!resultado || !Number.isFinite(resultado.lat) || !Number.isFinite(resultado.lon)) {
    throw new ErroGeoapify('ENDERECO_NAO_ENCONTRADO');
  }
  return mapearParaEndereco(resultado);
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
