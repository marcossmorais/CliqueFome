import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acaoDisponivelNaCozinha,
  destinoDoPedido,
  ordenarPorPrioridadeCozinha,
  validarRespostaTransicaoCozinha,
} from '../../lib/cozinha/tipos.ts';

test('encaminha retirada para retirada local', () => {
  assert.equal(
    destinoDoPedido({ tipo: 'retirada', endereco: null }).id,
    'retirada'
  );
});

test('encaminha balcão e mesa para seus pontos operacionais', () => {
  assert.equal(
    destinoDoPedido({ tipo: 'balcao', endereco: null }).id,
    'balcao'
  );
  assert.equal(
    destinoDoPedido({ tipo: 'mesa', endereco: null }).id,
    'salao'
  );
});

test('encomenda permanece retirada local mesmo quando preserva endereço', () => {
  assert.equal(
    destinoDoPedido({ tipo: 'encomenda', endereco: 'Rua A, 10' }).id,
    'retirada'
  );
  assert.equal(
    destinoDoPedido({ tipo: 'encomenda', endereco: '   ' }).id,
    'retirada'
  );
  assert.equal(
    destinoDoPedido({ tipo: 'encomenda', endereco: null }).id,
    'retirada'
  );
});

test('receber pedido inicia o preparo sem pular a máquina de estados', () => {
  assert.deepEqual(
    acaoDisponivelNaCozinha({
      status: 'confirmado',
      tipo: 'retirada',
      endereco: null,
    }),
    {
      statusEsperado: 'confirmado',
      novoStatus: 'em_preparo',
      rotulo: 'Receber pedido',
    }
  );
});

test('pedido em preparo fica pronto com rótulo do destino', () => {
  assert.deepEqual(
    acaoDisponivelNaCozinha({
      status: 'em_preparo',
      tipo: 'encomenda',
      endereco: 'Rua A, 10',
    }),
    {
      statusEsperado: 'em_preparo',
      novoStatus: 'pronto',
      rotulo: 'Pedido pronto — retirada local',
    }
  );
});

test('a cozinha não avança um pedido que já está pronto', () => {
  assert.equal(
    acaoDisponivelNaCozinha({
      status: 'pronto',
      tipo: 'balcao',
      endereco: null,
    }),
    null
  );
});

test('aceita somente a confirmação exata da RPC de transição', () => {
  assert.doesNotThrow(() =>
    validarRespostaTransicaoCozinha(
      { ok: true, status: 'em_preparo' },
      'em_preparo'
    )
  );

  assert.throws(
    () =>
      validarRespostaTransicaoCozinha(
        { ok: true, status: 'pronto' },
        'em_preparo'
      ),
    /confirmação esperada/
  );
  assert.throws(
    () => validarRespostaTransicaoCozinha(null, 'pronto'),
    /confirmação esperada/
  );
});

test('propaga o conflito explícito retornado pela RPC', () => {
  assert.throws(
    () =>
      validarRespostaTransicaoCozinha(
        { ok: false, message: 'Status desatualizado.' },
        'pronto'
      ),
    /Status desatualizado/
  );
});

test('encomenda futura não passa à frente de pedido imediato', () => {
  const ordenados = ordenarPorPrioridadeCozinha([
    {
      id: 'encomenda-futura',
      tipo: 'encomenda',
      data_hora_agendada: '2026-08-10T18:00:00-03:00',
      criado_em: '2026-08-08T08:00:00-03:00',
    },
    {
      id: 'retirada-agora',
      tipo: 'retirada',
      data_hora_agendada: null,
      criado_em: '2026-08-08T09:00:00-03:00',
    },
  ]);

  assert.deepEqual(
    ordenados.map((pedido) => pedido.id),
    ['retirada-agora', 'encomenda-futura']
  );
});

test('encomenda atrasada sobe para o começo da fila', () => {
  const ordenados = ordenarPorPrioridadeCozinha([
    {
      id: 'retirada-recente',
      tipo: 'retirada',
      data_hora_agendada: null,
      criado_em: '2026-08-08T09:00:00-03:00',
    },
    {
      id: 'encomenda-atrasada',
      tipo: 'encomenda',
      data_hora_agendada: '2026-08-08T08:30:00-03:00',
      criado_em: '2026-08-01T09:00:00-03:00',
    },
  ]);

  assert.equal(ordenados[0].id, 'encomenda-atrasada');
});
