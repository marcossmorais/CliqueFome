import './dark.css';
import './admin.css';

/**
 * Rotas de autenticação nunca entram em dark. A checagem é feita aqui, e não
 * só no layout de `(auth)`: se este script resolvesse dark primeiro e o de
 * `(auth)` corrigisse depois, existiria um instante com o atributo em dark
 * — o "pisca" que o usuário via ao abrir o login vindo do painel escuro.
 * Os dois pontos concordam desde o primeiro byte.
 */
const SCRIPT_TEMA = `
try {
  var ehAuth = /^\\/entrar(\\/|$)/.test(location.pathname);
  var temaSalvo = localStorage.getItem('cf_admin_theme');
  var tema = ehAuth ? 'light' : (temaSalvo === 'dark' || temaSalvo === 'light'
    ? temaSalvo
    : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  document.documentElement.dataset.adminTheme = tema;
} catch (_) {
  document.documentElement.dataset.adminTheme = 'light';
}
`;

/**
 * A casca precisa nascer vertical antes mesmo do chunk completo de CSS chegar.
 * Sem estas poucas regras críticas, uma conexão fria podia pintar os filhos da
 * sidebar na direção padrão e corrigi-los no quadro seguinte. No mobile ela
 * também nasce fora da tela, evitando o drawer aberto durante esse intervalo.
 */
const ESTILO_CASCA_CRITICO = `
html,body{max-width:100%;overflow-x:hidden}
#appView{display:none;width:100%;min-width:0;max-width:100vw;overflow-x:clip}
#appView.ativo{display:flex;align-items:flex-start}
#sidebar{display:flex;flex-direction:column;width:240px;min-width:240px;max-width:240px;overflow:hidden}
#menu{display:block;width:100%;min-width:0;overflow-x:hidden}
#main{flex:1;min-width:0}
#painelTopo{display:none}
@media(min-width:901px){
  #appView.ativo{display:grid;grid-template-columns:240px minmax(0,1fr);grid-template-rows:76px minmax(0,1fr);align-items:stretch;height:100vh;height:100dvh;overflow:hidden}
  #painelTopo{display:flex;grid-column:1/-1;grid-row:1;align-items:center}
  .painel-topo-marca{display:flex;width:240px;flex:0 0 240px;align-items:center;padding:0 24px}
  .painel-topo-marca .logo-floufood{width:165px;height:32px;object-fit:contain}
  .painel-topo-acoes{display:flex;margin-left:auto;align-items:center;gap:12px;padding:0 30px}
  #sidebar{grid-column:1;grid-row:2;position:relative;top:auto;height:100%}
  #sidebar>.brand-logo{display:none}
  #main{grid-column:2;grid-row:2;display:flex;flex-direction:column;height:100%;min-height:0;padding:0;overflow:hidden}
  .main-top-acoes-mobile{display:none}
  #mainContent{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:26px 30px 80px}
}
@media(max-width:900px){
  #sidebar{position:fixed;left:0;top:0;width:min(240px,calc(100vw - 32px));min-width:0;max-width:calc(100vw - 32px);transform:translateX(-100%)}
  #sidebar.aberto{transform:none}
}
`;

/**
 * Casca da área interna: /entrar, /criar-loja, /painel/<loja>/* e
 * /superadmin/*. É um route group — não vira segmento de URL.
 *
 * O `admin.css` é importado AQUI e só aqui. Quando ele estava espalhado em
 * cinco imports por rota, o Next servia um chunk de CSS diferente por
 * segmento e a navegação client-side pintava o menu antes do estilo
 * chegar — a barra lateral aparecia quebrada até dar F5 (PR #6).
 */
export default function LayoutInterno({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      <style dangerouslySetInnerHTML={{ __html: ESTILO_CASCA_CRITICO }} />
      {children}
    </>
  );
}
