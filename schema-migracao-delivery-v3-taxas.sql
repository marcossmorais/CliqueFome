-- Delivery v3 — motor de taxas, centavos no pedido e snapshot da entrega
--
-- Execute no SQL Editor do Supabase, DEPOIS de schema-migracao-delivery-v3.sql.
-- Seguro para execução repetida.
--
-- Não altera criar_pedido_publico_v1/v2 nem a máquina de estados do pedido.
-- Não toca em pagamento. Adiciona uma coluna, uma tabela e uma RPC que
-- envolve a existente.

begin;

-- ---------------------------------------------------------------------------
-- Terceira modalidade: taxa fixa MAIS valor por km
-- ---------------------------------------------------------------------------
-- Para quem tem custo de saída (a moto sai da loja de qualquer jeito) e ainda
-- quer cobrar a distância por cima: `fixed_fee_cents` + (km × price_per_km).
--
-- A soma acontece só entre as duas partes da MESMA regra base. Override de
-- bairro/cidade continua SUBSTITUINDO o resultado inteiro, nunca somando.
alter table public.store_delivery_settings
  drop constraint if exists store_delivery_settings_calculation_type_check;
alter table public.store_delivery_settings
  add constraint store_delivery_settings_calculation_type_check
  check (calculation_type in ('FIXED', 'PER_KM', 'FIXED_PLUS_KM'));

-- A exigência de coordenada passa a valer para as duas modalidades que
-- dependem de rota. Sem origem não há distância, e sem distância a taxa
-- combinada seria só a base — cobrando a menos, silenciosamente.
alter table public.store_delivery_settings
  drop constraint if exists store_delivery_settings_origem_para_km;
alter table public.store_delivery_settings
  add constraint store_delivery_settings_origem_para_km
  check (
    calculation_type not in ('PER_KM', 'FIXED_PLUS_KM')
    or (origin_lat is not null and origin_lng is not null)
  );

-- ---------------------------------------------------------------------------
-- Taxa de entrega em centavos inteiros
-- ---------------------------------------------------------------------------
-- `taxa_entrega` (numeric em reais) CONTINUA sendo escrita pela cadeia de
-- RPCs que cria o pedido — reescrever aquela cadeia inteira seria mexer em
-- idempotência, rate limit e recálculo de catálogo de uma vez só, muito
-- risco pra um ganho de representação.
--
-- Em vez disso, `taxa_entrega_cents` é DERIVADA por trigger. Não há perda de
-- precisão: `taxa_entrega` é numeric(10,2), então `round(v * 100)` é exato,
-- e não uma aproximação de ponto flutuante. Quem lê passa a ler a coluna
-- inteira; quem escreve não precisa saber que ela existe.
alter table public.pedidos
  add column if not exists taxa_entrega_cents integer;

create or replace function public.cf_derivar_taxa_entrega_cents()
returns trigger
language plpgsql
as $$
begin
  new.taxa_entrega_cents := round(coalesce(new.taxa_entrega, 0) * 100)::integer;
  return new;
end;
$$;

drop trigger if exists cf_pedidos_taxa_entrega_cents on public.pedidos;
create trigger cf_pedidos_taxa_entrega_cents
before insert or update of taxa_entrega on public.pedidos
for each row execute function public.cf_derivar_taxa_entrega_cents();

-- Backfill do histórico. Roda uma vez; em execução repetida não encontra nada.
update public.pedidos
set taxa_entrega_cents = round(coalesce(taxa_entrega, 0) * 100)::integer
where taxa_entrega_cents is null;

alter table public.pedidos
  alter column taxa_entrega_cents set default 0;

-- ---------------------------------------------------------------------------
-- Snapshot da entrega
-- ---------------------------------------------------------------------------
-- O pedido de ontem não pode mudar porque a loja mexeu na taxa hoje, porque o
-- cliente editou o endereço, ou porque a Geoapify passou a devolver outro
-- resultado pro mesmo texto. Tudo que explica AQUELA cobrança fica congelado
-- aqui no instante da criação.
create table if not exists public.pedido_entrega_snapshot (
  pedido_id uuid primary key references public.pedidos(id) on delete cascade,
  loja_id uuid not null references public.lojas(id) on delete cascade,

  endereco_formatado text not null,
  logradouro text,
  numero text,
  bairro text,
  cidade text,
  cidade_normalizada text,
  uf text,
  cep text,
  complemento text,
  referencia text,
  latitude numeric(9,6),
  longitude numeric(9,6),

  distancia_metros integer check (distancia_metros is null or distancia_metros >= 0),
  taxa_cents integer not null check (taxa_cents >= 0),

  -- Qual regra produziu a taxa. Sem isto, meses depois ninguém consegue
  -- explicar por que aquela entrega custou aquilo.
  regra_aplicada text not null
    check (regra_aplicada in ('FIXED', 'PER_KM', 'FIXED_PLUS_KM', 'OVERRIDE_CITY', 'OVERRIDE_NEIGHBORHOOD')),
  -- Sem FK: a regra pode ser apagada depois, e o snapshot precisa sobreviver
  -- a isso. Guarda o id só como rastro.
  override_id uuid,
  -- `updated_at` da configuração no momento da cotação (o settingsVersion).
  config_versao timestamptz,

  criado_em timestamptz not null default now()
);

create index if not exists pedido_entrega_snapshot_loja on public.pedido_entrega_snapshot (loja_id, criado_em desc);

alter table public.pedido_entrega_snapshot enable row level security;
revoke all on table public.pedido_entrega_snapshot from public, anon;
grant select on table public.pedido_entrega_snapshot to authenticated;

drop policy if exists "Dono le snapshot de entrega da propria loja" on public.pedido_entrega_snapshot;
create policy "Dono le snapshot de entrega da propria loja"
on public.pedido_entrega_snapshot for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.lojas l
    where l.id = loja_id and l.dono_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- Criação do pedido com snapshot, na MESMA transação
-- ---------------------------------------------------------------------------
-- Envolve a RPC existente em vez de reimplementá-la: idempotência, rate
-- limit, recálculo de preços e validação de disponibilidade continuam vindo
-- de lá, sem cópia. Uma função plpgsql roda numa transação só — se o insert
-- do snapshot falhar, o pedido inteiro volta atrás.
--
-- `p_entrega` nulo = retirada, ou loja ainda não migrada: nenhum snapshot é
-- gravado e o comportamento é idêntico ao de antes.
create or replace function public.criar_pedido_publico_offline_v2(
  p_loja_slug text,
  p_cliente_nome text,
  p_cliente_telefone text,
  p_tipo text,
  p_endereco text,
  p_observacao text,
  p_forma_pagamento text,
  p_itens jsonb,
  p_idempotency_key uuid,
  p_payload_hash text,
  p_total_esperado_centavos integer,
  p_chave_ip text,
  p_chave_telefone text,
  p_taxa_entrega_validada numeric default null,
  p_entrega jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resultado jsonb;
  v_pedido_id uuid;
  v_loja_id uuid;
begin
  v_resultado := public.criar_pedido_publico_offline_v1(
    p_loja_slug, p_cliente_nome, p_cliente_telefone, p_tipo, p_endereco,
    p_observacao, p_forma_pagamento, p_itens, p_idempotency_key, p_payload_hash,
    p_total_esperado_centavos, p_chave_ip, p_chave_telefone, p_taxa_entrega_validada
  );

  v_pedido_id := (v_resultado->>'id')::uuid;

  -- Replay de idempotência não regrava o snapshot: o pedido já existe com o
  -- dele, e sobrescrever apagaria justamente o congelamento que ele garante.
  if p_entrega is not null
     and p_tipo = 'delivery'
     and coalesce((v_resultado->>'replay')::boolean, false) = false then

    select loja_id into v_loja_id from public.pedidos where id = v_pedido_id;

    insert into public.pedido_entrega_snapshot (
      pedido_id, loja_id, endereco_formatado, logradouro, numero, bairro,
      cidade, cidade_normalizada, uf, cep, complemento, referencia,
      latitude, longitude, distancia_metros, taxa_cents,
      regra_aplicada, override_id, config_versao
    ) values (
      v_pedido_id,
      v_loja_id,
      coalesce(p_entrega->>'endereco_formatado', ''),
      p_entrega->>'logradouro',
      p_entrega->>'numero',
      p_entrega->>'bairro',
      p_entrega->>'cidade',
      p_entrega->>'cidade_normalizada',
      p_entrega->>'uf',
      p_entrega->>'cep',
      p_entrega->>'complemento',
      p_entrega->>'referencia',
      (p_entrega->>'latitude')::numeric,
      (p_entrega->>'longitude')::numeric,
      (p_entrega->>'distancia_metros')::integer,
      (p_entrega->>'taxa_cents')::integer,
      p_entrega->>'regra_aplicada',
      (p_entrega->>'override_id')::uuid,
      (p_entrega->>'config_versao')::timestamptz
    )
    on conflict (pedido_id) do nothing;
  end if;

  return v_resultado;
end;
$$;

revoke execute on function public.criar_pedido_publico_offline_v2(
  text,text,text,text,text,text,text,jsonb,uuid,text,integer,text,text,numeric,jsonb
) from public, anon, authenticated;
grant execute on function public.criar_pedido_publico_offline_v2(
  text,text,text,text,text,text,text,jsonb,uuid,text,integer,text,text,numeric,jsonb
) to service_role;

commit;

-- ---------------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------------
-- select numero, taxa_entrega, taxa_entrega_cents from public.pedidos
-- order by criado_em desc limit 10;
--
-- select s.taxa_cents, s.regra_aplicada, s.distancia_metros, s.cidade, s.bairro
-- from public.pedido_entrega_snapshot s order by s.criado_em desc limit 10;

-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
-- A coluna e a tabela são aditivas; o deploy anterior ignora as duas.
--
-- drop function if exists public.criar_pedido_publico_offline_v2(
--   text,text,text,text,text,text,text,jsonb,uuid,text,integer,text,text,numeric,jsonb);
-- drop table if exists public.pedido_entrega_snapshot;
-- drop trigger if exists cf_pedidos_taxa_entrega_cents on public.pedidos;
-- drop function if exists public.cf_derivar_taxa_entrega_cents();
-- alter table public.pedidos drop column if exists taxa_entrega_cents;
