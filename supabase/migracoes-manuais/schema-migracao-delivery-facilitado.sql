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

-- Checkout público V2: aplica a taxa assinada pelo servidor dentro da mesma
-- transação que cria o pedido. O navegador nunca chama esta RPC diretamente.
create or replace function public.criar_pedido_publico_v2(
  p_loja_slug text,
  p_cliente_nome text,
  p_cliente_telefone text,
  p_tipo text,
  p_endereco text,
  p_observacao text,
  p_itens jsonb,
  p_idempotency_key uuid,
  p_payload_hash text,
  p_total_esperado_centavos integer,
  p_chave_ip text,
  p_chave_telefone text,
  p_taxa_entrega_validada numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resultado jsonb;
  v_pedido record;
  v_total_centavos integer;
  v_taxa_maxima numeric;
begin
  if p_tipo <> 'delivery' or p_taxa_entrega_validada is null
     or p_taxa_entrega_validada < 0 or p_taxa_entrega_validada > 200 then
    raise exception 'Cotação de entrega inválida.' using errcode = '22023';
  end if;
  select cd.taxa_maxima into v_taxa_maxima
  from public.configuracoes_delivery cd
  join public.lojas l on l.id = cd.loja_id
  where l.slug = p_loja_slug;
  if v_taxa_maxima is null or p_taxa_entrega_validada > v_taxa_maxima then
    raise exception 'Cotação acima do limite seguro.' using errcode = '22023';
  end if;

  -- A V1 continua responsável por idempotência, rate limit e validação do
  -- catálogo. O total do cliente é conferido abaixo, depois da taxa dinâmica.
  v_resultado := public.criar_pedido_publico_v1(
    p_loja_slug, p_cliente_nome, p_cliente_telefone, p_tipo, p_endereco,
    p_observacao, p_itens, p_idempotency_key, p_payload_hash, null,
    p_chave_ip, p_chave_telefone
  );

  update public.pedidos
  set taxa_entrega = round(p_taxa_entrega_validada, 2),
      total = subtotal + round(p_taxa_entrega_validada, 2)
  where id = (v_resultado->>'id')::uuid
  returning id, numero, token, subtotal, taxa_entrega, total into v_pedido;

  if not found then raise exception 'Pedido não encontrado.'; end if;
  v_total_centavos := round(v_pedido.total * 100);
  if p_total_esperado_centavos is not null
     and abs(v_total_centavos - p_total_esperado_centavos) > 5 then
    raise exception 'CART_CHANGED' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'id', v_pedido.id, 'numero', v_pedido.numero, 'token', v_pedido.token,
    'subtotal', v_pedido.subtotal, 'taxa_entrega', v_pedido.taxa_entrega,
    'total', v_pedido.total, 'replay', coalesce((v_resultado->>'replay')::boolean, false)
  );
end;
$$;
revoke execute on function public.criar_pedido_publico_v2(
  text,text,text,text,text,text,jsonb,uuid,text,integer,text,text,numeric
) from public, anon, authenticated;
grant execute on function public.criar_pedido_publico_v2(
  text,text,text,text,text,text,jsonb,uuid,text,integer,text,text,numeric
) to service_role;

-- Conferência: uma configuração por loja e nenhum valor fora dos limites.
select
  (select count(*) from public.lojas) as lojas,
  (select count(*) from public.configuracoes_delivery) as configuracoes;

select * from public.configuracoes_delivery
where taxa_fixa < 0 or valor_por_km < 0 or taxa_maxima > 200
   or distancia_maxima_km > 100;

-- ---------------------------------------------------------------------------
-- V2 — endereço do estabelecimento estruturado
-- ---------------------------------------------------------------------------
begin;

create table if not exists public.enderecos_estabelecimento (
  loja_id uuid primary key references public.lojas(id) on delete cascade,
  cep text not null check (cep ~ '^[0-9]{8}$'),
  logradouro text not null check (length(trim(logradouro)) between 3 and 120),
  numero text not null check (length(trim(numero)) between 1 and 20),
  bairro text not null check (length(trim(bairro)) between 2 and 80),
  cidade text not null check (length(trim(cidade)) between 2 and 100),
  uf text not null check (uf ~ '^[A-Z]{2}$'),
  complemento text check (complemento is null or length(complemento) <= 100),
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  endereco_formatado text not null,
  atualizado_em timestamptz not null default now()
);

alter table public.enderecos_estabelecimento enable row level security;
revoke all on table public.enderecos_estabelecimento from public, anon;
grant select on table public.enderecos_estabelecimento to authenticated;
drop policy if exists "Dono le endereco do estabelecimento" on public.enderecos_estabelecimento;
create policy "Dono le endereco do estabelecimento"
on public.enderecos_estabelecimento for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.lojas l
    where l.id = loja_id and l.dono_id = auth.uid()
  )
);

create or replace function public.config_delivery_publica(p_loja_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'configurada', e.loja_id is not null and (
        cd.tipo_taxa = 'fixa' or (e.latitude is not null and e.longitude is not null)
      ),
      'tipo_taxa', cd.tipo_taxa,
      'setor', cd.setor,
      'cidade', coalesce(e.cidade, cd.cidade_atendida),
      'endereco_retirada', case when e.loja_id is null then null else
        e.logradouro || ', ' || e.numero || ' — ' || e.bairro || ', ' || e.cidade || '/' || e.uf
      end,
      'cidades', case when cd.setor = 'avancado' then coalesce((
        select jsonb_agg(jsonb_build_object('cidade', c.cidade, 'taxa', c.taxa) order by c.cidade)
        from public.configuracoes_delivery_cidades c where c.loja_id = cd.loja_id
      ), '[]'::jsonb) else '[]'::jsonb end
    )
    from public.configuracoes_delivery cd
    left join public.enderecos_estabelecimento e on e.loja_id = cd.loja_id
    where cd.loja_id = p_loja_id
  ), jsonb_build_object(
    'configurada', false, 'tipo_taxa', 'fixa', 'setor', 'facilitado',
    'cidade', null, 'endereco_retirada', null, 'cidades', '[]'::jsonb
  ));
$$;
revoke execute on function public.config_delivery_publica(uuid) from public;
grant execute on function public.config_delivery_publica(uuid) to anon, authenticated;

create or replace function public.salvar_config_delivery_v2(
  p_loja_id uuid,
  p_setor text,
  p_tipo_taxa text,
  p_taxa_fixa numeric,
  p_valor_por_km numeric,
  p_taxa_maxima numeric,
  p_distancia_maxima_km numeric,
  p_cep text,
  p_logradouro text,
  p_numero text,
  p_bairro text,
  p_cidade text,
  p_uf text,
  p_complemento text,
  p_latitude numeric,
  p_longitude numeric,
  p_endereco_formatado text,
  p_cidades jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_cidade jsonb;
begin
  if p_setor not in ('facilitado', 'avancado') or p_tipo_taxa not in ('fixa', 'por_km')
     or p_cep !~ '^[0-9]{8}$' or p_uf !~ '^[A-Z]{2}$'
     or length(trim(p_logradouro)) not between 3 and 120
     or length(trim(p_numero)) not between 1 and 20
     or length(trim(p_bairro)) not between 2 and 80
     or length(trim(p_cidade)) not between 2 and 100
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180
     or p_taxa_fixa < 0 or p_taxa_fixa > 200
     or p_valor_por_km < 0 or p_valor_por_km > 50
     or p_taxa_maxima <= 0 or p_taxa_maxima > 200
     or p_distancia_maxima_km <= 0 or p_distancia_maxima_km > 100
     or p_cidades is null or jsonb_typeof(p_cidades) <> 'array' or jsonb_array_length(p_cidades) > 60 then
    raise exception 'Configuração de delivery inválida.' using errcode = '22023';
  end if;
  if p_tipo_taxa = 'fixa' and p_taxa_fixa > p_taxa_maxima then
    raise exception 'Taxa fixa acima do teto de segurança.' using errcode = '22023';
  end if;

  insert into public.enderecos_estabelecimento (
    loja_id, cep, logradouro, numero, bairro, cidade, uf, complemento,
    latitude, longitude, endereco_formatado, atualizado_em
  ) values (
    p_loja_id, p_cep, trim(p_logradouro), trim(p_numero), trim(p_bairro),
    trim(p_cidade), p_uf, nullif(trim(coalesce(p_complemento, '')), ''),
    p_latitude, p_longitude, p_endereco_formatado, now()
  ) on conflict (loja_id) do update set
    cep = excluded.cep, logradouro = excluded.logradouro, numero = excluded.numero,
    bairro = excluded.bairro, cidade = excluded.cidade, uf = excluded.uf,
    complemento = excluded.complemento, latitude = excluded.latitude,
    longitude = excluded.longitude, endereco_formatado = excluded.endereco_formatado,
    atualizado_em = now();

  insert into public.configuracoes_delivery (
    loja_id, setor, tipo_taxa, cidade_atendida, taxa_fixa, valor_por_km,
    taxa_maxima, distancia_maxima_km, endereco_origem,
    origem_latitude, origem_longitude, atualizado_em
  ) values (
    p_loja_id, p_setor, p_tipo_taxa, trim(p_cidade), p_taxa_fixa, p_valor_por_km,
    p_taxa_maxima, p_distancia_maxima_km, p_endereco_formatado,
    p_latitude, p_longitude, now()
  ) on conflict (loja_id) do update set
    setor = excluded.setor, tipo_taxa = excluded.tipo_taxa,
    cidade_atendida = excluded.cidade_atendida, taxa_fixa = excluded.taxa_fixa,
    valor_por_km = excluded.valor_por_km, taxa_maxima = excluded.taxa_maxima,
    distancia_maxima_km = excluded.distancia_maxima_km,
    endereco_origem = excluded.endereco_origem,
    origem_latitude = excluded.origem_latitude,
    origem_longitude = excluded.origem_longitude, atualizado_em = now();

  delete from public.configuracoes_delivery_cidades where loja_id = p_loja_id;
  if p_setor = 'avancado' then
    for v_cidade in select * from jsonb_array_elements(p_cidades) loop
      if coalesce(trim(v_cidade->>'cidade'), '') = ''
         or coalesce(trim(v_cidade->>'cidade_normalizada'), '') = ''
         or (v_cidade->>'taxa')::numeric < 0
         or (v_cidade->>'taxa')::numeric > p_taxa_maxima then
        raise exception 'Cidade vizinha inválida.' using errcode = '22023';
      end if;
      insert into public.configuracoes_delivery_cidades (loja_id, cidade_normalizada, cidade, taxa)
      values (p_loja_id, trim(v_cidade->>'cidade_normalizada'), trim(v_cidade->>'cidade'), (v_cidade->>'taxa')::numeric);
    end loop;
  end if;

  update public.lojas set
    cidade = trim(p_cidade),
    taxa_entrega = case when p_tipo_taxa = 'fixa' then p_taxa_fixa else 0 end
  where id = p_loja_id;
end;
$$;
revoke execute on function public.salvar_config_delivery_v2(
  uuid,text,text,numeric,numeric,numeric,numeric,text,text,text,text,text,text,text,numeric,numeric,text,jsonb
) from public, anon, authenticated;
grant execute on function public.salvar_config_delivery_v2(
  uuid,text,text,numeric,numeric,numeric,numeric,text,text,text,text,text,text,text,numeric,numeric,text,jsonb
) to service_role;

commit;

-- HOTFIX: taxa fixa não depende da Geoapify. Coordenadas podem ficar nulas
-- até a loja escolher o cálculo por quilômetro, quando a API administrativa
-- volta a exigir e validar a geocodificação antes de salvar.
begin;
alter table public.enderecos_estabelecimento alter column latitude drop not null;
alter table public.enderecos_estabelecimento alter column longitude drop not null;
commit;
