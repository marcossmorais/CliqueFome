// Import só de tipo, de propósito: o `node --test` roda estes arquivos com
// type stripping, e uma importação de VALOR entre módulos .ts exigiria a
// extensão `.ts` explícita no caminho (que o bundler do Next não aceita).
// Importação de tipo é apagada antes de o Node resolver o módulo.
import type { EnderecoEstruturado } from './tipos';

/**
 * Formato interno de endereço do Delivery.
 *
 * Toda resposta de provedor (Geoapify hoje) é mapeada para cá na borda, e é
 * só isto que circula pelo resto do projeto. O motivo é troca de provedor:
 * quando `street`/`housenumber`/`suburb` viram outro nome amanhã, muda o
 * mapeamento em um lugar só — nenhum componente de tela sabe o formato bruto
 * de ninguém.
 *
 * `latitude`/`longitude` são anuláveis de propósito: o ViaCEP (fallback)
 * devolve endereço sem coordenada, e a geocodificação final que preenche
 * isso só acontece depois que o número é informado.
 */
export type DeliveryAddress = {
  formattedAddress: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
};

export const ENDERECO_ENTREGA_VAZIO: DeliveryAddress = {
  formattedAddress: '',
  street: '',
  number: '',
  neighborhood: '',
  city: '',
  state: '',
  postalCode: '',
  latitude: null,
  longitude: null,
};

/** Contratos que qualquer provedor futuro precisa cumprir. Dois métodos, de
 *  propósito — o Delivery não precisa de mais nada de um provedor de mapas. */
export type OpcoesAutocomplete = {
  /** Proximidade da loja, quando conhecida: melhora muito o resultado no
   *  celular, onde a pessoa digita "rua joao" e espera a rua do bairro dela. */
  bias?: { latitude: number; longitude: number } | null;
  limite?: number;
  signal?: AbortSignal;
};

export interface ProvedorEndereco {
  autocompletar(texto: string, opcoes?: OpcoesAutocomplete): Promise<DeliveryAddress[]>;
  geocodificar(texto: string): Promise<DeliveryAddress>;
}

export interface ProvedorRota {
  distanciaMetros(
    origem: { latitude: number; longitude: number },
    destino: { latitude: number; longitude: number },
  ): Promise<number>;
}

/** Só o que o cliente precisa ver na lista de sugestões. Nada de coordenada
 *  ou campo interno vazando pro navegador sem necessidade. */
export type SugestaoEnderecoPublica = {
  id: string;
  formattedAddress: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  precisaNumero: boolean;
};

export function temNumero(endereco: DeliveryAddress) {
  return endereco.number.trim().length > 0;
}

/** Uma sugestão só serve pra entrega se dá pra chegar nela: rua e cidade são
 *  o mínimo. Ponto de interesse solto ("Praça X") não entra na lista. */
export function sugestaoUtilizavel(endereco: DeliveryAddress) {
  return endereco.street.trim().length > 0 && endereco.city.trim().length > 0;
}

export function paraSugestaoPublica(endereco: DeliveryAddress, indice: number): SugestaoEnderecoPublica {
  return {
    // Só precisa ser estável e único dentro de uma lista de sugestões — é
    // chave de render, não identificador de domínio.
    id: `${indice}-${endereco.formattedAddress.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`,
    formattedAddress: endereco.formattedAddress,
    street: endereco.street,
    number: endereco.number,
    neighborhood: endereco.neighborhood,
    city: endereco.city,
    state: endereco.state,
    postalCode: endereco.postalCode,
    precisaNumero: !temNumero(endereco),
  };
}

/** Texto que vai pro provedor na geocodificação final, depois que a pessoa
 *  informou o número. Monta na ordem que a Geoapify entende melhor no Brasil. */
export function textoParaGeocodificar(endereco: DeliveryAddress) {
  const rua = [endereco.street.trim(), endereco.number.trim()].filter(Boolean).join(', ');
  return [rua, endereco.neighborhood.trim(), endereco.city.trim(), endereco.state.trim(), endereco.postalCode.trim()]
    .filter(Boolean)
    .join(', ');
}

/** Resumo curto pra confirmar na tela — o endereço formatado do provedor às
 *  vezes vem com país e CEP no meio, longo demais pro mobile. */
export function resumoEndereco(endereco: DeliveryAddress) {
  const rua = [endereco.street.trim(), endereco.number.trim()].filter(Boolean).join(', ');
  return [rua, endereco.neighborhood.trim(), [endereco.city.trim(), endereco.state.trim()].filter(Boolean).join(' - ')]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Ponte para o contrato antigo `EnderecoEstruturado`, que a cotação e a
 * criação de pedido ainda consomem.
 *
 * Existe pra este PR trocar SÓ a coleta do endereço sem mexer no motor de
 * taxas nem no create-order — os dois continuam recebendo exatamente o que
 * sempre receberam. Sai no PR do motor de taxas, quando a cotação passar a
 * falar `DeliveryAddress` direto.
 */
export function paraEnderecoEstruturado(
  endereco: DeliveryAddress,
  extras: { complemento?: string; referencia?: string } = {},
): EnderecoEstruturado {
  return {
    cep: endereco.postalCode.replace(/\D/g, ''),
    logradouro: endereco.street.trim(),
    numero: endereco.number.trim(),
    bairro: endereco.neighborhood.trim(),
    cidade: endereco.city.trim(),
    uf: endereco.state.trim().toUpperCase(),
    complemento: extras.complemento?.trim() || '',
    referencia: extras.referencia?.trim() || '',
  };
}

export function deEnderecoEstruturado(endereco: EnderecoEstruturado): DeliveryAddress {
  return {
    formattedAddress: '',
    street: endereco.logradouro,
    number: endereco.numero,
    neighborhood: endereco.bairro,
    city: endereco.cidade,
    state: endereco.uf,
    postalCode: endereco.cep,
    latitude: null,
    longitude: null,
  };
}

/** Campos que o endereço ainda não tem e a cotação vai exigir. A tela usa
 *  isto pra mostrar só o que falta, em vez de um formulário inteiro. */
export function camposFaltantes(endereco: DeliveryAddress): Array<'numero' | 'bairro' | 'cep'> {
  const faltando: Array<'numero' | 'bairro' | 'cep'> = [];
  if (!temNumero(endereco)) faltando.push('numero');
  if (endereco.neighborhood.trim().length < 2) faltando.push('bairro');
  if (endereco.postalCode.replace(/\D/g, '').length !== 8) faltando.push('cep');
  return faltando;
}
