-- Migração de segurança — fecha o que a auditoria de 2026-08-08 apontou
-- em RLS, Storage e funções.
--
-- Como usar: Supabase → SQL Editor → New query → cola tudo → Run.
-- Rodar DEPOIS de schema-migracao-pedidos.sql. Seguro rodar mais de uma vez.
--
-- No fim do arquivo há um bloco de CONFERÊNCIA que imprime o resultado.
-- Rode ele e confira antes de considerar isto pronto.
--
-- O que este arquivo NÃO resolve (precisa de decisão ou infraestrutura):
--   * rate limit da criação de pedido — precisa de Edge Function/API na
--     frente do banco; nenhuma quantidade de SQL substitui isso;
--   * quota de lojas por usuário e signup por convite — depende do modelo
--     de onboarding, que ainda não foi decidido;
--   * quota de Storage por loja e limpeza de arquivos órfãos.

-- ---------------------------------------------------------------
-- 1. A criar_pedido() ANTIGA, de 8 parâmetros
-- ---------------------------------------------------------------
-- A primeira versão da função tinha 8 parâmetros. Quando a migração de
-- pedidos acrescentou p_data_hora_agendada, p_origem e p_status_inicial, o
-- `create or replace` NÃO substituiu a antiga: assinatura diferente é
-- função diferente em Postgres. O banco ficou com as duas.
--
-- Isso é grave por dois motivos:
--   1. a de 8 parâmetros não tem NENHUMA das validações novas (vínculo de
--      complemento, qtd_min/qtd_max, quantidade por opção) e continuava
--      concedida a anon;
--   2. com as duas no ar, o PostgREST não sabe qual chamar quando o corpo
--      da requisição casa com ambas, e responde PGRST203.
drop function if exists criar_pedido(text, text, text, text, text, text, text, jsonb);

-- Garantia sobre a que fica: só quem tem sessão executa. Na versão básica
-- o cardápio público não grava pedido — ele monta a mensagem do WhatsApp
-- (ver docs/DECISIONS.md). Quem lança pedido é a loja, logada, pelo painel.
revoke execute on function criar_pedido(text,text,text,text,text,text,text,jsonb,timestamptz,text,text) from public;
revoke execute on function criar_pedido(text,text,text,text,text,text,text,jsonb,timestamptz,text,text) from anon;
grant execute on function criar_pedido(text,text,text,text,text,text,text,jsonb,timestamptz,text,text) to authenticated;

-- ---------------------------------------------------------------
-- 2. Colunas internas fora do alcance anônimo
-- ---------------------------------------------------------------
-- A RLS de leitura pública é `using (true)`: ela libera as LINHAS, e RLS
-- não filtra COLUNA nenhuma. Com a chave anon (que é pública, vai no
-- bundle do navegador) dava pra pedir `select=preco_custo` na API REST e
-- receber o custo de cada item — a própria schema.sql diz "nunca aparece
-- pro cliente".
--
-- ATENÇÃO ao detalhe que faz isto funcionar: `revoke select (coluna)` NÃO
-- tem efeito enquanto existir o privilégio de SELECT na TABELA INTEIRA, que
-- é o que o Supabase concede por padrão. Precisa revogar a tabela primeiro
-- e depois conceder coluna a coluna. Foi assim que a primeira tentativa
-- desta migração passou sem erro e sem efeito nenhum.
--
-- Efeito colateral esperado: `select('*')` como anônimo passa a dar erro de
-- permissão nestas tabelas. É por isso que app/[loja]/page.tsx lista as
-- colunas uma a uma. Se um dia o cardápio precisar de coluna nova, ela
-- precisa ser acrescentada aqui também.
revoke select on produtos from anon;
grant select (
  id, loja_id, categoria_id, nome, descricao,
  preco, preco_promocional, imagem_url, etiqueta, destaque,
  esconder_observacao, esconder_quantidade, dias_semana, tipos_pedido,
  ativo, ordem
) on produtos to anon;
-- Fora da lista, de propósito: preco_custo, codigo_pdv, codigo_interno,
-- unidade_medida, created_at.

revoke select on lojas from anon;
grant select (
  id, slug, nome, logo_url, banner_url, cor_marca, cidade, sobre,
  whatsapp_numero, tempo_entrega_min, tempo_entrega_max,
  taxa_entrega, pedido_minimo, delivery_ativo, recebendo_encomendas
) on lojas to anon;
-- Fora da lista: dono_id, nicho, created_at.

-- ---------------------------------------------------------------
-- 3. Storage: teto de tamanho e tipos permitidos
-- ---------------------------------------------------------------
-- A validação em lib/catalogo/upload.ts é a primeira barreira, não a
-- fronteira: qualquer pessoa com a chave anon chama a API de Storage
-- direto, sem passar pelo nosso código. SVG e HTML ficam de fora de
-- propósito — o bucket é público e serviria conteúdo ativo a partir de um
-- domínio confiável.
update storage.buckets
set file_size_limit = 3145728,  -- 3 MB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'imagens-cardapio';

-- ---------------------------------------------------------------
-- 4. search_path fixo nas funções SECURITY DEFINER
-- ---------------------------------------------------------------
-- is_admin() roda com os privilégios do dono da função. Sem search_path
-- fixo, quem controlar o search_path da sessão pode fazer `admins` apontar
-- pra outra tabela e a função responder "sim". As demais funções já
-- declaram `set search_path = public`; esta ficou de fora.
alter function is_admin() set search_path = public;

revoke execute on function is_admin() from public;
grant execute on function is_admin() to authenticated;

revoke execute on function pedido_detalhe(uuid) from public;
revoke execute on function pedido_detalhe(uuid) from anon;
grant execute on function pedido_detalhe(uuid) to authenticated;

-- ---------------------------------------------------------------
-- CONFERÊNCIA — rode e leia o resultado
-- ---------------------------------------------------------------
-- 1) Quantas criar_pedido existem? Precisa sobrar UMA, com 11 argumentos.
select
  p.oid::regprocedure as assinatura,
  pg_get_function_identity_arguments(p.oid) as argumentos
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'criar_pedido';

-- 2) Quem pode executar cada função. anon NÃO pode aparecer em
--    criar_pedido nem em pedido_detalhe.
select
  p.proname,
  coalesce(r.rolname, 'PUBLIC') as papel,
  a.privilege_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
left join lateral aclexplode(p.proacl) a on true
left join pg_roles r on r.oid = a.grantee
where n.nspname = 'public'
  and p.proname in ('criar_pedido', 'pedido_detalhe', 'pedido_por_token', 'is_admin')
order by p.proname, papel;

-- 3) anon enxerga alguma coluna interna? Precisa voltar VAZIO.
select table_name, column_name
from information_schema.column_privileges
where grantee = 'anon'
  and privilege_type = 'SELECT'
  and (
    (table_name = 'produtos' and column_name in ('preco_custo','codigo_pdv','codigo_interno'))
    or (table_name = 'lojas' and column_name = 'dono_id')
  );

-- 4) Limites do bucket.
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'imagens-cardapio';
