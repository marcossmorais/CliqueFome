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
      {children}
    </>
  );
}
