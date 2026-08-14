'use client';

import Image from 'next/image';
import { formatBRL, subtotalLinha, type LinhaCarrinho } from '@/lib/cardapio/tipos';

export function CarrinhoLateral({
  linhas,
  imagensPorProduto,
  subtotal,
  onMudarQtd,
  onRemover,
  onContinuar,
}: {
  linhas: LinhaCarrinho[];
  imagensPorProduto: Record<string, string | null>;
  subtotal: number;
  onMudarQtd: (lineId: string, delta: number) => void;
  onRemover: (lineId: string) => void;
  onContinuar: () => void;
}) {
  const quantidade = linhas.reduce((total, linha) => total + linha.qty, 0);

  return (
    <aside className="carrinho-lateral" aria-label="Seu pedido">
      <div className="carrinho-lateral-caixa">
        <header>
          <div><span>Seu pedido</span><small>{quantidade} {quantidade === 1 ? 'item' : 'itens'}</small></div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <path d="M3 5h2l2.2 10.2a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L21 8H6M10 21h.01M18 21h.01" />
          </svg>
        </header>

        {linhas.length === 0 ? (
          <div className="carrinho-lateral-vazio">
            <span aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 5h2l2.2 10.2a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L21 8H6" /></svg>
            </span>
            <strong>Seu carrinho está vazio</strong>
            <p>Adicione itens do cardápio para começar.</p>
          </div>
        ) : (
          <>
            <div className="carrinho-lateral-itens" aria-live="polite">
              {linhas.map((linha) => {
                const imagem = imagensPorProduto[linha.produtoId];
                const complementos = linha.complementos.map((item) => `${item.quantidade}× ${item.nome}`).join(', ');
                return (
                  <article className="carrinho-lateral-item" key={linha.lineId}>
                    <span className="carrinho-lateral-foto">
                      {imagem ? <Image src={imagem} alt="" width={52} height={52} /> : <span aria-hidden="true">•</span>}
                    </span>
                    <div className="carrinho-lateral-item-corpo">
                      <strong>{linha.nome}</strong>
                      {complementos && <small title={complementos}>{complementos}</small>}
                      {linha.observacao && <small>Obs.: {linha.observacao}</small>}
                      <div>
                        <span className="carrinho-lateral-qtd">
                          <button type="button" onClick={() => onMudarQtd(linha.lineId, -1)} aria-label={`Diminuir ${linha.nome}`}>−</button>
                          <b>{linha.qty}</b>
                          <button type="button" onClick={() => onMudarQtd(linha.lineId, 1)} aria-label={`Aumentar ${linha.nome}`}>+</button>
                        </span>
                        <b>{formatBRL(subtotalLinha(linha))}</b>
                      </div>
                      <button type="button" className="carrinho-lateral-remover" onClick={() => onRemover(linha.lineId)}>Remover</button>
                    </div>
                  </article>
                );
              })}
            </div>

            <dl className="carrinho-lateral-totais">
              <div><dt>Subtotal</dt><dd>{formatBRL(subtotal)}</dd></div>
              <div className="carrinho-lateral-taxa"><dt>Taxa de entrega</dt><dd>Calculada na próxima etapa</dd></div>
              <div className="total"><dt>Total parcial</dt><dd>{formatBRL(subtotal)}</dd></div>
            </dl>
            <button type="button" className="carrinho-lateral-continuar" onClick={onContinuar}>
              Continuar pedido <span aria-hidden="true">→</span>
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
