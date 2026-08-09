import { formatBRL, precoBase, precoMinimo, type ProdutoPublico } from '@/lib/cardapio/tipos';

export const ETIQUETAS: Record<string, string> = {
  mais_pedido: 'Mais pedido',
  novidade: 'Novidade',
  recomendado: 'Recomendado',
  edicao_limitada: 'Edição limitada',
};

/**
 * Um cartão só, usado tanto na lista plana (resultado de busca) quanto
 * dentro dos carrosséis de cada seção — mesma marcação, mesmo clique
 * (`onClicar`), só a classe `carrossel` muda o layout via CSS (foto em
 * cima, largura fixa). Existir um cartão só é o que garante que carrinho,
 * quantidade e "produto esgotado" se comportam igual em qualquer lugar do
 * cardápio — nenhuma seção reimplementa a lógica de adicionar ao carrinho.
 */
export function CartaoProduto({
  produto,
  onClicar,
  carrossel,
}: {
  produto: ProdutoPublico;
  onClicar: () => void;
  carrossel?: boolean;
}) {
  const esgotado = !produto.ativo;
  const minimo = precoMinimo(produto);
  const base = precoBase(produto);

  return (
    <article
      className={'menu-card' + (carrossel ? ' menu-card-carrossel' : '') + (esgotado ? ' esgotado' : '')}
      onClick={onClicar}
    >
      <div className="menu-card-photo">
        {produto.imagem_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- foto do catálogo da loja
          <img src={produto.imagem_url} alt={produto.nome} loading="lazy" />
        ) : (
          <span className="menu-emoji">🖼️</span>
        )}
        {esgotado && (
          <div className="fita-esgotado">
            <span>Esgotado</span>
          </div>
        )}
      </div>
      <div className="menu-card-body">
        <h3>{produto.nome}</h3>
        {produto.etiqueta && ETIQUETAS[produto.etiqueta] && (
          <span className="menu-etiqueta">{ETIQUETAS[produto.etiqueta]}</span>
        )}
        {produto.descricao && <p className="menu-desc">{produto.descricao}</p>}
        <div className="menu-card-footer">
          <span className="menu-price">
            {minimo > base && <span className="desde">A partir de</span>}
            {formatBRL(minimo > base ? minimo : base)}
          </span>
          {!esgotado && (
            <span className="btn-add" aria-hidden="true">
              +
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
