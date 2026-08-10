import { test, expect } from '@playwright/test';

/**
 * Depende de uma loja de teste já existente no Supabase apontado por
 * NEXT_PUBLIC_SUPABASE_URL, com pelo menos um produto ativo e WhatsApp
 * cadastrado — "lojateste" é a usada nesta sessão pra validar o fluxo
 * manualmente. Troque via E2E_LOJA_SLUG se sua loja de teste for outra.
 */
const LOJA_SLUG = process.env.E2E_LOJA_SLUG || 'lojateste';

test('checkout com "Fazer Pix no WhatsApp" redireciona e registra o pedido pra acompanhamento', async ({ page, context }) => {
  await page.goto(`/${LOJA_SLUG}`, { waitUntil: 'networkidle' });

  await page.locator('.menu-card').first().click();
  const btnAdicionarModal = page.locator('.produto-modal-add');
  if (await btnAdicionarModal.count()) {
    const opcao = page.locator('.produto-modal li, .produto-modal label').first();
    if (await opcao.count()) await opcao.click();
    await btnAdicionarModal.click();
  }

  const flutuante = page.locator('.floating-cart');
  if (await flutuante.count()) await flutuante.click();

  const continuar = page.locator('.checkout-modal .checkout-acao:has-text("Continuar pedido")');
  if (await continuar.count()) await continuar.click();

  await page.fill('.checkout-dados-grid input[autocomplete="name"]', 'Cliente Teste E2E');
  await page.fill('.checkout-dados-grid input[autocomplete="tel"]', '11999998888');

  await page.locator('.checkout-formas-pagamento button', { hasText: 'Pix no WhatsApp' }).click();

  const popupPromise = context.waitForEvent('page');
  await page.locator('button:has-text("Confirmar e registrar pedido")').click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded').catch(() => {});
  expect(popup.url()).toMatch(/wa\.me|api\.whatsapp\.com/);

  await expect(page.locator('a:has-text("Continuar no WhatsApp pra fazer o Pix")')).toBeVisible();

  await page.click('.checkout-fechar');
  await expect(page.locator('.acompanhar-barra')).toBeVisible();
  await expect(page.locator('.acompanhar-barra')).toContainText('Acompanhando o pedido #');
});
