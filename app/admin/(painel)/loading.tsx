/**
 * Esqueleto mostrado enquanto a página do painel busca os dados.
 *
 * Cada navegação depende de 3 saltos de rede em série ao Supabase (validar
 * sessão → resolver a loja → carregar os dados da área), e isso não some:
 * o loja.id é dependência das queries. O que dá pra tirar é a sensação de
 * travamento — com este arquivo o Next troca de tela na hora e preenche
 * quando os dados chegam, em vez de segurar o clique até tudo estar pronto.
 */
export default function CarregandoPainel() {
  return (
    <div id="appView" className="ativo">
      <aside id="sidebar" aria-hidden="true">
        <div className="esqueleto esqueleto-logo" />
        <div className="esqueleto esqueleto-chip" />
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="esqueleto esqueleto-linha" />
        ))}
      </aside>
      <main id="main">
        <div id="mainTop">
          <div className="esqueleto esqueleto-titulo" />
        </div>
        <div className="esqueleto esqueleto-bloco" />
        <div className="esqueleto esqueleto-bloco" />
      </main>
    </div>
  );
}
