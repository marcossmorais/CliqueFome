import 'server-only';

import type { Coordenadas, EnderecoDelivery } from './tipos';
import { montarEnderecoCompleto } from './endereco';

const TEMPO_LIMITE_MS = 6_000;
const URL_GEOCODE = 'https://api.geoapify.com/v1/geocode/search';
const URL_ROUTING = 'https://api.geoapify.com/v1/routing';

type CodigoErroGeoapify =
  | 'NAO_CONFIGURADO'
  | 'ENDERECO_NAO_ENCONTRADO'
  | 'GEOCODE_INDISPONIVEL'
  | 'ROTA_INDISPONIVEL';

export class ErroGeoapify extends Error {
  constructor(public readonly codigo: CodigoErroGeoapify) {
    super(codigo);
    this.name = 'ErroGeoapify';
  }
}

function chaveGeoapify() {
  const chave = process.env.GEOAPIFY_API_KEY?.trim();
  if (!chave) throw new ErroGeoapify('NAO_CONFIGURADO');
  return chave;
}

async function buscarComTimeout(url: URL, codigo: CodigoErroGeoapify) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TEMPO_LIMITE_MS);
  try {
    const resposta = await fetch(url, {
      signal: controlador.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      // A URL contém apiKey e, no geocode, o endereço. Não criar span de
      // fetch com essa URL; a rota pai ainda mede a operação como um todo.
      opentelemetry: { ignore: true, propagateContext: false },
    });
    if (!resposta.ok) throw new ErroGeoapify(codigo);
    return await resposta.json() as unknown;
  } catch (erro) {
    if (erro instanceof ErroGeoapify) throw erro;
    throw new ErroGeoapify(codigo);
  } finally {
    clearTimeout(temporizador);
  }
}

function coordenadasValidas(latitude: number, longitude: number) {
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
    Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

export async function geocodificarEndereco(endereco: EnderecoDelivery): Promise<Coordenadas> {
  const url = new URL(URL_GEOCODE);
  url.searchParams.set('text', montarEnderecoCompleto(endereco));
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('filter', 'countrycode:br');
  url.searchParams.set('apiKey', chaveGeoapify());

  const corpo = await buscarComTimeout(url, 'GEOCODE_INDISPONIVEL') as {
    results?: { lat?: unknown; lon?: unknown }[];
  };
  const primeiro = corpo.results?.[0];
  const latitude = Number(primeiro?.lat);
  const longitude = Number(primeiro?.lon);
  if (!primeiro || !coordenadasValidas(latitude, longitude)) {
    throw new ErroGeoapify('ENDERECO_NAO_ENCONTRADO');
  }
  return { latitude, longitude };
}

export async function calcularDistanciaRota(
  origem: Coordenadas,
  destino: Coordenadas,
): Promise<number> {
  if (!coordenadasValidas(origem.latitude, origem.longitude) ||
      !coordenadasValidas(destino.latitude, destino.longitude)) {
    throw new ErroGeoapify('ROTA_INDISPONIVEL');
  }

  const url = new URL(URL_ROUTING);
  url.searchParams.set(
    'waypoints',
    `${origem.latitude},${origem.longitude}|${destino.latitude},${destino.longitude}`,
  );
  url.searchParams.set('mode', 'drive');
  url.searchParams.set('apiKey', chaveGeoapify());

  const corpo = await buscarComTimeout(url, 'ROTA_INDISPONIVEL') as {
    features?: { properties?: { distance?: unknown } }[];
  };
  const distancia = Number(corpo.features?.[0]?.properties?.distance);
  if (!Number.isFinite(distancia) || distancia < 0) {
    throw new ErroGeoapify('ROTA_INDISPONIVEL');
  }
  return Math.round(distancia);
}
