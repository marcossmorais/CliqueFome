/**
 * Resolve o primeiro painel depois do login sem confiar no parâmetro da URL.
 * Superadmin sempre entra pela plataforma; lojista só pode ser devolvido a
 * rotas do painel de lojas, cuja autorização final é conferida no servidor.
 */
export function destinoAposLogin(ehAdmin: boolean, proximo: string | null) {
  if (ehAdmin) return '/superadmin';

  const rotaPainel =
    !!proximo &&
    !proximo.startsWith('//') &&
    (proximo === '/painel' || proximo.startsWith('/painel/'));

  return rotaPainel ? proximo : '/painel';
}
