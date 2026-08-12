import { defineConfig, devices } from '@playwright/test';

const E2E_PORT = process.env.E2E_PORT || '3000';
const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

/**
 * e2e contra build de produção (npm start), não npm run dev — mais fiel
 * ao que vai pro ar e bem mais rápido no CI (dev compila sob demanda,
 * ver CLAUDE.md). O CI precisa rodar `npm run build` antes desta suíte.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: E2E_BASE_URL,
    // Só grava tráfego do navegador, que nunca carrega credencial de
    // servidor: a limpeza do checkout usa fetch do Node, fora do contexto do
    // Playwright. Vídeo e screenshot seguem desligados (padrão), e o CI não
    // publica artefato nenhum.
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npm start -- -p ${E2E_PORT}`,
    url: E2E_BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
