import assert from 'node:assert/strict';
import test from 'node:test';

// O segredo precisa existir ANTES do módulo ser importado? Não: `segredo()` é
// lido a cada assinatura, então definir aqui basta e mantém o teste isolado
// de qualquer .env da máquina.
process.env.DELIVERY_QUOTE_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres-aqui';

const {
  criarTokenCotacao,
  verificarTokenCotacao,
  validarCotacaoParaPedido,
  MENSAGEM_RECUSA_COTACAO,
} = await import('../lib/delivery/cotacao.ts');

const LOJA = '9e7a7d55-8ca5-4662-8ed3-f3b11092ef5a';
const OUTRA_LOJA = 'c81c466f-a0e7-43ad-a333-63728ea1e87c';
const HASH = 'hash-do-endereco-normalizado';
const VERSAO = '2026-08-11T02:11:28.369784+00:00';

function token(extra = {}) {
  return criarTokenCotacao({
    lojaId: LOJA,
    enderecoHash: HASH,
    taxaCentavos: 700,
    distanciaMetros: 3500,
    regra: 'PER_KM',
    overrideId: null,
    configVersao: VERSAO,
    exp: Date.now() + 15 * 60_000,
    ...extra,
  });
}

const validar = (t, extra = {}) => validarCotacaoParaPedido({
  token: t, lojaId: LOJA, enderecoHash: HASH, configVersaoAtual: VERSAO, ...extra,
});

test('token integro e aceito e preserva os valores assinados', () => {
  const resultado = validar(token());
  assert.equal(resultado.ok, true);
  assert.equal(resultado.cotacao.taxaCentavos, 700);
  assert.equal(resultado.cotacao.distanciaMetros, 3500);
  assert.equal(resultado.cotacao.regra, 'PER_KM');
});

test('token adulterado na taxa e recusado', () => {
  // Reescreve o payload com uma taxa menor, mantendo a assinatura antiga.
  const [payload, assinatura] = token().split('.');
  const conteudo = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  conteudo.taxaCentavos = 1;
  const forjado = `${Buffer.from(JSON.stringify(conteudo)).toString('base64url')}.${assinatura}`;

  assert.equal(verificarTokenCotacao(forjado), null);
  assert.equal(validar(forjado).motivo, 'TOKEN_INVALIDO');
});

test('assinatura trocada e recusada', () => {
  const [payload] = token().split('.');
  assert.equal(verificarTokenCotacao(`${payload}.assinaturaInventada`), null);
});

test('token sem ponto separador nao derruba a validacao', () => {
  for (const lixo of ['', '.', 'abc', 'a.b.c', 'sem-ponto-nenhum']) {
    assert.equal(verificarTokenCotacao(lixo), null);
  }
});

test('token expirado e recusado', () => {
  const expirado = token({ exp: Date.now() - 1000 });
  assert.equal(verificarTokenCotacao(expirado), null);
  assert.equal(validar(expirado).motivo, 'TOKEN_INVALIDO');
});

test('cotacao de OUTRA loja e recusada', () => {
  const resultado = validarCotacaoParaPedido({
    token: token(), lojaId: OUTRA_LOJA, enderecoHash: HASH, configVersaoAtual: VERSAO,
  });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, 'OUTRA_LOJA');
});

test('cotacao de outro endereco e recusada', () => {
  const resultado = validar(token(), { enderecoHash: 'hash-de-outro-endereco' });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, 'OUTRO_ENDERECO');
});

test('configuracao alterada invalida a cotacao', () => {
  // Cenário da spec: checkout aberto, loja muda a taxa, cliente confirma.
  const resultado = validar(token(), { configVersaoAtual: '2026-08-11T03:00:00.000000+00:00' });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, 'CONFIG_MUDOU');
});

test('configuracao alterada invalida mesmo quando a taxa BAIXARIA', () => {
  // Cobrar diferente do que foi mostrado é o problema — pra cima ou pra
  // baixo. A comparação é por igualdade, não por "mais novo que".
  const resultado = validar(token(), { configVersaoAtual: '2020-01-01T00:00:00.000000+00:00' });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, 'CONFIG_MUDOU');
});

test('override aplicado viaja assinado no token', () => {
  const t = token({ regra: 'OVERRIDE_NEIGHBORHOOD', overrideId: 'ov-centro', taxaCentavos: 500, distanciaMetros: null });
  const resultado = validar(t);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.cotacao.regra, 'OVERRIDE_NEIGHBORHOOD');
  assert.equal(resultado.cotacao.overrideId, 'ov-centro');
  assert.equal(resultado.cotacao.distanciaMetros, null, 'override nao chama rota, entao nao ha distancia');
});

test('mensagens de recusa sao humanas e distintas entre si', () => {
  const mensagens = Object.values(MENSAGEM_RECUSA_COTACAO);
  assert.equal(new Set(mensagens).size, mensagens.length, 'cada motivo precisa de mensagem propria');
  for (const [motivo, texto] of Object.entries(MENSAGEM_RECUSA_COTACAO)) {
    assert.ok(texto.length > 20, `${motivo} sem mensagem de verdade`);
    assert.doesNotMatch(texto, /token|HMAC|hash|409|422/i, `${motivo} vaza detalhe tecnico`);
  }
});
