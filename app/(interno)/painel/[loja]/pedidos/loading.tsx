/**
 * Esqueleto específico da Gestão de pedidos (tela mais visitada do
 * painel) — substitui o genérico de `(painel)/loading.tsx` só aqui, no
 * formato real de 2 colunas (Em andamento / Prontos) com cards fantasma.
 *
 * Precisa repetir a casca `#appView`/`#sidebar`/`#main` do genérico (não dá
 * pra reaproveitar `<ShellPainel>` porque ele é client e depende de
 * `lojaNome`/`lojaSlug`/`souAdmin`, dados que só chegam depois do fetch que
 * este loading.tsx existe pra cobrir) — sem isso a barra lateral some
 * inteira enquanto os pedidos carregam, só a área de conteúdo aparece.
 */
export default function CarregandoPedidos() {
  return (
    <div id="appView" className="ativo" aria-hidden="true">
      <aside id="sidebar">
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
        <div className="pedidos-colunas">
          {Array.from({ length: 2 }).map((_, coluna) => (
            <div key={coluna} className="pedidos-coluna">
              <div className="esqueleto esqueleto-linha" style={{ width: '50%', height: 20 }} />
              <div className="pedidos-lista" style={{ marginTop: 10 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="esqueleto esqueleto-cartao" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
