export type EnderecoPorCep = {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
};

export function somenteDigitosCep(valor: string) {
  return valor.replace(/\D/g, '').slice(0, 8);
}
