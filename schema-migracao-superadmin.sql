-- Migração: adiciona super admin ao schema já existente.
-- Rode isso se você já tinha rodado o schema.sql ANTES da tabela "admins"
-- existir (senão dá erro de "já existe" tentando rodar o schema.sql
-- inteiro de novo). Pode rodar mais de uma vez sem problema.
--
-- Como usar: Supabase → seu projeto → SQL Editor → New query → cola tudo
-- → Run.

-- 1. Um dono agora pode ter mais de uma loja (necessário pro super admin
-- criar várias lojas de teste na própria conta).
alter table lojas drop constraint if exists lojas_dono_id_key;

-- 2. Tabela de super admins. Sem policy de select — só é lida por dentro
-- da função is_admin() (security definer), nunca direto via API.
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table admins enable row level security;

create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

grant execute on function is_admin() to authenticated;

-- 3. Recria as policies que precisam passar a aceitar "ou is_admin()".
drop policy if exists "lojas_insert_dono" on lojas;
create policy "lojas_insert_dono"
  on lojas for insert
  to authenticated
  with check (dono_id = auth.uid() or is_admin());

drop policy if exists "lojas_update_dono" on lojas;
create policy "lojas_update_dono"
  on lojas for update
  to authenticated
  using (dono_id = auth.uid() or is_admin());

drop policy if exists "categorias_all_dono" on categorias;
create policy "categorias_all_dono"
  on categorias for all
  to authenticated
  using (loja_id in (select id from lojas where dono_id = auth.uid()) or is_admin())
  with check (loja_id in (select id from lojas where dono_id = auth.uid()) or is_admin());

drop policy if exists "produtos_all_dono" on produtos;
create policy "produtos_all_dono"
  on produtos for all
  to authenticated
  using (loja_id in (select id from lojas where dono_id = auth.uid()) or is_admin())
  with check (loja_id in (select id from lojas where dono_id = auth.uid()) or is_admin());

drop policy if exists "grupos_complemento_all_dono" on grupos_complemento;
create policy "grupos_complemento_all_dono"
  on grupos_complemento for all
  to authenticated
  using (loja_id in (select id from lojas where dono_id = auth.uid()) or is_admin())
  with check (loja_id in (select id from lojas where dono_id = auth.uid()) or is_admin());

drop policy if exists "complementos_all_dono" on complementos;
create policy "complementos_all_dono"
  on complementos for all
  to authenticated
  using (is_admin() or grupo_id in (
    select gc.id from grupos_complemento gc
    join lojas l on l.id = gc.loja_id
    where l.dono_id = auth.uid()
  ))
  with check (is_admin() or grupo_id in (
    select gc.id from grupos_complemento gc
    join lojas l on l.id = gc.loja_id
    where l.dono_id = auth.uid()
  ));

drop policy if exists "produto_grupos_all_dono" on produto_grupos;
create policy "produto_grupos_all_dono"
  on produto_grupos for all
  to authenticated
  using (is_admin() or produto_id in (
    select p.id from produtos p join lojas l on l.id = p.loja_id where l.dono_id = auth.uid()
  ))
  with check (is_admin() or produto_id in (
    select p.id from produtos p join lojas l on l.id = p.loja_id where l.dono_id = auth.uid()
  ));

drop policy if exists "imagens_cardapio_insert_dono" on storage.objects;
create policy "imagens_cardapio_insert_dono"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'imagens-cardapio'
    and (is_admin() or (storage.foldername(name))[1] in (select id::text from lojas where dono_id = auth.uid()))
  );

drop policy if exists "imagens_cardapio_update_dono" on storage.objects;
create policy "imagens_cardapio_update_dono"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'imagens-cardapio'
    and (is_admin() or (storage.foldername(name))[1] in (select id::text from lojas where dono_id = auth.uid()))
  );

drop policy if exists "imagens_cardapio_delete_dono" on storage.objects;
create policy "imagens_cardapio_delete_dono"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'imagens-cardapio'
    and (is_admin() or (storage.foldername(name))[1] in (select id::text from lojas where dono_id = auth.uid()))
  );

-- 4. Troque o email abaixo pelo email do usuário que vai ser super admin
-- (o mesmo que você usa pra logar no admin.html) e rode essa linha.
-- insert into admins (user_id) select id from auth.users where email = 'COLE_SEU_EMAIL_AQUI';
