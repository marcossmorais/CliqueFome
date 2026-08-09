import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ErroValidacaoCheckout,
  itensParaRpc,
  normalizarTelefone,
  payloadCanonico,
  validarEntradaCheckout,
} from '../lib/pedidos/checkout.ts';

const ITEM_ID = '11111111-1111-1111-1111-111111111111';
const COMPLEMENTO_ID = '22222222-2222-2222-2222-222222222222';
const IDEMPOTENCY_KEY = '33333333-3333-4333-8333-333333333333';

function entradaBase(sobrescreve = {}) {
  return {
    idempotencyKey: IDEMPOTENCY_KEY,
    clienteNome: 'Maria Silva',
    clienteTelefone: '(11) 91234-5678',
    tipo: 'retirada',
    formaPagamento: 'pagamento_retirada',
    itens: [{ produtoId: ITEM_ID, quantidade: 2 }],
    totalEsperadoCentavos: 5000,
    ...sobrescreve,
  };
}

test('normalizarTelefone só aceita 10 ou 11 dígitos, ignorando a máscara', () => {
  assert.equal(normalizarTelefone('(11) 91234-5678'), '11912345678');
  assert.equal(normalizarTelefone('11 3456-7890'), '1134567890');
  assert.throws(() => normalizarTelefone('123'), ErroValidacaoCheckout);
  assert.throws(() => normalizarTelefone('1191234567890000'), ErroValidacaoCheckout);
});

test('validarEntradaCheckout aceita um pedido de retirada válido', () => {
  const entrada = validarEntradaCheckout(entradaBase());
  assert.equal(entrada.clienteNome, 'Maria Silva');
  assert.equal(entrada.clienteTelefone, '11912345678');
  assert.equal(entrada.tipo, 'retirada');
  assert.equal(entrada.itens.length, 1);
  assert.equal(entrada.endereco, undefined);
});

test('validarEntradaCheckout exige endereço só quando tipo é delivery', () => {
  assert.throws(
    () => validarEntradaCheckout(entradaBase({ tipo: 'delivery', formaPagamento: 'dinheiro_entrega' })),
    ErroValidacaoCheckout
  );
  const entrada = validarEntradaCheckout(entradaBase({ tipo: 'delivery', formaPagamento: 'dinheiro_entrega', endereco: 'Rua Um, 123, Centro' }));
  assert.equal(entrada.endereco, 'Rua Um, 123, Centro');
});

test('validarEntradaCheckout rejeita idempotencyKey que não é UUID', () => {
  assert.throws(
    () => validarEntradaCheckout(entradaBase({ idempotencyKey: 'nao-e-uuid' })),
    ErroValidacaoCheckout
  );
});

test('validarEntradaCheckout rejeita pedido vazio e pedido com itens demais', () => {
  assert.throws(() => validarEntradaCheckout(entradaBase({ itens: [] })), ErroValidacaoCheckout);
  const itensDemais = Array.from({ length: 101 }, () => ({ produtoId: ITEM_ID, quantidade: 1 }));
  assert.throws(() => validarEntradaCheckout(entradaBase({ itens: itensDemais })), ErroValidacaoCheckout);
});

test('validarEntradaCheckout ignora silenciosamente propriedades que o navegador não deveria mandar', () => {
  // loja_id, preco, total oficial, status — nada disso é lido, então nada
  // disso pode influenciar o pedido criado.
  const entrada = validarEntradaCheckout(
    entradaBase({
      loja_id: 'outra-loja', preco: 0.01, status: 'confirmado',
      pagamento_status: 'confirmado', total: 999999,
    })
  );
  assert.equal(Object.keys(entrada).includes('loja_id'), false);
  assert.equal(Object.keys(entrada).includes('status'), false);
  assert.equal(Object.keys(entrada).includes('pagamento_status'), false);
});

test('validarEntradaCheckout valida cada complemento do item', () => {
  const entrada = validarEntradaCheckout(
    entradaBase({
      itens: [
        {
          produtoId: ITEM_ID,
          quantidade: 1,
          complementos: [{ complementoId: COMPLEMENTO_ID, quantidade: 2 }],
        },
      ],
    })
  );
  assert.deepEqual(entrada.itens[0].complementos, [{ complementoId: COMPLEMENTO_ID, quantidade: 2 }]);

  assert.throws(
    () =>
      validarEntradaCheckout(
        entradaBase({ itens: [{ produtoId: ITEM_ID, quantidade: 1, complementos: [{ complementoId: 'invalido' }] }] })
      ),
    ErroValidacaoCheckout
  );
});

test('payloadCanonico é determinístico não importa a ordem dos itens/complementos', () => {
  const a = entradaBase({
    itens: [
      { produtoId: ITEM_ID, quantidade: 1, complementos: [{ complementoId: COMPLEMENTO_ID, quantidade: 1 }, { complementoId: '44444444-4444-4444-4444-444444444444', quantidade: 1 }] },
    ],
  });
  const entradaA = validarEntradaCheckout(a);
  const entradaB = validarEntradaCheckout({
    ...a,
    itens: [
      {
        produtoId: ITEM_ID,
        quantidade: 1,
        complementos: [
          { complementoId: '44444444-4444-4444-4444-444444444444', quantidade: 1 },
          { complementoId: COMPLEMENTO_ID, quantidade: 1 },
        ],
      },
    ],
  });
  assert.equal(payloadCanonico(entradaA), payloadCanonico(entradaB));
});

test('payloadCanonico muda quando o total esperado muda (protege contra reuso indevido da chave)', () => {
  const entrada1 = validarEntradaCheckout(entradaBase({ totalEsperadoCentavos: 5000 }));
  const entrada2 = validarEntradaCheckout(entradaBase({ totalEsperadoCentavos: 7000 }));
  assert.notEqual(payloadCanonico(entrada1), payloadCanonico(entrada2));
});

test('checkout exige uma forma offline compatível com entrega ou retirada', () => {
  assert.throws(
    () => validarEntradaCheckout(entradaBase({ formaPagamento: undefined })),
    ErroValidacaoCheckout
  );
  assert.throws(
    () => validarEntradaCheckout(entradaBase({ formaPagamento: 'cartao_online' })),
    ErroValidacaoCheckout
  );
  assert.throws(
    () => validarEntradaCheckout(entradaBase({
      tipo: 'delivery', endereco: 'Rua Um, 123', formaPagamento: 'pagamento_retirada',
    })),
    ErroValidacaoCheckout
  );
  assert.equal(
    validarEntradaCheckout(entradaBase({
      tipo: 'delivery', endereco: 'Rua Um, 123', formaPagamento: 'pix_manual',
    })).formaPagamento,
    'pix_manual'
  );
});

test('a forma de pagamento participa da idempotência do pedido', () => {
  const retirada = validarEntradaCheckout(entradaBase({ formaPagamento: 'pagamento_retirada' }));
  const pix = validarEntradaCheckout(entradaBase({ formaPagamento: 'pix_manual' }));
  assert.notEqual(payloadCanonico(retirada), payloadCanonico(pix));
});

test('itensParaRpc converte pro formato snake_case que criar_pedido() espera', () => {
  const entrada = validarEntradaCheckout(
    entradaBase({
      itens: [
        {
          produtoId: ITEM_ID,
          quantidade: 3,
          observacao: 'sem cebola',
          complementos: [{ complementoId: COMPLEMENTO_ID, quantidade: 2 }],
        },
      ],
    })
  );
  assert.deepEqual(itensParaRpc(entrada.itens), [
    {
      produto_id: ITEM_ID,
      quantidade: 3,
      observacao: 'sem cebola',
      opcoes: [{ complemento_id: COMPLEMENTO_ID, quantidade: 2 }],
    },
  ]);
});

test('validarEntradaCheckout preserva cotacao apenas no delivery', () => {
  const delivery = validarEntradaCheckout(entradaBase({
    tipo: 'delivery', formaPagamento: 'dinheiro_entrega', endereco: 'Rua Um, 123, Centro',
    enderecoCotacao: 'Rua Um, 123, Centro, Cidade - PB, CEP 58000-000',
    cotacaoToken: 'payload.assinatura',
  }));
  assert.equal(delivery.enderecoCotacao, 'Rua Um, 123, Centro, Cidade - PB, CEP 58000-000');
  assert.equal(delivery.cotacaoToken, 'payload.assinatura');

  const retirada = validarEntradaCheckout(entradaBase({
    enderecoCotacao: 'nao deve entrar', cotacaoToken: 'nao deve entrar',
  }));
  assert.equal(retirada.enderecoCotacao, undefined);
  assert.equal(retirada.cotacaoToken, undefined);
});
