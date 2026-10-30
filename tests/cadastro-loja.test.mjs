import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { aplicarRespostaViaCep } from '../lib/delivery/endereco.ts';
import {
  ErroCadastro,
  formatarWhatsapp,
  normalizarWhatsapp,
  resolverEtapa,
  slugDoNome,
  slugReservado,
  validarCategoria,
  validarEmail,
  validarNomeLoja,
  validarNomePessoa,
  validarSenha,
} from '../lib/onboarding/dados.ts';
import {
  AJUSTE_MAXIMO_METROS,
  arredondar,
  coordenadaDoPonto,
  coordenadaValida,
  distanciaMetros,
  posicaoDoPin,
} from '../lib/onboarding/mapa.ts';

const CENTRO = { latitude: -7.3281, longitude: -35.6329 };

/* 1. Usuário novo cria conta ------------------------------------------- */

test('conta nova exige nome, e-mail e senha utilizáveis', () => {
  assert.equal(validarNomePessoa('  Maria  Silva '), 'Maria Silva');
  assert.equal(validarEmail(' Dono@Loja.COM '), 'dono@loja.com');
  assert.equal(validarSenha('senhaboa1'), 'senhaboa1');

  assert.throws(() => validarNomePessoa('M'), ErroCadastro);
  assert.throws(() => validarEmail('dono@loja'), ErroCadastro);
  // Senha curta é recusada aqui e não só pelo Supabase: a mensagem precisa
  // aparecer antes da chamada de rede.
  assert.throws(() => validarSenha('1234567'), ErroCadastro);
});

/* 2. Usuário logado pula a etapa Conta ---------------------------------- */

test('quem já está logado começa direto na etapa da loja', () => {
  assert.equal(resolverEtapa({ temSessao: false, loja: null }), 'ACCOUNT');
  assert.equal(resolverEtapa({ temSessao: true, loja: null }), 'STORE');
});

/* 3. Dados da loja salvam ----------------------------------------------- */

test('loja só avança com nome, categoria e WhatsApp válidos', () => {
  assert.equal(validarNomeLoja('  Burger   do  Zé '), 'Burger do Zé');
  assert.equal(validarCategoria('Marmitaria'), 'Marmitaria');
  assert.equal(normalizarWhatsapp('(83) 99999-8888'), '5583999998888');

  assert.throws(() => validarNomeLoja('B'), ErroCadastro);
  assert.throws(() => validarCategoria('Petshop'), ErroCadastro);
  assert.throws(() => normalizarWhatsapp('99999-8888'), ErroCadastro);
});

test('WhatsApp é gravado com 55 na frente, que é o que o wa.me exige', () => {
  // O cardápio público monta wa.me/<dígitos>. Sem o 55 o link abre vazio.
  assert.equal(normalizarWhatsapp('83 99999-8888'), '5583999998888');
  assert.equal(normalizarWhatsapp('5583999998888'), '5583999998888');
  assert.equal(normalizarWhatsapp('(83) 3221-8888'), '558332218888');
  // Celular sem o 9 na frente é digitação errada, não número antigo.
  assert.throws(() => normalizarWhatsapp('83 88888-8888'), ErroCadastro);

  assert.equal(formatarWhatsapp('5583999998888'), '(83) 99999-8888');
  assert.equal(formatarWhatsapp('558332218888'), '(83) 3221-8888');
  assert.equal(formatarWhatsapp('83999'), '(83) 999');
});

test('slug sai do nome e não colide com rota da aplicação', () => {
  assert.equal(slugDoNome('Açaí do Zé'), 'acai-do-ze');
  assert.equal(slugDoNome('  Pizzaria  São João!! '), 'pizzaria-sao-joao');
  // Nome só de símbolo ainda precisa gerar slug válido pro banco.
  assert.equal(slugDoNome('★★★'), 'loja');

  // `app/[loja]/` é catch-all na raiz: uma loja com slug "painel" ficaria
  // inacessível pra sempre porque a rota estática vence.
  assert.equal(slugReservado('painel'), true);
  assert.equal(slugReservado('cadastro'), true);
  assert.equal(slugReservado('burger-do-ze'), false);
});

/* 4. CEP preenche os campos --------------------------------------------- */

const ENDERECO_EM_BRANCO = {
  cep: '58360000',
  rua: '',
  numero: '',
  bairro: '',
  cidade: '',
  uf: '',
  complemento: null,
};

test('ViaCEP preenche rua, bairro, cidade e UF', () => {
  const preenchido = aplicarRespostaViaCep(ENDERECO_EM_BRANCO, {
    logradouro: 'Rua João Pessoa',
    bairro: 'Centro',
    localidade: 'Itabaiana',
    uf: 'pb',
  });

  assert.equal(preenchido.rua, 'Rua João Pessoa');
  assert.equal(preenchido.bairro, 'Centro');
  assert.equal(preenchido.cidade, 'Itabaiana');
  assert.equal(preenchido.uf, 'PB');
});

/* 5. CEP inválido não trava o cadastro ---------------------------------- */

test('CEP sem retorno preserva o que a pessoa já digitou', () => {
  const digitado = { ...ENDERECO_EM_BRANCO, rua: 'Rua Nova', bairro: 'Alto', cidade: 'Areia', uf: 'PB' };
  // CEP de logradouro único responde 200 com os campos vazios; o antigo
  // comportamento de sobrescrever apagava o endereço correto na tela.
  const resultado = aplicarRespostaViaCep(digitado, { logradouro: '', bairro: '', localidade: '', uf: '' });

  assert.deepEqual(resultado, digitado);
});

/* 6. Geoapify devolve coordenada gravável -------------------------------- */

test('coordenada é validada e arredondada pro formato da coluna', () => {
  assert.equal(coordenadaValida(CENTRO), true);
  assert.equal(coordenadaValida({ latitude: 91, longitude: 0 }), false);
  assert.equal(coordenadaValida({ latitude: Number.NaN, longitude: 0 }), false);

  // numeric(9,6) no banco: mandar 15 casas só gera arredondamento silencioso.
  assert.deepEqual(arredondar({ latitude: -7.32814999, longitude: -35.63291234 }), {
    latitude: -7.32815,
    longitude: -35.632912,
  });
});

test('pin ajustado no mapa vira coordenada perto do endereço', () => {
  // Clicar no centro da imagem devolve o próprio centro.
  const meio = coordenadaDoPonto(CENTRO, { x: 320, y: 130, larguraCss: 640, alturaCss: 260 });
  assert.ok(distanciaMetros(CENTRO, meio) < 1);

  // A imagem aparece reduzida no celular; o ponto clicado não pode escorregar.
  const meioNoCelular = coordenadaDoPonto(CENTRO, { x: 160, y: 65, larguraCss: 320, alturaCss: 130 });
  assert.ok(distanciaMetros(CENTRO, meioNoCelular) < 1);

  // Um clique na borda continua sendo uma correção de quarteirão, nunca de
  // cidade — é o que o teto do servidor confere antes de gravar.
  const borda = coordenadaDoPonto(CENTRO, { x: 640, y: 0, larguraCss: 640, alturaCss: 260 });
  assert.ok(distanciaMetros(CENTRO, borda) < AJUSTE_MAXIMO_METROS);

  const posicao = posicaoDoPin(CENTRO, CENTRO);
  assert.ok(Math.abs(posicao.esquerda - 50) < 0.001);
  assert.ok(Math.abs(posicao.topo - 50) < 0.001);
});

test('coordenada de outra cidade estoura o teto de ajuste do pin', () => {
  // João Pessoa fica a ~100 km de Campina Grande: o servidor recusa.
  const outraCidade = { latitude: -7.1195, longitude: -34.8451 };
  assert.ok(distanciaMetros(CENTRO, outraCidade) > AJUSTE_MAXIMO_METROS);
});

/* 7. Refresh retoma o cadastro ------------------------------------------ */

test('etapa vem do banco, então recarregar cai no mesmo passo', () => {
  assert.equal(resolverEtapa({ temSessao: true, loja: { onboarding_etapa: 'ADDRESS' } }), 'ADDRESS');
  assert.equal(resolverEtapa({ temSessao: true, loja: { onboarding_etapa: 'STORE' } }), 'STORE');
  // Valor desconhecido nunca deixa alguém preso no cadastro. `undefined` é o
  // caso real do intervalo entre o deploy e a migration rodar: a coluna ainda
  // não existe e o painel precisa continuar abrindo pra quem já era cliente.
  assert.equal(resolverEtapa({ temSessao: true, loja: { onboarding_etapa: 'xpto' } }), 'DONE');
  assert.equal(resolverEtapa({ temSessao: true, loja: {} }), 'DONE');
});

/* 8 e 9. Loja de um dono não é alcançável pelo corpo da requisição ------- */

const ROTAS_CADASTRO = [
  'app/api/onboarding/loja/route.ts',
  'app/api/onboarding/endereco/route.ts',
  'app/api/onboarding/concluir/route.ts',
];

test('nenhuma rota do cadastro aceita id de loja vindo do navegador', () => {
  for (const caminho of ROTAS_CADASTRO) {
    const fonte = readFileSync(new URL(`../${caminho}`, import.meta.url), 'utf8');

    // A loja é sempre descoberta a partir do usuário da sessão. Se um dia
    // alguém ler o id do corpo, forjar o JSON passa a escrever na loja alheia.
    assert.match(fonte, /autorizarCadastro\(\)/, `${caminho} precisa resolver o usuário da sessão`);
    assert.doesNotMatch(
      fonte,
      /corpo\.(lojaId|loja_id|storeId|store_id|slug)/,
      `${caminho} não pode ler identificador de loja do corpo`
    );
  }
});

test('gravação da loja filtra por dono, mesmo com client privilegiado', () => {
  const fonte = readFileSync(new URL('../lib/onboarding/servidor.ts', import.meta.url), 'utf8');
  // criarClientPrivilegiado ignora RLS: o filtro por dono_id é o que sobra.
  assert.match(fonte, /\.eq\('dono_id', userId\)/);
  assert.match(fonte, /dono_id: userId/);
});

/* 10. Onboarding concluído libera o painel ------------------------------ */

test('painel só abre com o cadastro concluído', () => {
  assert.equal(resolverEtapa({ temSessao: true, loja: { onboarding_etapa: 'DONE' } }), 'DONE');

  const layout = readFileSync(
    new URL('../app/(interno)/painel/[loja]/layout.tsx', import.meta.url),
    'utf8'
  );
  assert.match(layout, /etapaDaLoja\(loja\.onboarding_etapa\) !== 'DONE'/);
  assert.match(layout, /redirect\('\/cadastro'\)/);
});

/* Reservas e blindagem ---------------------------------------------------- */

/** Primeiro nível de rotas de `app/`, atravessando grupos `(x)` e ignorando
 * pastas privadas `_x` e dinâmicas `[x]`. */
function segmentosDeRota(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('['))
    .flatMap((e) => (e.name.startsWith('(') ? segmentosDeRota(`${dir}/${e.name}`) : [e.name]));
}

test('todo segmento de rota estático de app/ está nos slugs reservados', () => {
  for (const segmento of segmentosDeRota(new URL('../app', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
    assert.equal(slugReservado(segmento), true, `"${segmento}" falta em SLUGS_RESERVADOS`);
  }
});

test('migration blinda onboarding_etapa e a unicidade do cadastro pendente', () => {
  const sql = readFileSync(
    new URL('../supabase/migrations/20260816090000_blinda_onboarding_etapa.sql', import.meta.url),
    'utf8'
  );
  assert.match(sql, /new\.onboarding_etapa := 'ADDRESS'/);
  assert.match(sql, /new\.onboarding_etapa := old\.onboarding_etapa/);
  assert.match(sql, /create unique index if not exists lojas_um_cadastro_pendente_por_dono[\s\S]*where onboarding_etapa <> 'DONE'/);
});

test('concluir recusa coordenada que não seja número', () => {
  const fonte = readFileSync(new URL('../app/api/onboarding/concluir/route.ts', import.meta.url), 'utf8');
  assert.match(fonte, /typeof corpo\.latitude !== 'number'/);
});
