import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { aplicarRespostaViaCep } from '../lib/delivery/endereco.ts';
import {
  calcularCotacaoDelivery,
  validarItensDelivery,
} from '../lib/delivery/quote.ts';

const ENDERECO = {
  cep: '58360000',
  rua: 'Rua João Pessoa',
  numero: '123',
  bairro: 'Centro',
  cidade: 'Itabaiana',
  uf: 'PB',
  complemento: null,
};

const MIGRATION = readFileSync(
  new URL('../supabase/migrations/20260811180000_rebuild_delivery_module.sql', import.meta.url),
  'utf8',
);

function fonte(caminho) {
  return readFileSync(new URL(caminho, import.meta.url), 'utf8');
}

function funcaoSql(nome) {
  const assinaturas = [
    `create function public.${nome}`,
    `create or replace function public.${nome}`,
  ];
  const inicio = assinaturas
    .map((assinatura) => MIGRATION.indexOf(assinatura))
    .find((indice) => indice >= 0);
  assert.notEqual(inicio, undefined, `função ${nome} não encontrada`);
  const fim = MIGRATION.indexOf('\n$$;', inicio);
  assert.ok(fim > inicio, `fim da função ${nome} não encontrado`);
  return MIGRATION.slice(inicio, fim + 4);
}

function dependenciasContadas(distancia = 4_800) {
  const chamadas = { geocode: 0, routing: 0 };
  return {
    chamadas,
    geocodificar: async () => {
      chamadas.geocode += 1;
      return { latitude: -7.33, longitude: -35.33 };
    },
    rotear: async () => {
      chamadas.routing += 1;
      return distancia;
    },
  };
}

test('1. ViaCEP preenche o que encontrou e preserva campos manuais', () => {
  const atual = { ...ENDERECO, rua: 'Rua digitada', bairro: 'Bairro digitado', cidade: '', uf: '' };
  const preenchido = aplicarRespostaViaCep(atual, {
    logradouro: '',
    bairro: '',
    localidade: 'Itabaiana',
    uf: 'pb',
  });
  assert.equal(preenchido.rua, 'Rua digitada');
  assert.equal(preenchido.bairro, 'Bairro digitado');
  assert.equal(preenchido.cidade, 'Itabaiana');
  assert.equal(preenchido.uf, 'PB');
});

test('2. FIXED faz um geocode, nenhum routing e cobra a taxa correta', async () => {
  const deps = dependenciasContadas();
  const resultado = await calcularCotacaoDelivery({
    endereco: ENDERECO,
    configuracao: {
      feeMode: 'FIXED', fixedFeeCents: 700, pricePerKmCents: null,
      freeDeliveryThresholdCents: null,
    },
    subtotalCentavos: 3_000,
    origem: null,
    geocodificar: deps.geocodificar,
    rotear: deps.rotear,
  });
  assert.equal(resultado.taxaEntregaCentavos, 700);
  assert.equal(resultado.distanciaMetros, null);
  assert.deepEqual(deps.chamadas, { geocode: 1, routing: 0 });
});

test('3. PER_KM faz um geocode, um routing e arredonda a taxa em centavos', async () => {
  const deps = dependenciasContadas(4_801);
  const resultado = await calcularCotacaoDelivery({
    endereco: ENDERECO,
    configuracao: {
      feeMode: 'PER_KM', fixedFeeCents: null, pricePerKmCents: 200,
      freeDeliveryThresholdCents: null,
    },
    subtotalCentavos: 3_000,
    origem: { latitude: -7.32, longitude: -35.32 },
    geocodificar: deps.geocodificar,
    rotear: deps.rotear,
  });
  assert.equal(resultado.taxaEntregaCentavos, 960);
  assert.equal(resultado.distanciaMetros, 4_801);
  assert.deepEqual(deps.chamadas, { geocode: 1, routing: 1 });
});

test('4. entrega grátis faz um geocode, nenhum routing e retorna taxa zero', async () => {
  const deps = dependenciasContadas();
  const resultado = await calcularCotacaoDelivery({
    endereco: ENDERECO,
    configuracao: {
      feeMode: 'PER_KM', fixedFeeCents: null, pricePerKmCents: 200,
      freeDeliveryThresholdCents: 5_000,
    },
    subtotalCentavos: 5_000,
    origem: null,
    geocodificar: deps.geocodificar,
    rotear: deps.rotear,
  });
  assert.equal(resultado.taxaEntregaCentavos, 0);
  assert.equal(resultado.distanciaMetros, null);
  assert.deepEqual(deps.chamadas, { geocode: 1, routing: 0 });
});

test('5. backend ignora fee, distância e store_id adulterados pelo browser', () => {
  const itens = validarItensDelivery([{
    produtoId: '11111111-1111-4111-8111-111111111111',
    quantidade: 1,
    complementos: [],
    deliveryFee: 0,
    distance: 1,
    storeId: '22222222-2222-4222-8222-222222222222',
  }]);
  assert.deepEqual(itens, [{
    produtoId: '11111111-1111-4111-8111-111111111111',
    quantidade: 1,
    observacao: undefined,
    complementos: [],
  }]);

  const quoteRoute = fonte('../app/api/delivery/quote/route.ts');
  const pedidoRoute = fonte('../app/api/lojas/[slug]/pedidos/route.ts');
  assert.doesNotMatch(quoteRoute, /corpo\.(?:deliveryFee|delivery_fee|distance|distancia|storeId|store_id)/);
  assert.match(quoteRoute, /rpc\('calcular_subtotal_delivery_v1'/);
  assert.match(quoteRoute, /delivery_fee_cents:\s*taxaEntregaCentavos/);
  assert.match(pedidoRoute, /p_quote_id:\s*entrada\.quoteId/);
  assert.doesNotMatch(pedidoRoute, /p_(?:delivery_fee|distance|store_id)\s*:/);

  const instrumentacao = fonte('../instrumentation.ts');
  assert.match(instrumentacao, /description:\s*'Geoapify request',\s*data:\s*\{\}/);
  assert.match(instrumentacao, /beforeBreadcrumb[\s\S]*return contemGeoapify \? null : breadcrumb/);
  assert.doesNotMatch(instrumentacao, /url\.query.*valor/);

  const configuracaoRoute = fonte('../app/api/admin/delivery/[loja]/configuracao/route.ts');
  assert.match(configuracaoRoute, /criarClientPrivilegiado/);
  assert.match(MIGRATION, /grant select on table public\.store_delivery_settings to authenticated/);
  assert.doesNotMatch(
    MIGRATION,
    /grant\s+(?:insert|update|select\s*,\s*insert)[^;]*store_delivery_settings[^;]*authenticated/i,
  );
});

test('6. quote expirada, consumida, de outra loja ou alterada rejeita o pedido', () => {
  const criarPedido = funcaoSql('criar_pedido_publico_delivery_v1(');
  assert.match(criarPedido, /from public\.delivery_quotes q[\s\S]*where q\.id = p_quote_id[\s\S]*for update/);
  assert.match(criarPedido, /v_quote\.store_id <> v_loja\.id/);
  assert.match(criarPedido, /v_quote\.consumed_at is not null/);
  assert.match(criarPedido, /v_quote\.expires_at <= clock_timestamp\(\)/);
  assert.match(criarPedido, /v_settings_updated_at is distinct from v_quote\.settings_updated_at/);
  assert.match(criarPedido, /v_subtotal_cents <> v_quote\.items_subtotal_cents/);
  assert.ok((criarPedido.match(/DELIVERY_QUOTE_STALE/g) || []).length >= 3);
});

test('7. owner da Store A não acessa nem atribui Delivery da Store B', () => {
  assert.match(
    MIGRATION,
    /create policy deliveries_owner_or_assigned_driver_select[\s\S]*where l\.id = store_id and l\.dono_id = auth\.uid\(\)/,
  );
  const atribuir = funcaoSql('atribuir_delivery_v1(');
  assert.match(atribuir, /where l\.id = v_delivery\.store_id\s+and l\.dono_id = auth\.uid\(\)/);
  assert.match(atribuir, /dr\.store_id = v_delivery\.store_id/);
});

test('8. Driver A não acessa, inicia nem conclui delivery atribuído ao Driver B', () => {
  assert.match(
    MIGRATION,
    /create policy deliveries_owner_or_assigned_driver_select[\s\S]*dr\.id = deliveries\.driver_id[\s\S]*dr\.store_id = deliveries\.store_id[\s\S]*dr\.auth_user_id = auth\.uid\(\)[\s\S]*and dr\.active[\s\S]*deliveries\.status in \('ASSIGNED', 'OUT_FOR_DELIVERY'\)/,
  );
  assert.match(
    MIGRATION,
    /create policy delivery_drivers_owner_or_self_select[\s\S]*auth_user_id = auth\.uid\(\) and active/,
  );
  for (const nome of ['iniciar_delivery_v1(', 'concluir_delivery_v1(']) {
    const funcao = funcaoSql(nome);
    assert.match(funcao, /dr\.auth_user_id = auth\.uid\(\)/);
    assert.match(funcao, /d\.store_id = v_driver\.store_id/);
    assert.match(funcao, /d\.driver_id = v_driver\.id/);
  }
});

test('9. READY segue WAITING_DRIVER → ASSIGNED → OUT_FOR_DELIVERY → DELIVERED', () => {
  const sincronizar = funcaoSql('delivery_sync_from_order(');
  const atribuir = funcaoSql('atribuir_delivery_v1(');
  const iniciar = funcaoSql('iniciar_delivery_v1(');
  const concluir = funcaoSql('concluir_delivery_v1(');
  const transicionar = funcaoSql('transicionar_pedido(');

  assert.match(sincronizar, /new\.tipo = 'delivery'[\s\S]*new\.status = 'pronto'[\s\S]*'WAITING_DRIVER'/);
  assert.match(atribuir, /status = 'ASSIGNED'/);
  assert.match(iniciar, /status = 'OUT_FOR_DELIVERY'/);
  assert.match(concluir, /status = 'DELIVERED'[\s\S]*set status = 'concluido'/);
  assert.doesNotMatch(concluir, /pagamento_status|set\s+pagamento/i);
  assert.match(transicionar, /v_pedido\.tipo = 'delivery'[\s\S]*p_novo_status = 'concluido'[\s\S]*DELIVERY_REQUER_CONCLUSAO_DO_ENTREGADOR/);
});

test('10. PICKUP não chama ViaCEP nem o endpoint de quote Delivery', () => {
  const checkout = fonte('../app/[loja]/CheckoutModal.tsx');
  const cardapio = fonte('../app/[loja]/CardapioClient.tsx');
  const inicioCalculo = checkout.indexOf('async function calcularEntrega()');
  const fimCalculo = checkout.indexOf('function selecionarModalidade', inicioCalculo);
  const calculo = checkout.slice(inicioCalculo, fimCalculo);

  assert.match(checkout, /if \(modalidade !== 'delivery'\) return;[\s\S]*fetch\(`https:\/\/viacep\.com\.br/);
  assert.match(calculo, /modalidade !== 'delivery'[\s\S]*fetch\('\/api\/delivery\/quote'/);
  assert.equal((checkout.match(/fetch\('\/api\/delivery\/quote'/g) || []).length, 1);
  assert.doesNotMatch(cardapio, /fetch\(['"`]\/api\/delivery\//);
  assert.match(checkout, /onFinalizar\(modalidade === 'delivery' \? cotacaoAtual : null\)/);
});
