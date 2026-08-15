-- Reafirma a blindagem de is_admin(), que regrediu em algum ponto do histórico.
--
-- COMO ISTO FOI DESCOBERTO
-- ------------------------
-- `supabase/verificacao-estado.sql`, bloco 5 (funções executáveis por anon),
-- rodado no banco real, listou `is_admin` — mas
-- `schema-migracao-seguranca.sql` já tinha feito:
--
--     revoke execute on function is_admin() from public;
--     grant  execute on function is_admin() to authenticated;
--
-- `create or replace` PRESERVA a ACL, então recriar a função não explica o
-- retorno do privilégio. O que explica é um DROP + CREATE em algum momento —
-- e o Postgres concede EXECUTE a PUBLIC por padrão em função nova. Confirmado
-- na prática: `POST /rest/v1/rpc/is_admin` com a chave anon responde
-- `200 false`, em vez de recusar por permissão.
--
-- POR QUE ISTO IMPORTA MAIS DO QUE PARECE
-- ---------------------------------------
-- Chamada por anon, `is_admin()` devolve `false` (não há `auth.uid()`), então
-- o grant sozinho não é exploração. O problema é o que ele denuncia: o MESMO
-- drop que devolveu o privilégio ao PUBLIC também descarta
--
--     alter function is_admin() set search_path = public;
--
-- que é `ALTER`, não parte do corpo da função — não sobrevive a um recreate.
-- E essa parte é séria: `is_admin()` é SECURITY DEFINER, roda com os
-- privilégios do dono. Sem `search_path` fixo, quem conseguir controlar o
-- search_path da sessão faz `admins` resolver para uma tabela própria e a
-- função responde "sim" — o que destranca todas as policies que terminam em
-- `or is_admin()`, ou seja, o catálogo inteiro de todas as lojas.
--
-- Esta migration é idempotente e reafirma os dois lados. Rodar de novo, mesmo
-- que já esteja tudo certo, não muda nada.
--
-- Também recolhe o EXECUTE público das funções de gatilho, que nunca
-- precisaram dele: `pedidos_marcar_tempos` (trigger) e `rls_auto_enable`
-- (event trigger) só rodam em contexto de gatilho — o Postgres não consulta
-- EXECUTE para dispará-las. Nenhuma das duas é chamável pela API (o PostgREST
-- responde 404 e "cannot display a value of type event_trigger"), então isto
-- é higiene de superfície, não correção de falha.

begin;

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- is_admin()
-- ---------------------------------------------------------------------------
alter function public.is_admin() set search_path = public;

revoke execute on function public.is_admin() from public;
revoke execute on function public.is_admin() from anon;
grant  execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Funções de gatilho: ninguém precisa poder chamá-las
-- ---------------------------------------------------------------------------
-- `if exists` porque `rls_auto_enable` não tem definição em lugar nenhum do
-- repositório — ela existe só no banco. Enquanto a origem dela não for
-- reconstruída no histórico, esta migration não pode presumir que exista.
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'pedidos_marcar_tempos'
  ) then
    execute 'revoke execute on function public.pedidos_marcar_tempos() from public, anon, authenticated';
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- CONFERÊNCIA
-- ---------------------------------------------------------------------------
-- Rode de novo o bloco 5 de supabase/verificacao-estado.sql. Devem sobrar
-- APENAS as duas funções deliberadamente públicas do cardápio, mais a de
-- acompanhamento por token:
--
--     capacidades_checkout
--     delivery_disponibilidade_publica
--     pedido_por_token
--
-- E o bloco 4 (SECURITY DEFINER sem search_path) precisa voltar vazio.
