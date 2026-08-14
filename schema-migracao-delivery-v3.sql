-- Delivery v3 — endereço, configuração e taxas específicas
--
-- Execute no SQL Editor do Supabase. Seguro para execução repetida.
-- A chave Geoapify NÃO fica no banco: configure GEOAPIFY_API_KEY somente
-- nas variáveis de ambiente server-side da aplicação/Vercel.
--
-- Esta migração NÃO derruba nada. `configuracoes_delivery`,
-- `configuracoes_delivery_cidades` e `enderecos_estabelecimento` continuam
-- existindo com os dados intactos — o backfill no fim COPIA delas para as
-- tabelas novas. A remoção das antigas só acontece num passo posterior,
-- depois que o motor novo estiver validado em produção.
--
-- Diferença central para a v2: dinheiro em CENTAVOS INTEIROS. `numeric(10,2)`
-- em reais convidava a aritmética de ponto flutuante no JS (a taxa por km era
-- calculada com `* 100 / 100` no cliente do cálculo). Aqui nenhum valor
-- financeiro passa por float em momento nenhum.

begin;

-- ---------------------------------------------------------------------------
-- Normalização de texto (espelha lib/delivery/tipos.ts, normalizarTexto)
-- ---------------------------------------------------------------------------
-- Sem `unaccent`: a extensão não é IMMUTABLE por padrão no Postgres, o que a
-- desqualifica para índice e para coluna gerada. `translate` cobre o conjunto
-- de acentos do português e é imutável de verdade.
--
-- Precisa continuar dando exatamente o mesmo resultado que a função JS de
-- mesmo nome — tests/delivery-endereco.test.mjs trava os casos, e a
-- divergência entre as duas faria "São José" cadastrado no painel não casar
-- com "sao jose" resolvido no checkout.
create or replace function public.cf_normalizar_texto(p_valor text)
returns text
language sql
immutable
strict
as $$
  select regexp_replace(
    btrim(lower(translate(
      p_valor,
      'áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
      'aaaaaaeeeeiiiiooooouuuucnAAAAAAEEEEIIIIOOOOOUUUUCN'
    ))),
    '\s+', ' ', 'g'
  );
$$;

-- ---------------------------------------------------------------------------
-- Configuração de entrega da loja
-- ---------------------------------------------------------------------------
create table if not exists public.store_delivery_settings (
  store_id uuid primary key references public.lojas(id) on delete cascade,
  enabled boolean not null default true,
  calculation_type text not null default 'FIXED'
    check (calculation_type in ('FIXED', 'PER_KM')),
  fixed_fee_cents integer not null default 0
    check (fixed_fee_cents >= 0 and fixed_fee_cents <= 20000),
  price_per_km_cents integer not null default 200
    check (price_per_km_cents >= 0 and price_per_km_cents <= 5000),

  -- Tetos de segurança herdados da v2 (`taxa_maxima`/`distancia_maxima_km`).
  -- Não estavam na especificação da v3, mas são a única barreira contra uma
  -- rota absurda virar uma taxa absurda cobrada do cliente — remover seria
  -- regressão de segurança financeira, não simplificação.
  max_fee_cents integer not null default 4000
    check (max_fee_cents > 0 and max_fee_cents <= 20000),
  max_distance_meters integer not null default 30000
    check (max_distance_meters > 0 and max_distance_meters <= 100000),

  -- Origem (PONTO A). Geocodificada UMA vez, no cadastro, e reutilizada em
  -- toda cotação — nenhum pedido re-geocodifica a loja.
  origin_formatted_address text,
  origin_street text,
  origin_number text,
  origin_neighborhood text,
  origin_city text,
  origin_city_normalized text,
  origin_state text,
  origin_postal_code text,
  origin_lat numeric(9,6) check (origin_lat is null or origin_lat between -90 and 90),
  origin_lng numeric(9,6) check (origin_lng is null or origin_lng between -180 and 180),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- PER_KM sem coordenada de origem não tem como calcular rota. FIXED pode
  -- operar sem endereço nenhum cadastrado.
  constraint store_delivery_settings_origem_para_km check (
    calculation_type <> 'PER_KM'
    or (origin_lat is not null and origin_lng is not null)
  )
);

comment on column public.store_delivery_settings.updated_at is
  'Serve de settingsVersion: vai assinado dentro do deliveryQuoteToken. Se a loja mudar a configuração, toda cotação emitida antes deixa de valer.';

-- ---------------------------------------------------------------------------
-- Taxas específicas por cidade/bairro
-- ---------------------------------------------------------------------------
-- A taxa específica SUBSTITUI a regra base, nunca soma. A prioridade
-- (bairro > cidade > base) é resolvida na consulta, não aqui.
create table if not exists public.delivery_fee_overrides (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.lojas(id) on delete cascade,
  scope text not null check (scope in ('CITY', 'NEIGHBORHOOD')),

  state text check (state is null or state ~ '^[A-Z]{2}$'),
  city_display text not null check (length(btrim(city_display)) between 2 and 100),
  city_normalized text not null check (length(city_normalized) between 2 and 100),
  neighborhood_display text check (neighborhood_display is null or length(btrim(neighborhood_display)) between 2 and 80),
  neighborhood_normalized text check (neighborhood_normalized is null or length(neighborhood_normalized) between 2 and 80),

  fee_cents integer not null check (fee_cents >= 0 and fee_cents <= 20000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Regra de bairro exige bairro; regra de cidade exige que ele esteja ausente.
  -- Sem isso, uma linha scope='CITY' com bairro preenchido casaria nas duas
  -- consultas e a prioridade viraria loteria.
  constraint delivery_fee_overrides_bairro_coerente check (
    (scope = 'NEIGHBORHOOD' and neighborhood_normalized is not null and neighborhood_display is not null)
    or (scope = 'CITY' and neighborhood_normalized is null and neighborhood_display is null)
  )
);

-- Duplicidade dentro da loja é impedida no banco, não só na tela: dois
-- índices parciais porque a chave de unicidade muda conforme o escopo.
create unique index if not exists delivery_fee_overrides_cidade_unica
  on public.delivery_fee_overrides (store_id, city_normalized)
  where scope = 'CITY';

create unique index if not exists delivery_fee_overrides_bairro_unico
  on public.delivery_fee_overrides (store_id, city_normalized, neighborhood_normalized)
  where scope = 'NEIGHBORHOOD';

-- Caminho de leitura da cotação: sempre filtrando por loja e só o que está ativo.
create index if not exists delivery_fee_overrides_busca
  on public.delivery_fee_overrides (store_id, city_normalized, scope)
  where active;

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------
create or replace function public.cf_tocar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cf_store_delivery_settings_updated_at on public.store_delivery_settings;
create trigger cf_store_delivery_settings_updated_at
before update on public.store_delivery_settings
for each row execute function public.cf_tocar_updated_at();

drop trigger if exists cf_delivery_fee_overrides_updated_at on public.delivery_fee_overrides;
create trigger cf_delivery_fee_overrides_updated_at
before update on public.delivery_fee_overrides
for each row execute function public.cf_tocar_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- O dono LÊ a própria configuração pelo painel. A ESCRITA não tem policy:
-- passa inteira pela API administrativa com client privilegiado, que valida
-- os limites antes de gravar, sem liberar escrita direta na tabela.
--
-- `anon` não recebe nada: o cardápio público nunca lê estas tabelas direto.
-- Quem cota é a rota server-side, com service_role.
alter table public.store_delivery_settings enable row level security;
revoke all on table public.store_delivery_settings from public, anon;
grant select on table public.store_delivery_settings to authenticated;

drop policy if exists "Dono le configuracao de entrega da propria loja" on public.store_delivery_settings;
create policy "Dono le configuracao de entrega da propria loja"
on public.store_delivery_settings for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.lojas l
    where l.id = store_id and l.dono_id = auth.uid()
  )
);

alter table public.delivery_fee_overrides enable row level security;
revoke all on table public.delivery_fee_overrides from public, anon;
grant select on table public.delivery_fee_overrides to authenticated;

drop policy if exists "Dono le taxas especificas da propria loja" on public.delivery_fee_overrides;
create policy "Dono le taxas especificas da propria loja"
on public.delivery_fee_overrides for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.lojas l
    where l.id = store_id and l.dono_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- Backfill a partir da v2 — cópia, não movimentação
-- ---------------------------------------------------------------------------
-- `on conflict do nothing` mantém a migração repetível: rodar de novo depois
-- que a loja já editou a configuração nova não sobrescreve o que ela salvou.
insert into public.store_delivery_settings (
  store_id, enabled, calculation_type,
  fixed_fee_cents, price_per_km_cents, max_fee_cents, max_distance_meters,
  origin_formatted_address, origin_street, origin_number, origin_neighborhood,
  origin_city, origin_city_normalized, origin_state, origin_postal_code,
  origin_lat, origin_lng
)
select
  cd.loja_id,
  coalesce(l.delivery_ativo, true),
  case when cd.tipo_taxa = 'por_km' then 'PER_KM' else 'FIXED' end,
  round(cd.taxa_fixa * 100)::integer,
  round(cd.valor_por_km * 100)::integer,
  round(cd.taxa_maxima * 100)::integer,
  round(cd.distancia_maxima_km * 1000)::integer,
  coalesce(e.endereco_formatado, cd.endereco_origem),
  e.logradouro,
  e.numero,
  e.bairro,
  coalesce(e.cidade, cd.cidade_atendida),
  public.cf_normalizar_texto(coalesce(e.cidade, cd.cidade_atendida)),
  e.uf,
  e.cep,
  coalesce(e.latitude, cd.origem_latitude),
  coalesce(e.longitude, cd.origem_longitude)
from public.configuracoes_delivery cd
join public.lojas l on l.id = cd.loja_id
left join public.enderecos_estabelecimento e on e.loja_id = cd.loja_id
on conflict (store_id) do nothing;

-- PER_KM sem coordenada violaria a constraint acima. Loja nessa situação cai
-- para FIXED com a taxa fixa que já tinha — continua vendendo, e o painel
-- volta a exigir o endereço quando ela reabrir a configuração.
update public.store_delivery_settings
set calculation_type = 'FIXED'
where calculation_type = 'PER_KM' and (origin_lat is null or origin_lng is null);

-- Cidades vizinhas do modo "avançado" viram overrides de CIDADE. O `<select>`
-- que fazia o CLIENTE escolher a cidade no checkout sai de cena: a cidade
-- passa a vir do endereço que o autocomplete resolveu.
insert into public.delivery_fee_overrides (
  store_id, scope, state, city_display, city_normalized, fee_cents, active
)
select
  c.loja_id,
  'CITY',
  e.uf,
  btrim(c.cidade),
  public.cf_normalizar_texto(c.cidade),
  round(c.taxa * 100)::integer,
  true
from public.configuracoes_delivery_cidades c
join public.configuracoes_delivery cd on cd.loja_id = c.loja_id
left join public.enderecos_estabelecimento e on e.loja_id = c.loja_id
where cd.setor = 'avancado'
  and length(btrim(c.cidade)) between 2 and 100
  and round(c.taxa * 100)::integer between 0 and 20000
on conflict do nothing;

commit;

-- ---------------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------------
-- select store_id, calculation_type, fixed_fee_cents, price_per_km_cents,
--        origin_city, origin_lat, origin_lng, updated_at
-- from public.store_delivery_settings order by updated_at desc limit 20;
--
-- select store_id, scope, city_display, neighborhood_display, fee_cents, active
-- from public.delivery_fee_overrides order by store_id, scope;

-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
-- As tabelas da v2 seguem populadas e intactas, então reverter é só parar de
-- ler as novas (deploy anterior) e, opcionalmente:
--
-- drop table if exists public.delivery_fee_overrides;
-- drop table if exists public.store_delivery_settings;
-- drop function if exists public.cf_normalizar_texto(text);
