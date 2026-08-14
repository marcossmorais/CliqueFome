-- Sessão leve e multi-tenant para o consumidor consultar os próprios
-- pedidos no mesmo navegador. Não é uma conta e não substitui Supabase Auth.

begin;

create or replace function public.normalizar_telefone_brasil(p_valor text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_digitos text := regexp_replace(coalesce(p_valor, ''), '[^0-9]', '', 'g');
begin
  if char_length(v_digitos) in (12, 13) and left(v_digitos, 2) = '55' then
    return '+' || v_digitos;
  end if;
  if char_length(v_digitos) in (10, 11) then
    return '+55' || v_digitos;
  end if;
  return null;
end;
$$;

revoke all on function public.normalizar_telefone_brasil(text) from public, anon, authenticated;
grant execute on function public.normalizar_telefone_brasil(text) to service_role;

alter table public.pedidos
  add column if not exists cliente_telefone_normalizado text;

update public.pedidos
set cliente_telefone_normalizado = public.normalizar_telefone_brasil(cliente_telefone)
where cliente_telefone_normalizado is distinct from public.normalizar_telefone_brasil(cliente_telefone);

create or replace function public.preencher_telefone_normalizado_pedido()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.cliente_telefone_normalizado := public.normalizar_telefone_brasil(new.cliente_telefone);
  return new;
end;
$$;

revoke all on function public.preencher_telefone_normalizado_pedido() from public, anon, authenticated;

drop trigger if exists pedidos_normalizar_telefone on public.pedidos;
create trigger pedidos_normalizar_telefone
before insert or update of cliente_telefone on public.pedidos
for each row execute function public.preencher_telefone_normalizado_pedido();

create index if not exists idx_pedidos_loja_cliente_telefone
  on public.pedidos (loja_id, cliente_telefone_normalizado, criado_em desc)
  where cliente_telefone_normalizado is not null;

create table if not exists public.sessoes_clientes (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  telefone_normalizado text not null
    check (telefone_normalizado ~ '^\\+55[0-9]{10,11}$'),
  token_hash text not null unique
    check (token_hash ~ '^[0-9a-f]{64}$'),
  criada_em timestamptz not null default now(),
  ultimo_uso_em timestamptz not null default now(),
  expira_em timestamptz not null
);

create index if not exists idx_sessoes_clientes_loja_telefone
  on public.sessoes_clientes (loja_id, telefone_normalizado);
create index if not exists idx_sessoes_clientes_expiracao
  on public.sessoes_clientes (expira_em);

alter table public.sessoes_clientes enable row level security;
revoke all on table public.sessoes_clientes from public, anon, authenticated;
grant select, insert, update, delete on table public.sessoes_clientes to service_role;

comment on table public.sessoes_clientes is
  'Autoriza o navegador a consultar pedidos de um telefone em uma única loja; armazena somente hash do token.';
comment on column public.pedidos.cliente_telefone_normalizado is
  'Telefone brasileiro E.164 usado somente para vínculos e buscas seguras por loja.';

-- Agrega a base de clientes sem duplicar dados nem criar uma segunda fonte
-- de verdade: nomes, contatos e recorrência continuam vindo dos pedidos.
create or replace function public.listar_clientes_loja_v1(
  p_loja_id uuid,
  p_busca text default null,
  p_limite integer default 20,
  p_offset integer default 0
)
returns table (
  telefone_normalizado text,
  nome text,
  ultimo_pedido_em timestamptz,
  quantidade_pedidos bigint,
  quantidade_concluidos bigint,
  valor_total numeric,
  total_clientes bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.lojas l
    where l.id = p_loja_id
      and (l.dono_id = auth.uid() or public.is_admin())
  ) then
    raise exception 'Loja nao encontrada.' using errcode = '22023';
  end if;

  return query
  with agregados as (
    select
      p.cliente_telefone_normalizado as telefone,
      (array_agg(p.cliente_nome order by p.criado_em desc))[1] as nome_recente,
      max(p.criado_em) as ultimo_em,
      count(*) as pedidos,
      count(*) filter (where p.status = 'concluido') as concluidos,
      coalesce(sum(p.total) filter (where p.status = 'concluido'), 0) as total_concluido
    from public.pedidos p
    where p.loja_id = p_loja_id
      and p.cliente_telefone_normalizado is not null
    group by p.cliente_telefone_normalizado
  ), filtrados as (
    select *
    from agregados a
    where nullif(btrim(coalesce(p_busca, '')), '') is null
      or a.nome_recente ilike '%' || btrim(p_busca) || '%'
      or (
        regexp_replace(p_busca, '[^0-9]', '', 'g') <> ''
        and regexp_replace(a.telefone, '[^0-9]', '', 'g') like '%' || regexp_replace(p_busca, '[^0-9]', '', 'g') || '%'
      )
  )
  select
    f.telefone,
    f.nome_recente,
    f.ultimo_em,
    f.pedidos,
    f.concluidos,
    f.total_concluido,
    count(*) over ()
  from filtrados f
  order by f.ultimo_em desc
  limit greatest(1, least(coalesce(p_limite, 20), 100))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.listar_clientes_loja_v1(uuid,text,integer,integer)
  from public, anon;
grant execute on function public.listar_clientes_loja_v1(uuid,text,integer,integer)
  to authenticated, service_role;

commit;
