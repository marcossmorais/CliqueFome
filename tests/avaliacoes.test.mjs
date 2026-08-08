import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const tiposFonte = await readFile(new URL('../lib/avaliacoes/tipos.ts', import.meta.url), 'utf8');
const migracaoFonte = await readFile(new URL('../schema-migracao-avaliacoes.sql', import.meta.url), 'utf8');

test('Plano Básico é normalizado como padrão seguro', () => {
  assert.match(tiposFonte, /valor === 'pro' \|\| valor === 'pro_plus'/);
  assert.match(tiposFonte, /: 'basico';/);
});

test('Plano Básico mantém as duas avaliações permanentemente ativas', () => {
  assert.match(tiposFonte, /if \(plano === 'basico'\)/);
  assert.match(tiposFonte, /produtosAtivos: true, marcaAtiva: true/);
  assert.match(migracaoFonte, /new\.plano = 'basico'/i);
  assert.match(migracaoFonte, /avaliacoes_produtos_ativas = true/i);
  assert.match(migracaoFonte, /avaliacoes_marca_ativas = true/i);
});

test('somente Pro e Pro+ podem alterar preferências', () => {
  assert.match(tiposFonte, /plano === 'pro' \|\| plano === 'pro_plus'/);
  assert.match(migracaoFonte, /coalesce\(v_plano, 'basico'\) not in \('pro', 'pro_plus'\)/i);
});

test('RPC não é executável por anon e valida o dono da loja', () => {
  assert.match(migracaoFonte, /revoke execute on function public\.configurar_avaliacoes[\s\S]*from anon/i);
  assert.match(migracaoFonte, /l\.dono_id = auth\.uid\(\)/i);
});
