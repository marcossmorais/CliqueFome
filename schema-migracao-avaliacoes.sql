-- Configuração antecipada de avaliações por plano
--
-- Como aplicar: Supabase > SQL Editor > New query > colar todo o arquivo > Run.
-- Seguro para execução repetida. Esta migração NÃO cria avaliações, notas,
-- comentários nem qualquer endpoint público de coleta.

begin;

-- O plano fica fora de `lojas`, cuja leitura é pública e cuja atualização é
-- permitida ao dono. Assim, o navegador do lojista não consegue se promover.
create table if not exists public.loja_planos (
  loja_id uuid primary key references public.lojas(id) on delete cascade,
  plano text not null default 'basico'
    check (plano in ('basico', 'pro', 'pro_plus')),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.configuracoes_avaliacoes (
  loja_id uuid primary key references public.lojas(id) on delete cascade,
  avaliacoes_produtos_ativas boolean not null default true,
  avaliacoes_marca_ativas boolean not null default true,
  atualizado_em timestamptz not null default now()
);

alter table public.loja_planos enable row level security;
alter table public.configuracoes_avaliacoes enable row level security;

revoke all on table public.loja_planos from public, anon;
revoke all on table public.configuracoes_avaliacoes from public, anon;
grant select, insert, update, delete on table public.loja_planos to authenticated;
grant select, insert, update, delete on table public.configuracoes_avaliacoes to authenticated;

drop policy if exists "Dono le plano da propria loja" on public.loja_planos;
create policy "Dono le plano da propria loja"
on public.loja_planos for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.lojas l
    where l.id = loja_id and l.dono_id = auth.uid()
  )
);

-- Somente o administrador da plataforma altera planos. O dono da loja não
-- recebe policy de escrita nessa tabela.
drop policy if exists "Admin gerencia planos" on public.loja_planos;
create policy "Admin gerencia planos"
on public.loja_planos for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Dono le configuracao de avaliacoes" on public.configuracoes_avaliacoes;
create policy "Dono le configuracao de avaliacoes"
on public.configuracoes_avaliacoes for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.lojas l
    where l.id = loja_id and l.dono_id = auth.uid()
  )
);

-- Não há policy de escrita para usuários autenticados, nem mesmo admin. Toda
-- alteração passa pela RPC abaixo, que aplica a regra do plano da loja.
drop policy if exists "Admin gerencia configuracao de avaliacoes" on public.configuracoes_avaliacoes;

-- Cria as configurações privadas junto com cada nova loja. SECURITY DEFINER é
-- necessário para o trigger não depender dos privilégios do usuário criador.
create or replace function public.inicializar_plano_e_avaliacoes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.loja_planos (loja_id, plano)
  values (new.id, 'basico')
  on conflict (loja_id) do nothing;

  insert into public.configuracoes_avaliacoes (
    loja_id, avaliacoes_produtos_ativas, avaliacoes_marca_ativas
  ) values (new.id, true, true)
  on conflict (loja_id) do nothing;

  return new;
end;
$$;

revoke execute on function public.inicializar_plano_e_avaliacoes() from public, anon, authenticated;

drop trigger if exists trg_inicializar_plano_e_avaliacoes on public.lojas;
create trigger trg_inicializar_plano_e_avaliacoes
after insert on public.lojas
for each row execute function public.inicializar_plano_e_avaliacoes();

-- Regra estrutural: ao criar/rebaixar para Básico, as duas opções voltam a
-- ficar ligadas. Nem chamada direta à API consegue manter um Básico desligado.
create or replace function public.aplicar_regra_avaliacoes_do_plano()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.atualizado_em := now();

  if new.plano = 'basico' then
    insert into public.configuracoes_avaliacoes (
      loja_id, avaliacoes_produtos_ativas, avaliacoes_marca_ativas, atualizado_em
    ) values (new.loja_id, true, true, now())
    on conflict (loja_id) do update set
      avaliacoes_produtos_ativas = true,
      avaliacoes_marca_ativas = true,
      atualizado_em = now();
  end if;

  return new;
end;
$$;

revoke execute on function public.aplicar_regra_avaliacoes_do_plano() from public, anon, authenticated;

drop trigger if exists trg_aplicar_regra_avaliacoes_do_plano on public.loja_planos;
create trigger trg_aplicar_regra_avaliacoes_do_plano
before insert or update of plano on public.loja_planos
for each row execute function public.aplicar_regra_avaliacoes_do_plano();

-- Backfill conservador: toda loja existente começa no Básico, com avaliações
-- ligadas. Um administrador pode promover o plano depois da migração.
insert into public.loja_planos (loja_id, plano)
select id, 'basico' from public.lojas
on conflict (loja_id) do nothing;

insert into public.configuracoes_avaliacoes (
  loja_id, avaliacoes_produtos_ativas, avaliacoes_marca_ativas
)
select id, true, true from public.lojas
on conflict (loja_id) do nothing;

-- Único caminho de escrita para o dono. A função confere sessão, propriedade,
-- plano e valores antes de atualizar uma única linha atomicamente.
create or replace function public.configurar_avaliacoes(
  p_loja_id uuid,
  p_produtos boolean,
  p_marca boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plano text;
begin
  if auth.uid() is null then
    raise exception 'Sessao obrigatoria' using errcode = '42501';
  end if;

  if p_loja_id is null or p_produtos is null or p_marca is null then
    raise exception 'Parametros invalidos' using errcode = '22023';
  end if;

  if not public.is_admin() and not exists (
    select 1 from public.lojas l
    where l.id = p_loja_id and l.dono_id = auth.uid()
  ) then
    raise exception 'Loja nao autorizada' using errcode = '42501';
  end if;

  select lp.plano into v_plano
  from public.loja_planos lp
  where lp.loja_id = p_loja_id
  for share;

  if coalesce(v_plano, 'basico') not in ('pro', 'pro_plus') then
    raise exception 'O plano atual mantem as avaliacoes permanentemente ativas'
      using errcode = '42501';
  end if;

  insert into public.configuracoes_avaliacoes (
    loja_id, avaliacoes_produtos_ativas, avaliacoes_marca_ativas, atualizado_em
  ) values (p_loja_id, p_produtos, p_marca, now())
  on conflict (loja_id) do update set
    avaliacoes_produtos_ativas = excluded.avaliacoes_produtos_ativas,
    avaliacoes_marca_ativas = excluded.avaliacoes_marca_ativas,
    atualizado_em = now();

  return jsonb_build_object(
    'ok', true,
    'produtos_ativos', p_produtos,
    'marca_ativa', p_marca
  );
end;
$$;

revoke execute on function public.configurar_avaliacoes(uuid, boolean, boolean) from public;
revoke execute on function public.configurar_avaliacoes(uuid, boolean, boolean) from anon;
grant execute on function public.configurar_avaliacoes(uuid, boolean, boolean) to authenticated;

commit;

-- Conferência: deve haver uma linha em cada tabela por loja e nenhum Básico
-- com opções desligadas.
select
  (select count(*) from public.lojas) as lojas,
  (select count(*) from public.loja_planos) as planos,
  (select count(*) from public.configuracoes_avaliacoes) as configuracoes;

select lp.loja_id
from public.loja_planos lp
join public.configuracoes_avaliacoes ca on ca.loja_id = lp.loja_id
where lp.plano = 'basico'
  and (not ca.avaliacoes_produtos_ativas or not ca.avaliacoes_marca_ativas);
