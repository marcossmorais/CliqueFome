'use client';

import { useState } from 'react';
import { formatBRL, type LojaPublica } from '@/lib/cardapio/tipos';

/**
 * Topo do cardápio: capa, logo sobreposto, nome, status e cidade — tudo com
 * a identidade que o dono cadastrou. Nada aqui usa a marca CliqueFome: o
 * cardápio é whitelabel da loja.
 */
export function HeroLoja({ loja }: { loja: LojaPublica }) {
  const [infoAberta, setInfoAberta] = useState(false);

  const aberto = loja.delivery_ativo;
  const linhas = [
    loja.sobre,
    loja.cidade && `Local: ${loja.cidade}`,
    loja.tempo_entrega_min && loja.tempo_entrega_max
      ? `Entrega em ${loja.tempo_entrega_min}–${loja.tempo_entrega_max} min`
      : null,
    Number(loja.taxa_entrega) > 0
      ? `Taxa de entrega: ${formatBRL(Number(loja.taxa_entrega))}`
      : 'Entrega grátis',
    Number(loja.pedido_minimo) > 0 ? `Pedido mínimo: ${formatBRL(Number(loja.pedido_minimo))}` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="loja-hero">
      <div
        className="loja-capa"
        style={loja.banner_url ? { ['--capa' as string]: `url("${loja.banner_url}")` } : undefined}
      />
      <div className="loja-hero-base">
        <div
          className="loja-logo"
          style={loja.logo_url ? { ['--logo' as string]: `url("${loja.logo_url}")` } : undefined}
        />
        <div className="loja-hero-txt">
          <h2 className="loja-hero-nome">{loja.nome}</h2>
          <div className="loja-hero-meta">
            <span className={'loja-status ' + (aberto ? 'aberto' : 'fechado')}>
              {aberto ? 'Aberto agora' : 'Fechado no momento'}
            </span>
            {loja.cidade && (
              <>
                <span className="loja-sep">•</span>
                <span>{loja.cidade}</span>
              </>
            )}
            <span className="loja-sep">•</span>
            <button type="button" className="loja-mais" onClick={() => setInfoAberta((v) => !v)}>
              Mais informações
            </button>
          </div>
        </div>
      </div>

      {infoAberta && (
        <div className="loja-info-caixa">
          {linhas.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      )}
    </div>
  );
}
