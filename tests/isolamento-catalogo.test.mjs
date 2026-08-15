import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * Trava o isolamento do catálogo entre lojas.
 *
 * O furo original: as policies de leitura pública eram `using (true)` sem
 * cláusula `to`, o que em Postgres vale pra TODOS os papéis. As colunas
 * internas estavam fechadas só pra `anon`, então qualquer lojista logado lia
 * `preco_custo`, `codigo_pdv` e `dono_id` de qualquer loja via PostgREST.
 *
 * Estes testes são de código-fonte, não de banco — o teste de banco é o
 * roteiro no rodapé da própria migration, que precisa de duas contas reais.
 * O que se garante aqui é que ninguém desfaça as duas decisões que sustentam
 * a correção.
 */

const ler = (caminho) => readFileSync(new URL(`../${caminho}`, import.meta.url), 'utf8');

const MIGRATION = 'supabase/migrations/20260815090000_isola_catalogo_entre_lojas.sql';

const TABELAS_PUBLICAS = [
  'lojas',
  'categorias',
  'produtos',
  'grupos_complemento',
  'complementos',
  'produto_grupos',
];

test('toda policy de leitura pública do catálogo é escopada ao papel anon', () => {
  const sql = ler(MIGRATION);

  for (const tabela of TABELAS_PUBLICAS) {
    const bloco = sql.match(
      new RegExp(`create policy "${tabela}_select_publico"[\\s\\S]*?using \\(true\\);`)
    );
    assert.ok(bloco, `falta recriar ${tabela}_select_publico`);
    assert.match(
      bloco[0],
      /\bto anon\b/,
      `${tabela}_select_publico sem "to anon" volta a valer para authenticated`
    );
  }
});

test('lojas ganha policy de select do dono, senão o painel fica sem leitura', () => {
  const sql = ler(MIGRATION);
  // `lojas` é a única tabela do grupo sem `*_all_dono`: a policy pública era a
  // única de select. Escopar pra anon sem acrescentar esta trancaria o painel.
  const bloco = sql.match(/create policy "lojas_select_dono"[\s\S]*?;/);
  assert.ok(bloco, 'lojas_select_dono não foi criada');
  assert.match(bloco[0], /to authenticated/);
  assert.match(bloco[0], /dono_id = auth\.uid\(\)/);
  assert.match(bloco[0], /is_admin\(\)/, 'super admin precisa continuar enxergando as lojas');
});

test('o cardápio público não usa a sessão do visitante', () => {
  // Esta é a razão de escopar a policy a `anon` não derrubar a vitrine: as
  // páginas públicas montam um client com a chave anon e sem cookie, então um
  // lojista logado que abre o cardápio de outra loja continua sendo `anon`
  // para o banco. Trocar isto por criarClientServidor() reabriria a discussão
  // inteira — e quebraria o cardápio para quem estiver logado.
  for (const caminho of ['app/[loja]/page.tsx', 'app/[loja]/meus-pedidos/page.tsx']) {
    const fonte = ler(caminho);
    assert.match(fonte, /persistSession: false/, `${caminho} precisa de client sem sessão`);
    assert.doesNotMatch(
      fonte,
      /criarClientServidor/,
      `${caminho} não pode ler o catálogo com a sessão do visitante`
    );
  }
});

test('o cardápio público lista colunas e nunca pede select(*)', () => {
  // `anon` tem grant coluna a coluna: um `select('*')` derruba a consulta
  // inteira com "permission denied" — já tirou o cardápio do ar uma vez.
  const fonte = ler('app/[loja]/page.tsx');
  assert.doesNotMatch(fonte, /\.select\(\s*['"`]\*/);
});

test('o client privilegiado é inutilizável fora do servidor', () => {
  const fonte = ler('lib/pedidos/servidor.ts');
  // Carrega a chave que ignora RLS. `server-only` transforma um import errado
  // em erro de build, em vez de mandar o segredo pro bundle do navegador.
  assert.match(fonte, /^import 'server-only';/m);
});

test('o CI não expõe a chave privilegiada aos jobs que não precisam dela', () => {
  const ci = ler('.github/workflows/ci.yml');
  // Sem as linhas de comentário: o bloco global EXPLICA por que os segredos
  // saíram dali, e citar o nome deles na prosa não é declará-los.
  const semComentario = (texto) =>
    texto
      .split('\n')
      .filter((linha) => !linha.trim().startsWith('#'))
      .join('\n');

  const globalEnv = semComentario(ci.split('jobs:')[0]);
  // `npm ci` roda scripts de dependências: quanto menos jobs tiverem a
  // chave-mestra no ambiente, menor a superfície.
  assert.doesNotMatch(globalEnv, /SUPABASE_SECRET_KEY:/);
  assert.doesNotMatch(globalEnv, /RATE_LIMIT_HMAC_SECRET:/);
  assert.match(semComentario(ci.split('e2e:')[1] ?? ''), /SUPABASE_SECRET_KEY:/);
});
