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

  await test.step('sidebar e cabeçalho persistem na navegação interna', async () => {
    await page.locator('#sidebar').evaluate((elemento) => {
      elemento.setAttribute('data-e2e-casca-persistente', 'sidebar');
    });
    await page.locator('#mainTop').evaluate((elemento) => {
      elemento.setAttribute('data-e2e-casca-persistente', 'cabecalho');
    });

    await page.getByRole('link', { name: 'Gestão de pedidos', exact: true }).click();
    await page.waitForURL(`/painel/${slug}/pedidos`);
    await expect(page.locator('.pedidos-topo')).toBeVisible();
    await expect(page.locator('#sidebar')).toHaveAttribute('data-e2e-casca-persistente', 'sidebar');
    await expect(page.locator('#mainTop')).toHaveAttribute('data-e2e-casca-persistente', 'cabecalho');
    await expect(page.locator('#mainTop h1')).toHaveText('Gestão de pedidos');

    const posicoes = await page.locator('#mainContent').evaluate(async (conteudo) => {
      const espacoDeTeste = document.createElement('div');
      espacoDeTeste.style.height = '1600px';
      espacoDeTeste.setAttribute('aria-hidden', 'true');
      conteudo.appendChild(espacoDeTeste);
      conteudo.scrollTo({ top: 500 });
      await new Promise<void>((resolver) => requestAnimationFrame(() => resolver()));

      const topo = document.querySelector('#painelTopo');
      const sidebar = document.querySelector('#sidebar');
      return {
        scrollConteudo: conteudo.scrollTop,
        scrollDocumento: window.scrollY,
        alturaTopo: topo?.getBoundingClientRect().height,
        topoDoTopo: topo?.getBoundingClientRect().top,
        topoSidebar: sidebar?.getBoundingClientRect().top,
        separadorTopo: topo ? getComputedStyle(topo).borderBottomWidth : null,
      };
    });

    expect(posicoes.scrollConteudo).toBeGreaterThan(0);
    expect(posicoes.scrollDocumento).toBe(0);
    expect(posicoes.topoDoTopo).toBe(0);
    expect(posicoes.topoSidebar).toBe(posicoes.alturaTopo);
    expect(posicoes.separadorTopo).toBe('1px');
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
