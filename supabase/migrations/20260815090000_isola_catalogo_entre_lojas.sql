-- Fecha o vazamento de leitura do catálogo entre lojas.
--
-- O QUE ESTAVA ERRADO
-- -------------------
-- As policies de leitura pública do catálogo eram `using (true)` SEM cláusula
-- `to`, o que em Postgres significa "vale para TODOS os papéis" — inclusive
-- `authenticated`.
--
-- `schema-migracao-seguranca.sql` fechou as colunas internas, mas só para
-- `anon`:
--
--     revoke select on produtos from anon;
--     grant select (id, nome, preco, ...) on produtos to anon;
--
-- `authenticated` manteve o SELECT da tabela inteira. Somando as duas coisas,
-- qualquer lojista com conta na plataforma podia pedir, direto na API REST do
-- Supabase (a chave anon vai no bundle, e o token dele é o da própria sessão):
--
--     GET /rest/v1/produtos?loja_id=eq.<LOJA_ALHEIA>&select=preco_custo,codigo_pdv
--     GET /rest/v1/lojas?id=eq.<LOJA_ALHEIA>&select=dono_id
--
-- e recebia 200 com a margem de lucro, o código de PDV e o dono de qualquer
-- loja da plataforma. Confirmado contra o banco real antes desta migração;
-- esconder os campos no frontend não protegia nada, porque o atacante fala
-- com o PostgREST direto.
--
-- Escrita NÃO estava exposta: as policies `*_all_dono` já filtravam por dono,
-- e um UPDATE/DELETE cruzado afetava zero linhas (o 204 do PostgREST é
-- "nenhuma linha", não "alterado"). O problema era de confidencialidade.
--
-- A CORREÇÃO
-- ----------
-- Escopar a leitura pública ao papel `anon`, que é onde ela precisa existir —
-- e onde as colunas JÁ estão restritas coluna a coluna. `authenticated` passa
-- a enxergar apenas a própria loja, pelas policies de dono que já existiam.
--
-- Por que isto não derruba o cardápio público: as páginas de `app/[loja]/`
-- não usam a sessão do visitante. Elas montam um client próprio com a chave
-- anon e `persistSession: false` (`clientePublico()`), então um lojista logado
-- que abre o cardápio de outra loja continua sendo `anon` para o banco. Quem
-- usa sessão é só o painel, que lê a própria loja.
--
-- As rotas de API (checkout, cotação, meus-pedidos) usam o client
-- privilegiado, que ignora RLS — nenhuma delas é afetada.

begin;

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- lojas
-- ---------------------------------------------------------------------------
-- Caso especial: `lojas` NÃO tinha policy de select para o dono. A pública era
-- a única, então escopá-la a `anon` sem acrescentar a de dono trancaria o
-- painel inteiro para fora (o layout resolve a loja pelo slug com a sessão).
drop policy if exists "lojas_select_publico" on public.lojas;
create policy "lojas_select_publico"
  on public.lojas for select
  to anon
  using (true);

drop policy if exists "lojas_select_dono" on public.lojas;
create policy "lojas_select_dono"
  on public.lojas for select
  to authenticated
  using (dono_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Demais tabelas do catálogo
-- ---------------------------------------------------------------------------
-- Todas já têm `<tabela>_all_dono for all to authenticated`, e `for all`
-- inclui select — por isso aqui basta escopar a policy pública. O dono segue
-- lendo (e escrevendo) o catálogo da própria loja, com todas as colunas.

drop policy if exists "categorias_select_publico" on public.categorias;
create policy "categorias_select_publico"
  on public.categorias for select
  to anon
  using (true);

drop policy if exists "produtos_select_publico" on public.produtos;
create policy "produtos_select_publico"
  on public.produtos for select
  to anon
  using (true);

drop policy if exists "grupos_complemento_select_publico" on public.grupos_complemento;
create policy "grupos_complemento_select_publico"
  on public.grupos_complemento for select
  to anon
  using (true);

drop policy if exists "complementos_select_publico" on public.complementos;
create policy "complementos_select_publico"
  on public.complementos for select
  to anon
  using (true);

drop policy if exists "produto_grupos_select_publico" on public.produto_grupos;
create policy "produto_grupos_select_publico"
  on public.produto_grupos for select
  to anon
  using (true);

commit;

-- ---------------------------------------------------------------------------
-- CONFERÊNCIA
-- ---------------------------------------------------------------------------
-- 1) Nenhuma policy de catálogo pode ficar sem `roles` definido. A coluna
--    `polroles` vem '{0}' quando a policy vale pra todos os papéis — que é
--    exatamente o defeito corrigido aqui. Precisa voltar VAZIO:
--
--    select polrelid::regclass as tabela, polname
--    from pg_policy
--    where polname like '%_select_publico'
--      and polroles = '{0}';
--
-- 2) Teste vivo (o que provou o furo): autentique-se como dono da loja A e
--    peça colunas internas da loja B. Precisa voltar 200 com lista VAZIA —
--    não 200 com dados, e não erro de permissão:
--
--    GET /rest/v1/produtos?loja_id=eq.<LOJA_B>&select=nome,preco_custo
--        Authorization: Bearer <token do dono da loja A>
--
-- 3) O cardápio público (sem Authorization, só apikey anon) precisa continuar
--    respondendo 200 com dados:
--
--    GET /rest/v1/produtos?loja_id=eq.<LOJA_B>&select=nome,preco
