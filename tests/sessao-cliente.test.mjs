import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { normalizarTelefoneBrasil } from '../lib/clientes/telefone.ts';
import { statusVisivelCliente } from '../lib/clientes/pedidos-publicos.ts';

test('telefone do cliente é normalizado no backend como E.164 brasileiro', () => {
  assert.equal(normalizarTelefoneBrasil('(83) 99999-9999'), '+5583999999999');
  assert.equal(normalizarTelefoneBrasil('55 83 99999-9999'), '+5583999999999');
  assert.equal(normalizarTelefoneBrasil('(83) 3333-4444'), '+558333334444');
  assert.equal(normalizarTelefoneBrasil('123'), null);
});

test('status público reutiliza pedido e entrega reais sem criar nova máquina', () => {
  assert.equal(statusVisivelCliente('em_preparo', null), 'em_preparo');
  assert.equal(statusVisivelCliente('pronto', { status: 'ASSIGNED' }), 'pronto');
  assert.equal(statusVisivelCliente('pronto', { status: 'OUT_FOR_DELIVERY' }), 'saiu_entrega');
  assert.equal(statusVisivelCliente('concluido', { status: 'DELIVERED' }), 'concluido');
});

test('Meus pedidos não aceita telefone como autorização pública', async () => {
  const fonte = await readFile(new URL('../app/api/lojas/[slug]/meus-pedidos/route.ts', import.meta.url), 'utf8');
  assert.match(fonte, /resolverSessaoCliente/);
  assert.match(fonte, /\.eq\('loja_id', sessao\.lojaId\)/);
  assert.match(fonte, /\.eq\('cliente_telefone_normalizado', sessao\.telefoneNormalizado\)/);
  assert.doesNotMatch(fonte, /searchParams\.get\(['"](?:phone|telefone|store_id|customer_id)['"]\)/);
});

test('sessão guarda somente hash e o cookie tem proteções do navegador', async () => {
  const [servidor, migracao] = await Promise.all([
    readFile(new URL('../lib/clientes/sessao-servidor.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260814040000_sessoes_clientes.sql', import.meta.url), 'utf8'),
  ]);
  assert.match(servidor, /randomBytes\(32\)/);
  assert.match(servidor, /token_hash: hashToken\(token\)/);
  assert.match(servidor, /httpOnly: true/);
  assert.match(servidor, /sameSite: 'lax'/);
  assert.match(migracao, /alter table public\.sessoes_clientes enable row level security/i);
  assert.match(migracao, /revoke all on table public\.sessoes_clientes from public, anon, authenticated/i);
});

test('pedido confirmado prepara sessão sem alterar o contrato do carrinho', async () => {
  const fonte = await readFile(new URL('../app/api/lojas/[slug]/pedidos/route.ts', import.meta.url), 'utf8');
  const rpc = fonte.indexOf("sb.rpc('criar_pedido_publico_");
  const sessao = fonte.indexOf('await prepararSessaoCliente');
  assert.ok(rpc >= 0);
  assert.ok(sessao > rpc);
  assert.match(fonte, /Pedido criado, mas não foi possível preparar a sessão do cliente/);
});
