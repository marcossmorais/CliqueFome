-- Onboarding da loja — progresso persistido no banco.
--
-- O cadastro tem quatro etapas (Conta, Loja, Endereço, Finalizar) e precisa
-- ser retomável: fechar a aba no meio não pode fazer o dono recomeçar. Só
-- duas delas precisam de coluna, porque as outras já são deriváveis:
--
--   ACCOUNT  -> não existe sessão do Supabase Auth;
--   STORE    -> existe sessão, não existe linha em `lojas` para o dono;
--   ADDRESS  -> a loja existe e ainda não tem endereço confirmado;
--   DONE     -> onboarding concluído, o painel libera.
--
-- Guardar a etapa PENDENTE (e não a última concluída) deixa a leitura direta:
-- o valor da coluna é a tela para onde mandar a pessoa.
--
-- Lojas que já existem nascem 'DONE': elas foram criadas pelo super admin
-- antes deste fluxo e não podem ser jogadas para dentro do cadastro.

begin;

set local lock_timeout = '10s';

alter table public.lojas
  add column if not exists onboarding_etapa text not null default 'DONE';

alter table public.lojas
  drop constraint if exists lojas_onboarding_etapa_check;

alter table public.lojas
  add constraint lojas_onboarding_etapa_check
  check (onboarding_etapa in ('STORE', 'ADDRESS', 'DONE'));

comment on column public.lojas.onboarding_etapa is
  'Etapa PENDENTE do cadastro: ADDRESS (falta endereço) ou DONE (concluído). ACCOUNT e STORE não chegam a ser gravados — sem sessão ou sem linha aqui, o fluxo já sabe onde retomar.';

-- Índice não entra: a coluna é sempre lida junto com a loja já resolvida por
-- id ou slug, nunca como filtro de varredura.

-- ---------------------------------------------------------------------------
-- Complemento do endereço da loja
-- ---------------------------------------------------------------------------
-- `store_delivery_settings` guarda CEP, rua, número, bairro, cidade, UF e as
-- coordenadas de origem, mas não tinha onde pôr "sala 2" / "fundos". O
-- cadastro pergunta (é opcional) e precisa devolver o valor quando o dono
-- reabre a tela — sem coluna, o campo se perdia em silêncio.
alter table public.store_delivery_settings
  add column if not exists origin_complement text;

alter table public.store_delivery_settings
  drop constraint if exists store_delivery_settings_origin_complement_check;

alter table public.store_delivery_settings
  add constraint store_delivery_settings_origin_complement_check
  check (
    origin_complement is null
    or char_length(btrim(origin_complement)) between 1 and 120
  );

commit;
