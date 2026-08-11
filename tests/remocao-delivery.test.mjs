import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

import {
  ehCarrinhoValido,
  reconciliarCarrinho,
  subtotalLinha,
} from '../lib/cardapio/tipos.ts';
import { MENU, TODAS_AREAS } from '../lib/menu.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function caminho(...partes) {
  return path.join(ROOT, ...partes);
}

function fonte(...partes) {
  return readFileSync(caminho(...partes), 'utf8');
}

function arquivosRecursivos(diretorio) {
  if (!existsSync(diretorio)) return [];
  return readdirSync(diretorio, { withFileTypes: true }).flatMap((entrada) => {
    const atual = path.join(diretorio, entrada.name);
    return entrada.isDirectory() ? arquivosRecursivos(atual) : [atual];
  });
}

function nomesParametrosObjeto(bloco) {
  return [...bloco.matchAll(/^\s*(p_[a-z0-9_]+)\s*:/gim)].map((match) => match[1]);
}

test('carrinho de retirada preserva quantidade, total e reconcilia preco com o catalogo', () => {
  const linha = {
    lineId: 'produto-1-sem-opcoes',
    produtoId: 'produto-1',
    nome: 'Produto teste',
    precoUnit: 12,
    complementos: [],
    observacao: '',
    qty: 2,
  };

  assert.equal(ehCarrinhoValido([linha]), true);
  assert.equal(subtotalLinha(linha), 24);

  const produtoAtual = {
    id: 'produto-1',
    nome: 'Produto teste atualizado',
    preco: 13,
    preco_promocional: null,
    ativo: true,
    grupos: [],
  };
  const reconciliado = reconciliarCarrinho([linha], [produtoAtual]);

  assert.equal(reconciliado.linhas.length, 1);
  assert.equal(reconciliado.linhas[0].qty, 2);
  assert.equal(reconciliado.linhas[0].precoUnit, 13);
  assert.deepEqual(reconciliado.avisos, [
    { nome: 'Produto teste atualizado', motivo: 'reprecificado' },
  ]);
});

test('mensagem Pix continua sendo de retirada e usa o snapshot persistido', () => {
  const mensagem = fonte('lib', 'pedidos', 'mensagemWhatsapp.ts');

  assert.match(mensagem, /criar_pedido\(\) gravou em pedido_itens\/pedido_item_opcoes/);
  assert.match(mensagem, /'Retirada no local'/);
  assert.match(mensagem, /formaPagamento === 'pix_manual'/);
  assert.match(mensagem, /`Acompanhar: \$\{trackingUrl\}`/);
  assert.doesNotMatch(mensagem, /taxa de entrega|endereco de entrega/i);
});

test('route handler cria somente retirada pela RPC limpa e nao aceita loja_id do cliente', () => {
  const route = fonte('app', 'api', 'lojas', '[slug]', 'pedidos', 'route.ts');
  const match = route.match(
    /const parametros = \{([\s\S]*?)\n\s*\};\s*const \{ data, error \} = await sb\.rpc/
  );
  assert.ok(match, 'o objeto enviado a RPC precisa permanecer auditavel e imediatamente antes da chamada');

  const parametros = nomesParametrosObjeto(match[1]);
  assert.deepEqual(parametros, [
    'p_loja_slug',
    'p_cliente_nome',
    'p_cliente_telefone',
    'p_observacao',
    'p_forma_pagamento',
    'p_itens',
    'p_idempotency_key',
    'p_payload_hash',
    'p_total_esperado_centavos',
    'p_chave_ip',
    'p_chave_telefone',
  ]);
  assert.doesNotMatch(match[1], /p_(?:tipo|endereco|taxa|entrega|driver)/i);
  assert.equal(
    (route.match(/\.rpc\('criar_pedido_publico_retirada_v1', parametros\)/g) || []).length,
    1,
  );
  assert.match(
    route,
    /\.from\('lojas'\)[\s\S]*?\.select\('whatsapp_numero, recebendo_encomendas, retirada_ativa'\)[\s\S]*?\.eq\('slug', slug\)/,
  );
  assert.doesNotMatch(match[1], /loja_id|store_id/i);
});

test('migration e backend compartilham a assinatura pickup-only e os cinco pagamentos', () => {
  const migration = fonte(
    'supabase',
    'migrations',
    '20260811_remove_legacy_delivery_system.sql',
  );
  const inicio = migration.indexOf(
    'create or replace function public.criar_pedido_publico_retirada_v1(',
  );
  const fim = migration.indexOf('\ncommit;', inicio);
  assert.ok(inicio >= 0 && fim > inicio, 'a RPC de retirada deve existir dentro da transacao');
  const rpc = migration.slice(inicio, fim);

  const assinatura = rpc.match(/^create or replace function[^]*?\) returns jsonb/m)?.[0];
  assert.ok(assinatura, 'assinatura da RPC nao encontrada');
  const parametros = [...assinatura.matchAll(/^\s*(p_[a-z0-9_]+)\s+[a-z]+,?$/gim)]
    .map((match) => match[1]);
  assert.deepEqual(parametros, [
    'p_loja_slug',
    'p_cliente_nome',
    'p_cliente_telefone',
    'p_observacao',
    'p_forma_pagamento',
    'p_itens',
    'p_idempotency_key',
    'p_payload_hash',
    'p_total_esperado_centavos',
    'p_chave_ip',
    'p_chave_telefone',
  ]);
  assert.doesNotMatch(assinatura, /p_(?:tipo|endereco|taxa|entrega)/i);

  for (const forma of [
    'dinheiro',
    'cartao_credito',
    'cartao_debito',
    'pix_manual',
    'pagamento_retirada',
  ]) {
    assert.match(rpc, new RegExp(`'${forma}'`));
  }
  assert.match(rpc, /'retirada',\s*\n\s*null,\s*\n\s*p_observacao/);
  assert.doesNotMatch(rpc, /taxa_entrega/);
  assert.match(
    rpc,
    /revoke execute[\s\S]*from public, anon, authenticated;[\s\S]*grant execute[\s\S]*to service_role;/i,
  );
});

test('constraints e arrays persistidos nao reintroduzem delivery nem saiu_entrega', () => {
  const migration = fonte(
    'supabase',
    'migrations',
    '20260811_remove_legacy_delivery_system.sql',
  );
  const tipos = migration.match(
    /add constraint pedidos_tipo_check\s+check \(tipo in \(([^)]*)\)\)/i,
  )?.[1];
  const statuses = migration.match(
    /add constraint pedidos_status_check\s+check \(status in \(([^)]*)\)\)/i,
  )?.[1];
  assert.ok(tipos && statuses, 'constraints finais de pedido nao encontradas');
  assert.doesNotMatch(tipos, /delivery/i);
  assert.doesNotMatch(statuses, /saiu_entrega/i);
  assert.match(tipos, /'retirada'/);
  assert.match(tipos, /'encomenda'/);
  assert.match(statuses, /'pronto'/);
  assert.match(statuses, /'concluido'/);

  for (const tabela of ['produtos', 'grupos_complemento']) {
    assert.match(
      migration,
      new RegExp(
        `update public\\.${tabela}[\\s\\S]*?array_remove\\(tipos_pedido, 'delivery'\\)[\\s\\S]*?array\\['retirada'\\]`,
        'i',
      ),
    );
  }
});

test('rotas e modulos executaveis do Delivery antigo nao existem mais', () => {
  const appFiles = arquivosRecursivos(caminho('app'))
    .filter((arquivo) => /(?:page\.tsx|route\.ts)$/.test(arquivo))
    .map((arquivo) => path.relative(caminho('app'), arquivo).replaceAll('\\', '/'));
  const segmentosProibidos = /(^|\/)(delivery|deliveries|entrega|entregas|entregador|entregadores|drivers?|geocode|routing)(\/|$)/i;
  assert.deepEqual(appFiles.filter((arquivo) => segmentosProibidos.test(arquivo)), []);

  for (const legado of [
    ['app', 'api', 'delivery'],
    ['app', 'api', 'admin', 'delivery'],
    ['app', '(interno)', 'painel', '[loja]', 'delivery'],
    ['app', 'entregador'],
    ['components', 'delivery'],
    ['lib', 'delivery'],
  ]) {
    assert.deepEqual(
      arquivosRecursivos(caminho(...legado)),
      [],
      `${legado.join('/')} ainda contem implementacao executavel`,
    );
  }
});

test('checkout renderiza contrato de retirada sem controles de endereco ou frete', () => {
  const modal = fonte('app', '[loja]', 'CheckoutModal.tsx');
  const cardapio = fonte('app', '[loja]', 'CardapioClient.tsx');

  assert.match(modal, /<b>2<\/b> Retirada/);
  assert.match(modal, /<h3>Retirada<\/h3>/);
  assert.match(modal, /Retirar no estabelecimento/);
  assert.match(modal, /formasPagamentoPara\('retirada'\)/);
  assert.doesNotMatch(modal, /autocomplete=["'](?:street-address|postal-code)["']/i);
  assert.doesNotMatch(modal, /from ["'][^"']*\/delivery(?:\/|["'])/i);

  assert.match(cardapio, /const tipoPedido = 'retirada'/);
  assert.match(cardapio, /tipo:\s*'retirada'/);
  assert.doesNotMatch(cardapio, /tipo:\s*'delivery'/i);
});

test('dashboard, configuracoes, financeiro e pedidos continuam roteaveis', () => {
  for (const pagina of [
    ['app', '(interno)', 'painel', '[loja]', 'inicio', 'page.tsx'],
    ['app', '(interno)', 'painel', '[loja]', 'pedidos', 'page.tsx'],
    ['app', '(interno)', 'painel', '[loja]', 'config', 'page.tsx'],
    ['app', '(interno)', 'painel', '[loja]', '[area]', 'page.tsx'],
  ]) {
    assert.equal(existsSync(caminho(...pagina)), true, `${pagina.join('/')} precisa existir`);
  }

  const areas = new Map(TODAS_AREAS.map((area) => [area.id, area]));
  assert.equal(areas.get('inicio')?.pronta, true);
  assert.equal(areas.get('pedidos')?.pronta, true);
  assert.equal(areas.get('config')?.pronta, true);
  assert.equal(areas.has('financeiro'), true);

  const idsMenu = MENU.flatMap((grupo) => grupo.itens.map((item) => item.id));
  assert.equal(idsMenu.includes('financeiro'), true);
  assert.equal(idsMenu.some((id) => /delivery|entrega|entregador|driver/i.test(id)), false);

  const config = fonte('app', '(interno)', 'painel', '[loja]', 'config', 'ConfigHub.tsx');
  assert.match(config, /\/config\/funcionamento/);
  assert.match(config, /\/config\/assinatura/);
  assert.doesNotMatch(config, /\/delivery(?:\/|`|'|")/i);
});

test('consultas criticas mantem isolamento explicito entre Store A e Store B', () => {
  const loja = fonte('lib', 'loja.ts');
  const pedidosPage = fonte('app', '(interno)', 'painel', '[loja]', 'pedidos', 'page.tsx');
  const dashboard = fonte('app', '(interno)', 'painel', '[loja]', 'inicio', 'page.tsx');
  const pedidosClient = fonte('app', '(interno)', 'painel', '[loja]', 'pedidos', 'PedidosClient.tsx');
  const migration = fonte(
    'supabase',
    'migrations',
    '20260811_remove_legacy_delivery_system.sql',
  );

  assert.match(
    loja,
    /souAdmin \? consulta : consulta\.eq\('dono_id', user\.id\)/,
  );
  assert.ok(
    (pedidosPage.match(/\.eq\('loja_id', loja\.id\)/g) || []).length >= 3,
    'pedidos, categorias e produtos devem ser filtrados pela loja resolvida no servidor',
  );
  assert.match(dashboard, /\.from\('pedidos'\)[\s\S]*?\.eq\('loja_id', lojaId\)/);
  assert.match(pedidosClient, /filter: `loja_id=eq\.\$\{lojaId\}`/);
  assert.doesNotMatch(
    migration,
    /drop policy[^;]*on public\.(?:lojas|pedidos|pedido_itens|pedido_item_opcoes)/i,
  );
  assert.doesNotMatch(
    migration,
    /alter table public\.(?:lojas|pedidos|pedido_itens|pedido_item_opcoes) disable row level security/i,
  );
});
