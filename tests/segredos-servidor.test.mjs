import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolverChaveSupabase,
  resolverSegredoDeLimite,
} from '../lib/pedidos/segredos.ts';

const CHAVE = `sb_secret_${'x'.repeat(40)}`;
const LEGADA = `eyJ${'y'.repeat(60)}`;
const DEDICADO = 'd'.repeat(64);

test('chave do Supabase vem só de SUPABASE_SECRET_KEY', () => {
  assert.equal(resolverChaveSupabase({ SUPABASE_SECRET_KEY: CHAVE }), CHAVE);

  // A ponte para o nome antigo foi removida depois que produção, local e CI
  // migraram. Voltar a aceitá-lo reabriria a porta para um ambiente ficar
  // rodando na credencial legada sem ninguém perceber.
  assert.throws(
    () => resolverChaveSupabase({ SUPABASE_SERVICE_ROLE_KEY: LEGADA }),
    /SUPABASE_SECRET_KEY_NAO_CONFIGURADA/
  );
  assert.throws(() => resolverChaveSupabase({}), /SUPABASE_SECRET_KEY_NAO_CONFIGURADA/);
  assert.throws(() => resolverChaveSupabase({ SUPABASE_SECRET_KEY: '   ' }), /NAO_CONFIGURADA/);
});

test('segredo do rate limit é variável própria e falha alto se faltar', () => {
  assert.equal(resolverSegredoDeLimite({ RATE_LIMIT_HMAC_SECRET: DEDICADO }), DEDICADO);

  // Não cai mais na chave do Supabase: as duas funções estão separadas.
  assert.throws(
    () => resolverSegredoDeLimite({ SUPABASE_SECRET_KEY: CHAVE }),
    /RATE_LIMIT_HMAC_SECRET_NAO_CONFIGURADO/
  );

  // Segredo curto demais para: aceitá-lo em silêncio tornaria os hashes de IP
  // e telefone reversíveis por dicionário.
  assert.throws(
    () => resolverSegredoDeLimite({ RATE_LIMIT_HMAC_SECRET: 'curto' }),
    /RATE_LIMIT_HMAC_SECRET_NAO_CONFIGURADO/
  );
  assert.throws(() => resolverSegredoDeLimite({}), /RATE_LIMIT_HMAC_SECRET_NAO_CONFIGURADO/);
});
