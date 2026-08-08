import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fimExclusivoIso,
  inicioDoDiaIso,
  resolverPeriodo,
  sanitizarBuscaHistorico,
} from '../lib/pedidos/historico.ts';

const AGORA = new Date('2026-08-08T15:00:00-03:00');

test('resolve os três atalhos de período sem incluir dias extras', () => {
  assert.deepEqual(resolverPeriodo('', '', 'hoje', AGORA), { inicio: '2026-08-08', fim: '2026-08-08' });
  assert.deepEqual(resolverPeriodo('', '', '7dias', AGORA), { inicio: '2026-08-02', fim: '2026-08-08' });
  assert.deepEqual(resolverPeriodo('', '', 'mes', AGORA), { inicio: '2026-08-01', fim: '2026-08-08' });
});

test('mantém período manual válido e descarta datas inválidas', () => {
  assert.deepEqual(resolverPeriodo('2026-07-01', '2026-07-31', '', AGORA), {
    inicio: '2026-07-01',
    fim: '2026-07-31',
  });
  assert.deepEqual(resolverPeriodo('ontem', '31/07/2026', '', AGORA), { inicio: '', fim: '' });
});

test('usa início inclusivo e fim exclusivo no fuso da operação', () => {
  assert.equal(inicioDoDiaIso('2026-08-08'), '2026-08-08T00:00:00-03:00');
  assert.equal(fimExclusivoIso('2026-08-08'), '2026-08-09T00:00:00-03:00');
});

test('remove operadores da gramática PostgREST da busca', () => {
  assert.equal(sanitizarBuscaHistorico('  Ana,(or.status.eq.cancelado)  '), 'Ana or status eq cancelado');
  assert.equal(sanitizarBuscaHistorico("João +55-11"), 'João +55-11');
});
