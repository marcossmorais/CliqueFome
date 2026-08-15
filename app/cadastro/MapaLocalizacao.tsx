'use client';

import { useState } from 'react';

import {
  ALTURA_MAPA,
  LARGURA_MAPA,
  coordenadaDoPonto,
  posicaoDoPin,
  type Coordenada,
} from '@/lib/onboarding/mapa';
import estilos from './cadastro.module.css';

/**
 * Mapa de conferência da etapa de endereço.
 *
 * Só existe pra uma coisa: deixar o dono olhar e dizer "é ali". Não é um mapa
 * navegável — não tem zoom, não tem arrasto e não recarrega a imagem quando o
 * pin se move (seria uma requisição por clique). O centro continua sendo o
 * ponto que o Geoapify devolveu; o marcador anda por cima.
 *
 * Carregado sob demanda por quem o usa, e só depois de existir coordenada:
 * nada de mapa na etapa da conta ou da loja.
 *
 * NÃO faz geocodificação reversa ao mover o pin. Mudar o endereço escrito
 * porque a pessoa arrastou o marcador dois metros seria desfazer o que ela
 * acabou de digitar.
 */
export function MapaLocalizacao({
  centro,
  pin,
  onMoverPin,
}: {
  centro: Coordenada;
  pin: Coordenada;
  onMoverPin: (coordenada: Coordenada) => void;
}) {
  const [falhou, setFalhou] = useState(false);
  const posicao = posicaoDoPin(centro, pin);

  function ajustar(evento: React.MouseEvent<HTMLButtonElement>) {
    const area = evento.currentTarget.getBoundingClientRect();
    onMoverPin(
      coordenadaDoPonto(centro, {
        x: evento.clientX - area.left,
        y: evento.clientY - area.top,
        larguraCss: area.width,
        alturaCss: area.height,
      })
    );
  }

  if (falhou) {
    return (
      <div className={estilos.mapaMoldura}>
        <p className={estilos.mapaVazio}>
          Não foi possível carregar o mapa — o endereço continua salvo.
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={estilos.mapaMoldura}
      onClick={ajustar}
      aria-label="Mapa da loja. Clique para ajustar a posição exata do marcador."
    >
      {/* <img> e não next/image: a imagem vem da nossa própria rota, já no
          tamanho final e com cache privado. Passar pelo otimizador só
          acrescentaria um salto.

          SEM `loading="lazy"`. O adiamento que importa já está garantido por
          fora: este componente é carregado por next/dynamic e só é montado
          depois que a geocodificação volta, então nenhum mapa é pedido antes
          da etapa de endereço. O atributo, aqui, só criava um bug — o
          elemento entra no DOM abaixo da dobra, nós rolamos até ele, e o
          Chromium não reavaliava a interseção durante a rolagem suave: a
          moldura ficava vazia até a pessoa rolar de novo na mão. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={estilos.mapaImagem}
        src={`/api/onboarding/mapa?lat=${centro.latitude}&lng=${centro.longitude}`}
        width={LARGURA_MAPA}
        height={ALTURA_MAPA}
        alt=""
        decoding="async"
        onError={() => setFalhou(true)}
      />
      <svg
        className={estilos.pin}
        style={{ left: `${posicao.esquerda}%`, top: `${posicao.topo}%` }}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          fill="#FF5A00"
          d="M12 2c-3.9 0-7 3.1-7 7 0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7z"
        />
        <circle cx="12" cy="9" r="2.6" fill="#fff" />
      </svg>
    </button>
  );
}
