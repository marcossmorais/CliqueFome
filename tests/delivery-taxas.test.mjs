import assert from 'node:assert/strict';
import test from 'node:test';
import {
  escolherTaxaEspecifica,
  fecharCotacaoPorKm,
  planejarCotacao,
  taxaPorDistanciaCents,
  MENSAGEM_INDISPONIVEL,
} from '../lib/delivery/taxas.ts';

const BASE = {
  enabled: true,
  calculationType: 'PER_KM',
  fixedFeeCents: 500,
  pricePerKmCents: 200, // R$ 2,00/km
  maxFeeCents: 4000,
  maxDistanceMeters: 30000,
  origem: { latitude: -7.33, longitude: -35.33 },
  atualizadoEm: '2026-08-11T00:00:00.000Z',
};

const config = (extra = {}) => ({ ...BASE, ...extra });
const destino = (cidade, bairro = '') => ({ cityNormalized: cidade, neighborhoodNormalized: bairro });

const CENTRO = { id: 'ov-centro', scope: 'NEIGHBORHOOD', cityNormalized: 'campina grande', neighborhoodNormalized: 'centro', feeCents: 500 };
const SAO_JOSE = { id: 'ov-sj', scope: 'NEIGHBORHOOD', cityNormalized: 'campina grande', neighborhoodNormalized: 'sao jose', feeCents: 700 };
const CIDADE_CG = { id: 'ov-cg', scope: 'CITY', cityNormalized: 'campina grande', neighborhoodNormalized: null, feeCents: 1000 };

// ---------------------------------------------------------------------------
// Regra base
// ---------------------------------------------------------------------------

test('FIXED usa a taxa fixa e NAO precisa de rota', () => {
  const plano = planejarCotacao({
    config: config({ calculationType: 'FIXED' }),
    taxasEspecificas: [],
    destino: destino('campina grande', 'centro'),
  });
  assert.equal(plano.tipo, 'pronto', 'FIXED jamais pode pedir rota — gastaria crédito à toa');
  assert.equal(plano.feeCents, 500);
  assert.equal(plano.regra, 'FIXED');
});

test('PER_KM sem override precisa de rota', () => {
  const plano = planejarCotacao({ config: config(), taxasEspecificas: [], destino: destino('campina grande', 'centro') });
  assert.equal(plano.tipo, 'precisa_rota');
  assert.equal(plano.regra, 'PER_KM');
});

test('PER_KM sem coordenada da loja fica indisponivel, nao vira taxa zero', () => {
  const plano = planejarCotacao({ config: config({ origem: null }), taxasEspecificas: [], destino: destino('x', 'y') });
  assert.equal(plano.tipo, 'indisponivel');
  assert.equal(plano.motivo, 'SEM_ORIGEM');
});

test('delivery desligado nao produz cotacao', () => {
  const plano = planejarCotacao({ config: config({ enabled: false }), taxasEspecificas: [], destino: destino('x', 'y') });
  assert.equal(plano.tipo, 'indisponivel');
  assert.equal(plano.motivo, 'DELIVERY_DESLIGADO');
});

// ---------------------------------------------------------------------------
// Overrides e prioridade
// ---------------------------------------------------------------------------

test('override de BAIRRO vence override de CIDADE', () => {
  const escolhido = escolherTaxaEspecifica([CIDADE_CG, CENTRO], destino('campina grande', 'centro'));
  assert.equal(escolhido.id, 'ov-centro');
  assert.equal(escolhido.feeCents, 500);
});

test('sem bairro correspondente, cai no override de CIDADE', () => {
  const escolhido = escolherTaxaEspecifica([CIDADE_CG, CENTRO], destino('campina grande', 'bairro qualquer'));
  assert.equal(escolhido.id, 'ov-cg');
  assert.equal(escolhido.feeCents, 1000);
});

test('override de bairro NAO vaza entre cidades', () => {
  // "Centro" existe em toda cidade. Casar só pelo bairro faria a taxa do
  // Centro de Campina Grande valer no Centro de outra cidade.
  const escolhido = escolherTaxaEspecifica([CENTRO], destino('joao pessoa', 'centro'));
  assert.equal(escolhido, null);
});

test('cidade sem nenhuma regra devolve null e cai na regra base', () => {
  assert.equal(escolherTaxaEspecifica([CENTRO, CIDADE_CG], destino('recife', 'boa viagem')), null);
});

test('override SUBSTITUI a regra base por km — nunca soma', () => {
  // Base R$2/km, bairro Centro R$5. Entrega no Centro custa R$5 e ponto.
  const plano = planejarCotacao({
    config: config(),
    taxasEspecificas: [CENTRO],
    destino: destino('campina grande', 'centro'),
  });
  assert.equal(plano.tipo, 'pronto');
  assert.equal(plano.feeCents, 500, 'override e o valor final, nao um adicional');
  assert.equal(plano.regra, 'OVERRIDE_NEIGHBORHOOD');
  assert.equal(plano.overrideId, 'ov-centro');
});

test('override SUBSTITUI tambem a taxa fixa — nunca soma', () => {
  const plano = planejarCotacao({
    config: config({ calculationType: 'FIXED', fixedFeeCents: 500 }),
    taxasEspecificas: [CIDADE_CG],
    destino: destino('campina grande', 'centro'),
  });
  assert.equal(plano.feeCents, 1000, 'nao pode ser 500 + 1000');
  assert.equal(plano.regra, 'OVERRIDE_CITY');
});

test('override existente impede a chamada de rota mesmo com PER_KM', () => {
  // Este é o teste de economia de crédito: PER_KM + override = zero request.
  // Cada par é (regras cadastradas, destino que casa com alguma delas).
  const casos = [
    { taxas: [CENTRO], bairro: 'centro', esperado: 500 },
    { taxas: [CIDADE_CG], bairro: 'qualquer bairro', esperado: 1000 },
    { taxas: [CIDADE_CG, SAO_JOSE], bairro: 'sao jose', esperado: 700 },
    { taxas: [CIDADE_CG, SAO_JOSE], bairro: 'bairro sem regra', esperado: 1000 },
  ];
  for (const caso of casos) {
    const plano = planejarCotacao({
      config: config(),
      taxasEspecificas: caso.taxas,
      destino: destino('campina grande', caso.bairro),
    });
    assert.equal(plano.tipo, 'pronto', `com override aplicavel a rota nao pode ser chamada (${caso.bairro})`);
    assert.equal(plano.feeCents, caso.esperado);
  }
});

test('PER_KM cai na rota quando NENHUM override casa com o destino', () => {
  const plano = planejarCotacao({
    config: config(),
    taxasEspecificas: [CENTRO, SAO_JOSE],
    destino: destino('joao pessoa', 'centro'), // outra cidade
  });
  assert.equal(plano.tipo, 'precisa_rota');
});

test('dois bairros na mesma cidade nao se confundem', () => {
  const taxas = [CENTRO, SAO_JOSE, CIDADE_CG];
  assert.equal(escolherTaxaEspecifica(taxas, destino('campina grande', 'centro')).feeCents, 500);
  assert.equal(escolherTaxaEspecifica(taxas, destino('campina grande', 'sao jose')).feeCents, 700);
});

// ---------------------------------------------------------------------------
// Cálculo em metros/centavos
// ---------------------------------------------------------------------------

test('taxa por distancia calcula em centavos inteiros', () => {
  assert.equal(taxaPorDistanciaCents(5000, 200), 1000); // 5 km x R$2 = R$10
  assert.equal(taxaPorDistanciaCents(3333, 150), 500);  // arredonda uma vez só
  assert.equal(taxaPorDistanciaCents(0, 200), 0);
  assert.equal(taxaPorDistanciaCents(1, 200), 0);
});

test('taxa por distancia devolve inteiro, nunca centavo fracionado', () => {
  for (const metros of [1234, 5678, 9999, 15001, 27777]) {
    const cents = taxaPorDistanciaCents(metros, 237);
    assert.ok(Number.isInteger(cents), `${metros}m gerou centavo fracionado: ${cents}`);
  }
});

test('taxa por distancia rejeita entrada invalida em vez de devolver zero', () => {
  assert.throws(() => taxaPorDistanciaCents(-1, 200), /DISTANCIA_INVALIDA/);
  assert.throws(() => taxaPorDistanciaCents(1000.5, 200), /DISTANCIA_INVALIDA/);
  assert.throws(() => taxaPorDistanciaCents(1000, -5), /PRECO_KM_INVALIDO/);
  assert.throws(() => taxaPorDistanciaCents(1000, 1.5), /PRECO_KM_INVALIDO/);
});

test('fechar cotacao por km aplica o preco configurado', () => {
  const plano = fecharCotacaoPorKm({ config: config(), distanceMeters: 7500 });
  assert.equal(plano.tipo, 'pronto');
  assert.equal(plano.feeCents, 1500);
  assert.equal(plano.regra, 'PER_KM');
});

// ---------------------------------------------------------------------------
// Tetos de segurança
// ---------------------------------------------------------------------------

test('distancia acima do limite fica indisponivel, nao vira taxa', () => {
  const plano = fecharCotacaoPorKm({ config: config(), distanceMeters: 40000 });
  assert.equal(plano.tipo, 'indisponivel');
  assert.equal(plano.motivo, 'FORA_DA_AREA');
});

test('taxa acima do teto fica indisponivel mesmo dentro da distancia', () => {
  const plano = fecharCotacaoPorKm({ config: config({ maxFeeCents: 1000 }), distanceMeters: 20000 });
  assert.equal(plano.tipo, 'indisponivel');
  assert.equal(plano.motivo, 'TAXA_ACIMA_LIMITE');
});

test('override acima do teto tambem e barrado', () => {
  const plano = planejarCotacao({
    config: config({ maxFeeCents: 400 }),
    taxasEspecificas: [CENTRO],
    destino: destino('campina grande', 'centro'),
  });
  assert.equal(plano.tipo, 'indisponivel');
  assert.equal(plano.motivo, 'TAXA_ACIMA_LIMITE');
});

// ---------------------------------------------------------------------------
// Nunca taxa zero por acidente
// ---------------------------------------------------------------------------

test('nenhum caminho de indisponibilidade devolve taxa', () => {
  const casos = [
    planejarCotacao({ config: config({ enabled: false }), taxasEspecificas: [], destino: destino('x', 'y') }),
    planejarCotacao({ config: config({ origem: null }), taxasEspecificas: [], destino: destino('x', 'y') }),
    fecharCotacaoPorKm({ config: config(), distanceMeters: 999999 }),
  ];
  for (const plano of casos) {
    assert.equal(plano.tipo, 'indisponivel');
    assert.equal('feeCents' in plano, false, 'plano indisponivel nao pode carregar taxa — e assim que nasce frete zero');
  }
});

test('toda indisponibilidade tem mensagem humana, sem codigo tecnico', () => {
  for (const [motivo, mensagem] of Object.entries(MENSAGEM_INDISPONIVEL)) {
    assert.ok(mensagem.length > 15, `${motivo} sem mensagem de verdade`);
    assert.doesNotMatch(mensagem, /[A-Z]{4,}_[A-Z]{3,}|50\d|429|ROUTING|PROVIDER/, `${motivo} vaza codigo tecnico`);
  }
});
