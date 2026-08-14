import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('bottom navigation usa uma superficie realmente opaca', async () => {
  const css = await readFile(new URL('../app/[loja]/cliente.css', import.meta.url), 'utf8');
  const inicio = css.indexOf('  .cliente-nav-inferior{');
  const fim = css.indexOf('  .cliente-nav-inferior::before{', inicio);
  const regra = css.slice(inicio, fim);

  assert.ok(inicio >= 0 && fim > inicio);
  assert.match(regra, /position:fixed/);
  assert.match(regra, /width:100%/);
  assert.match(regra, /background-color:var\(--cliente-nav-fundo,#fff\)!important/);
  assert.match(regra, /opacity:1!important/);
  assert.match(regra, /-webkit-backdrop-filter:none!important/);
  assert.match(regra, /backdrop-filter:none!important/);
  assert.doesNotMatch(regra, /background(?:-color)?:[^;]*(?:rgba|hsla|transparent)/);
});

test('bottom navigation fica fora dos containers rolaveis do cardapio', async () => {
  const [cardapio, pedidos] = await Promise.all([
    readFile(new URL('../app/[loja]/CardapioClient.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/[loja]/meus-pedidos/MeusPedidosClient.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(cardapio, /<\/div>\s*<NavegacaoCliente lojaSlug=\{loja\.slug\}/);
  assert.match(pedidos, /<\/div>\s*<NavegacaoCliente lojaSlug=\{loja\.slug\}/);
});

test('carrinho fixo tambem compoe sobre um fundo solido', async () => {
  const css = await readFile(new URL('../app/[loja]/vitrine.css', import.meta.url), 'utf8');
  const inicio = css.indexOf('.cardapio-app .floating-cart{');
  const fim = css.indexOf('.cardapio-app .floating-cart-icon', inicio);
  const regra = css.slice(inicio, fim);

  assert.match(regra, /background-color:#14733d/);
  assert.match(regra, /background-image:linear-gradient\(var\(--verde-ui\),var\(--verde-ui\)\)/);
  assert.match(regra, /opacity:1!important/);
  assert.match(regra, /backdrop-filter:none!important/);
});
