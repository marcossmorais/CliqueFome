import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as esperar } from 'node:timers/promises';
import {
  criarControladorBusca,
  MINIMO_CARACTERES,
  ATRASO_DEBOUNCE_MS,
} from '../lib/delivery/autocomplete.ts';
import {
  camposFaltantes,
  deEnderecoEstruturado,
  paraEnderecoEstruturado,
  paraSugestaoPublica,
  resumoEndereco,
  sugestaoUtilizavel,
  temNumero,
  textoParaGeocodificar,
  ENDERECO_ENTREGA_VAZIO,
} from '../lib/delivery/endereco.ts';
import { normalizarTexto } from '../lib/delivery/tipos.ts';

const ATRASO_TESTE = 20;

function endereco(campos = {}) {
  return { ...ENDERECO_ENTREGA_VAZIO, ...campos };
}

/** Controlador com um `buscar` espião, pra contar quantas requests saíram. */
function montarControlador({ resposta, atrasoResposta = 0 } = {}) {
  const chamadas = [];
  const estados = [];
  const controlador = criarControladorBusca({
    atrasoMs: ATRASO_TESTE,
    buscar: async (texto, signal) => {
      chamadas.push(texto);
      if (atrasoResposta > 0) await esperar(atrasoResposta);
      if (signal.aborted) throw new DOMException('abortada', 'AbortError');
      return typeof resposta === 'function' ? resposta(texto) : (resposta ?? []);
    },
    aoMudarEstado: (estado) => estados.push(estado),
  });
  return { controlador, chamadas, estados };
}

// ---------------------------------------------------------------------------
// Autocomplete: mínimo de caracteres, debounce e request obsoleta
// ---------------------------------------------------------------------------

test('digitar abaixo do mínimo não dispara request nenhuma', async () => {
  const { controlador, chamadas, estados } = montarControlador();
  controlador.digitar('ru');
  await esperar(ATRASO_TESTE * 3);
  assert.equal(chamadas.length, 0);
  assert.deepEqual(estados.at(-1), { status: 'idle' });
  controlador.destruir();
});

test('o mínimo do cliente é o mesmo do servidor', () => {
  // Divergir aqui faria o cliente gastar uma ida à rede pra receber lista
  // vazia de volta.
  assert.equal(MINIMO_CARACTERES, 3);
  assert.ok(ATRASO_DEBOUNCE_MS >= 400 && ATRASO_DEBOUNCE_MS <= 500);
});

test('debounce agrupa a digitação numa request só, com o texto final', async () => {
  const { controlador, chamadas } = montarControlador();
  controlador.digitar('rua');
  controlador.digitar('rua j');
  controlador.digitar('rua jo');
  controlador.digitar('rua joao');
  await esperar(ATRASO_TESTE * 4);
  assert.deepEqual(chamadas, ['rua joao']);
  controlador.destruir();
});

test('resposta antiga que chega depois de uma busca nova é descartada', async () => {
  // A primeira busca responde devagar; a segunda, rápido. Sem o número de
  // sequência, a lenta sobrescreveria a lista com o resultado errado.
  const respostas = {
    'rua antiga': { atraso: 60, itens: [{ id: 'a', formattedAddress: 'ANTIGA' }] },
    'rua nova': { atraso: 0, itens: [{ id: 'n', formattedAddress: 'NOVA' }] },
  };
  const estados = [];
  const controlador = criarControladorBusca({
    atrasoMs: ATRASO_TESTE,
    buscar: async (texto) => {
      const alvo = respostas[texto];
      if (alvo.atraso) await esperar(alvo.atraso);
      return alvo.itens;
    },
    aoMudarEstado: (estado) => estados.push(estado),
  });

  controlador.digitar('rua antiga');
  await esperar(ATRASO_TESTE + 5);
  controlador.digitar('rua nova');
  await esperar(120);

  const resultados = estados.filter((e) => e.status === 'resultados');
  assert.equal(resultados.length, 1, 'só o resultado da busca mais nova deve virar estado');
  assert.equal(resultados[0].sugestoes[0].formattedAddress, 'NOVA');
  controlador.destruir();
});

test('limpar cancela o que estava agendado e volta pra idle', async () => {
  const { controlador, chamadas, estados } = montarControlador();
  controlador.digitar('rua joao pessoa');
  controlador.limpar();
  await esperar(ATRASO_TESTE * 3);
  assert.equal(chamadas.length, 0);
  assert.deepEqual(estados.at(-1), { status: 'idle' });
  controlador.destruir();
});

test('destruir não deixa request pendente disparar depois', async () => {
  const { controlador, chamadas } = montarControlador();
  controlador.digitar('rua das flores');
  controlador.destruir();
  await esperar(ATRASO_TESTE * 3);
  assert.equal(chamadas.length, 0);
});

test('lista vazia vira estado vazio, não erro', async () => {
  const { controlador, estados } = montarControlador({ resposta: [] });
  controlador.digitar('rua inexistente');
  await esperar(ATRASO_TESTE * 3);
  assert.deepEqual(estados.at(-1), { status: 'vazio' });
  controlador.destruir();
});

test('falha do provedor vira mensagem legível, não código técnico', async () => {
  const estados = [];
  const controlador = criarControladorBusca({
    atrasoMs: ATRASO_TESTE,
    buscar: async () => { throw new Error('A busca de endereço está fora do ar. Use a busca por CEP.'); },
    aoMudarEstado: (estado) => estados.push(estado),
  });
  controlador.digitar('rua qualquer');
  await esperar(ATRASO_TESTE * 3);
  const ultimo = estados.at(-1);
  assert.equal(ultimo.status, 'erro');
  assert.match(ultimo.mensagem, /CEP/);
  assert.doesNotMatch(ultimo.mensagem, /500|ROUTING|PROVIDER/);
  controlador.destruir();
});

// ---------------------------------------------------------------------------
// Normalização e DTO
// ---------------------------------------------------------------------------

test('normalização trata as três grafias de São José como uma só', () => {
  const esperado = 'sao jose';
  assert.equal(normalizarTexto('São José'), esperado);
  assert.equal(normalizarTexto('sao jose'), esperado);
  assert.equal(normalizarTexto('SÃO  JOSÉ '), esperado);
});

test('sugestão sem rua não entra na lista', () => {
  assert.equal(sugestaoUtilizavel(endereco({ street: 'Rua A', city: 'Recife' })), true);
  assert.equal(sugestaoUtilizavel(endereco({ street: '', city: 'Recife' })), false);
  assert.equal(sugestaoUtilizavel(endereco({ street: 'Rua A', city: '' })), false);
});

test('sugestão pública não vaza coordenada para o navegador', () => {
  const publica = paraSugestaoPublica(
    endereco({ street: 'Rua A', number: '10', city: 'Recife', latitude: -8.05, longitude: -34.9 }),
    0,
  );
  assert.equal('latitude' in publica, false);
  assert.equal('longitude' in publica, false);
  assert.equal(publica.precisaNumero, false);
});

test('sugestão sem número é marcada para pedir o número', () => {
  const semNumero = paraSugestaoPublica(endereco({ street: 'Rua A', city: 'Recife' }), 0);
  assert.equal(semNumero.precisaNumero, true);
  assert.equal(temNumero(endereco({ street: 'Rua A' })), false);
  assert.equal(temNumero(endereco({ number: '120' })), true);
});

test('camposFaltantes aponta só o que a sugestão não trouxe', () => {
  const completo = endereco({
    street: 'Rua João Pessoa', number: '120', neighborhood: 'Centro',
    city: 'Campina Grande', state: 'PB', postalCode: '58400000',
  });
  assert.deepEqual(camposFaltantes(completo), []);

  // 'uf' entra porque a sugestão veio sem estado — é o caso do interior que
  // travava o salvar, já que sem entrar aqui o campo nunca aparecia na tela.
  const semNumeroNemCep = endereco({ street: 'Rua João Pessoa', neighborhood: 'Centro', city: 'Campina Grande' });
  assert.deepEqual(camposFaltantes(semNumeroNemCep), ['numero', 'cep', 'uf']);
});

test('ida e volta para o contrato antigo preserva os campos', () => {
  const original = endereco({
    street: 'Rua João Pessoa', number: '120', neighborhood: 'Centro',
    city: 'Campina Grande', state: 'PB', postalCode: '58400-000',
  });
  const estruturado = paraEnderecoEstruturado(original, { complemento: 'Apto 202' });

  assert.equal(estruturado.cep, '58400000', 'CEP vai só com dígitos pro contrato antigo');
  assert.equal(estruturado.logradouro, 'Rua João Pessoa');
  assert.equal(estruturado.numero, '120');
  assert.equal(estruturado.bairro, 'Centro');
  assert.equal(estruturado.uf, 'PB');
  assert.equal(estruturado.complemento, 'Apto 202');

  const devolta = deEnderecoEstruturado(estruturado);
  assert.equal(devolta.street, original.street);
  assert.equal(devolta.number, original.number);
  assert.equal(devolta.city, original.city);
  assert.equal(devolta.postalCode, '58400000');
});

test('complemento não faz parte do endereço buscado no provedor', () => {
  const texto = textoParaGeocodificar(endereco({
    street: 'Rua João Pessoa', number: '120', neighborhood: 'Centro',
    city: 'Campina Grande', state: 'PB', postalCode: '58400000',
  }));
  assert.match(texto, /Rua João Pessoa, 120/);
  assert.doesNotMatch(texto, /Apto|bloco|fundos/i);
});

test('resumo do endereço é curto e sem país', () => {
  const texto = resumoEndereco(endereco({
    street: 'Rua João Pessoa', number: '120', neighborhood: 'Centro',
    city: 'Campina Grande', state: 'PB',
  }));
  assert.equal(texto, 'Rua João Pessoa, 120 · Centro · Campina Grande - PB');
  assert.doesNotMatch(texto, /Brasil|Brazil/);
});

test('endereco sem UF e sem bairro (caso real do interior) pede os dois', () => {
  // Regressao do bug relatado: a Geoapify devolve `state_code` e `suburb`
  // nulos em boa parte do interior, mesmo acertando rua/numero/CEP com
  // confianca 1. Sem 'uf' na lista, o campo nunca aparecia — e
  // `enderecoEstruturadoValido`, que exige duas letras, reprovava um
  // endereco que a pessoa nao tinha como corrigir.
  const daGeoapify = endereco({
    street: 'Rua Santa Rita', number: '284', neighborhood: '',
    city: 'Itabaiana', state: '', postalCode: '58360000',
  });
  const faltando = camposFaltantes(daGeoapify);
  assert.ok(faltando.includes('uf'), 'UF precisa estar na lista, senao nao vira campo na tela');
  assert.ok(faltando.includes('bairro'));
  assert.equal(faltando.includes('numero'), false);
  assert.equal(faltando.includes('cep'), false);
});

test('UF invalida conta como faltante', () => {
  for (const uf of ['', 'P', 'PBA', '12']) {
    assert.ok(camposFaltantes(endereco({ state: uf })).includes('uf'), `UF ${JSON.stringify(uf)} deveria ser rejeitada`);
  }
  assert.equal(camposFaltantes(endereco({ state: 'PB' })).includes('uf'), false);
});

test('cidade ausente conta como faltante', () => {
  assert.ok(camposFaltantes(endereco({ city: '' })).includes('cidade'));
  assert.equal(camposFaltantes(endereco({ city: 'Recife' })).includes('cidade'), false);
});

test('endereco completo nao pede nada', () => {
  const completo = endereco({
    street: 'Rua Santa Rita', number: '284', neighborhood: 'Centro',
    city: 'Itabaiana', state: 'PB', postalCode: '58360000',
  });
  assert.deepEqual(camposFaltantes(completo), []);
});
