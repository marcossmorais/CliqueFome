/** Remove diferenças de caixa e acentuação para a busca da Central de Ajuda. */
export function normalizarBusca(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Todos os termos digitados precisam existir em algum ponto do conteúdo.
 * Assim, "pedido whatsapp" encontra uma resposta mesmo que as palavras não
 * estejam lado a lado.
 */
export function correspondeABusca(conteudo: string, consulta: string): boolean {
  const termos = normalizarBusca(consulta).split(' ').filter(Boolean);
  if (termos.length === 0) return true;

  const indice = normalizarBusca(conteudo);
  return termos.every((termo) => indice.includes(termo));
}
