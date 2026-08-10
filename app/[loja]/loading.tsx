import './cardapio.css';
import './vitrine.css';

/**
 * Esqueleto do cardápio público — Next troca de tela na hora da navegação
 * e preenche quando os dados (loja, categorias, produtos) chegam, em vez
 * de deixar a tela em branco até tudo resolver. Formato aproximado do
 * `HeroLoja` + `.menu-list` reais (`CardapioClient.tsx`), não pixel a
 * pixel — é só o suficiente pra não parecer uma página quebrada por um
 * instante.
 */
export default function CarregandoCardapio() {
  return (
    <div className="cardapio-app" aria-hidden="true">
      <div className="esq-topo">
        <span className="esq esq-avatar" />
        <div className="esq-topo-txt">
          <span className="esq esq-linha" style={{ width: '55%' }} />
          <span className="esq esq-linha" style={{ width: '35%', height: 10 }} />
        </div>
      </div>
      <div className="esq esq-capa" />
      <div className="esq-conteudo">
        <span className="esq esq-busca" />
        <div className="esq-filtros">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="esq esq-chip" />
          ))}
        </div>
        <div className="esq-grade">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="esq esq-card" />
          ))}
        </div>
      </div>
    </div>
  );
}
