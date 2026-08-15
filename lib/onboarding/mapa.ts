/**
 * Conversão pixel ↔ coordenada para o mapa de confirmação do cadastro.
 *
 * O mapa é uma imagem estática (Geoapify Static Maps, servida pelo nosso
 * `/api/onboarding/mapa` para a chave não sair do servidor). Sem biblioteca
 * de mapa no projeto e sem motivo pra instalar uma só por causa desta tela,
 * o ajuste fino do pin é resolvido aqui: clicar na imagem vira um
 * deslocamento em pixels, e Web Mercator devolve a coordenada.
 *
 * É a MESMA projeção que a imagem usa (Web Mercator esférico, 256px por
 * tile), então o ponto clicado e o pin desenhado coincidem.
 */

export type Coordenada = { latitude: number; longitude: number };

/** Zoom fixo da imagem: bairro visível, casa reconhecível. */
export const ZOOM_MAPA = 16;
export const LARGURA_MAPA = 640;
export const ALTURA_MAPA = 260;

const TAMANHO_TILE = 256;
/** Limite do Mercator: além disso a projeção diverge. */
const LAT_MAXIMA = 85.05112878;

function mundoEmPixels(zoom: number) {
  return TAMANHO_TILE * 2 ** zoom;
}

function limitar(valor: number, minimo: number, maximo: number) {
  return Math.min(maximo, Math.max(minimo, valor));
}

export function coordenadaValida(coordenada: Coordenada) {
  const { latitude, longitude } = coordenada;
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function paraPixel(coordenada: Coordenada, zoom: number) {
  const mundo = mundoEmPixels(zoom);
  const latitude = limitar(coordenada.latitude, -LAT_MAXIMA, LAT_MAXIMA);
  const seno = Math.sin((latitude * Math.PI) / 180);
  return {
    x: ((coordenada.longitude + 180) / 360) * mundo,
    y: (0.5 - Math.log((1 + seno) / (1 - seno)) / (4 * Math.PI)) * mundo,
  };
}

function paraCoordenada(x: number, y: number, zoom: number): Coordenada {
  const mundo = mundoEmPixels(zoom);
  const n = Math.PI - (2 * Math.PI * y) / mundo;
  return {
    longitude: (x / mundo) * 360 - 180,
    latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)),
  };
}

/**
 * Coordenada de um ponto da imagem, dado o centro dela.
 *
 * `x`/`y` são relativos ao canto superior esquerdo do elemento renderizado;
 * `larguraCss`/`alturaCss` permitem que a imagem apareça redimensionada
 * (ela é responsiva no mobile) sem desalinhar o pin.
 */
export function coordenadaDoPonto(
  centro: Coordenada,
  ponto: { x: number; y: number; larguraCss: number; alturaCss: number },
  zoom = ZOOM_MAPA
): Coordenada {
  const escalaX = LARGURA_MAPA / (ponto.larguraCss || LARGURA_MAPA);
  const escalaY = ALTURA_MAPA / (ponto.alturaCss || ALTURA_MAPA);
  const centroPixel = paraPixel(centro, zoom);
  const deslocamentoX = ponto.x * escalaX - LARGURA_MAPA / 2;
  const deslocamentoY = ponto.y * escalaY - ALTURA_MAPA / 2;
  const bruta = paraCoordenada(
    centroPixel.x + deslocamentoX,
    centroPixel.y + deslocamentoY,
    zoom
  );
  return arredondar(bruta);
}

/**
 * Seis casas decimais — ~11 cm, mais do que suficiente pra porta de uma loja
 * e o mesmo que as colunas `numeric(9,6)` do banco guardam. Sem isso, um
 * clique gera 15 dígitos que o Postgres arredondaria de qualquer jeito.
 */
export function arredondar(coordenada: Coordenada): Coordenada {
  return {
    latitude: Math.round(coordenada.latitude * 1e6) / 1e6,
    longitude: Math.round(coordenada.longitude * 1e6) / 1e6,
  };
}

/**
 * Distância em metros entre dois pontos (haversine).
 *
 * Serve pra uma coisa só: conferir, no servidor, que o pin ajustado pelo dono
 * continua perto do endereço que o Geoapify devolveu. Depois do ajuste manual
 * a coordenada passa a vir do navegador, e sem esse teto bastaria editar o
 * JSON pra cravar a loja em outra cidade — o que depois virava taxa de
 * entrega por quilômetro calculada a partir de um ponto falso.
 */
export function distanciaMetros(a: Coordenada, b: Coordenada) {
  const RAIO_TERRA = 6_371_000;
  const rad = (grau: number) => (grau * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * RAIO_TERRA * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Quanto o pin pode andar. O mapa mostra ~1,2 km de largura no zoom 16, então
 * qualquer correção que caiba na tela cabe aqui.
 */
export const AJUSTE_MAXIMO_METROS = 2_000;

/**
 * Posição do pin dentro da imagem, em porcentagem.
 *
 * Depois de o dono arrastar o ponto, a imagem NÃO é recarregada (seria uma
 * chamada de rede por clique): o centro continua sendo o endereço
 * geocodificado e só o marcador se move por cima.
 */
export function posicaoDoPin(centro: Coordenada, pin: Coordenada, zoom = ZOOM_MAPA) {
  const centroPixel = paraPixel(centro, zoom);
  const pinPixel = paraPixel(pin, zoom);
  return {
    esquerda: ((pinPixel.x - centroPixel.x + LARGURA_MAPA / 2) / LARGURA_MAPA) * 100,
    topo: ((pinPixel.y - centroPixel.y + ALTURA_MAPA / 2) / ALTURA_MAPA) * 100,
  };
}
