'use client';

import { useState } from 'react';
import { formatBRL, type LojaPublica } from '@/lib/cardapio/tipos';

const AVALIACOES_DEMO = [5, 5, 5, 4, 5, 5, 4, 5, 5, 5, 4, 5];
const MEDIA_AVALIACOES_DEMO = AVALIACOES_DEMO.reduce((total, nota) => total + nota, 0) / AVALIACOES_DEMO.length;

function AvaliacaoLoja() {
  const preenchimento = `${(MEDIA_AVALIACOES_DEMO / 5) * 100}%`;

  return (
    <div className="loja-avaliacao" aria-label={`Avaliação média ${MEDIA_AVALIACOES_DEMO.toFixed(1)} de 5, com ${AVALIACOES_DEMO.length} avaliações`}>
      <span className="loja-estrelas" aria-hidden="true">
        <span className="loja-estrelas-base">★★★★★</span>
        <span className="loja-estrelas-cheias" style={{ width: preenchimento }}>★★★★★</span>
      </span>
      <strong>{MEDIA_AVALIACOES_DEMO.toFixed(1).replace('.', ',')}</strong>
      <small>({AVALIACOES_DEMO.length})</small>
    </div>
  );
}

export function HeroLoja({ loja }: { loja: LojaPublica }) {
  const [infoAberta, setInfoAberta] = useState(false);
  const aceitando = loja.recebendo_encomendas && loja.retirada_ativa;
  const tempo = loja.tempo_preparo_min && loja.tempo_preparo_max
    ? `${loja.tempo_preparo_min}–${loja.tempo_preparo_max} min`
    : null;
  const perfilDemo = loja.slug === 'pizzaria-teste';
  const numeroWhats = (loja.whatsapp_numero || '').replace(/\D/g, '');

  const logoStyle = loja.logo_url ? { ['--logo' as string]: `url("${loja.logo_url}")` } : undefined;
  const capaStyle = loja.banner_url ? { ['--capa' as string]: `url("${loja.banner_url}")` } : undefined;

  return (
    <header className="loja-hero">
      <div className="loja-mobile-topo">
        <button
          type="button"
          className="loja-menu-btn"
          aria-label={infoAberta ? 'Fechar informações da loja' : 'Abrir informações da loja'}
          aria-controls="painel-informacoes-loja"
          aria-expanded={infoAberta}
          onClick={() => setInfoAberta((v) => !v)}
        >
          <span /> <span /> <span />
        </button>
        <span className="loja-mobile-logo" style={logoStyle} aria-hidden="true" />
        <div className="loja-mobile-identidade">
          <strong>{loja.nome}</strong>
          <small><b className={aceitando ? 'aberto' : 'fechado'}>{aceitando ? 'Aceitando pedidos' : 'Pedidos pausados'}</b>{tempo && <> · {tempo}</>}</small>
          {perfilDemo && <AvaliacaoLoja />}
        </div>
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
            {perfilDemo && <AvaliacaoLoja />}
            <button type="button" className="loja-mais" aria-controls="painel-informacoes-loja" aria-expanded={infoAberta} onClick={() => setInfoAberta((v) => !v)}>ⓘ Mais informações</button>
          </div>
        </div>
      </div>

      {infoAberta && (
        <div id="painel-informacoes-loja" className="loja-info-caixa" role="region" aria-label="Informações da loja">
          <section>
            <h2>Informações da loja</h2>
            {loja.sobre && <p>{loja.sobre}</p>}
            {loja.cidade && <p><strong>Local:</strong> {loja.cidade}</p>}
            {tempo && <p><strong>Tempo estimado de preparo:</strong> {tempo}</p>}
            {Number(loja.pedido_minimo) > 0 && <p><strong>Pedido mínimo:</strong> {formatBRL(Number(loja.pedido_minimo))}</p>}
          </section>

          <section>
            <h2>Funcionamento</h2>
            <p><strong>Hoje:</strong> {aceitando ? (perfilDemo ? '11h às 23h' : 'Loja aberta agora') : 'Pedidos pausados'}</p>
            {perfilDemo && <p>Segunda a domingo · 11h às 23h</p>}
          </section>

          <section>
            <h2>Meios de pagamento</h2>
            <ul className="loja-pagamentos">
              <li>Pix direto para a loja</li>
              <li>Dinheiro na retirada</li>
              <li>Cartão de crédito na retirada</li>
              <li>Cartão de débito na retirada</li>
            </ul>
          </section>

          {numeroWhats && (
            <a className="loja-whatsapp" href={`https://wa.me/${numeroWhats}`} target="_blank" rel="noopener noreferrer">
              Falar com a loja no WhatsApp
            </a>
          )}
        </div>
      )}
    </header>
  );
}
