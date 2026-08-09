'use client';

import { useState } from 'react';
import { formatBRL, type LojaPublica } from '@/lib/cardapio/tipos';

export function HeroLoja({ loja }: { loja: LojaPublica }) {
  const [infoAberta, setInfoAberta] = useState(false);
  const aceitando = loja.delivery_ativo;
  const tempo = loja.tempo_entrega_min && loja.tempo_entrega_max
    ? `${loja.tempo_entrega_min}–${loja.tempo_entrega_max} min`
    : null;

  const logoStyle = loja.logo_url ? { ['--logo' as string]: `url("${loja.logo_url}")` } : undefined;
  const capaStyle = loja.banner_url ? { ['--capa' as string]: `url("${loja.banner_url}")` } : undefined;

  return (
    <header className="loja-hero">
      <div className="loja-mobile-topo">
        <button type="button" className="loja-menu-btn" aria-label="Mostrar informações da loja" aria-expanded={infoAberta} onClick={() => setInfoAberta((v) => !v)}>
          <span /> <span /> <span />
        </button>
        <span className="loja-mobile-logo" style={logoStyle} aria-hidden="true" />
        <div className="loja-mobile-identidade">
          <strong>{loja.nome}</strong>
          <small><b className={aceitando ? 'aberto' : 'fechado'}>{aceitando ? 'Aceitando pedidos' : 'Pedidos pausados'}</b>{tempo && <> · {tempo}</>}</small>
        </div>
        <button type="button" className="loja-info-btn" aria-label="Mais informações" aria-expanded={infoAberta} onClick={() => setInfoAberta((v) => !v)}>i</button>
      </div>

      <div className="loja-capa" style={capaStyle}>
        <div className="loja-capa-sombra" />
        <p className="loja-chamada">{loja.sobre || 'Os seus favoritos, preparados com carinho.'}</p>
        <div className="loja-hero-base">
          <span className="loja-logo" style={logoStyle} aria-hidden="true" />
          <div className="loja-hero-txt">
            <h1 className="loja-hero-nome">{loja.nome}</h1>
            <div className="loja-hero-meta">
              <span className={'loja-status ' + (aceitando ? 'aberto' : 'fechado')}>{aceitando ? 'Aceitando pedidos' : 'Pedidos pausados'}</span>
              {tempo && <><span>·</span><span>{tempo}</span></>}
            </div>
            <button type="button" className="loja-mais" aria-expanded={infoAberta} onClick={() => setInfoAberta((v) => !v)}>ⓘ Mais informações</button>
          </div>
        </div>
      </div>

      {infoAberta && (
        <div className="loja-info-caixa" role="status">
          {loja.sobre && <p>{loja.sobre}</p>}
          {loja.cidade && <p><strong>Local:</strong> {loja.cidade}</p>}
          {tempo && <p><strong>Tempo estimado:</strong> {tempo}</p>}
          <p><strong>Taxa:</strong> {Number(loja.taxa_entrega) > 0 ? formatBRL(Number(loja.taxa_entrega)) : 'Entrega grátis'}</p>
          {Number(loja.pedido_minimo) > 0 && <p><strong>Pedido mínimo:</strong> {formatBRL(Number(loja.pedido_minimo))}</p>}
        </div>
      )}
    </header>
  );
}
