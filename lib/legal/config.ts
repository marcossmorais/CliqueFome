export type DadosLegais = {
  razaoSocial: string;
  cnpj: string;
  endereco: string;
  emailPrivacidade: string;
  dataVigencia: string;
};

export const CAMPOS_LEGAIS_OBRIGATORIOS: { chave: keyof DadosLegais; nome: string }[] = [
  { chave: 'razaoSocial', nome: 'razão social' },
  { chave: 'cnpj', nome: 'CNPJ' },
  { chave: 'endereco', nome: 'endereço da empresa' },
  { chave: 'emailPrivacidade', nome: 'e-mail de privacidade' },
  { chave: 'dataVigencia', nome: 'data de vigência' },
];

export function avaliarDadosLegais(dados: DadosLegais) {
  const faltantes = CAMPOS_LEGAIS_OBRIGATORIOS
    .filter(({ chave }) => !dados[chave].trim())
    .map(({ nome }) => nome);

  return {
    publicavel: faltantes.length === 0,
    faltantes,
  };
}

/**
 * Dados jurídicos ficam apenas no servidor. Como a página é gerada no build,
 * qualquer mudança dessas variáveis exige uma nova publicação.
 */
export function obterDadosLegais(): DadosLegais {
  return {
    razaoSocial: process.env.CLIQUEFOME_RAZAO_SOCIAL?.trim() ?? '',
    cnpj: process.env.CLIQUEFOME_CNPJ?.trim() ?? '',
    endereco: process.env.CLIQUEFOME_ENDERECO?.trim() ?? '',
    emailPrivacidade: process.env.CLIQUEFOME_EMAIL_PRIVACIDADE?.trim() ?? '',
    dataVigencia: process.env.CLIQUEFOME_DATA_VIGENCIA?.trim() ?? '',
  };
}

export function exibirOuPendente(valor: string): string {
  return valor.trim() || '[PENDENTE DE PREENCHIMENTO]';
}
