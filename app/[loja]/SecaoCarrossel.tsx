'use client';

import { useRef } from 'react';
import { CartaoProduto } from './CartaoProduto';
import type { ProdutoPublico } from '@/lib/cardapio/tipos';

/**
 * Rolagem nativa do navegador (scroll-snap em CSS), sem nenhuma lógica de
 * paginação própria — índice de página, "next/prev" calculado à mão etc.
 * são exatamente a classe de bug que fica fácil de introduzir num
 * carrossel construído do zero. As setas de desktop só chamam
 * `scrollBy`, na direção do próprio scroll nativo; em touch elas nem
 * aparecem (CSS), e arrastar com o dedo já funciona sem nenhum JS aqui.
 */
export function SecaoCarrossel({
  id,
  titulo,
  emoji,
  produtos,
  onClicarProduto,
}: {
  id: string;
  titulo: string;
  emoji?: string;
  produtos: ProdutoPublico[];
  onClicarProduto: (p: ProdutoPublico) => void;
}) {
  const trilhoRef = useRef<HTMLDivElement>(null);

  if (produtos.length === 0) return null;

  function rolar(direcao: 1 | -1) {
    const el = trilhoRef.current;
    if (!el) return;
    el.scrollBy({ left: direcao * Math.round(el.clientWidth * 0.8), behavior: 'smooth' });
  }

  return (
    <section id={`secao-${id}`} className="menu-secao" aria-labelledby={`secao-${id}-titulo`}>
      <div className="menu-secao-topo">
        <h2 id={`secao-${id}-titulo`}>
          {emoji ? emoji + ' ' : ''}
          {titulo}
        </h2>
        <div className="menu-secao-nav">
          <button type="button" aria-label={`Voltar em ${titulo}`} onClick={() => rolar(-1)}>
            ‹
          </button>
          <button type="button" aria-label={`Avançar em ${titulo}`} onClick={() => rolar(1)}>
            ›
          </button>
        </div>
      </div>
      <div className="menu-carrossel" ref={trilhoRef}>
        {produtos.map((p) => (
          <CartaoProduto key={p.id} produto={p} carrossel onClicar={() => onClicarProduto(p)} />
        ))}
      </div>
    </section>
  );
}
