import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numeroPedido, numeroPedidoComData } from '../lib/pedidos/numero.ts';

test('preenche com zeros até três dígitos', () => {
  assert.equal(numeroPedido(1), '#001');
  assert.equal(numeroPedido(42), '#042');
  assert.equal(numeroPedido(999), '#999');
});

test('acima de 999 segue natural, sem truncar', () => {
  assert.equal(numeroPedido(1000), '#1000');
  assert.equal(numeroPedido(14600), '#14600');
});

test('no histórico vem com data e hora, porque o número repete entre dias', () => {
  const texto = numeroPedidoComData(42, new Date(2026, 7, 13, 19, 37));
  assert.equal(texto, '#042 · 13/08/2026 · 19:37');
});
