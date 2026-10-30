-- Blinda o onboarding contra escrita direta no banco.
--
-- Duas brechas da migration 20260814170000_onboarding_loja.sql:
--
--  1. As policies `lojas_insert_dono` / `lojas_update_dono` deixam o dono
--     gravar na própria linha pelo navegador (supabase-js). Como a coluna
--     nasce 'DONE', ele podia inserir uma loja já "concluída" ou atualizar
--     `onboarding_etapa` para 'DONE', pulando endereço, reserva de slug e
--     limites que só as rotas /api/onboarding aplicam.
--  2. Nada impedia duas lojas em cadastro para o mesmo dono: um duplo clique
--     em /api/onboarding/loja passava pelo "existe? não -> insere" nas duas
--     requisições. `unique(dono_id)` não serve — o super admin cria várias
--     lojas por dono —, então a unicidade vale só para loja ainda pendente.
--
-- O trigger não age sobre a service role nem sobre o SQL Editor
-- (`auth.uid()` é nulo ali) e deixa o super admin passar.

begin;

set local lock_timeout = '10s';

create or replace function public.cf_blindar_onboarding_etapa()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.onboarding_etapa := 'ADDRESS';
  else
    new.onboarding_etapa := old.onboarding_etapa;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_blindar_onboarding_etapa on public.lojas;
create trigger trg_blindar_onboarding_etapa
before insert or update on public.lojas
for each row execute function public.cf_blindar_onboarding_etapa();

create unique index if not exists lojas_um_cadastro_pendente_por_dono
  on public.lojas (dono_id)
  where onboarding_etapa <> 'DONE';

commit;
