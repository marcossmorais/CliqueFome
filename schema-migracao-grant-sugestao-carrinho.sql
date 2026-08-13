-- Libera para `anon` as colunas de sugestão do carrinho.
--
-- schema-migracao-seguranca.sql revogou o SELECT das tabelas inteiras e
-- concedeu coluna a coluna. As colunas de sugestão nasceram depois disso
-- (schema-migracao-sugestoes-carrinho.sql) e ficaram de fora do grant — e uma
-- só coluna sem permissão derruba a consulta inteira do cardápio com
-- "permission denied for table produtos". Por isso o select público de
-- app/[loja]/page.tsx as omitia, e as sugestões do carrinho nunca chegavam a
-- aparecer para ninguém.
--
-- Rodar ANTES de publicar o código que passa a selecionar essas colunas.

grant select (sugestao_carrinho) on produtos to anon, authenticated;
grant select (sugestao_carrinho) on complementos to anon, authenticated;

-- Conferência: as duas linhas abaixo precisam retornar uma linha cada.
select table_name, column_name
from information_schema.column_privileges
where table_schema = 'public'
  and grantee = 'anon'
  and privilege_type = 'SELECT'
  and column_name = 'sugestao_carrinho'
order by table_name;
