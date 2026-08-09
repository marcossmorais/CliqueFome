import assert from 'node:assert/strict';
import test from 'node:test';
import { intervaloDashboard, montarResumoDashboard } from '../lib/dashboard/metricas.ts';

const AGORA = new Date('2026-08-09T22:30:00-03:00');

function pedido(id, criado_em, total, status = 'pendente', pagamento_status = 'pendente') {
  return { id, criado_em, total, status, pagamento_status };
}

test('define hoje e as duas janelas de sete dias no fuso da operação', () => {
  assert.deepEqual(intervaloDashboard(AGORA), {
    hoje: '2026-08-09',
    amanha: '2026-08-10',
    ontem: '2026-08-08',
    inicio7Dias: '2026-08-03',
    inicio7DiasAnteriores: '2026-07-27',
  });
});

test('concilia vendas, estados e pagamentos sem contar cancelado como receita', () => {
  const pedidos = [
    pedido('1', '2026-08-09T20:00:00-03:00', 40),
    pedido('2', '2026-08-09T20:40:00-03:00', 60, 'concluido', 'confirmado'),
    pedido('3', '2026-08-09T21:00:00-03:00', 30, 'cancelado'),
    pedido('4', '2026-08-08T19:00:00-03:00', 50, 'concluido', 'confirmado'),
    pedido('5', '2026-08-05T18:00:00-03:00', 100, 'concluido', 'confirmado'),
    pedido('6', '2026-08-02T18:00:00-03:00', 200, 'concluido', 'confirmado'),
  ];
  const resumo = montarResumoDashboard(pedidos, [
    { nome: 'X-Bacon', quantidade: 2 },
    { nome: 'X-Bacon', quantidade: 2 },
    { nome: 'Batata G', quantidade: 3 },
  ], AGORA);

  assert.equal(resumo.vendasHoje, 100);
  assert.equal(resumo.pedidosHoje, 3);
  assert.equal(resumo.ticketMedio, 50);
  assert.equal(resumo.aguardando, 1);
  assert.equal(resumo.concluidos, 1);
  assert.equal(resumo.cancelados, 1);
  assert.equal(resumo.pagamentosPendentes, 1);
  assert.equal(resumo.valorPendente, 40);
  assert.equal(resumo.variacaoVendasHoje, 100);
  assert.equal(resumo.vendas7Dias, 250);
  assert.equal(resumo.variacao7Dias, 25);
  assert.equal(resumo.horarioPico?.rotulo, '20h');
  assert.deepEqual(resumo.maisVendidos[0], { nome: 'X-Bacon', quantidade: 4 });
});

test('não inventa tendência quando não existe base anterior', () => {
  const resumo = montarResumoDashboard([
    pedido('1', '2026-08-09T12:00:00-03:00', 20),
  ], [], AGORA);
  assert.equal(resumo.variacaoVendasHoje, null);
  assert.equal(resumo.variacaoPedidosHoje, null);
  assert.equal(resumo.variacao7Dias, null);
});
