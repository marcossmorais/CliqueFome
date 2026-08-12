import type { EnderecoDelivery } from './tipos';

const LIMITES = {
  rua: 120,
  numero: 20,
  bairro: 80,
  cidade: 80,
  complemento: 120,
} as const;

export class ErroEnderecoDelivery extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErroEnderecoDelivery';
  }
}

export type RespostaViaCep = {
  erro?: boolean;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
};

export function aplicarRespostaViaCep(atual: EnderecoDelivery, dados: RespostaViaCep): EnderecoDelivery {
  return {
    ...atual,
    rua: dados.logradouro?.trim() || atual.rua,
    bairro: dados.bairro?.trim() || atual.bairro,
    cidade: dados.localidade?.trim() || atual.cidade,
    uf: dados.uf?.trim().toUpperCase() || atual.uf,
  };
}

function textoObrigatorio(valor: unknown, campo: keyof typeof LIMITES) {
  const texto = String(valor ?? '').trim().replace(/\s+/g, ' ');
  if (!texto || texto.length > LIMITES[campo]) {
    throw new ErroEnderecoDelivery(`Campo \"${campo}\" inválido.`);
  }
  return texto;
}

export function normalizarCep(valor: unknown) {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  if (digitos.length !== 8) throw new ErroEnderecoDelivery('Informe um CEP válido.');
  return digitos;
}

export function formatarCep(valor: string) {
  const digitos = valor.replace(/\D/g, '').slice(0, 8);
  return digitos.length > 5 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
}

export function validarEnderecoDelivery(valor: unknown): EnderecoDelivery {
  if (!valor || typeof valor !== 'object') {
    throw new ErroEnderecoDelivery('Preencha o endereço de entrega.');
  }

  const entrada = valor as Record<string, unknown>;
  const uf = String(entrada.uf ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(uf)) throw new ErroEnderecoDelivery('Informe uma UF válida.');

  const complementoBruto = String(entrada.complemento ?? '').trim().replace(/\s+/g, ' ');
  if (complementoBruto.length > LIMITES.complemento) {
    throw new ErroEnderecoDelivery('Campo \"complemento\" inválido.');
  }

  return {
    cep: normalizarCep(entrada.cep),
    rua: textoObrigatorio(entrada.rua, 'rua'),
    numero: textoObrigatorio(entrada.numero, 'numero'),
    bairro: textoObrigatorio(entrada.bairro, 'bairro'),
    cidade: textoObrigatorio(entrada.cidade, 'cidade'),
    uf,
    complemento: complementoBruto || null,
  };
}

export function montarEnderecoCompleto(endereco: EnderecoDelivery) {
  return [
    `${endereco.rua}, ${endereco.numero}`,
    endereco.bairro,
    endereco.cidade,
    endereco.uf,
    formatarCep(endereco.cep),
    'Brasil',
  ].join(', ');
}
