/**
 * Hook oficial do Next.js (App Router, estável desde o Next 15) — roda
 * uma vez por instância de servidor. É o único lugar certo pra ligar
 * instrumentação de observabilidade sem duplicar em cada rota.
 *
 * Só registra no runtime nodejs: proxy.ts roda em Edge Runtime, onde nem
 * @vercel/otel nem @sentry/nextjs têm como funcionar de verdade (mesmo
 * motivo do logger em lib/observabilidade/logger.ts).
 *
 * OpenTelemetry (@vercel/otel) não pede conta nem coletor — hospedado na
 * Vercel, os traces já aparecem no dashboard deles. Sentry só liga se
 * SENTRY_DSN existir; sem a env var, Sentry.init nem roda — zero custo,
 * zero chamada de rede, até o dono da loja criar a conta em sentry.io e
 * colar o DSN (ver docs/PENDING_TASKS.md).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerOTel } = await import('@vercel/otel');
    registerOTel({
      serviceName: 'cliquefome',
      // Geoapify recebe chave e endereço na query string por contrato da API.
      // Esses dois fetches ficam fora dos traces para não exportar segredo nem
      // endereço de cliente; duração/falhas continuam cobertas pela rota pai.
      instrumentationConfig: {
        fetch: { ignoreUrls: [/^https:\/\/api\.geoapify\.com\//] },
      },
    });

    if (process.env.SENTRY_DSN) {
      const Sentry = await import('@sentry/nextjs');
      const hostGeoapify = 'api.geoapify.com';
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        tracesSampleRate: 0.1,
        beforeBreadcrumb(breadcrumb) {
          const contemGeoapify =
            breadcrumb.category === 'http' &&
            Object.values(breadcrumb.data ?? {}).some(
              (valor) => typeof valor === 'string' && valor.includes(hostGeoapify)
            );
          // O breadcrumb separa `http.query` da URL. Descartar o registro
          // inteiro evita enviar apiKey, endereço ou coordenadas junto de um
          // evento posterior da mesma request.
          return contemGeoapify ? null : breadcrumb;
        },
        beforeSendSpan(span) {
          const contemGeoapify =
            span.description?.includes(hostGeoapify) ||
            Object.values(span.data).some(
              (valor) => typeof valor === 'string' && valor.includes(hostGeoapify)
            );
          if (!contemGeoapify) return span;

          // O Sentry decompõe a URL em campos como `url.query`; estes campos
          // não contêm o hostname, mas carregam apiKey, endereço e waypoints.
          // Uma allowlist seria frágil entre versões do SDK, então o span da
          // chamada externa mantém somente nome/tempo/status e nenhum dado.
          return { ...span, description: 'Geoapify request', data: {} };
        },
      });
    }
  }
}

export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  if (!process.env.SENTRY_DSN) return;
  const { captureRequestError } = await import('@sentry/nextjs');
  captureRequestError(error, request, context);
}
