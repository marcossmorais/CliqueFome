import { test, expect } from '@playwright/test';

/**
 * Precisa de E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD apontando pra uma conta
 * de dono de loja de teste — nunca credencial real. Sem essas vars, pula
 * (não falha o pipeline por falta de segredo de conta).
 */
const EMAIL = process.env.E2E_ADMIN_EMAIL;
const SENHA = process.env.E2E_ADMIN_PASSWORD;

test.skip(!EMAIL || !SENHA, 'E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD não configurados');

test('login abre pedidos, dashboard, configurações e financeiro sem depender de Delivery', async ({ page }) => {
  await page.goto('/entrar', { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', EMAIL!);
  await page.fill('input[type=password]', SENHA!);
  await page.click('button[type=submit], button:has-text("Entrar")');
  // Espera chegar no painel de uma loja. Checar só "saiu do /entrar" não
  // serve: /painel é um passo intermediário que ainda vai redirecionar.
  await page.waitForURL((url) => /^\/painel\/[^/]+\//.test(url.pathname), { timeout: 20_000 });

  // O slug da loja vem da URL pra onde o login levou (/painel/<slug>/...),
  // e não de uma constante: depois da migração pra /painel/<loja> não dá
  // pra montar a URL do painel sem saber de qual loja é a conta de teste.
  const slug = new URL(page.url()).pathname.split('/')[2];
  expect(slug, 'login deveria cair em /painel/<slug>/...').toBeTruthy();

  await test.step('Gestão de pedidos continua acessível', async () => {
    await page.goto(`/painel/${slug}/pedidos`, { waitUntil: 'networkidle' });
    await expect(page.locator('.pedidos-topo')).toBeVisible();
  });

  await test.step('dashboard da loja continua acessível', async () => {
    await page.goto(`/painel/${slug}/inicio`, { waitUntil: 'networkidle' });
    await expect(page.locator('#mainTop h1')).toHaveText('Início');
    await expect(page.locator('#appView')).toBeVisible();
  });

  await test.step('configurações gerais continuam acessíveis', async () => {
    await page.goto(`/painel/${slug}/config`, { waitUntil: 'networkidle' });
    await expect(page.locator('#mainTop h1')).toHaveText('Configurações');
    await expect(page.getByRole('link', { name: 'Meu perfil' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Minha loja' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Funcionamento' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Plano e assinatura' })).toBeVisible();
  });

  await test.step('financeiro continua roteável sem Delivery', async () => {
    await page.goto(`/painel/${slug}/financeiro`, { waitUntil: 'networkidle' });
    await expect(page.locator('#mainTop h1')).toHaveText('Financeiro');
    await expect(page.locator('.card.em-breve')).toContainText('Em breve');
  });
});
