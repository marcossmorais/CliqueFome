import { test, expect } from '@playwright/test';

/**
 * Precisa de E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD apontando pra uma conta
 * de dono de loja de teste — nunca credencial real. Sem essas vars, pula
 * (não falha o pipeline por falta de segredo de conta).
 */
const EMAIL = process.env.E2E_ADMIN_EMAIL;
const SENHA = process.env.E2E_ADMIN_PASSWORD;

test.skip(!EMAIL || !SENHA, 'E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD não configurados');

test('login no painel e navegação básica pra Gestão de pedidos', async ({ page }) => {
  await page.goto('/admin/login', { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', EMAIL!);
  await page.fill('input[type=password]', SENHA!);
  await page.click('button[type=submit], button:has-text("Entrar")');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });

  await page.goto('/admin/pedidos', { waitUntil: 'networkidle' });
  await expect(page.locator('.pedidos-topo')).toBeVisible();
});
