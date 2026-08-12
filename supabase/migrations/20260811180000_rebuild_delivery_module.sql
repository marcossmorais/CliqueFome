-- Reconstrucao pequena e independente do modulo Delivery.
--
-- Esta migration parte do estado produzido por
-- 20260811_remove_legacy_delivery_system.sql. Ela nao recupera tabelas, RPCs
-- ou regras do Delivery antigo. Cotacoes e criacao publica de pedidos ficam
-- restritas ao service_role; operacoes de loja e entregador usam RLS e RPCs
-- estreitas, sempre validadas novamente no banco.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. Configuracao, cotacoes, entregadores e entregas
-- ---------------------------------------------------------------------------

create table public.store_delivery_settings (
  store_id uuid primary key
    references public.lojas(id) on delete restrict,
  enabled boolean not null default false,
  fee_mode text not null default 'FIXED',
  fixed_fee_cents integer,
  price_per_km_cents integer,
  free_delivery_threshold_cents integer,
  origin_postal_code text,
  origin_street text,
  origin_number text,
  origin_neighborhood text,
  origin_city text,
  origin_state text,
  origin_latitude double precision,
  origin_longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint store_delivery_settings_fee_mode_check
    check (fee_mode in ('FIXED', 'PER_KM')),
  constraint store_delivery_settings_money_check
    check (
      (fixed_fee_cents is null or fixed_fee_cents >= 0)
      and (price_per_km_cents is null or price_per_km_cents >= 0)
      and (
        free_delivery_threshold_cents is null
        or free_delivery_threshold_cents >= 0
      )
    ),
  constraint store_delivery_settings_single_fee_check
    check (
      (fee_mode = 'FIXED' and price_per_km_cents is null)
      or (fee_mode = 'PER_KM' and fixed_fee_cents is null)
    ),
  constraint store_delivery_settings_coordinates_check
    check (
      (origin_latitude is null or origin_latitude between -90 and 90)
      and (origin_longitude is null or origin_longitude between -180 and 180)
    ),
  constraint store_delivery_settings_origin_format_check
    check (
      (origin_postal_code is null or origin_postal_code ~ '^[0-9]{8}$')
      and (origin_street is null or char_length(btrim(origin_street)) between 1 and 160)
      and (origin_number is null or char_length(btrim(origin_number)) between 1 and 30)
      and (origin_neighborhood is null or char_length(btrim(origin_neighborhood)) between 1 and 100)
      and (origin_city is null or char_length(btrim(origin_city)) between 1 and 100)
      and (origin_state is null or origin_state ~ '^[A-Z]{2}$')
    ),
  constraint store_delivery_settings_enabled_complete_check
    check (
      not enabled
      or (
        origin_postal_code is not null
        and origin_street is not null
        and origin_number is not null
        and origin_neighborhood is not null
        and origin_city is not null
        and origin_state is not null
        and origin_latitude is not null
        and origin_longitude is not null
        and (
          (fee_mode = 'FIXED' and fixed_fee_cents is not null)
          or (fee_mode = 'PER_KM' and price_per_km_cents is not null)
        )
      )
    )
);

create table public.delivery_quotes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null
    references public.lojas(id) on delete restrict,
  postal_code text not null,
  street text not null,
  number text not null,
  neighborhood text not null,
  city text not null,
  state text not null,
  complement text,
  latitude double precision not null,
  longitude double precision not null,
  distance_meters integer,
  delivery_fee_cents integer not null,
  items_subtotal_cents integer not null,
  settings_updated_at timestamptz not null,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),

  constraint delivery_quotes_address_check
    check (
      postal_code ~ '^[0-9]{8}$'
      and char_length(btrim(street)) between 1 and 160
      and char_length(btrim(number)) between 1 and 30
      and char_length(btrim(neighborhood)) between 1 and 100
      and char_length(btrim(city)) between 1 and 100
      and state ~ '^[A-Z]{2}$'
      and (complement is null or char_length(btrim(complement)) between 1 and 160)
    ),
  constraint delivery_quotes_coordinates_check
    check (latitude between -90 and 90 and longitude between -180 and 180),
  constraint delivery_quotes_values_check
    check (
      (distance_meters is null or distance_meters >= 0)
      and delivery_fee_cents >= 0
      and items_subtotal_cents >= 0
    )
);

create table public.delivery_drivers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null
    references public.lojas(id) on delete restrict,
  auth_user_id uuid not null unique
    references auth.users(id) on delete restrict,
  name text not null,
  phone text not null,
  active boolean not null default true,
  available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint delivery_drivers_store_id_id_unique unique (store_id, id),
  constraint delivery_drivers_name_check
    check (char_length(btrim(name)) between 2 and 100),
  constraint delivery_drivers_phone_check
    check (
      char_length(phone) <= 20
      and char_length(regexp_replace(phone, '[^0-9]', '', 'g')) between 10 and 13
    )
);

-- A chave composta permite que a FK de deliveries garanta no proprio banco
-- que o pedido e a entrega pertencem a mesma loja.
alter table public.pedidos
  add constraint pedidos_loja_id_id_unique unique (loja_id, id);

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null
    references public.lojas(id) on delete restrict,
  order_id uuid not null unique,
  driver_id uuid,
  status text not null default 'WAITING_DRIVER',
  assigned_at timestamptz,
  started_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint deliveries_store_order_fkey
    foreign key (store_id, order_id)
    references public.pedidos(loja_id, id) on delete restrict,
  constraint deliveries_store_driver_fkey
    foreign key (store_id, driver_id)
    references public.delivery_drivers(store_id, id) on delete restrict,
  constraint deliveries_status_check
    check (
      status in (
        'WAITING_DRIVER',
        'ASSIGNED',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'CANCELED'
      )
    ),
  constraint deliveries_state_check
    check (
      (
        status = 'WAITING_DRIVER'
        and driver_id is null
        and assigned_at is null
        and started_at is null
        and delivered_at is null
      )
      or (
        status = 'ASSIGNED'
        and driver_id is not null
        and assigned_at is not null
        and started_at is null
        and delivered_at is null
      )
      or (
        status = 'OUT_FOR_DELIVERY'
        and driver_id is not null
        and assigned_at is not null
        and started_at is not null
        and delivered_at is null
      )
      or (
        status = 'DELIVERED'
        and driver_id is not null
        and assigned_at is not null
        and started_at is not null
        and delivered_at is not null
      )
      or (status = 'CANCELED' and delivered_at is null)
    ),
  constraint deliveries_timestamps_check
    check (
      (assigned_at is null or assigned_at >= created_at)
      and (started_at is null or (assigned_at is not null and started_at >= assigned_at))
      and (delivered_at is null or (started_at is not null and delivered_at >= started_at))
    )
);

create index delivery_quotes_store_expires_idx
  on public.delivery_quotes(store_id, expires_at);
create index delivery_drivers_store_active_idx
  on public.delivery_drivers(store_id, active);
create index deliveries_store_status_idx
  on public.deliveries(store_id, status);
create index deliveries_driver_status_idx
  on public.deliveries(driver_id, status);
create unique index deliveries_one_active_per_driver_idx
  on public.deliveries(driver_id)
  where driver_id is not null
    and status in ('ASSIGNED', 'OUT_FOR_DELIVERY');
create index if not exists pedido_checkout_limites_janela_delivery_idx
  on public.pedido_checkout_limites(janela);

-- ---------------------------------------------------------------------------
-- 2. Snapshot imutavel de entrega no pedido
-- ---------------------------------------------------------------------------

alter table public.pedidos
  drop constraint pedidos_tipo_check;

alter table public.pedidos
  add constraint pedidos_tipo_check
  check (tipo in ('delivery','retirada','balcao','mesa','encomenda'));

alter table public.pedidos
  add column delivery_postal_code text,
  add column delivery_street text,
  add column delivery_number text,
  add column delivery_neighborhood text,
  add column delivery_city text,
  add column delivery_state text,
  add column delivery_complement text,
  add column delivery_latitude double precision,
  add column delivery_longitude double precision,
  add column delivery_distance_meters integer,
  add column delivery_fee_cents integer not null default 0;

alter table public.pedidos
  add constraint pedidos_delivery_snapshot_check
  check (
    (
      tipo = 'delivery'
      and delivery_postal_code is not null
      and delivery_postal_code ~ '^[0-9]{8}$'
      and delivery_street is not null
      and char_length(btrim(delivery_street)) between 1 and 160
      and delivery_number is not null
      and char_length(btrim(delivery_number)) between 1 and 30
      and delivery_neighborhood is not null
      and char_length(btrim(delivery_neighborhood)) between 1 and 100
      and delivery_city is not null
      and char_length(btrim(delivery_city)) between 1 and 100
      and delivery_state is not null
      and delivery_state ~ '^[A-Z]{2}$'
      and (delivery_complement is null or char_length(btrim(delivery_complement)) between 1 and 160)
      and delivery_latitude is not null
      and delivery_latitude between -90 and 90
      and delivery_longitude is not null
      and delivery_longitude between -180 and 180
      and (delivery_distance_meters is null or delivery_distance_meters >= 0)
      and delivery_fee_cents >= 0
    )
    or (
      tipo <> 'delivery'
      and delivery_postal_code is null
      and delivery_street is null
      and delivery_number is null
      and delivery_neighborhood is null
      and delivery_city is null
      and delivery_state is null
      and delivery_complement is null
      and delivery_latitude is null
      and delivery_longitude is null
      and delivery_distance_meters is null
      and delivery_fee_cents = 0
    )
  );

-- ---------------------------------------------------------------------------
-- 3. updated_at e protecao contra desativar entregador em rota
-- ---------------------------------------------------------------------------

create function public.delivery_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function public.delivery_touch_updated_at()
  from public, anon, authenticated;

create trigger store_delivery_settings_touch_updated_at
before update on public.store_delivery_settings
for each row execute function public.delivery_touch_updated_at();

create trigger delivery_drivers_touch_updated_at
before update on public.delivery_drivers
for each row execute function public.delivery_touch_updated_at();

create trigger deliveries_touch_updated_at
before update on public.deliveries
for each row execute function public.delivery_touch_updated_at();

create function public.delivery_prevent_active_driver_deactivation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.active and not new.active and exists (
    select 1
    from public.deliveries d
    where d.driver_id = old.id
      and d.status in ('ASSIGNED', 'OUT_FOR_DELIVERY')
  ) then
    raise exception 'Entregador possui uma entrega ativa.' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.delivery_prevent_active_driver_deactivation()
  from public, anon, authenticated;

create trigger delivery_drivers_prevent_active_deactivation
before update of active on public.delivery_drivers
for each row execute function public.delivery_prevent_active_driver_deactivation();

-- ---------------------------------------------------------------------------
-- 4. RLS e privilegios minimos
-- ---------------------------------------------------------------------------

alter table public.store_delivery_settings enable row level security;
alter table public.delivery_quotes enable row level security;
alter table public.delivery_drivers enable row level security;
alter table public.deliveries enable row level security;

revoke all on table public.store_delivery_settings
  from public, anon, authenticated;
revoke all on table public.delivery_quotes
  from public, anon, authenticated;
revoke all on table public.delivery_drivers
  from public, anon, authenticated;
revoke all on table public.deliveries
  from public, anon, authenticated;

grant all on table public.store_delivery_settings to service_role;
grant all on table public.delivery_quotes to service_role;
grant all on table public.delivery_drivers to service_role;
grant all on table public.deliveries to service_role;

grant select on table public.store_delivery_settings to authenticated;
grant select on table public.delivery_drivers to authenticated;
grant select on table public.deliveries to authenticated;

create policy store_delivery_settings_owner_select
on public.store_delivery_settings
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.lojas l
    where l.id = store_id and l.dono_id = auth.uid()
  )
);

create policy delivery_drivers_owner_or_self_select
on public.delivery_drivers
for select to authenticated
using (
  (auth_user_id = auth.uid() and active)
  or public.is_admin()
  or exists (
    select 1 from public.lojas l
    where l.id = store_id and l.dono_id = auth.uid()
  )
);

create policy deliveries_owner_or_assigned_driver_select
on public.deliveries
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.lojas l
    where l.id = store_id and l.dono_id = auth.uid()
  )
  or exists (
    select 1
    from public.delivery_drivers dr
    where dr.id = deliveries.driver_id
      and dr.store_id = deliveries.store_id
      and dr.auth_user_id = auth.uid()
      and dr.active
      and deliveries.status in ('ASSIGNED', 'OUT_FOR_DELIVERY')
  )
);

-- O entregador precisa dos dados do cliente/endereco para executar apenas a
-- entrega que foi atribuida a ele. Nao ha policy equivalente em pedido_itens.
create policy pedidos_select_assigned_delivery_driver
on public.pedidos
for select to authenticated
using (
  exists (
    select 1
    from public.deliveries d
    join public.delivery_drivers dr
      on dr.id = d.driver_id and dr.store_id = d.store_id
    where d.order_id = pedidos.id
      and d.store_id = pedidos.loja_id
      and dr.auth_user_id = auth.uid()
      and dr.active
      and d.status in ('ASSIGNED', 'OUT_FOR_DELIVERY')
  )
);

-- delivery_quotes deliberadamente nao recebe policy nem privilegio para
-- anon/authenticated. O navegador enxerga apenas o resultado projetado pela API.

-- ---------------------------------------------------------------------------
-- 5. Projecao publica minima e subtotal autoritativo do catalogo
-- ---------------------------------------------------------------------------

create function public.delivery_disponibilidade_publica(p_loja_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.store_delivery_settings s
    where s.store_id = p_loja_id
      and s.enabled
      and s.origin_latitude is not null
      and s.origin_longitude is not null
  );
$$;

revoke all on function public.delivery_disponibilidade_publica(uuid)
  from public, anon, authenticated;
grant execute on function public.delivery_disponibilidade_publica(uuid)
  to anon, authenticated, service_role;

-- Esta e a mesma primeira passagem de validacao do nucleo atual de pedidos:
-- valida tenant, disponibilidade, grupos, limites e calcula os precos sempre
-- a partir do catalogo. Ela serve tanto a quote quanto a criacao atomica.
create function public.cf_calcular_subtotal_catalogo_delivery(
  p_loja_id uuid,
  p_itens jsonb
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_opcao jsonb;
  v_produto public.produtos%rowtype;
  v_compl public.complementos%rowtype;
  v_grupo public.grupos_complemento%rowtype;
  v_qtd integer;
  v_qtd_opcao integer;
  v_preco_base numeric(10,2);
  v_extra numeric(10,2);
  v_unitario numeric(10,2);
  v_subtotal numeric(10,2) := 0;
  v_grupo_id uuid;
  v_precos numeric[];
  v_opcoes jsonb;
  v_escolhas integer;
  v_distintas integer;
begin
  if p_itens is null
     or jsonb_typeof(p_itens) <> 'array'
     or jsonb_array_length(p_itens) = 0 then
    raise exception 'O pedido esta vazio.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_itens) > 100 then
    raise exception 'Pedido com itens demais.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := coalesce((v_item->>'quantidade')::integer, 1);
    if v_qtd < 1 or v_qtd > 99 then
      raise exception 'Quantidade invalida.' using errcode = '22023';
    end if;

    select p.* into v_produto
    from public.produtos p
    where p.id = (v_item->>'produto_id')::uuid
      and p.loja_id = p_loja_id
    for share;

    if not found or not v_produto.ativo then
      raise exception 'Produto indisponivel.' using errcode = '22023';
    end if;

    v_preco_base := coalesce(v_produto.preco_promocional, v_produto.preco);
    v_extra := 0;
    v_opcoes := coalesce(v_item->'opcoes', '[]'::jsonb);

    if jsonb_typeof(v_opcoes) <> 'array' then
      raise exception 'Complementos invalidos.' using errcode = '22023';
    end if;
    if jsonb_array_length(v_opcoes) > 50 then
      raise exception 'Complementos demais em "%".', v_produto.nome
        using errcode = '22023';
    end if;

    for v_opcao in select * from jsonb_array_elements(v_opcoes) loop
      v_qtd_opcao := coalesce((v_opcao->>'quantidade')::integer, 1);

      select c.* into v_compl
      from public.complementos c
      where c.id = (v_opcao->>'complemento_id')::uuid
        and c.ativo
      for share;

      if not found then
        raise exception 'Complemento indisponivel.' using errcode = '22023';
      end if;

      select g.* into v_grupo
      from public.grupos_complemento g
      where g.id = v_compl.grupo_id
        and g.loja_id = p_loja_id
        and g.ativo
      for share;

      if not found then
        raise exception 'Complemento invalido.' using errcode = '22023';
      end if;

      perform 1
      from public.produto_grupos pg
      where pg.produto_id = v_produto.id
        and pg.grupo_id = v_grupo.id
      for share;

      if not found then
        raise exception 'O complemento "%" nao pertence a "%".',
          v_compl.nome, v_produto.nome using errcode = '22023';
      end if;

      if v_grupo.tipo_selecao = 'varias_repetir' then
        if v_qtd_opcao < 1
           or v_qtd_opcao > coalesce(v_compl.qtd_max, 99) then
          raise exception 'Quantidade invalida em "%".', v_compl.nome
            using errcode = '22023';
        end if;
      elsif v_qtd_opcao <> 1 then
        raise exception 'A opcao "%" nao pode repetir.', v_compl.nome
          using errcode = '22023';
      end if;
    end loop;

    for v_grupo in
      select g.*
      from public.produto_grupos pg
      join public.grupos_complemento g on g.id = pg.grupo_id
      where pg.produto_id = v_produto.id
        and g.loja_id = p_loja_id
        and g.ativo
      for share of pg, g
    loop
      select
        coalesce(sum(coalesce((o->>'quantidade')::integer, 1)), 0),
        count(distinct o->>'complemento_id')
      into v_escolhas, v_distintas
      from jsonb_array_elements(v_opcoes) o
      join public.complementos c
        on c.id = (o->>'complemento_id')::uuid
      where c.grupo_id = v_grupo.id;

      if v_escolhas < v_grupo.qtd_min then
        raise exception 'Escolha pelo menos % opcao(oes) em "%".',
          v_grupo.qtd_min, v_grupo.nome using errcode = '22023';
      end if;
      if v_escolhas > v_grupo.qtd_max then
        raise exception 'Escolha no maximo % opcao(oes) em "%".',
          v_grupo.qtd_max, v_grupo.nome using errcode = '22023';
      end if;
      if v_grupo.tipo_selecao <> 'varias_repetir'
         and v_distintas <> v_escolhas then
        raise exception 'Nao e permitido repetir a mesma opcao em "%".',
          v_grupo.nome using errcode = '22023';
      end if;
    end loop;

    for v_grupo_id in
      select distinct c.grupo_id
      from jsonb_array_elements(v_opcoes) o
      join public.complementos c
        on c.id = (o->>'complemento_id')::uuid
    loop
      select g.* into v_grupo
      from public.grupos_complemento g
      where g.id = v_grupo_id
        and g.loja_id = p_loja_id
      for share;

      if not found then
        raise exception 'Complemento invalido.' using errcode = '22023';
      end if;

      select array_agg(
        c.preco * coalesce((o->>'quantidade')::integer, 1)
      )
      into v_precos
      from jsonb_array_elements(v_opcoes) o
      join public.complementos c
        on c.id = (o->>'complemento_id')::uuid
      where c.grupo_id = v_grupo_id
        and c.ativo;

      if v_precos is not null then
        v_extra := v_extra + case v_grupo.modo_preco
          when 'soma'  then (select coalesce(sum(x), 0) from unnest(v_precos) x)
          when 'media' then (select coalesce(avg(x), 0) from unnest(v_precos) x)
          when 'maior' then (select coalesce(max(x), 0) from unnest(v_precos) x)
          when 'menor' then (select coalesce(min(x), 0) from unnest(v_precos) x)
          else (select coalesce(sum(x), 0) from unnest(v_precos) x)
        end;
      end if;
    end loop;

    v_unitario := v_preco_base + v_extra;
    if v_unitario < 0 then
      raise exception 'Preco invalido em "%".', v_produto.nome
        using errcode = '22023';
    end if;
    v_subtotal := v_subtotal + (v_unitario * v_qtd);
  end loop;

  return v_subtotal;
end;
$$;

revoke all on function public.cf_calcular_subtotal_catalogo_delivery(uuid,jsonb)
  from public, anon, authenticated;

create function public.calcular_subtotal_delivery_v1(
  p_loja_slug text,
  p_itens jsonb
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loja_id uuid;
  v_pedido_minimo numeric(10,2);
  v_subtotal numeric(10,2);
begin
  select l.id, l.pedido_minimo
  into v_loja_id, v_pedido_minimo
  from public.lojas l
  where l.slug = p_loja_slug;

  if not found then
    raise exception 'Loja nao encontrada.' using errcode = '22023';
  end if;
  if not public.delivery_disponibilidade_publica(v_loja_id) then
    raise exception 'Delivery indisponivel.' using errcode = '22023';
  end if;

  v_subtotal := public.cf_calcular_subtotal_catalogo_delivery(
    v_loja_id,
    p_itens
  );

  if v_subtotal < coalesce(v_pedido_minimo, 0) then
    raise exception 'O pedido minimo e de R$ %.',
      to_char(v_pedido_minimo, 'FM999999990.00') using errcode = '22023';
  end if;

  return round(v_subtotal * 100)::integer;
end;
$$;

revoke all on function public.calcular_subtotal_delivery_v1(text,jsonb)
  from public, anon, authenticated;
grant execute on function public.calcular_subtotal_delivery_v1(text,jsonb)
  to service_role;

-- Reutiliza o armazenamento distribuido do checkout sem consumir a cota
-- diaria de criacao de pedidos. O hash nunca contem IP ou slug em claro.
create function public.consumir_cota_delivery_quote(p_chave_ip text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_janela timestamptz :=
    to_timestamp(floor(extract(epoch from now()) / 600) * 600);
  v_quantidade integer;
begin
  if p_chave_ip is null
     or length(p_chave_ip) <> 64
     or p_chave_ip !~* '^[0-9a-f]{64}$' then
    raise exception 'Chave de limite invalida.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('delivery-quote-ip:' || p_chave_ip || ':' || v_janela::text)
  );

  -- Limpeza amostrada mantém a rota barata e impede acúmulo indefinido em
  -- lojas com muitas cotações e pouca atividade administrativa.
  if random() < 0.01 then
    delete from public.pedido_checkout_limites
    where janela < clock_timestamp() - interval '2 days';
  end if;

  insert into public.pedido_checkout_limites (chave, janela, quantidade)
  values ('delivery-quote-ip:' || p_chave_ip, v_janela, 1)
  on conflict (chave, janela) do update
  set quantidade = public.pedido_checkout_limites.quantidade + 1
  returning quantidade into v_quantidade;

  if v_quantidade > 10 then
    return jsonb_build_object(
      'permitido', false,
      'motivo', 'MUITAS_TENTATIVAS'
    );
  end if;

  return jsonb_build_object('permitido', true);
end;
$$;

revoke all on function public.consumir_cota_delivery_quote(text)
  from public, anon, authenticated;
grant execute on function public.consumir_cota_delivery_quote(text)
  to service_role;

-- Limite persistente para login e operacoes de Auth Admin. Reutiliza a mesma
-- tabela distribuida do checkout; a aplicacao envia somente uma chave HMAC-SHA-256.
create function public.consumir_cota_operacao_delivery_v1(
  p_chave text,
  p_limite integer,
  p_janela_segundos integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_janela timestamptz;
  v_quantidade integer;
  v_tentar_em integer;
begin
  if p_chave is null
     or p_limite is null
     or p_janela_segundos is null
     or length(p_chave) <> 64
     or p_chave !~* '^[0-9a-f]{64}$'
     or p_limite < 1
     or p_limite > 100
     or p_janela_segundos < 60
     or p_janela_segundos > 86400 then
    raise exception 'Limite de operacao invalido.' using errcode = '22023';
  end if;

  v_janela := to_timestamp(
    floor(extract(epoch from now()) / p_janela_segundos) * p_janela_segundos
  );
  perform pg_advisory_xact_lock(
    hashtext('delivery-op:' || p_chave || ':' || v_janela::text)
  );

  -- A maior janela permitida e de um dia; dois dias preservam margem para
  -- qualquer chamada em andamento e evitam crescimento permanente da tabela.
  delete from public.pedido_checkout_limites
  where janela < clock_timestamp() - interval '2 days';

  insert into public.pedido_checkout_limites (chave, janela, quantidade)
  values ('delivery-op:' || p_chave, v_janela, 1)
  on conflict (chave, janela) do update
  set quantidade = public.pedido_checkout_limites.quantidade + 1
  returning quantidade into v_quantidade;

  v_tentar_em := greatest(
    1,
    ceil(extract(epoch from (
      v_janela + make_interval(secs => p_janela_segundos) - clock_timestamp()
    )))::integer
  );

  return jsonb_build_object(
    'permitido', v_quantidade <= p_limite,
    'tentar_em_segundos', case when v_quantidade > p_limite then v_tentar_em else 0 end
  );
end;
$$;

revoke all on function public.consumir_cota_operacao_delivery_v1(text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.consumir_cota_operacao_delivery_v1(text,integer,integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6. Criacao publica de Delivery: quote + pedido + itens em uma transacao
-- ---------------------------------------------------------------------------

create function public.criar_pedido_publico_delivery_v1(
  p_loja_slug text,
  p_cliente_nome text,
  p_cliente_telefone text,
  p_observacao text,
  p_forma_pagamento text,
  p_itens jsonb,
  p_quote_id uuid,
  p_idempotency_key uuid,
  p_payload_hash text,
  p_total_esperado_centavos integer,
  p_chave_ip text,
  p_chave_telefone text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loja public.lojas%rowtype;
  v_quote public.delivery_quotes%rowtype;
  v_settings_enabled boolean;
  v_settings_updated_at timestamptz;
  v_existente public.pedido_idempotencia%rowtype;
  v_pedido public.pedidos%rowtype;
  v_limite jsonb;
  v_subtotal numeric(10,2);
  v_subtotal_cents integer;
  v_total numeric(10,2);
  v_total_cents integer;
  v_numero integer;
  v_pedido_id uuid;
  v_token text;
  v_endereco text;
  v_item jsonb;
  v_opcao jsonb;
  v_produto public.produtos%rowtype;
  v_compl public.complementos%rowtype;
  v_grupo public.grupos_complemento%rowtype;
  v_item_id uuid;
  v_qtd integer;
  v_preco_base numeric(10,2);
  v_extra numeric(10,2);
  v_unitario numeric(10,2);
  v_grupo_id uuid;
  v_precos numeric[];
  v_opcoes jsonb;
begin
  if p_idempotency_key is null then
    raise exception 'Requisicao sem identificador de repeticao.'
      using errcode = '22023';
  end if;
  if p_quote_id is null then
    raise exception 'DELIVERY_QUOTE_STALE' using errcode = '22023';
  end if;
  if p_payload_hash is null
     or length(p_payload_hash) <> 64
     or p_payload_hash !~* '^[0-9a-f]{64}$' then
    raise exception 'Requisicao invalida.' using errcode = '22023';
  end if;
  if p_total_esperado_centavos is not null
     and (
       p_total_esperado_centavos < 0
       or p_total_esperado_centavos > 100000000
     ) then
    raise exception 'Total esperado invalido.' using errcode = '22023';
  end if;
  if p_cliente_nome is null
     or char_length(btrim(p_cliente_nome)) < 2
     or char_length(p_cliente_nome) > 80 then
    raise exception 'Informe o nome de quem esta pedindo.' using errcode = '22023';
  end if;
  if p_cliente_telefone is null
     or char_length(p_cliente_telefone) > 20
     or char_length(regexp_replace(p_cliente_telefone, '[^0-9]', '', 'g')) < 10 then
    raise exception 'Informe um telefone valido com DDD.' using errcode = '22023';
  end if;
  if p_observacao is not null and char_length(p_observacao) > 500 then
    raise exception 'Observacao muito longa.' using errcode = '22023';
  end if;
  if p_forma_pagamento not in (
    'dinheiro',
    'cartao_credito',
    'cartao_debito',
    'pix_manual'
  ) then
    raise exception 'Forma de pagamento incompativel com Delivery.'
      using errcode = '22023';
  end if;

  select l.* into v_loja
  from public.lojas l
  where l.slug = p_loja_slug;

  if not found then
    raise exception 'Loja nao encontrada.' using errcode = '22023';
  end if;

  -- Serializa tentativas concorrentes com a mesma chave antes do SELECT. Isso
  -- permite que a segunda chamada devolva replay, em vez de bater na unique.
  perform pg_advisory_xact_lock(
    hashtext(v_loja.id::text || ':' || p_idempotency_key::text)
  );

  select i.* into v_existente
  from public.pedido_idempotencia i
  where i.loja_id = v_loja.id
    and i.idempotency_key = p_idempotency_key;

  if found then
    if v_existente.payload_hash <> p_payload_hash then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = '22023';
    end if;
    if v_existente.pedido_id is null then
      raise exception 'Pedido ainda sendo processado. Tente novamente em instantes.'
        using errcode = '22023';
    end if;

    select p.* into v_pedido
    from public.pedidos p
    where p.id = v_existente.pedido_id
      and p.loja_id = v_loja.id
      and p.tipo = 'delivery';

    if not found then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = '22023';
    end if;

    return jsonb_build_object(
      'id', v_pedido.id,
      'numero', v_pedido.numero,
      'token', v_pedido.token,
      'subtotal', v_pedido.subtotal,
      'delivery_fee_cents', v_pedido.delivery_fee_cents,
      'total', v_pedido.total,
      'forma_pagamento', v_pedido.forma_pagamento,
      'pagamento_status', v_pedido.pagamento_status,
      'replay', true
    );
  end if;

  insert into public.pedido_idempotencia (
    loja_id,
    idempotency_key,
    payload_hash
  ) values (
    v_loja.id,
    p_idempotency_key,
    p_payload_hash
  );

  v_limite := public.consumir_cota_checkout(
    p_chave_ip,
    p_chave_telefone
  );
  if (v_limite->>'permitido') is distinct from 'true' then
    raise exception 'RATE_LIMIT:%', coalesce(v_limite->>'motivo', 'LIMITE')
      using errcode = '22023';
  end if;

  select q.* into v_quote
  from public.delivery_quotes q
  where q.id = p_quote_id
  for update;

  if not found
     or v_quote.store_id <> v_loja.id
     or v_quote.consumed_at is not null
     or v_quote.expires_at <= clock_timestamp() then
    raise exception 'DELIVERY_QUOTE_STALE' using errcode = '22023';
  end if;

  -- O FOR SHARE impede que a configuracao seja alterada depois da validacao e
  -- antes do consumo da quote nesta mesma transacao.
  select s.enabled, s.updated_at
  into v_settings_enabled, v_settings_updated_at
  from public.store_delivery_settings s
  where s.store_id = v_loja.id
  for share;

  if not found
     or not v_settings_enabled
     or v_settings_updated_at is distinct from v_quote.settings_updated_at then
    raise exception 'DELIVERY_QUOTE_STALE' using errcode = '22023';
  end if;

  v_subtotal := public.cf_calcular_subtotal_catalogo_delivery(
    v_loja.id,
    p_itens
  );
  v_subtotal_cents := round(v_subtotal * 100)::integer;

  if v_subtotal < coalesce(v_loja.pedido_minimo, 0) then
    raise exception 'O pedido minimo e de R$ %.',
      to_char(v_loja.pedido_minimo, 'FM999999990.00') using errcode = '22023';
  end if;
  if v_subtotal_cents <> v_quote.items_subtotal_cents then
    raise exception 'DELIVERY_QUOTE_STALE' using errcode = '22023';
  end if;

  v_total := v_subtotal + (v_quote.delivery_fee_cents::numeric / 100);
  v_total_cents := round(v_total * 100)::integer;

  if p_total_esperado_centavos is not null
     and abs(v_total_cents - p_total_esperado_centavos) > 5 then
    raise exception 'CART_CHANGED' using errcode = '22023';
  end if;

  v_endereco := left(
    concat_ws(
      ', ',
      format('%s, %s', v_quote.street, v_quote.number),
      nullif(btrim(coalesce(v_quote.complement, '')), ''),
      v_quote.neighborhood,
      format('%s - %s', v_quote.city, v_quote.state),
      'CEP ' || v_quote.postal_code
    ),
    300
  );

  perform pg_advisory_xact_lock(hashtext(v_loja.id::text));
  select coalesce(max(p.numero), 0) + 1
  into v_numero
  from public.pedidos p
  where p.loja_id = v_loja.id;

  insert into public.pedidos (
    loja_id,
    numero,
    cliente_nome,
    cliente_telefone,
    tipo,
    endereco,
    observacao,
    forma_pagamento,
    subtotal,
    total,
    origem,
    status,
    delivery_postal_code,
    delivery_street,
    delivery_number,
    delivery_neighborhood,
    delivery_city,
    delivery_state,
    delivery_complement,
    delivery_latitude,
    delivery_longitude,
    delivery_distance_meters,
    delivery_fee_cents
  ) values (
    v_loja.id,
    v_numero,
    btrim(p_cliente_nome),
    btrim(p_cliente_telefone),
    'delivery',
    v_endereco,
    nullif(btrim(coalesce(p_observacao, '')), ''),
    p_forma_pagamento,
    v_subtotal,
    v_total,
    'site',
    'pendente',
    v_quote.postal_code,
    v_quote.street,
    v_quote.number,
    v_quote.neighborhood,
    v_quote.city,
    v_quote.state,
    v_quote.complement,
    v_quote.latitude,
    v_quote.longitude,
    v_quote.distance_meters,
    v_quote.delivery_fee_cents
  ) returning id, token into v_pedido_id, v_token;

  -- Segunda passagem do nucleo atual: persiste snapshots dos itens e opcoes ja
  -- validados e precificados pela funcao autoritativa acima.
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := coalesce((v_item->>'quantidade')::integer, 1);

    select p.* into v_produto
    from public.produtos p
    where p.id = (v_item->>'produto_id')::uuid
      and p.loja_id = v_loja.id
    for share;

    v_preco_base := coalesce(v_produto.preco_promocional, v_produto.preco);
    v_extra := 0;
    v_opcoes := coalesce(v_item->'opcoes', '[]'::jsonb);

    for v_grupo_id in
      select distinct c.grupo_id
      from jsonb_array_elements(v_opcoes) o
      join public.complementos c
        on c.id = (o->>'complemento_id')::uuid
    loop
      select g.* into v_grupo
      from public.grupos_complemento g
      where g.id = v_grupo_id
      for share;

      select array_agg(
        c.preco * coalesce((o->>'quantidade')::integer, 1)
      )
      into v_precos
      from jsonb_array_elements(v_opcoes) o
      join public.complementos c
        on c.id = (o->>'complemento_id')::uuid
      where c.grupo_id = v_grupo_id
        and c.ativo;

      if v_precos is not null then
        v_extra := v_extra + case v_grupo.modo_preco
          when 'soma'  then (select coalesce(sum(x), 0) from unnest(v_precos) x)
          when 'media' then (select coalesce(avg(x), 0) from unnest(v_precos) x)
          when 'maior' then (select coalesce(max(x), 0) from unnest(v_precos) x)
          when 'menor' then (select coalesce(min(x), 0) from unnest(v_precos) x)
          else (select coalesce(sum(x), 0) from unnest(v_precos) x)
        end;
      end if;
    end loop;

    v_unitario := v_preco_base + v_extra;

    insert into public.pedido_itens (
      pedido_id,
      produto_id,
      nome,
      preco_unitario,
      quantidade,
      observacao,
      subtotal
    ) values (
      v_pedido_id,
      v_produto.id,
      v_produto.nome,
      v_unitario,
      v_qtd,
      nullif(btrim(coalesce(v_item->>'observacao', '')), ''),
      v_unitario * v_qtd
    ) returning id into v_item_id;

    if jsonb_array_length(v_opcoes) > 0 then
      for v_opcao in select * from jsonb_array_elements(v_opcoes) loop
        select c.* into v_compl
        from public.complementos c
        where c.id = (v_opcao->>'complemento_id')::uuid
          and c.ativo
        for share;

        if found then
          select g.* into v_grupo
          from public.grupos_complemento g
          where g.id = v_compl.grupo_id
          for share;

          insert into public.pedido_item_opcoes (
            pedido_item_id,
            complemento_id,
            grupo_nome,
            nome,
            preco,
            quantidade
          ) values (
            v_item_id,
            v_compl.id,
            v_grupo.nome,
            v_compl.nome,
            v_compl.preco,
            coalesce((v_opcao->>'quantidade')::integer, 1)
          );
        end if;
      end loop;
    end if;
  end loop;

  update public.delivery_quotes
  set consumed_at = clock_timestamp()
  where id = v_quote.id
    and consumed_at is null;

  if not found then
    raise exception 'DELIVERY_QUOTE_STALE' using errcode = '22023';
  end if;

  update public.pedido_idempotencia
  set pedido_id = v_pedido_id
  where loja_id = v_loja.id
    and idempotency_key = p_idempotency_key;

  select p.* into v_pedido
  from public.pedidos p
  where p.id = v_pedido_id;

  return jsonb_build_object(
    'id', v_pedido_id,
    'numero', v_numero,
    'token', v_token,
    'subtotal', v_subtotal,
    'delivery_fee_cents', v_quote.delivery_fee_cents,
    'total', v_total,
    'forma_pagamento', v_pedido.forma_pagamento,
    'pagamento_status', v_pedido.pagamento_status,
    'replay', false
  );
end;
$$;

revoke all on function public.criar_pedido_publico_delivery_v1(
  text,text,text,text,text,jsonb,uuid,uuid,text,integer,text,text
) from public, anon, authenticated;
grant execute on function public.criar_pedido_publico_delivery_v1(
  text,text,text,text,text,jsonb,uuid,uuid,text,integer,text,text
) to service_role;

-- Mantem o contrato publico de acompanhamento e acrescenta apenas a taxa do
-- snapshot. Endereco completo continua no campo legado `endereco`; coordenadas
-- e telefone nao sao expostos por esta RPC publica.
create or replace function public.pedido_por_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resultado jsonb;
begin
  select jsonb_build_object(
    'numero', p.numero,
    'status', p.status,
    'pagamento_status', p.pagamento_status,
    'tipo', p.tipo,
    'cliente_nome', p.cliente_nome,
    'endereco', p.endereco,
    'observacao', p.observacao,
    'forma_pagamento', p.forma_pagamento,
    'subtotal', p.subtotal,
    'delivery_fee_cents', p.delivery_fee_cents,
    'total', p.total,
    'data_hora_agendada', p.data_hora_agendada,
    'origem', p.origem,
    'criado_em', p.criado_em,
    'confirmado_em', p.confirmado_em,
    'loja_nome', l.nome,
    'loja_slug', l.slug,
    'loja_cor', l.cor_marca,
    'loja_whatsapp', l.whatsapp_numero,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nome', i.nome,
        'quantidade', i.quantidade,
        'preco_unitario', i.preco_unitario,
        'subtotal', i.subtotal,
        'observacao', i.observacao,
        'opcoes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'grupo', o.grupo_nome,
            'nome', o.nome,
            'preco', o.preco,
            'quantidade', o.quantidade
          ))
          from public.pedido_item_opcoes o
          where o.pedido_item_id = i.id
        ), '[]'::jsonb)
      ))
      from public.pedido_itens i
      where i.pedido_id = p.id
    ), '[]'::jsonb)
  ) into v_resultado
  from public.pedidos p
  join public.lojas l on l.id = p.loja_id
  where p.token = p_token;

  if v_resultado is null then
    raise exception 'Pedido nao encontrado.' using errcode = '22023';
  end if;
  return v_resultado;
end;
$$;

revoke all on function public.pedido_por_token(text)
  from public, anon, authenticated;
grant execute on function public.pedido_por_token(text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Defesa final do checkout e ativacao da entrega quando o pedido fica pronto
-- ---------------------------------------------------------------------------

create or replace function public.cf_validar_operacao_pedido_site()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aberta boolean;
  v_retirada boolean;
  v_delivery boolean;
begin
  if coalesce(new.origem, 'site') <> 'site' then
    return new;
  end if;

  select l.recebendo_encomendas, l.retirada_ativa
  into v_aberta, v_retirada
  from public.lojas l
  where l.id = new.loja_id
  for share;

  if not found then
    raise exception 'Loja nao encontrada.' using errcode = '22023';
  end if;
  if not v_aberta then
    raise exception 'A loja esta fechada e nao esta recebendo pedidos no momento.'
      using errcode = '22023';
  end if;

  if new.tipo = 'retirada' then
    if not v_retirada then
      raise exception 'A retirada esta indisponivel no momento.'
        using errcode = '22023';
    end if;
    return new;
  end if;

  if new.tipo = 'delivery' then
    v_delivery := public.delivery_disponibilidade_publica(new.loja_id);

    if not v_delivery then
      raise exception 'Delivery indisponivel.' using errcode = '22023';
    end if;
    return new;
  end if;

  raise exception 'Pedidos do site aceitam somente retirada ou Delivery.'
    using errcode = '22023';
end;
$$;

revoke all on function public.cf_validar_operacao_pedido_site()
  from public, anon, authenticated;

create function public.delivery_sync_from_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tipo = 'delivery'
     and new.status = 'pronto'
     and (
       tg_op = 'INSERT'
       or old.status is distinct from 'pronto'
     ) then
    insert into public.deliveries (
      store_id,
      order_id,
      status
    ) values (
      new.loja_id,
      new.id,
      'WAITING_DRIVER'
    )
    on conflict (order_id) do nothing;
  end if;

  if new.tipo = 'delivery'
     and new.status = 'cancelado'
     and (
       tg_op = 'INSERT'
       or old.status is distinct from 'cancelado'
     ) then
    update public.deliveries
    set status = 'CANCELED'
    where order_id = new.id
      and store_id = new.loja_id
      and status in ('WAITING_DRIVER', 'ASSIGNED', 'OUT_FOR_DELIVERY');
  end if;

  return new;
end;
$$;

revoke all on function public.delivery_sync_from_order()
  from public, anon, authenticated;

create trigger pedidos_sync_delivery
after insert or update of status on public.pedidos
for each row execute function public.delivery_sync_from_order();

-- O fluxo geral continua responsavel pela cozinha. Para Delivery, a etapa
-- pronto e terminal para o painel: somente concluir_delivery_v1 conclui pedido
-- e entrega juntos. Cancelar continua permitido e o trigger acima cancela a
-- entrega ativa sem tocar no pagamento.
create or replace function public.transicionar_pedido(
  p_pedido_id uuid,
  p_status_esperado text,
  p_novo_status text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_transicoes_validas text[];
begin
  select p.* into v_pedido
  from public.pedidos p
  where p.id = p_pedido_id
  for update;

  if not found then
    raise exception 'Pedido nao encontrado.' using errcode = '22023';
  end if;

  if not (
    exists (
      select 1 from public.lojas l
      where l.id = v_pedido.loja_id
        and l.dono_id = auth.uid()
    )
    or public.is_admin()
  ) then
    raise exception 'Pedido nao encontrado.' using errcode = '22023';
  end if;

  if p_novo_status not in (
    'pendente','confirmado','em_preparo','pronto','concluido','cancelado'
  ) then
    raise exception 'Status invalido.' using errcode = '22023';
  end if;
  if v_pedido.status in ('concluido','cancelado') then
    raise exception 'Pedido ja esta %.', v_pedido.status using errcode = '22023';
  end if;
  if v_pedido.status <> p_status_esperado then
    raise exception 'CONFLITO' using errcode = '22023';
  end if;

  if v_pedido.tipo = 'delivery'
     and v_pedido.status = 'pronto'
     and p_novo_status = 'concluido' then
    raise exception 'DELIVERY_REQUER_CONCLUSAO_DO_ENTREGADOR'
      using errcode = '22023';
  end if;

  if p_novo_status <> 'cancelado' then
    v_transicoes_validas := case v_pedido.status
      when 'pendente'   then array['confirmado']
      when 'confirmado' then array['em_preparo']
      when 'em_preparo' then array['pronto']
      when 'pronto'     then array['concluido']
      else array[]::text[]
    end;

    if not (p_novo_status = any(v_transicoes_validas)) then
      raise exception 'Transicao de status invalida.' using errcode = '22023';
    end if;
  end if;

  update public.pedidos
  set status = p_novo_status
  where id = p_pedido_id
    and status = p_status_esperado;

  return jsonb_build_object('ok', true, 'status', p_novo_status);
end;
$$;

revoke all on function public.transicionar_pedido(uuid,text,text)
  from public, anon;
grant execute on function public.transicionar_pedido(uuid,text,text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 8. RPCs operacionais estreitas
-- ---------------------------------------------------------------------------

create function public.atribuir_delivery_v1(
  p_delivery_id uuid,
  p_driver_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery public.deliveries%rowtype;
  v_driver public.delivery_drivers%rowtype;
begin
  select d.* into v_delivery
  from public.deliveries d
  where d.id = p_delivery_id
  for update;

  if not found then
    raise exception 'Entrega nao encontrada.' using errcode = '22023';
  end if;
  if not (
    public.is_admin()
    or exists (
      select 1 from public.lojas l
      where l.id = v_delivery.store_id
        and l.dono_id = auth.uid()
    )
  ) then
    raise exception 'Entrega nao encontrada.' using errcode = '22023';
  end if;
  if v_delivery.status <> 'WAITING_DRIVER' then
    raise exception 'CONFLITO' using errcode = '22023';
  end if;

  select dr.* into v_driver
  from public.delivery_drivers dr
  where dr.id = p_driver_id
    and dr.store_id = v_delivery.store_id
  for update;

  if not found
     or not v_driver.active
     or not v_driver.available then
    raise exception 'Entregador indisponivel.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.deliveries d
    where d.driver_id = v_driver.id
      and d.status in ('ASSIGNED', 'OUT_FOR_DELIVERY')
  ) then
    raise exception 'Entregador indisponivel.' using errcode = '22023';
  end if;

  update public.deliveries
  set
    driver_id = v_driver.id,
    status = 'ASSIGNED',
    assigned_at = clock_timestamp()
  where id = v_delivery.id
    and status = 'WAITING_DRIVER'
  returning * into v_delivery;

  if not found then
    raise exception 'CONFLITO' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'id', v_delivery.id,
    'order_id', v_delivery.order_id,
    'status', v_delivery.status,
    'driver_id', v_delivery.driver_id,
    'assigned_at', v_delivery.assigned_at
  );
end;
$$;

revoke all on function public.atribuir_delivery_v1(uuid,uuid)
  from public, anon;
grant execute on function public.atribuir_delivery_v1(uuid,uuid)
  to authenticated;

create function public.definir_disponibilidade_driver_v1(p_available boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver public.delivery_drivers%rowtype;
  v_em_rota boolean;
  v_status_visual text;
begin
  if p_available is null then
    raise exception 'Disponibilidade invalida.' using errcode = '22023';
  end if;

  select dr.* into v_driver
  from public.delivery_drivers dr
  where dr.auth_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Entregador nao encontrado.' using errcode = '22023';
  end if;
  if not v_driver.active then
    raise exception 'Entregador inativo.' using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.deliveries d
    where d.driver_id = v_driver.id
      and d.store_id = v_driver.store_id
      and d.status in ('ASSIGNED', 'OUT_FOR_DELIVERY')
  ) into v_em_rota;

  if v_em_rota then
    raise exception 'ACTIVE_DELIVERY' using errcode = '22023';
  end if;

  update public.delivery_drivers
  set available = p_available
  where id = v_driver.id
  returning * into v_driver;

  v_status_visual := case
    when v_driver.available then 'DISPONIVEL'
    else 'INDISPONIVEL'
  end;

  return jsonb_build_object(
    'driver_id', v_driver.id,
    'available', v_driver.available,
    'status', v_status_visual
  );
end;
$$;

revoke all on function public.definir_disponibilidade_driver_v1(boolean)
  from public, anon;
grant execute on function public.definir_disponibilidade_driver_v1(boolean)
  to authenticated;

create function public.iniciar_delivery_v1(p_delivery_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver public.delivery_drivers%rowtype;
  v_delivery public.deliveries%rowtype;
begin
  select dr.* into v_driver
  from public.delivery_drivers dr
  where dr.auth_user_id = auth.uid()
  for update;

  if not found or not v_driver.active then
    raise exception 'Entrega nao encontrada.' using errcode = '22023';
  end if;

  select d.* into v_delivery
  from public.deliveries d
  where d.id = p_delivery_id
    and d.store_id = v_driver.store_id
    and d.driver_id = v_driver.id
  for update;

  if not found then
    raise exception 'Entrega nao encontrada.' using errcode = '22023';
  end if;
  if v_delivery.status <> 'ASSIGNED' then
    raise exception 'CONFLITO' using errcode = '22023';
  end if;

  update public.deliveries
  set
    status = 'OUT_FOR_DELIVERY',
    started_at = clock_timestamp()
  where id = v_delivery.id
    and status = 'ASSIGNED'
  returning * into v_delivery;

  if not found then
    raise exception 'CONFLITO' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'id', v_delivery.id,
    'order_id', v_delivery.order_id,
    'status', v_delivery.status,
    'driver_id', v_delivery.driver_id,
    'started_at', v_delivery.started_at
  );
end;
$$;

revoke all on function public.iniciar_delivery_v1(uuid)
  from public, anon;
grant execute on function public.iniciar_delivery_v1(uuid)
  to authenticated;

create function public.concluir_delivery_v1(p_delivery_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver public.delivery_drivers%rowtype;
  v_delivery public.deliveries%rowtype;
  v_pedido public.pedidos%rowtype;
begin
  select dr.* into v_driver
  from public.delivery_drivers dr
  where dr.auth_user_id = auth.uid()
  for update;

  if not found or not v_driver.active then
    raise exception 'Entrega nao encontrada.' using errcode = '22023';
  end if;

  select d.* into v_delivery
  from public.deliveries d
  where d.id = p_delivery_id
    and d.store_id = v_driver.store_id
    and d.driver_id = v_driver.id;

  if not found then
    raise exception 'Entrega nao encontrada.' using errcode = '22023';
  end if;

  -- Pedido antes de delivery mantem a mesma ordem de locks do cancelamento
  -- (transicionar_pedido -> trigger), evitando deadlock entre cancelar e
  -- concluir no mesmo instante.
  select p.* into v_pedido
  from public.pedidos p
  where p.id = v_delivery.order_id
    and p.loja_id = v_delivery.store_id
    and p.tipo = 'delivery'
  for update;

  if not found or v_pedido.status <> 'pronto' then
    raise exception 'CONFLITO' using errcode = '22023';
  end if;

  select d.* into v_delivery
  from public.deliveries d
  where d.id = p_delivery_id
    and d.store_id = v_driver.store_id
    and d.driver_id = v_driver.id
  for update;

  if not found or v_delivery.status <> 'OUT_FOR_DELIVERY' then
    raise exception 'CONFLITO' using errcode = '22023';
  end if;

  update public.deliveries
  set
    status = 'DELIVERED',
    delivered_at = clock_timestamp()
  where id = v_delivery.id
    and status = 'OUT_FOR_DELIVERY'
  returning * into v_delivery;

  if not found then
    raise exception 'CONFLITO' using errcode = '22023';
  end if;

  update public.pedidos
  set status = 'concluido'
  where id = v_pedido.id
    and status = 'pronto';

  if not found then
    raise exception 'CONFLITO' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'id', v_delivery.id,
    'order_id', v_delivery.order_id,
    'status', v_delivery.status,
    'driver_id', v_delivery.driver_id,
    'delivered_at', v_delivery.delivered_at,
    'order_status', 'concluido'
  );
end;
$$;

revoke all on function public.concluir_delivery_v1(uuid)
  from public, anon;
grant execute on function public.concluir_delivery_v1(uuid)
  to authenticated;

commit;
