import Image from 'next/image';
import { formatBRL, precoBase, precoMinimo, type ProdutoPublico } from '@/lib/cardapio/tipos';

/** Larguras reais do slot da foto em cada faixa — 1 card no celular, 2 no
 *  tablet, 4 no desktop. Sem isto o navegador baixa a maior versão sempre. */
const TAMANHOS_FOTO = '(min-width: 960px) 300px, (min-width: 640px) 220px, 96px';

const ETIQUETAS: Record<string, string> = {
  mais_pedido: 'Mais pedido',
  novidade: 'Novidade',
  recomendado: 'Recomendado',
  edicao_limitada: 'Edição limitada',
};

export function CartaoProduto({
  produto,
  quantidade,
  onAbrir,
  onAdicionar,
  onDiminuir,
}: {
  produto: ProdutoPublico;
  quantidade: number;
  onAbrir: () => void;
  onAdicionar: () => void;
  onDiminuir: () => void;
}) {
  const esgotado = !produto.ativo;
  const minimo = precoMinimo(produto);
  const base = precoBase(produto);
  const preco = minimo > base ? minimo : base;
  const permiteContadorDireto = produto.grupos.length === 0;

  return (
    <article className={'menu-card' + (esgotado ? ' esgotado' : '')}>
      <button
        type="button"
        className="menu-card-conteudo"
        onClick={onAbrir}
        disabled={esgotado}
        aria-label={`${produto.nome}, ${formatBRL(preco)}${esgotado ? ', esgotado' : ''}`}
      >
        <span className="menu-card-photo">
          {produto.imagem_url ? (
            <Image src={produto.imagem_url} alt="" fill sizes={TAMANHOS_FOTO} />
          ) : (
            <span className="menu-emoji" aria-hidden="true">🍽️</span>
          )}
          {produto.etiqueta && ETIQUETAS[produto.etiqueta] && (
            <span className="menu-etiqueta">{ETIQUETAS[produto.etiqueta]}</span>
          )}
          {/* A fita diagonal já existia no CSS e nunca chegou a ser usada: o
              card renderizava um <span> sem estilo nenhum, então "Esgotado"
              aparecia como texto solto sobre a foto. */}
          {esgotado && (
            <span className="fita-esgotado" aria-hidden="true"><span>Esgotado</span></span>
          )}
        </span>

        <span className="menu-card-body">
          <strong className="menu-card-nome">{produto.nome}</strong>
          {produto.descricao && <span className="menu-desc">{produto.descricao}</span>}
          <span className="menu-price">
            {minimo > base && <small>A partir de</small>}
            {formatBRL(preco)}
          </span>
        </span>
      </button>

      {!esgotado && (
        <div className="menu-card-acoes">
          {permiteContadorDireto && quantidade > 0 ? (
            <div className="menu-qty" aria-label={`Quantidade de ${produto.nome}`}>
              <button type="button" onClick={onDiminuir} aria-label={`Remover uma unidade de ${produto.nome}`}>−</button>
              <span>{quantidade}</span>
              <button type="button" onClick={onAdicionar} aria-label={`Adicionar uma unidade de ${produto.nome}`}>+</button>
            </div>
          ) : (
            <button type="button" className="btn-add" onClick={onAdicionar} aria-label={`Adicionar ${produto.nome}`}>
              <span aria-hidden="true">+</span><span className="btn-add-label">Adicionar</span>
            </button>
          )}
        </div>
      )}
    </article>
  );
}
