'use client';

import Image from 'next/image';
import { useState } from 'react';
import { formatBRL, type LojaPublica } from '@/lib/cardapio/tipos';

/**
 * Logo da loja. Era um `background-image` numa variável CSS, e por isso o
 * navegador só descobria a URL depois de baixar e aplicar o CSS — tarde, e
 * sem passar pelo otimizador: a imagem que o dono sobe pode ter 3 MB e
 * aparecia num círculo de 42px. Como <img>, ela é encontrada no HTML e
 * chega redimensionada.
 */
function LogoLoja({ url, className, lado }: { url: string | null; className: string; lado: number }) {
  return (
    <span className={className} aria-hidden="true">
      {/* Largura fixa em vez de `fill`+`sizes`: o topo do celular continua no
          DOM no desktop, só escondido por CSS, e um <img> em display:none não
          consegue resolver `sizes` — o navegador caía no maior candidato do
          srcset e baixava o logo em 3840px. */}
      {url && <Image src={url} alt="" width={lado} height={lado} />}
    </span>
  );
}

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

export function HeroLoja({
  loja,
  deliveryAtiva = false,
}: {
  loja: LojaPublica;
  deliveryAtiva?: boolean;
}) {
  const [infoAberta, setInfoAberta] = useState(false);
  const aceitando = loja.recebendo_encomendas && (loja.retirada_ativa || deliveryAtiva);
  const tempo = loja.tempo_preparo_min && loja.tempo_preparo_max
    ? `${loja.tempo_preparo_min}–${loja.tempo_preparo_max} min`
    : null;
  const perfilDemo = loja.slug === 'pizzaria-teste';
  const numeroWhats = (loja.whatsapp_numero || '').replace(/\D/g, '');
  const momentoPagamento = deliveryAtiva && !loja.retirada_ativa
    ? 'na entrega'
    : loja.retirada_ativa && !deliveryAtiva
      ? 'na retirada'
      : 'na retirada ou entrega';


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
        <LogoLoja url={loja.logo_url} className="loja-mobile-logo" lado={42} />
        <div className="loja-mobile-identidade">
          <strong>{loja.nome}</strong>
          <small><b className={aceitando ? 'aberto' : 'fechado'}>{aceitando ? 'Aceitando pedidos' : 'Pedidos pausados'}</b>{tempo && <> · {tempo}</>}</small>
          {perfilDemo && <AvaliacaoLoja />}
        </div>
      </div>

      <div className="loja-capa">
        {/* Maior imagem da página e a primeira que a pessoa vê: `priority`
            tira ela da fila do lazy-load e o Next a pré-carrega. */}
        {loja.banner_url && (
          <Image src={loja.banner_url} alt="" fill priority sizes="100vw" className="loja-capa-img" />
        )}
        <div className="loja-capa-sombra" />
        <p className="loja-chamada">{loja.sobre || 'Os seus favoritos, preparados com carinho.'}</p>
        <div className="loja-hero-base">
          <LogoLoja url={loja.logo_url} className="loja-logo" lado={92} />
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
              <li>Dinheiro {momentoPagamento}</li>
              <li>Cartão de crédito {momentoPagamento}</li>
              <li>Cartão de débito {momentoPagamento}</li>
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
