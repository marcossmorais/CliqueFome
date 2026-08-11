import { test, expect, type Page } from '@playwright/test';

/**
 * Requer uma loja de teste aberta, com retirada habilitada, WhatsApp e ao
 * menos um produto ativo. E2E_LOJA_SLUG permite trocar a fixture sem acoplar
 * os seletores ao nome de um produto ou a ids do banco.
 */
const LOJA_SLUG = process.env.E2E_LOJA_SLUG || 'lojateste';

function valorBRL(texto: string | null) {
  const numero = texto?.match(/R\$\s*([\d.]+,\d{2})/)?.[1];
  return numero ? Number(numero.replaceAll('.', '').replace(',', '.')) : 0;
}

async function adicionarPrimeiroProduto(page: Page) {
  const adicionar = page.locator('.menu-card:not(.esgotado) .btn-add').first();
  await expect(adicionar, 'a loja E2E precisa ter ao menos um produto ativo para retirada').toBeVisible();
  await adicionar.click();

  const modalProduto = page.locator('.produto-modal');
  if (!(await modalProduto.isVisible().catch(() => false))) return;

  // Seleciona opcoes habilitadas sem depender do nome cadastrado pela loja.
  // Radio termina com uma escolha; checkbox para ao atingir qtd_max porque os
  // demais inputs ficam disabled. Para lista repetivel, uma unidade cobre a
  // fixture usual e a validacao do proprio modal continua sendo a barreira.
  const grupos = modalProduto.locator('.grupo-bloco');
  for (let i = 0; i < await grupos.count(); i += 1) {
    const grupo = grupos.nth(i);
    const inputs = grupo.locator('input:not(:disabled)');
    if (await inputs.count()) {
      for (let j = 0; j < await inputs.count(); j += 1) {
        const input = inputs.nth(j);
        if (await input.isEnabled().catch(() => false)) await input.check();
      }
      continue;
    }

    const adicionarUm = grupo.getByRole('button', { name: /^Adicionar um / }).first();
    if (await adicionarUm.isVisible().catch(() => false)) await adicionarUm.click();
  }

  await modalProduto.locator('.produto-modal-add').click();
  await expect(modalProduto).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  // Carrinho e pedido acompanhado vivem em localStorage. Cada teste comeca de
  // uma sessao realmente vazia, sem depender de execucoes anteriores.
  await page.addInitScript(() => window.localStorage.clear());
});

test('checkout abre, opera o carrinho e registra somente retirada com Pix', async ({ page, context }) => {
  // O fluxo tenta abrir o WhatsApp automaticamente depois do commit. Fechamos
  // a aba externa para manter o teste deterministico e auditamos o href na UI.
  context.on('page', (popup) => { void popup.close().catch(() => {}); });

  const respostaPagina = await page.goto(`/${LOJA_SLUG}`, { waitUntil: 'networkidle' });
  expect(respostaPagina?.status(), 'o cardapio da fixture E2E precisa abrir').toBe(200);

  const abrirInformacoes = page.locator('button.loja-mais:visible');
  await abrirInformacoes.click();
  const minimoTexto = await page.getByText(/Pedido m.nimo:/i).first().textContent().catch(() => null);
  const pedidoMinimo = valorBRL(minimoTexto);
  await abrirInformacoes.click();

  await adicionarPrimeiroProduto(page);

  const botaoCarrinho = page.getByRole('button', { name: /Ver carrinho/ });
  await expect(botaoCarrinho).toBeVisible();
  await botaoCarrinho.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Seu carrinho' })).toBeVisible();
  await expect(dialog.locator('.checkout-item')).toHaveCount(1);

  // Prova que o carrinho continua mutavel depois da limpeza.
  const quantidade = dialog.locator('.checkout-item-qtd b').first();
  const aumentar = dialog.getByRole('button', { name: 'Aumentar quantidade' }).first();
  await expect(quantidade).toHaveText('1');
  await aumentar.click();
  await expect(quantidade).toHaveText('2');

  // Se a fixture tiver pedido minimo, aumenta a mesma linha ate alcanca-lo,
  // sem conhecer previamente o preco do catalogo.
  for (let tentativas = 0; tentativas < 97; tentativas += 1) {
    const subtotal = valorBRL(await dialog.locator('.checkout-total').last().textContent());
    if (subtotal >= pedidoMinimo) break;
    await aumentar.click();
  }

  await dialog.getByRole('button', { name: 'Continuar pedido' }).click();
  await expect(dialog.getByRole('heading', { name: 'Finalizar pedido' })).toBeVisible();

  // Contrato visual temporario: uma unica modalidade, nenhum formulario de
  // endereco/frete e nenhum CTA de Delivery escondido no dialog.
  await expect(dialog.getByRole('heading', { name: 'Retirada', exact: true })).toBeVisible();
  await expect(dialog.getByText('Retirar no estabelecimento')).toBeVisible();
  await expect(dialog.getByText(/\bDelivery\b/i)).toHaveCount(0);
  await expect(dialog.getByRole('heading', { name: /Entrega/i })).toHaveCount(0);
  await expect(dialog.locator('input[autocomplete="street-address"], input[autocomplete="postal-code"]')).toHaveCount(0);

  const radios = dialog.getByRole('radio');
  await expect(radios).toHaveCount(5);
  await expect(dialog.getByRole('radio', { name: 'Dinheiro' })).toBeVisible();
  await expect(dialog.getByRole('radio', { name: /Cart.o de cr.dito/i })).toBeVisible();
  await expect(dialog.getByRole('radio', { name: /Cart.o de d.bito/i })).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'Pix no WhatsApp' })).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'Pagar no estabelecimento' })).toBeVisible();

  await dialog.locator('input[autocomplete="name"]').fill('Cliente Teste E2E');
  await dialog.locator('input[autocomplete="tel"]').fill('11999998888');
  await dialog.getByRole('radio', { name: 'Pix no WhatsApp' }).click();

  const respostaPedidoPromise = page.waitForResponse((resposta) => {
    const url = new URL(resposta.url());
    return resposta.request().method() === 'POST'
      && url.pathname === `/api/lojas/${LOJA_SLUG}/pedidos`;
  });
  await dialog.getByRole('button', { name: 'Confirmar e registrar pedido' }).click();
  const respostaPedido = await respostaPedidoPromise;

  const corpoEnviado = respostaPedido.request().postDataJSON() as Record<string, unknown>;
  expect(corpoEnviado.tipo).toBe('retirada');
  expect(corpoEnviado.formaPagamento).toBe('pix_manual');
  expect(Object.keys(corpoEnviado).sort()).toEqual([
    'clienteNome',
    'clienteTelefone',
    'formaPagamento',
    'idempotencyKey',
    'itens',
    'tipo',
    'totalEsperadoCentavos',
  ]);
  expect([200, 201], await respostaPedido.text()).toContain(respostaPedido.status());

  const linkPix = dialog.getByRole('link', { name: 'Continuar no WhatsApp pra fazer o Pix' });
  await expect(linkPix).toBeVisible();
  await expect(linkPix).toHaveAttribute('href', /https:\/\/(?:wa\.me|api\.whatsapp\.com)\//);

  await dialog.locator('.checkout-fechar').click();
  const acompanhamento = page.locator('.acompanhar-barra');
  await expect(acompanhamento).toBeVisible();
  await expect(acompanhamento).toContainText('Acompanhando o pedido #');
});

test('APIs antigas respondem 404 e o portal removido nunca causa crash', async ({ request }) => {
  for (const rota of [
    '/api/delivery/cotacao',
    '/api/delivery/address/autocomplete',
    '/api/admin/delivery/configuracao',
    '/api/admin/delivery/taxas',
  ]) {
    const resposta = await request.get(rota);
    expect(resposta.status(), `${rota} nao deve continuar ativa`).toBe(404);
    expect(resposta.status(), `${rota} nao pode causar crash`).toBeLessThan(500);
  }

  // /[loja] e uma rota dinamica de primeiro nivel; por isso /entregador pode
  // ser tratado como slug de cardapio e responder uma pagina 404 com status
  // HTTP 200 depois do streaming. O contrato importante aqui e nao existir
  // mais portal executavel nem erro 5xx (a ausencia fisica e coberta no Node).
  const portal = await request.get('/entregador');
  expect(portal.status(), '/entregador nao pode causar crash').toBeLessThan(500);
});
