import pino from 'pino';

/**
 * Logger estruturado (JSON), só pro lado Node do projeto — as 5 rotas em
 * `app/api/**\/route.ts` (todas com `export const runtime = 'nodejs'`).
 * NÃO importar isto em `proxy.ts`: o middleware roda em Edge Runtime, que
 * não tem os módulos Node que o Pino precisa (viraria erro de build ou
 * um polyfill capenga em runtime).
 *
 * Cinco níveis, use o que descreve o que aconteceu — não o quão grave
 * "parece":
 *   - debug: detalhe de diagnóstico que só interessa investigando um bug
 *     específico (ex: valor intermediário de um cálculo). Não roda por
 *     padrão em produção (level padrão ali é "info").
 *   - info: um evento de negócio que vale ficar registrado mesmo sem
 *     nada dar errado (ex: "pedido criado").
 *   - warn: algo saiu do caminho normal mas foi contornado — a request
 *     terminou bem mesmo assim (ex: "resposta repetida por idempotência").
 *   - error: a request falhou e o cliente recebeu um erro por causa
 *     disso. É o nível mais usado hoje — nos `catch` que antes só
 *     devolviam uma mensagem genérica sem deixar rastro nenhum.
 *   - fatal: falha sem contorno possível, o processo não tem como
 *     continuar servindo essa request de jeito nenhum. Raro numa function
 *     serverless request-scoped como esta.
 *
 * Exemplo de uso (dentro de uma rota de API, runtime nodejs):
 *
 *   import { logger } from '@/lib/observabilidade/logger';
 *
 *   try {
 *     await registrarPedido(...);
 *   } catch (erro) {
 *     logger.error({ err: erro, rota: '/api/lojas/[slug]/pedidos', lojaSlug: slug },
 *       'Falha ao registrar pedido');
 *     return respostaErro('Não foi possível registrar o pedido.', 503);
 *   }
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: {
    service: 'cliquefome',
    env: process.env.VERCEL_ENV || process.env.NODE_ENV,
  },
  serializers: {
    err: pino.stdSerializers.err,
  },
  // Nunca deixa dado sensível vazar em texto puro no log, mesmo se algum
  // objeto de contexto passado por engano incluir um desses campos —
  // mesmo raciocínio de não confiar em dado sensível solto que já vale
  // pra preço vindo do navegador (ver CLAUDE.md).
  redact: {
    paths: [
      '*.cliente_telefone',
      '*.clienteTelefone',
      '*.telefone',
      '*.senha',
      '*.password',
      '*.SUPABASE_SERVICE_ROLE_KEY',
      '*.SUPABASE_SECRET_KEY',
      '*.RATE_LIMIT_HMAC_SECRET',
    ],
    censor: '[redigido]',
  },
  ...(process.env.NODE_ENV !== 'production'
    ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }
    : {}),
});
