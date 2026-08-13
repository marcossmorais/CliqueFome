import type { NextConfig } from 'next';

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

/**
 * Hostname do Supabase, sem protocolo — é o formato que `images.remotePatterns`
 * espera. Fora de um ambiente configurado a variável vem vazia; devolver '' faz
 * o padrão ser omitido em vez de derrubar o build.
 */
const supabaseHostname = (() => {
  try {
    return new URL(supabaseHost).hostname;
  } catch {
    return '';
  }
})();

/**
 * CSP. 'unsafe-inline' em style-src é necessário porque o Next injeta
 * estilos inline; 'unsafe-eval' fica só em dev (o Fast Refresh usa).
 * connect-src precisa liberar o Supabase (REST + Realtime via wss).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://viacep.com.br ${supabaseHost} ${supabaseHost.replace('https://', 'wss://')}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  // O Next gera AGENTS.md e CLAUDE.md na raiz por padrao. Desligado porque
  // um CLAUDE.md de projeto vira instrucao pra assistentes e conflitaria
  // com o CLAUDE.md global do usuario.
  agentRules: false,

  /**
   * Sem esta lista o `next/image` recusa qualquer src remoto e o
   * /_next/image responde 400 — foi por isso que a foto e o logo no
   * carrinho apareciam quebrados: os dois usam <Image> com URL do Storage.
   *
   * Vale também pelo desempenho, que é o motivo de existir: a foto que o
   * dono sobe pode ter até 3 MB (o teto do bucket) e era servida no
   * tamanho original dentro de um card de 168px. Passando por aqui ela é
   * redimensionada, convertida pra webp/avif e fica no cache da CDN.
   */
  images: {
    remotePatterns: [
      ...(supabaseHostname
        ? [{ protocol: 'https' as const, hostname: supabaseHostname, pathname: '/storage/v1/object/public/**' }]
        : []),
      // Fotos das lojas de demonstração, servidas do próprio site em produção.
      { protocol: 'https' as const, hostname: 'cliquefome.vercel.app', pathname: '/demo/**' },
    ],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },

  async redirects() {
    return [
      // /cardapio.html?loja=x é tratado no proxy.ts, não aqui: o Next
      // repassa a query string no redirect e a URL nova sairia como
      // /oh-taal?loja=oh-taal.
      { source: '/admin.html', destination: '/painel', permanent: true },
      { source: '/index.html', destination: '/', permanent: true },
    ];
  },
};

export default nextConfig;
