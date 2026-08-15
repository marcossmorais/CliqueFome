-- Retrato do estado de SEGURANÇA do banco. Somente leitura: nenhum comando
-- aqui altera nada, pode rodar em produção.
--
-- POR QUE ISTO EXISTE
-- -------------------
-- Parte das correções de segurança mora em arquivos `.sql` da raiz
-- (schema-migracao-seguranca.sql, schema-migracao-superadmin.sql, ...), que
-- foram aplicados à mão no SQL Editor, e parte em `supabase/migrations/`,
-- que é o histórico canônico. Ninguém consegue afirmar, olhando só o Git, o
-- que está de fato valendo no banco — e é assim que uma policy some sem
-- ninguém perceber, ou que um staging novo nasce diferente de produção.
--
-- Rode os cinco blocos no SQL Editor e guarde a saída. É ela que diz quais
-- correções da raiz já viraram estado real e precisam ser transportadas para
-- `supabase/migrations/` como a fonte da verdade.

-- ---------------------------------------------------------------------------
-- 1. Policies que valem para TODOS os papéis
-- ---------------------------------------------------------------------------
-- `polroles = '{0}'` significa "sem cláusula TO", ou seja: vale também para
-- `authenticated`. Foi exatamente isso que expôs preco_custo/codigo_pdv de
-- uma loja para o dono de outra. Depois da migration de isolamento, nenhuma
-- policy de catálogo pode aparecer aqui.
select
  polrelid::regclass as tabela,
  polname            as policy,
  case polcmd when 'r' then 'select' when 'a' then 'insert'
              when 'w' then 'update' when 'd' then 'delete' else 'all' end as comando
from pg_policy
where polroles = '{0}'
order by 1, 2;

-- ---------------------------------------------------------------------------
-- 2. O que cada papel do navegador enxerga, coluna a coluna
-- ---------------------------------------------------------------------------
-- `anon` e `authenticated` são alcançáveis com a chave pública do bundle.
-- Colunas internas (preco_custo, codigo_pdv, codigo_interno, dono_id) não
-- devem aparecer para `anon`.
select
  table_name,
  grantee,
  string_agg(column_name, ', ' order by column_name) as colunas
from information_schema.column_privileges
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and privilege_type = 'SELECT'
group by table_name, grantee
order by table_name, grantee;

-- ---------------------------------------------------------------------------
-- 3. Tabelas públicas sem RLS ativa
-- ---------------------------------------------------------------------------
-- Precisa voltar VAZIO. Uma tabela sem RLS é lida por inteiro por qualquer
-- pessoa que tenha a chave anon.
select relname as tabela_sem_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
order by 1;

-- ---------------------------------------------------------------------------
-- 4. Funções SECURITY DEFINER sem search_path fixo
-- ---------------------------------------------------------------------------
-- Roda com os privilégios do dono da função. Sem `search_path` fixo, quem
-- controlar o search_path da sessão pode fazer a função consultar outra
-- tabela — é o caso do is_admin() antigo. Precisa voltar VAZIO.
select
  p.proname as funcao,
  pg_get_function_identity_arguments(p.oid) as argumentos
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and coalesce(array_to_string(p.proconfig, ','), '') not like '%search_path%'
order by 1;

-- ---------------------------------------------------------------------------
-- 5. Funções executáveis por anônimo
-- ---------------------------------------------------------------------------
-- Cada linha aqui é uma porta aberta sem login. Devem sobrar apenas as
-- deliberadamente públicas (cardápio e disponibilidade). `criar_pedido` e
-- qualquer função administrativa NÃO podem aparecer.
select
  p.proname as funcao,
  pg_get_function_identity_arguments(p.oid) as argumentos
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and has_function_privilege('anon', p.oid, 'execute')
order by 1;
