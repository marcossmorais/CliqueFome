import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolverChaveSupabase,
  resolverSegredoDeLimite,
} from '../lib/pedidos/segredos.ts';

const CHAVE = `sb_secret_${'x'.repeat(40)}`;
const LEGADA = `eyJ${'y'.repeat(60)}`;
const DEDICADO = 'd'.repeat(64);

test('chave do Supabase: nome novo vence, nome antigo continua servindo de ponte', () => {
  assert.equal(resolverChaveSupabase({ SUPABASE_SECRET_KEY: CHAVE }), CHAVE);
  // Estado da produção hoje: só o nome antigo publicado. Publicar a
  // renomeação sem esta ponte derrubaria o checkout.
  assert.equal(resolverChaveSupabase({ SUPABASE_SERVICE_ROLE_KEY: LEGADA }), LEGADA);
  assert.equal(
    resolverChaveSupabase({ SUPABASE_SECRET_KEY: CHAVE, SUPABASE_SERVICE_ROLE_KEY: LEGADA }),
    CHAVE
  );
  assert.throws(() => resolverChaveSupabase({}), /SUPABASE_SECRET_KEY_NAO_CONFIGURADA/);
  assert.throws(() => resolverChaveSupabase({ SUPABASE_SECRET_KEY: '   ' }), /NAO_CONFIGURADA/);
});

test('segredo do rate limit deixa de ser a credencial do Supabase', () => {
  const dedicado = resolverSegredoDeLimite({
    SUPABASE_SECRET_KEY: CHAVE,
    RATE_LIMIT_HMAC_SECRET: DEDICADO,
  });
  assert.equal(dedicado.segredo, DEDICADO);
  assert.equal(dedicado.fonte, 'dedicado');
  // O ponto da separação: o segredo do hash não é mais a chave do banco.
  assert.notEqual(dedicado.segredo, CHAVE);

  // Sem a variável dedicada, cai na chave do Supabase e se identifica como
  // ponte, para quem chama poder avisar em vez de falhar calado.
  const ponte = resolverSegredoDeLimite({ SUPABASE_SERVICE_ROLE_KEY: LEGADA });
  assert.equal(ponte.segredo, LEGADA);
  assert.equal(ponte.fonte, 'legado');

  // Segredo curto demais não vale como dedicado — cai na ponte em vez de
  // enfraquecer o HMAC em silêncio.
  const curto = resolverSegredoDeLimite({
    RATE_LIMIT_HMAC_SECRET: 'curto',
    SUPABASE_SECRET_KEY: CHAVE,
  });
  assert.equal(curto.fonte, 'legado');

  assert.throws(() => resolverSegredoDeLimite({}), /SEGREDO_CHECKOUT_NAO_CONFIGURADO/);
});
