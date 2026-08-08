import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calcularTaxaPorDistancia,
  normalizarSetor,
  normalizarTexto,
  normalizarTipoTaxa,
  validarLimitesDaCotacao,
} from '../lib/delivery/tipos.ts';

test('taxa por km arredonda em centavos', () => {
  assert.equal(calcularTaxaPorDistancia(5000, 2), 10);
  assert.equal(calcularTaxaPorDistancia(3333, 1.5), 5);
});

test('taxa por km rejeita distância ou valor inválidos', () => {
  assert.throws(() => calcularTaxaPorDistancia(-1, 2), /DISTANCIA_INVALIDA/);
  assert.throws(() => calcularTaxaPorDistancia(1000, -2), /VALOR_KM_INVALIDO/);
});

test('cotação acima do teto de segurança é barrada, mesmo dentro da distância', () => {
  // Regressão do bug citado na spec: entrega nunca deveria passar de ~R$40
  // sem ser sinalizada como suspeita.
  const problema = validarLimitesDaCotacao({
    distanciaMetros: 8000,
    taxa: 55,
    distanciaMaximaKm: 30,
    taxaMaxima: 40,
  });
  assert.equal(problema, 'TAXA_ACIMA_LIMITE');
});

test('distância fora da área atendida é barrada mesmo com taxa baixa', () => {
  const problema = validarLimitesDaCotacao({
    distanciaMetros: 40000,
    taxa: 12,
    distanciaMaximaKm: 30,
    taxaMaxima: 40,
  });
  assert.equal(problema, 'FORA_DA_AREA');
});

test('cotação dentro dos limites passa sem problema', () => {
  const problema = validarLimitesDaCotacao({
    distanciaMetros: 4000,
    taxa: 12,
    distanciaMaximaKm: 30,
    taxaMaxima: 40,
  });
  assert.equal(problema, null);
});

test('normalizarTexto ignora acento, caixa e espaços duplicados', () => {
  assert.equal(normalizarTexto('  São  Paulo  '), 'sao paulo');
  assert.equal(normalizarTexto('CAMPINA GRANDE'), 'campina grande');
});

test('normalizarSetor e normalizarTipoTaxa nunca aceitam valor fora da lista', () => {
  assert.equal(normalizarSetor('avancado'), 'avancado');
  assert.equal(normalizarSetor('qualquer-coisa'), 'facilitado');
  assert.equal(normalizarSetor(undefined), 'facilitado');
  assert.equal(normalizarTipoTaxa('por_km'), 'por_km');
  assert.equal(normalizarTipoTaxa('outra'), 'fixa');
});
