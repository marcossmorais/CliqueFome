-- Delivery facilitado: taxa fixa ou por distância de rota
--
-- Execute no SQL Editor do Supabase. Seguro para execução repetida.
-- A chave Geoapify NÃO fica no banco: configure GEOAPIFY_API_KEY somente
-- nas variáveis de ambiente server-side da aplicação/Vercel.

begin;

create table if not exists public.configuracoes_delivery (
  loja_id uuid primary key references public.lojas(id) on delete cascade,
  setor text not null default 'facilitado'
    check (setor in ('facilitado', 'avancado')),
  tipo_taxa text not null default 'fixa'
    check (tipo_taxa in ('fixa', 'por_km')),
  cidade_atendida text not null,
  taxa_fixa numeric(10,2) not null default 0
    check (taxa_fixa >= 0 and taxa_fixa <= 200),
  valor_por_km numeric(10,2) not null default 2
    check (valor_por_km >= 0 and valor_por_km <= 50),
  taxa_maxima numeric(10,2) not null default 40
    check (taxa_maxima > 0 and taxa_maxima <= 200),
  distancia_maxima_km numeric(8,2) not null default 30
    check (distancia_maxima_km > 0 and distancia_maxima_km <= 100),
  endereco_origem text,
  origem_latitude numeric(9,6)
    check (origem_latitude is null or origem_latitude between -90 and 90),
  origem_longitude numeric(9,6)
    check (origem_longitude is null or origem_longitude between -180 and 180),
  atualizado_em timestamptz not null default now(),
  check (
    tipo_taxa <> 'por_km'
    or (endereco_origem is not null and origem_latitude is not null and origem_longitude is not null)
  )
);

-- Cidades vizinhas com taxa própria — o modo "avançado".
--
-- Por que uma tabela e não um jsonb na linha da configuração: cada cidade é
-- consultada isoladamente na hora da cotação, e a chave primária composta
-- impede duplicata da mesma cidade com grafias diferentes.
--
-- `cidade_normalizada` é gravada sem acento e em minúscula pela aplicação
-- (lib/delivery/tipos.ts, normalizarTexto). A comparação acontece por ela, e
-- `cidade` guarda a grafia bonita pra exibir. Sem isso, "São Paulo" e
-- "sao paulo" viravam duas cidades diferentes.
create table if not exists public.configuracoes_delivery_cidades (
  loja_id uuid not null references public.configuracoes_delivery(loja_id) on delete cascade,
  cidade_normalizada text not null,
  cidade text not null,
  taxa numeric(10,2) not null check (taxa >= 0 and taxa <= 200),
  primary key (loja_id, cidade_normalizada)
);

alter table public.configuracoes_delivery_cidades enable row level security;
revoke all on table public.configuracoes_delivery_cidades from public, anon;
grant select on table public.configuracoes_delivery_cidades to authenticated;

drop policy if exists "Dono le cidades da propria loja" on public.configuracoes_delivery_cidades;
create policy "Dono le cidades da propria loja"
on public.configuracoes_delivery_cidades for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.lojas l
    where l.id = loja_id and l.dono_id = auth.uid()
  )
);

alter table public.configuracoes_delivery enable row level security;
revoke all on table public.configuracoes_delivery from public, anon;
grant select on table public.configuracoes_delivery to authenticated;

drop policy if exists "Dono le delivery da propria loja" on public.configuracoes_delivery;
create policy "Dono le delivery da propria loja"
on public.configuracoes_delivery for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.lojas l
    where l.id = loja_id and l.dono_id = auth.uid()
  )
);

-- Contadores privados usados pela API server-side. Nenhuma policy: somente
-- service_role e as funções SECURITY DEFINER autorizadas os acessam.
create table if not exists public.delivery_cotacao_limites (
  chave text not null,
  janela timestamptz not null,
  quantidade integer not null default 0,
  primary key (chave, janela)
);
alter table public.delivery_cotacao_limites enable row level security;
revoke all on table public.delivery_cotacao_limites from public, anon, authenticated;

create table if not exists public.delivery_consumo_diario (
  dia date primary key,
  cotacoes_rota integer not null default 0
);
alter table public.delivery_consumo_diario enable row level security;
revoke all on table public.delivery_consumo_diario from public, anon, authenticated;

create or replace function public.inicializar_config_delivery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.configuracoes_delivery (
    loja_id, cidade_atendida, taxa_fixa
  ) values (
    new.id,
    coalesce(nullif(trim(new.cidade), ''), 'Cidade não configurada'),
    greatest(coalesce(new.taxa_entrega, 0), 0)
  ) on conflict (loja_id) do nothing;
  return new;
end;
$$;
revoke execute on function public.inicializar_config_delivery() from public, anon, authenticated;

drop trigger if exists trg_inicializar_config_delivery on public.lojas;
create trigger trg_inicializar_config_delivery
after insert on public.lojas
for each row execute function public.inicializar_config_delivery();

insert into public.configuracoes_delivery (loja_id, cidade_atendida, taxa_fixa)
select
  id,
  coalesce(nullif(trim(cidade), ''), 'Cidade não configurada'),
  greatest(coalesce(taxa_entrega, 0), 0)
from public.lojas
on conflict (loja_id) do nothing;

-- O cardápio só precisa saber se usa o fluxo novo e qual rótulo mostrar.
-- Valores, endereço e coordenadas permanecem fora da leitura pública.
create or replace function public.config_delivery_publica(p_loja_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'configurada',
        cd.cidade_atendida <> 'Cidade não configurada'
        and (
          cd.tipo_taxa = 'fixa'
          or (cd.origem_latitude is not null and cd.origem_longitude is not null)
        ),
      'tipo_taxa', cd.tipo_taxa,
      'setor', cd.setor,
      'cidade', cd.cidade_atendida,
      -- No modo avançado o cliente ESCOLHE a cidade numa lista, em vez de a
      -- gente geocodificar o endereço. É o que mantém a promessa de não
      -- gastar crédito de Geoapify fora do modo por km. Por isso a lista de
      -- cidades é pública: sem ela o cliente não teria o que escolher.
      -- A taxa de cada cidade também vai junto, porque ela aparece na tela
      -- antes do pedido — não é segredo, é preço de tabela.
      'cidades', case when cd.setor = 'avancado' then coalesce((
        select jsonb_agg(jsonb_build_object('cidade', c.cidade, 'taxa', c.taxa) order by c.cidade)
        from public.configuracoes_delivery_cidades c
        where c.loja_id = cd.loja_id
      ), '[]'::jsonb) else '[]'::jsonb end
    )
    from public.configuracoes_delivery cd
    where cd.loja_id = p_loja_id
  ), jsonb_build_object(
    'configurada', false, 'tipo_taxa', 'fixa', 'setor', 'facilitado',
    'cidade', null, 'cidades', '[]'::jsonb
  ));
$$;
revoke execute on function public.config_delivery_publica(uuid) from public;
grant execute on function public.config_delivery_publica(uuid) to anon, authenticated;

-- Escrita atômica usada exclusivamente pela rota administrativa server-side.
-- O navegador não recebe service_role e não consegue informar coordenadas
-- falsas diretamente a esta função.
create or replace function public.salvar_config_delivery(
  p_loja_id uuid,
  p_tipo_taxa text,
  p_cidade text,
  p_taxa_fixa numeric,
  p_valor_por_km numeric,
  p_taxa_maxima numeric,
  p_distancia_maxima_km numeric,
  p_endereco_origem text,
  p_origem_latitude numeric,
  p_origem_longitude numeric,
  p_setor text default 'facilitado',
  -- [{ "cidade": "Campina Grande", "cidade_normalizada": "campina grande", "taxa": 12.50 }]
  -- A normalização vem pronta da aplicação: fazer isso em SQL exigiria a
  -- extensão unaccent, que nem todo projeto Supabase tem habilitada.
  p_cidades jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cidade jsonb;
begin
  if p_setor not in ('facilitado', 'avancado') then
    raise exception 'Setor de entrega inválido.' using errcode = '22023';
  end if;
  if p_cidades is null or jsonb_typeof(p_cidades) <> 'array' or jsonb_array_length(p_cidades) > 60 then
    raise exception 'Lista de cidades inválida.' using errcode = '22023';
  end if;
  if p_tipo_taxa not in ('fixa', 'por_km')
     or p_cidade is null or length(trim(p_cidade)) < 2
     or p_taxa_fixa < 0 or p_taxa_fixa > 200
     or p_valor_por_km < 0 or p_valor_por_km > 50
     or p_taxa_maxima <= 0 or p_taxa_maxima > 200
     or p_distancia_maxima_km <= 0 or p_distancia_maxima_km > 100 then
    raise exception 'Configuração de delivery inválida.' using errcode = '22023';
  end if;
  if p_tipo_taxa = 'fixa' and p_taxa_fixa > p_taxa_maxima then
    raise exception 'Taxa fixa acima do teto de segurança.' using errcode = '22023';
  end if;
  if p_tipo_taxa = 'por_km' and (
    p_endereco_origem is null or p_origem_latitude is null or p_origem_longitude is null
  ) then
    raise exception 'Origem da rota obrigatória.' using errcode = '22023';
  end if;

  insert into public.configuracoes_delivery (
    loja_id, setor, tipo_taxa, cidade_atendida, taxa_fixa, valor_por_km,
    taxa_maxima, distancia_maxima_km, endereco_origem,
    origem_latitude, origem_longitude, atualizado_em
  ) values (
    p_loja_id, p_setor, p_tipo_taxa, trim(p_cidade), p_taxa_fixa,
    p_valor_por_km, p_taxa_maxima, p_distancia_maxima_km,
    nullif(trim(coalesce(p_endereco_origem, '')), ''),
    p_origem_latitude, p_origem_longitude, now()
  ) on conflict (loja_id) do update set
    setor = excluded.setor,
    tipo_taxa = excluded.tipo_taxa,
    cidade_atendida = excluded.cidade_atendida,
    taxa_fixa = excluded.taxa_fixa,
    valor_por_km = excluded.valor_por_km,
    taxa_maxima = excluded.taxa_maxima,
    distancia_maxima_km = excluded.distancia_maxima_km,
    endereco_origem = excluded.endereco_origem,
    origem_latitude = excluded.origem_latitude,
    origem_longitude = excluded.origem_longitude,
    atualizado_em = now();

  -- Cidades vizinhas: regrava o conjunto inteiro dentro da MESMA transação
  -- da configuração. Apagar antes e inserir depois, em chamadas separadas,
  -- deixaria a loja sem nenhuma cidade se a segunda falhasse — o mesmo erro
  -- que a edição de listas do catálogo cometia.
  delete from public.configuracoes_delivery_cidades where loja_id = p_loja_id;

  if p_setor = 'avancado' then
    for v_cidade in select * from jsonb_array_elements(p_cidades) loop
      if coalesce(trim(v_cidade->>'cidade'), '') = ''
         or coalesce(trim(v_cidade->>'cidade_normalizada'), '') = ''
         or (v_cidade->>'taxa')::numeric < 0
         or (v_cidade->>'taxa')::numeric > p_taxa_maxima then
        raise exception 'Cidade vizinha inválida ou acima do teto de segurança.' using errcode = '22023';
      end if;
      insert into public.configuracoes_delivery_cidades (loja_id, cidade_normalizada, cidade, taxa)
      values (
        p_loja_id,
        trim(v_cidade->>'cidade_normalizada'),
        trim(v_cidade->>'cidade'),
        (v_cidade->>'taxa')::numeric
      )
      on conflict (loja_id, cidade_normalizada) do update set
        cidade = excluded.cidade,
        taxa = excluded.taxa;
    end loop;
  end if;

  -- Mantém compatibilidade com telas antigas que ainda exibem esta coluna.
  update public.lojas
  set taxa_entrega = case when p_tipo_taxa = 'fixa' then p_taxa_fixa else 0 end
  where id = p_loja_id;
end;
$$;
revoke execute on function public.salvar_config_delivery(uuid,text,text,numeric,numeric,numeric,numeric,text,numeric,numeric,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.salvar_config_delivery(uuid,text,text,numeric,numeric,numeric,numeric,text,numeric,numeric,text,jsonb)
  to service_role;

-- Reserva capacidade antes de chamar o provedor: 10 tentativas/minuto por
-- origem e, no modo por km, no máximo 1.400 rotas/dia. Cada cotação usa em
-- geral 2 dos 3.000 créditos gratuitos (geocoding + routing), deixando margem.
create or replace function public.consumir_cota_delivery(
  p_chave text,
  p_usa_rota boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_janela timestamptz := date_trunc('minute', now());
  v_quantidade integer;
  v_diario integer;
begin
  if p_chave is null or length(p_chave) <> 64 then
    raise exception 'Chave de limite inválida.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('delivery:' || p_chave || ':' || v_janela::text));
  insert into public.delivery_cotacao_limites (chave, janela, quantidade)
  values (p_chave, v_janela, 1)
  on conflict (chave, janela) do update
    set quantidade = public.delivery_cotacao_limites.quantidade + 1
  returning quantidade into v_quantidade;

  if v_quantidade > 10 then
    return jsonb_build_object('permitido', false, 'motivo', 'MUITAS_TENTATIVAS');
  end if;

  if p_usa_rota then
    perform pg_advisory_xact_lock(hashtext('delivery-global:' || current_date::text));
    insert into public.delivery_consumo_diario (dia, cotacoes_rota)
    values (current_date, 1)
    on conflict (dia) do update
      set cotacoes_rota = public.delivery_consumo_diario.cotacoes_rota + 1
    returning cotacoes_rota into v_diario;

    if v_diario > 1400 then
      return jsonb_build_object('permitido', false, 'motivo', 'LIMITE_DIARIO');
    end if;
  end if;

  delete from public.delivery_cotacao_limites where janela < now() - interval '2 days';
  delete from public.delivery_consumo_diario where dia < current_date - 7;
  return jsonb_build_object('permitido', true);
end;
$$;
revoke execute on function public.consumir_cota_delivery(text, boolean) from public, anon, authenticated;
grant execute on function public.consumir_cota_delivery(text, boolean) to service_role;

commit;

-- Conferência: uma configuração por loja e nenhum valor fora dos limites.
select
  (select count(*) from public.lojas) as lojas,
  (select count(*) from public.configuracoes_delivery) as configuracoes;

select * from public.configuracoes_delivery
where taxa_fixa < 0 or valor_por_km < 0 or taxa_maxima > 200
   or distancia_maxima_km > 100;
