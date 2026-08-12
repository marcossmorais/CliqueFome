export type EnderecoDelivery = {
  cep: string;
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  complemento: string | null;
};

export type Coordenadas = {
  latitude: number;
  longitude: number;
};

export type ItemDeliveryEntrada = {
  produtoId: string;
  quantidade: number;
  observacao?: string;
  complementos?: { complementoId: string; quantidade: number }[];
};

export type CotacaoDeliveryPublica = {
  quoteId: string;
  deliveryFeeCents: number;
  address: EnderecoDelivery;
  expiresAt: string;
};

export type ModoTaxaDelivery = 'FIXED' | 'PER_KM';
export type ModalidadePedido = 'retirada' | 'delivery';

export type ConfiguracaoCalculoDelivery = {
  feeMode: ModoTaxaDelivery;
  fixedFeeCents: number | null;
  pricePerKmCents: number | null;
  freeDeliveryThresholdCents: number | null;
};
