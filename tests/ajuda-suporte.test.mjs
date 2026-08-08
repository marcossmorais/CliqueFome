import assert from 'node:assert/strict';
import test from 'node:test';
import { correspondeABusca, normalizarBusca } from '../lib/suporte/filtro.ts';
import { avaliarDadosLegais, exibirOuPendente } from '../lib/legal/config.ts';

test('normaliza acentos, caixa e espaços na busca', () => {
  assert.equal(normalizarBusca('  Gestão   de PEDIDOS  '), 'gestao de pedidos');
});

test('busca exige todos os termos, em qualquer ordem', () => {
  const conteudo = 'Cadastre o produto e envie o pedido pelo WhatsApp.';
  assert.equal(correspondeABusca(conteudo, 'whatsapp produto'), true);
  assert.equal(correspondeABusca(conteudo, 'whatsapp entrega'), false);
});

test('busca vazia não elimina conteúdo', () => {
  assert.equal(correspondeABusca('Qualquer resposta', '   '), true);
});

test('documento legal só é publicável com todos os dados obrigatórios', () => {
  const completo = {
    razaoSocial: 'CliqueFome Tecnologia Ltda.',
    cnpj: '00.000.000/0001-00',
    endereco: 'Rua Exemplo, 100, São Paulo - SP',
    emailPrivacidade: 'privacidade@example.com',
    dataVigencia: '8 de agosto de 2026',
  };

  assert.deepEqual(avaliarDadosLegais(completo), { publicavel: true, faltantes: [] });
  assert.deepEqual(avaliarDadosLegais({ ...completo, cnpj: '  ', emailPrivacidade: '' }), {
    publicavel: false,
    faltantes: ['CNPJ', 'e-mail de privacidade'],
  });
});

test('valor legal ausente nunca some silenciosamente do documento', () => {
  assert.equal(exibirOuPendente(''), '[PENDENTE DE PREENCHIMENTO]');
  assert.equal(exibirOuPendente('  Empresa Exemplo  '), 'Empresa Exemplo');
});
