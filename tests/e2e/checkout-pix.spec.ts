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

  await page.locator('.menu-card .btn-add').first().click();
  const btnAdicionarModal = page.locator('.produto-modal-add');
  await expect(page.locator('.produto-modal-add, .floating-cart').first()).toBeVisible();
  if (await btnAdicionarModal.isVisible().catch(() => false)) {
    const grupos = page.locator('.produto-modal .grupo-bloco');
    for (let i = 0; i < await grupos.count(); i++) {
      const grupo = grupos.nth(i);
      const opcao = grupo.locator('input:not(:disabled)').first();
      const adicionarUm = grupo.getByRole('button', { name: /^Adicionar um / }).first();
      if (await opcao.isVisible().catch(() => false)) await opcao.check();
      else if (await adicionarUm.isVisible().catch(() => false)) await adicionarUm.click();
    }
    await btnAdicionarModal.click();
  }

  const flutuante = page.locator('.floating-cart');
  await expect(flutuante).toBeVisible();
  await flutuante.click();

  const continuar = page.getByRole('button', { name: 'Continuar pedido' });
  await expect(continuar).toBeVisible();
  await continuar.click();

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
