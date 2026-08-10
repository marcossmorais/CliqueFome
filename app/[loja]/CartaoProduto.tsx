import { useState } from 'react';
import { formatBRL, precoBase, precoMinimo, type ProdutoPublico } from '@/lib/cardapio/tipos';

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
  const [imgCarregada, setImgCarregada] = useState(false);

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
            // eslint-disable-next-line @next/next/no-img-element -- imagem cadastrada pela loja
            <img
              src={produto.imagem_url}
              alt=""
              loading="lazy"
              className={'foto-produto' + (imgCarregada ? ' carregada' : '')}
              onLoad={() => setImgCarregada(true)}
            />
          ) : (
            <span className="menu-emoji" aria-hidden="true">🍽️</span>
          )}
          {produto.etiqueta && ETIQUETAS[produto.etiqueta] && (
            <span className="menu-etiqueta">{ETIQUETAS[produto.etiqueta]}</span>
          )}
          {esgotado && <span className="menu-esgotado">Esgotado</span>}
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
