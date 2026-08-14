/**
 * Normaliza telefones brasileiros no formato E.164 usado para relacionar
 * pedidos e sessões de cliente. A máscara exibida no navegador nunca entra
 * nessa comparação.
 */
export function normalizarTelefoneBrasil(valor: unknown): string | null {
  const digitos = String(valor ?? '').replace(/\D/g, '');

  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) {
    return `+${digitos}`;
  }

  if (digitos.length === 10 || digitos.length === 11) {
    return `+55${digitos}`;
  }

  return null;
}

/** Exibe apenas o telefone que já pertence ao painel autenticado da loja. */
export function formatarTelefoneBrasil(valor: string): string {
  const normalizado = normalizarTelefoneBrasil(valor);
  if (!normalizado) return valor;
  const nacional = normalizado.slice(3);
  if (nacional.length === 11) {
    return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 7)}-${nacional.slice(7)}`;
  }
  return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 6)}-${nacional.slice(6)}`;
}
