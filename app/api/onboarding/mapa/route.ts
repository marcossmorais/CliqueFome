import { logger } from '@/lib/observabilidade/logger';
import { ALTURA_MAPA, LARGURA_MAPA, ZOOM_MAPA, coordenadaValida } from '@/lib/onboarding/mapa';
import {
  autorizarCadastro,
  ErroCadastroApi,
  limitarCadastro,
  respostaDeErro,
} from '@/lib/onboarding/servidor';

export const runtime = 'nodejs';

const ROTA = '/api/onboarding/mapa';
const URL_STATICMAP = 'https://maps.geoapify.com/v1/staticmap';
const TEMPO_LIMITE_MS = 8_000;

/**
 * Imagem do mapa de conferência, servida pelo nosso domínio.
 *
 * Existe por causa da chave: o Geoapify quer a `apiKey` na URL da imagem, e
 * um `<img src="https://maps.geoapify.com/...&apiKey=...">` publica a chave
 * pra qualquer um que abra o inspetor. Aqui ela nunca sai do servidor.
 *
 * Não é um proxy aberto: exige sessão e tem limite por conta. Sem isso o
 * endpoint viraria um serviço de mapas grátis pago pela nossa fatura.
 *
 * Sem marcador do Geoapify de propósito — o pin é um elemento nosso desenhado
 * por cima, senão mover o pin exigiria baixar a imagem de novo a cada clique
 * (e apareceriam dois pinos enquanto isso).
 */
export async function GET(request: Request) {
  try {
    const userId = await autorizarCadastro();
    await limitarCadastro(userId, 'mapa', 60);

    const parametros = new URL(request.url).searchParams;
    const centro = {
      latitude: Number(parametros.get('lat')),
      longitude: Number(parametros.get('lng')),
    };
    if (!coordenadaValida(centro)) throw new ErroCadastroApi('Coordenadas inválidas.');

    const chave = process.env.GEOAPIFY_API_KEY?.trim();
    if (!chave) throw new ErroCadastroApi('Mapa indisponível no momento.', 503);

    const url = new URL(URL_STATICMAP);
    url.searchParams.set('style', 'osm-bright-smooth');
    url.searchParams.set('width', String(LARGURA_MAPA));
    url.searchParams.set('height', String(ALTURA_MAPA));
    url.searchParams.set('zoom', String(ZOOM_MAPA));
    url.searchParams.set('center', `lonlat:${centro.longitude},${centro.latitude}`);
    // Retina: a imagem chega no dobro da resolução, mas continua cobrindo a
    // mesma área — a matemática do pin em lib/onboarding/mapa.ts usa o
    // tamanho lógico e não muda por causa disto.
    url.searchParams.set('scaleFactor', '2');
    url.searchParams.set('apiKey', chave);

    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), TEMPO_LIMITE_MS);
    let resposta: Response;
    try {
      resposta = await fetch(url, {
        signal: controlador.signal,
        cache: 'no-store',
        // A URL carrega a apiKey: não virar atributo de span de telemetria.
        opentelemetry: { ignore: true, propagateContext: false },
      });
    } catch {
      throw new ErroCadastroApi('Mapa indisponível no momento.', 503);
    } finally {
      clearTimeout(temporizador);
    }

    if (!resposta.ok || !resposta.body) {
      logger.warn({ rota: ROTA, status: resposta.status }, 'Static map recusado pelo provedor');
      throw new ErroCadastroApi('Mapa indisponível no momento.', 503);
    }

    return new Response(resposta.body, {
      headers: {
        'Content-Type': resposta.headers.get('content-type') ?? 'image/png',
        // O mapa de um endereço não muda; o cache é privado porque a rota só
        // responde a sessão autenticada.
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (erro) {
    return respostaDeErro(erro, 'Mapa indisponível no momento.', ROTA);
  }
}
