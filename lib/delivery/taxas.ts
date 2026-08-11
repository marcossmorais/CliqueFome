/**
 * Motor de taxas do Delivery.
 *
 * Módulo puro: nenhuma chamada de rede, nenhum acesso a banco. Recebe a
 * configuração e o destino, devolve quanto custa — ou avisa que precisa de
 * uma rota pra decidir. É o que permite testar a regra inteira (inclusive
 * "o provedor NÃO pode ser chamado neste caso") sem subir nada.
 *
 * A decisão de chamar ou não a API de rota acontece em `planejarCotacao`,
 * ANTES de qualquer request. Não é otimização: chamar Routing quando existe
 * um override aplicável gastaria crédito pra calcular um número que seria
 * descartado na linha seguinte.
 */

/**
 * `FIXED_PLUS_KM` = uma taxa base cobrada sempre, MAIS o valor por quilômetro
 * rodado. É o modelo de quem tem custo de saída (a moto sai da loja de
 * qualquer jeito) e ainda quer cobrar a distância por cima.
 */
export type TipoCalculo = 'FIXED' | 'PER_KM' | 'FIXED_PLUS_KM';
export type EscopoOverride = 'CITY' | 'NEIGHBORHOOD';

/** Qual regra produziu a taxa. Vai no snapshot do pedido, pra a loja
 *  conseguir explicar meses depois por que aquela entrega custou aquilo. */
export type RegraAplicada = 'OVERRIDE_NEIGHBORHOOD' | 'OVERRIDE_CITY' | 'FIXED' | 'PER_KM' | 'FIXED_PLUS_KM';

export type ConfiguracaoEntrega = {
  enabled: boolean;
  calculationType: TipoCalculo;
  fixedFeeCents: number;
  pricePerKmCents: number;
  maxFeeCents: number;
  maxDistanceMeters: number;
  origem: { latitude: number; longitude: number } | null;
  /** `updated_at` da configuração — vira settingsVersion no token. */
  atualizadoEm: string;
};

export type TaxaEspecifica = {
  id: string;
  scope: EscopoOverride;
  cityNormalized: string;
  neighborhoodNormalized: string | null;
  feeCents: number;
};

export type DestinoNormalizado = {
  cityNormalized: string;
  neighborhoodNormalized: string;
};

export type MotivoIndisponivel =
  | 'DELIVERY_DESLIGADO'
  | 'SEM_ORIGEM'
  | 'FORA_DA_AREA'
  | 'TAXA_ACIMA_LIMITE';

export type PlanoCotacao =
  | { tipo: 'pronto'; feeCents: number; regra: RegraAplicada; overrideId: string | null }
  | { tipo: 'precisa_rota'; regra: 'PER_KM' | 'FIXED_PLUS_KM' }
  | { tipo: 'indisponivel'; motivo: MotivoIndisponivel };

/**
 * Escolhe a taxa específica que vale para o destino.
 *
 * Prioridade exata: BAIRRO vence CIDADE. E o override de bairro exige que a
 * CIDADE também bata — "Centro" existe em toda cidade do país, e casar só
 * pelo bairro faria a taxa do Centro de uma cidade vazar pra outra.
 *
 * Devolve `null` quando nada se aplica: aí vale a regra base.
 */
export function escolherTaxaEspecifica(
  taxas: TaxaEspecifica[],
  destino: DestinoNormalizado,
): TaxaEspecifica | null {
  const cidade = destino.cityNormalized;
  const bairro = destino.neighborhoodNormalized;

  if (bairro) {
    const porBairro = taxas.find(
      (t) => t.scope === 'NEIGHBORHOOD' && t.cityNormalized === cidade && t.neighborhoodNormalized === bairro,
    );
    if (porBairro) return porBairro;
  }

  return taxas.find((t) => t.scope === 'CITY' && t.cityNormalized === cidade) ?? null;
}

/** Centavos por metro, sem passar por float financeiro: multiplica antes de
 *  dividir e arredonda uma vez só no fim. */
export function taxaPorDistanciaCents(distanceMeters: number, pricePerKmCents: number) {
  if (!Number.isInteger(distanceMeters) || distanceMeters < 0) throw new Error('DISTANCIA_INVALIDA');
  if (!Number.isInteger(pricePerKmCents) || pricePerKmCents < 0) throw new Error('PRECO_KM_INVALIDO');
  return Math.round((distanceMeters * pricePerKmCents) / 1000);
}

/**
 * Decide o que fazer ANTES de qualquer chamada externa.
 *
 * `pronto` = a taxa já está definida, ninguém precisa falar com a Geoapify.
 * `precisa_rota` = só aqui a API de rota pode ser chamada.
 */
export function planejarCotacao({
  config,
  taxasEspecificas,
  destino,
}: {
  config: ConfiguracaoEntrega;
  taxasEspecificas: TaxaEspecifica[];
  destino: DestinoNormalizado;
}): PlanoCotacao {
  if (!config.enabled) return { tipo: 'indisponivel', motivo: 'DELIVERY_DESLIGADO' };

  // A taxa específica SUBSTITUI a regra base — não soma com ela, e não entra
  // no cálculo por km. Uma entrega no Centro com override de R$5 custa R$5,
  // e não R$5 mais o valor da distância.
  const especifica = escolherTaxaEspecifica(taxasEspecificas, destino);
  if (especifica) {
    if (especifica.feeCents > config.maxFeeCents) {
      return { tipo: 'indisponivel', motivo: 'TAXA_ACIMA_LIMITE' };
    }
    return {
      tipo: 'pronto',
      feeCents: especifica.feeCents,
      regra: especifica.scope === 'NEIGHBORHOOD' ? 'OVERRIDE_NEIGHBORHOOD' : 'OVERRIDE_CITY',
      overrideId: especifica.id,
    };
  }

  if (config.calculationType === 'FIXED') {
    if (config.fixedFeeCents > config.maxFeeCents) {
      return { tipo: 'indisponivel', motivo: 'TAXA_ACIMA_LIMITE' };
    }
    return { tipo: 'pronto', feeCents: config.fixedFeeCents, regra: 'FIXED', overrideId: null };
  }

  // Sem coordenada da loja não há como traçar rota — vale pros dois modos
  // que dependem de distância.
  if (!config.origem) return { tipo: 'indisponivel', motivo: 'SEM_ORIGEM' };
  return { tipo: 'precisa_rota', regra: config.calculationType };
}

/** Fecha a cotação por km depois que a rota respondeu. Separada de
 *  `planejarCotacao` justamente pra deixar explícito que só este caminho
 *  depende de rede. */
export function fecharCotacaoPorKm({
  config,
  distanceMeters,
}: {
  config: ConfiguracaoEntrega;
  distanceMeters: number;
}): PlanoCotacao {
  if (distanceMeters > config.maxDistanceMeters) {
    return { tipo: 'indisponivel', motivo: 'FORA_DA_AREA' };
  }
  const porDistancia = taxaPorDistanciaCents(distanceMeters, config.pricePerKmCents);
  // FIXED_PLUS_KM soma a base à distância. É a ÚNICA soma do motor inteiro —
  // e ela é entre as duas partes da MESMA regra base. Override continua
  // substituindo o resultado todo, nunca somando com ele.
  const combinada = config.calculationType === 'FIXED_PLUS_KM';
  const feeCents = combinada ? config.fixedFeeCents + porDistancia : porDistancia;
  if (feeCents > config.maxFeeCents) {
    return { tipo: 'indisponivel', motivo: 'TAXA_ACIMA_LIMITE' };
  }
  return { tipo: 'pronto', feeCents, regra: combinada ? 'FIXED_PLUS_KM' : 'PER_KM', overrideId: null };
}

/** Mensagens de tela. Nenhum código técnico do provedor chega ao cliente —
 *  "ROUTING_PROVIDER_500" não diz nada a quem só quer jantar. */
export const MENSAGEM_INDISPONIVEL: Record<MotivoIndisponivel, string> = {
  DELIVERY_DESLIGADO: 'A loja não está aceitando entregas agora.',
  SEM_ORIGEM: 'Esta loja ainda não terminou de configurar a entrega.',
  FORA_DA_AREA: 'Seu endereço está fora da área que esta loja atende.',
  TAXA_ACIMA_LIMITE: 'A taxa calculada ficou acima do limite da loja. Confirme pelo WhatsApp.',
};
