/**
 * Telas de autenticação: sempre em light, sem exceção.
 *
 * O layout de `(interno)` roda um script que resolve o tema a partir do
 * localStorage e do `prefers-color-scheme` — e ele embrulha tanto o painel
 * quanto o login, então quem usava dark no painel via o login em dark também.
 *
 * O script de `(interno)` já reconhece as rotas de autenticação e resolve
 * light nelas, então quando este roda o valor não muda — nada de dark
 * piscando antes da correção. Ele fica como garantia de que qualquer rota
 * colocada neste grupo nasce clara, mesmo que alguém esqueça de incluí-la
 * na checagem de lá. Não é um segundo sistema de tema: é o mesmo
 * `data-admin-theme`, só fixado aqui.
 *
 * O toggle de tema não é renderizado nestas telas, senão daria para sair
 * deste estado.
 */
const SCRIPT_LIGHT = `document.documentElement.dataset.adminTheme='light';`;

export default function LayoutAuth({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SCRIPT_LIGHT }} />
      {children}
    </>
  );
}
