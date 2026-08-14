import test from 'node:test';
import assert from 'node:assert/strict';
import { destinoAposLogin } from '../lib/auth/destino.ts';
import { MENU } from '../lib/menu.ts';

test('superadmin sempre inicia no painel da plataforma', () => {
  assert.equal(destinoAposLogin(true, null), '/superadmin');
  assert.equal(destinoAposLogin(true, '/painel/loja-teste/inicio'), '/superadmin');
});

test('lojista só retorna para rotas do painel de lojas', () => {
  assert.equal(destinoAposLogin(false, '/painel/loja-teste/pedidos'), '/painel/loja-teste/pedidos');
  assert.equal(destinoAposLogin(false, '/superadmin'), '/painel');
  assert.equal(destinoAposLogin(false, '//site-externo.example'), '/painel');
});

test('menu leva Financeiro à integração sem reaproveitar o histórico', () => {
  const itens = MENU.flatMap((grupo) => grupo.itens);
  const financeiro = itens.find((item) => item.id === 'financeiro');

  assert.equal(financeiro?.nome, 'Financeiro');
  assert.equal(financeiro?.rota, undefined);
  assert.equal(itens.some((item) => ['vendas', 'avaliacoes', 'integracoes'].includes(item.id)), false);
});
