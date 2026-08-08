import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calcularTaxaPorDistancia,
  enderecoEmLinha,
  enderecoEstruturadoValido,
  formatarCep,
  normalizarSetor,
  normalizarTexto,
  normalizarTipoTaxa,
  validarLimitesDaCotacao,
} from '../lib/delivery/tipos.ts';
import { criarTokenCotacao, verificarTokenCotacao } from '../lib/delivery/cotacao.ts';
import { geocodificarEndereco } from '../lib/delivery/geoapify.ts';

test('taxa por km arredonda em centavos', () => {
  assert.equal(calcularTaxaPorDistancia(5000, 2), 10);
  assert.equal(calcularTaxaPorDistancia(3333, 1.5), 5);
});

test('taxa por km rejeita distância ou valor inválidos', () => {
  assert.throws(() => calcularTaxaPorDistancia(-1, 2), /DISTANCIA_INVALIDA/);
  assert.throws(() => calcularTaxaPorDistancia(1000, -2), /VALOR_KM_INVALIDO/);
});

test('cotação acima do teto de segurança é barrada, mesmo dentro da distância', () => {
  // Regressão do bug citado na spec: entrega nunca deveria passar de ~R$40
  // sem ser sinalizada como suspeita.
  const problema = validarLimitesDaCotacao({
    distanciaMetros: 8000,
    taxa: 55,
    distanciaMaximaKm: 30,
    taxaMaxima: 40,
  });
  assert.equal(problema, 'TAXA_ACIMA_LIMITE');
});

test('distância fora da área atendida é barrada mesmo com taxa baixa', () => {
  const problema = validarLimitesDaCotacao({
    distanciaMetros: 40000,
    taxa: 12,
    distanciaMaximaKm: 30,
    taxaMaxima: 40,
  });
  assert.equal(problema, 'FORA_DA_AREA');
});

test('cotação dentro dos limites passa sem problema', () => {
  const problema = validarLimitesDaCotacao({
    distanciaMetros: 4000,
    taxa: 12,
    distanciaMaximaKm: 30,
    taxaMaxima: 40,
  });
  assert.equal(problema, null);
});

test('normalizarTexto ignora acento, caixa e espaços duplicados', () => {
  assert.equal(normalizarTexto('  São  Paulo  '), 'sao paulo');
  assert.equal(normalizarTexto('CAMPINA GRANDE'), 'campina grande');
});

test('normalizarSetor e normalizarTipoTaxa nunca aceitam valor fora da lista', () => {
  assert.equal(normalizarSetor('avancado'), 'avancado');
  assert.equal(normalizarSetor('qualquer-coisa'), 'facilitado');
  assert.equal(normalizarSetor(undefined), 'facilitado');
  assert.equal(normalizarTipoTaxa('por_km'), 'por_km');
  assert.equal(normalizarTipoTaxa('outra'), 'fixa');
});

test('endereco estruturado exige os campos usados na cotacao', () => {
  const endereco = {
    cep: '58100-000', logradouro: 'Rua das Flores', numero: '123', bairro: 'Centro',
    cidade: 'Campina Grande', uf: 'PB', complemento: 'Sala 2', referencia: 'Praca',
  };
  assert.equal(enderecoEstruturadoValido(endereco), true);
  assert.equal(formatarCep('58100000'), '58100-000');
  assert.match(enderecoEmLinha(endereco), /Rua das Flores, 123/);
  assert.equal(enderecoEstruturadoValido({ ...endereco, cep: '123' }), false);
  assert.equal(enderecoEstruturadoValido({ ...endereco, uf: 'Paraiba' }), false);
});

test('token de cotacao rejeita adulteracao e expiracao', () => {
  process.env.DELIVERY_QUOTE_SECRET = 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres';
  const conteudo = {
    lojaId: '11111111-1111-1111-1111-111111111111',
    enderecoHash: 'hash-do-endereco', taxaCentavos: 1290, distanciaMetros: 5200,
    exp: Date.now() + 60_000,
  };
  const token = criarTokenCotacao(conteudo);
  assert.deepEqual(verificarTokenCotacao(token), conteudo);

  const [payload, assinatura] = token.split('.');
  const alterado = `${payload.slice(0, -1)}${payload.endsWith('A') ? 'B' : 'A'}.${assinatura}`;
  assert.equal(verificarTokenCotacao(alterado), null);
  assert.equal(verificarTokenCotacao(criarTokenCotacao({ ...conteudo, exp: Date.now() - 1 })), null);
});

test('Geoapify diferencia chave ausente de chave recusada sem expor o valor', async () => {
  const chaveAnterior = process.env.GEOAPIFY_API_KEY;
  const fetchAnterior = globalThis.fetch;
  try {
    delete process.env.GEOAPIFY_API_KEY;
    await assert.rejects(
      geocodificarEndereco('Rua Um, 123, Cidade - PB'),
      (erro) => erro?.codigo === 'CHAVE_AUSENTE',
    );

    process.env.GEOAPIFY_API_KEY = 'chave-invalida-de-teste';
    globalThis.fetch = async () => new Response('', { status: 401 });
    await assert.rejects(
      geocodificarEndereco('Rua Um, 123, Cidade - PB'),
      (erro) => erro?.codigo === 'CHAVE_RECUSADA',
    );
  } finally {
    globalThis.fetch = fetchAnterior;
    if (chaveAnterior == null) delete process.env.GEOAPIFY_API_KEY;
    else process.env.GEOAPIFY_API_KEY = chaveAnterior;
  }
});
