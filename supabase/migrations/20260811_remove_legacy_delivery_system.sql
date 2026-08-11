-- Remove a implementacao legada de Delivery sem reconstruir o modulo.
-- Preserva pedidos, encomendas, retirada, pagamentos, RLS e isolamento por loja.
--
-- Esta migration e deliberadamente explicita: nao usa CASCADE e remove primeiro
-- os objetos dependentes conhecidos. Se existir uma dependencia nao auditada,
-- o PostgreSQL interrompera a transacao em vez de remove-la silenciosamente.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. RPCs antigas e funcoes compartilhadas que precisam ser substituidas
-- ---------------------------------------------------------------------------

-- Permite reaplicar a migration em ambientes locais sem deixar dependencia da
-- RPC limpa sobre o nucleo que sera recriado nesta mesma transacao.
drop function if exists public.criar_pedido_publico_retirada_v1(
  text,text,text,text,text,jsonb,uuid,text,integer,text,text
);

-- Wrappers exclusivos do checkout com Delivery, do mais externo para o nucleo.
drop function if exists public.criar_pedido_publico_offline_v2(
  text,text,text,text,text,text,text,jsonb,uuid,text,integer,text,text,numeric,jsonb
);
drop function if exists public.criar_pedido_publico_offline_v1(
  text,text,text,text,text,text,text,jsonb,uuid,text,integer,text,text,numeric
);
drop function if exists public.criar_pedido_publico_v2(
  text,text,text,text,text,text,jsonb,uuid,text,integer,text,text,numeric
);
drop function if exists public.criar_pedido_publico_v1(
  text,text,text,text,text,text,jsonb,uuid,text,integer,text,text
);

-- Funcoes compartilhadas sao recriadas adiante sem campos/status de Delivery.
drop function if exists public.criar_pedido(
  text,text,text,text,text,text,text,jsonb,timestamptz,text,text
);
drop function if exists public.pedido_por_token(text);
drop function if exists public.transicionar_pedido(uuid,text,text);

-- Triggers em tabelas compartilhadas: um e exclusivamente de Delivery; o outro
-- sera recriado apenas com as regras gerais e de retirada.
do $cleanup_shared_triggers$
begin
  if to_regclass('public.lojas') is not null then
    execute 'drop trigger if exists trg_inicializar_config_delivery on public.lojas';
    execute 'drop trigger if exists cf_normalizar_operacao_loja on public.lojas';
  end if;

  if to_regclass('public.pedidos') is not null then
    execute 'drop trigger if exists cf_pedidos_taxa_entrega_cents on public.pedidos';
    execute 'drop trigger if exists cf_validar_operacao_pedido_site on public.pedidos';
  end if;
end
$cleanup_shared_triggers$;

drop function if exists public.inicializar_config_delivery();
drop function if exists public.cf_normalizar_operacao_loja();
drop function if exists public.cf_derivar_taxa_entrega_cents();
drop function if exists public.cf_validar_operacao_pedido_site();

-- Funcoes/RPCs exclusivas das configuracoes, cotacao e endereco legados.
drop function if exists public.config_delivery_publica(uuid);
drop function if exists public.salvar_config_delivery(
  uuid,text,text,numeric,numeric,numeric,numeric,text,numeric,numeric,text,jsonb
);
drop function if exists public.salvar_config_delivery_v2(
  uuid,text,text,numeric,numeric,numeric,numeric,
  text,text,text,text,text,text,text,numeric,numeric,text,jsonb
);
drop function if exists public.consumir_cota_delivery(text,boolean);

-- Triggers internos das tabelas legadas.
do $cleanup_delivery_triggers$
begin
  if to_regclass('public.store_delivery_settings') is not null then
    execute 'drop trigger if exists cf_store_delivery_settings_updated_at on public.store_delivery_settings';
  end if;

  if to_regclass('public.delivery_fee_overrides') is not null then
    execute 'drop trigger if exists cf_delivery_fee_overrides_updated_at on public.delivery_fee_overrides';
  end if;
end
$cleanup_delivery_triggers$;

drop function if exists public.cf_tocar_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Normalizacao explicita dos dados de teste preservados
-- ---------------------------------------------------------------------------

-- Pedidos de Delivery de teste passam a ser retirada, sem endereco/tipo de
-- pagamento especifico de entrega. O status antigo volta ao ultimo estado
-- operacional neutro antes da conclusao.
update public.pedidos
set
  tipo = 'retirada',
  endereco = null,
  forma_pagamento = case
    when forma_pagamento = 'dinheiro_entrega' then 'dinheiro'
    when forma_pagamento = 'cartao_credito_entrega' then 'cartao_credito'
    when forma_pagamento = 'cartao_debito_entrega' then 'cartao_debito'
    else forma_pagamento
  end,
  status = case when status = 'saiu_entrega' then 'pronto' else status end
where tipo = 'delivery';

update public.pedidos
set forma_pagamento = case
  when forma_pagamento = 'dinheiro_entrega' then 'dinheiro'
  when forma_pagamento = 'cartao_credito_entrega' then 'cartao_credito'
  when forma_pagamento = 'cartao_debito_entrega' then 'cartao_debito'
  else forma_pagamento
end
where forma_pagamento in (
  'dinheiro_entrega',
  'cartao_credito_entrega',
  'cartao_debito_entrega'
);

update public.pedidos
set status = 'pronto'
where status = 'saiu_entrega';

-- Remove a parcela de entrega dos totais de teste antes de apagar as colunas.
-- Os blocos condicionais tornam esta parte segura caso a migration seja
-- reexecutada por uma ferramenta de desenvolvimento.
do $normalize_delivery_values$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pedidos'
      and column_name = 'taxa_entrega'
  ) then
    execute $sql$
      update public.pedidos
      set total = greatest(0, total - coalesce(taxa_entrega, 0)),
          taxa_entrega = 0
      where taxa_entrega is distinct from 0
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pedidos'
      and column_name = 'taxa_entrega_cents'
  ) then
    execute 'update public.pedidos set taxa_entrega_cents = 0 where taxa_entrega_cents is distinct from 0';
  end if;
end
$normalize_delivery_values$;

-- tipos_pedido e compartilhado pelo catalogo. Remove apenas o canal Delivery;
-- se ele era o unico canal explicito, retirada vira o fallback seguro.
update public.produtos
set tipos_pedido = case
  when cardinality(array_remove(tipos_pedido, 'delivery')) = 0
    then array['retirada']::text[]
  else array_remove(tipos_pedido, 'delivery')
end
where 'delivery' = any(tipos_pedido);

update public.grupos_complemento
set tipos_pedido = case
  when cardinality(array_remove(tipos_pedido, 'delivery')) = 0
    then array['retirada']::text[]
  else array_remove(tipos_pedido, 'delivery')
end
where 'delivery' = any(tipos_pedido);

-- ---------------------------------------------------------------------------
-- 3. Constraints compartilhadas sem os valores legados
-- ---------------------------------------------------------------------------

alter table if exists public.pedidos
  drop constraint if exists pedidos_tipo_check;
alter table if exists public.pedidos
  drop constraint if exists pedidos_status_check;

alter table public.pedidos
  add constraint pedidos_tipo_check
  check (tipo in ('retirada','balcao','mesa','encomenda'));

alter table public.pedidos
  add constraint pedidos_status_check
  check (status in ('pendente','confirmado','em_preparo','pronto','concluido','cancelado'));

-- Esta constraint combinava taxa_entrega e pedido_minimo. Mantemos somente a
-- garantia geral do pedido minimo.
alter table if exists public.lojas
  drop constraint if exists lojas_valores_nao_negativos;

-- ---------------------------------------------------------------------------
-- 4. Policies, indexes e FKs das oito tabelas legadas
-- ---------------------------------------------------------------------------

do $cleanup_delivery_policies$
begin
  if to_regclass('public.configuracoes_delivery_cidades') is not null then
    execute 'drop policy if exists "Dono le cidades da propria loja" on public.configuracoes_delivery_cidades';
  end if;
  if to_regclass('public.configuracoes_delivery') is not null then
    execute 'drop policy if exists "Dono le delivery da propria loja" on public.configuracoes_delivery';
  end if;
  if to_regclass('public.enderecos_estabelecimento') is not null then
    execute 'drop policy if exists "Dono le endereco do estabelecimento" on public.enderecos_estabelecimento';
  end if;
  if to_regclass('public.store_delivery_settings') is not null then
    execute 'drop policy if exists "Dono le configuracao de entrega da propria loja" on public.store_delivery_settings';
  end if;
  if to_regclass('public.delivery_fee_overrides') is not null then
    execute 'drop policy if exists "Dono le taxas especificas da propria loja" on public.delivery_fee_overrides';
  end if;
  if to_regclass('public.pedido_entrega_snapshot') is not null then
    execute 'drop policy if exists "Dono le snapshot de entrega da propria loja" on public.pedido_entrega_snapshot';
  end if;
end
$cleanup_delivery_policies$;

drop index if exists public.pedido_entrega_snapshot_loja;
drop index if exists public.delivery_fee_overrides_busca;
drop index if exists public.delivery_fee_overrides_bairro_unico;
drop index if exists public.delivery_fee_overrides_cidade_unica;

-- FKs sao removidas nominalmente; nenhuma dependencia e derrubada por CASCADE.
alter table if exists public.pedido_entrega_snapshot
  drop constraint if exists pedido_entrega_snapshot_pedido_id_fkey;
alter table if exists public.pedido_entrega_snapshot
  drop constraint if exists pedido_entrega_snapshot_loja_id_fkey;
alter table if exists public.delivery_fee_overrides
  drop constraint if exists delivery_fee_overrides_store_id_fkey;
alter table if exists public.store_delivery_settings
  drop constraint if exists store_delivery_settings_store_id_fkey;
alter table if exists public.configuracoes_delivery_cidades
  drop constraint if exists configuracoes_delivery_cidades_loja_id_fkey;
alter table if exists public.configuracoes_delivery
  drop constraint if exists configuracoes_delivery_loja_id_fkey;
alter table if exists public.enderecos_estabelecimento
  drop constraint if exists enderecos_estabelecimento_loja_id_fkey;

-- Ordem: filhos de pedidos/lojas antes dos pais internos; contadores sem FK no fim.
drop table if exists public.pedido_entrega_snapshot;
drop table if exists public.delivery_fee_overrides;
drop table if exists public.store_delivery_settings;
drop table if exists public.configuracoes_delivery_cidades;
drop table if exists public.configuracoes_delivery;
drop table if exists public.enderecos_estabelecimento;
drop table if exists public.delivery_cotacao_limites;
drop table if exists public.delivery_consumo_diario;

-- A normalizacao era usada somente pelo backfill/lookup do Delivery v3.
drop function if exists public.cf_normalizar_texto(text);

-- ---------------------------------------------------------------------------
-- 5. Colunas compartilhadas exclusivamente ligadas ao Delivery antigo
-- ---------------------------------------------------------------------------

-- O intervalo continua sendo um SLA geral da operacao. Renomeamos, em vez de
-- apagar, para retirar a semantica de entrega sem perder os valores existentes.
-- O ramo de consolidacao cobre ambientes de desenvolvimento que eventualmente
-- ja tenham criado os nomes novos antes de reaplicar esta migration.
do $rename_preparation_sla$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lojas'
      and column_name = 'tempo_entrega_min'
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'lojas'
        and column_name = 'tempo_preparo_min'
    ) then
      execute $sql$
        update public.lojas
        set tempo_preparo_min = coalesce(tempo_preparo_min, tempo_entrega_min)
        where tempo_preparo_min is null and tempo_entrega_min is not null
      $sql$;
      execute 'alter table public.lojas drop column tempo_entrega_min';
    else
      execute 'alter table public.lojas rename column tempo_entrega_min to tempo_preparo_min';
    end if;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lojas'
      and column_name = 'tempo_entrega_max'
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'lojas'
        and column_name = 'tempo_preparo_max'
    ) then
      execute $sql$
        update public.lojas
        set tempo_preparo_max = coalesce(tempo_preparo_max, tempo_entrega_max)
        where tempo_preparo_max is null and tempo_entrega_max is not null
      $sql$;
      execute 'alter table public.lojas drop column tempo_entrega_max';
    else
      execute 'alter table public.lojas rename column tempo_entrega_max to tempo_preparo_max';
    end if;
  end if;
end
$rename_preparation_sla$;

-- A migration de seguranca concedia essas duas colunas antigas ao cardapio
-- publico. Reaplicamos a mesma permissao nos nomes gerais (sem ampliar acesso).
do $preserve_preparation_sla_grants$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lojas'
      and column_name = 'tempo_preparo_min'
  ) then
    execute 'grant select (tempo_preparo_min) on public.lojas to anon';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lojas'
      and column_name = 'tempo_preparo_max'
  ) then
    execute 'grant select (tempo_preparo_max) on public.lojas to anon';
  end if;
end
$preserve_preparation_sla_grants$;

alter table if exists public.lojas
  drop column if exists delivery_ativo;
alter table if exists public.lojas
  drop column if exists taxa_entrega;

alter table if exists public.pedidos
  drop column if exists taxa_entrega_cents;
alter table if exists public.pedidos
  drop column if exists taxa_entrega;

alter table public.lojas
  add constraint lojas_valores_nao_negativos
  check (pedido_minimo >= 0);

-- ---------------------------------------------------------------------------
-- 6. Nucleo compartilhado de pedidos, agora sem Delivery
-- ---------------------------------------------------------------------------

create function public.criar_pedido(
  p_loja_slug text,
  p_cliente_nome text,
  p_cliente_telefone text,
  p_tipo text,
  p_endereco text,
  p_observacao text,
  p_forma_pagamento text,
  p_itens jsonb,
  p_data_hora_agendada timestamptz default null,
  p_origem text default 'site',
  p_status_inicial text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loja lojas%rowtype;
  v_numero integer;
  v_pedido_id uuid;
  v_token text;
  v_item jsonb;
  v_opcao jsonb;
  v_produto produtos%rowtype;
  v_compl complementos%rowtype;
  v_grupo grupos_complemento%rowtype;
  v_item_id uuid;
  v_qtd integer;
  v_preco_base numeric(10,2);
  v_extra numeric(10,2);
  v_unitario numeric(10,2);
  v_subtotal numeric(10,2) := 0;
  v_grupo_id uuid;
  v_precos numeric[];
  v_status_final text := 'pendente';
  v_sou_dono boolean := false;
  v_opcoes jsonb;
  v_qtd_opcao integer;
  v_escolhas integer;
  v_distintas integer;
begin
  if p_cliente_nome is null or length(trim(p_cliente_nome)) < 2 then
    raise exception 'Informe o nome de quem esta pedindo.';
  end if;

  if p_tipo not in ('balcao','mesa') then
    if p_cliente_telefone is null
       or length(regexp_replace(p_cliente_telefone, '\D', '', 'g')) < 10 then
      raise exception 'Informe um telefone valido com DDD.';
    end if;
  elsif p_cliente_telefone is not null
        and length(trim(p_cliente_telefone)) > 0
        and length(regexp_replace(p_cliente_telefone, '\D', '', 'g')) < 10 then
    raise exception 'Informe um telefone valido com DDD.';
  end if;

  if p_itens is null
     or jsonb_typeof(p_itens) <> 'array'
     or jsonb_array_length(p_itens) = 0 then
    raise exception 'O pedido esta vazio.';
  end if;

  if p_tipo not in ('retirada','balcao','mesa','encomenda') then
    raise exception 'Tipo de pedido invalido.';
  end if;

  if jsonb_array_length(p_itens) > 100 then
    raise exception 'Pedido com itens demais.';
  end if;
  if length(p_cliente_nome) > 80 then
    raise exception 'Nome muito longo.';
  end if;
  if length(coalesce(p_cliente_telefone, '')) > 20 then
    raise exception 'Telefone invalido.';
  end if;
  if p_endereco is not null and length(p_endereco) > 300 then
    raise exception 'Endereco muito longo.';
  end if;
  if p_observacao is not null and length(p_observacao) > 500 then
    raise exception 'Observacao muito longa.';
  end if;
  if p_forma_pagamento is not null and length(p_forma_pagamento) > 40 then
    raise exception 'Forma de pagamento invalida.';
  end if;

  select * into v_loja from lojas where slug = p_loja_slug;
  if not found then
    raise exception 'Loja nao encontrada.';
  end if;

  v_sou_dono := auth.uid() is not null and (
    exists (select 1 from lojas where id = v_loja.id and dono_id = auth.uid())
    or is_admin()
  );

  if p_origem not in ('site','instagram','telefone','outro') then
    raise exception 'Origem de pedido invalida.';
  end if;
  if p_origem <> 'site' and not v_sou_dono then
    raise exception 'So o dono da loja pode registrar pedido de outra origem.';
  end if;

  if p_status_inicial is not null then
    if p_status_inicial not in ('pendente','confirmado') then
      raise exception 'Status inicial invalido.';
    end if;
    if p_status_inicial <> 'pendente' and not v_sou_dono then
      raise exception 'So o dono da loja pode criar pedido ja confirmado.';
    end if;
    v_status_final := p_status_inicial;
  end if;

  if p_tipo = 'encomenda' and not v_loja.recebendo_encomendas then
    raise exception 'A loja nao esta recebendo encomendas no momento.';
  end if;
  if p_tipo = 'encomenda' and p_data_hora_agendada is null then
    raise exception 'Informe a data e hora combinada da encomenda.';
  end if;
  if p_tipo = 'encomenda' and p_data_hora_agendada < now() - interval '1 hour' then
    raise exception 'A data/hora da encomenda ja passou.';
  end if;

  -- Primeira passagem: valida catalogo, opcoes, limites e calcula o subtotal.
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := coalesce((v_item->>'quantidade')::integer, 1);
    if v_qtd < 1 or v_qtd > 99 then
      raise exception 'Quantidade invalida.';
    end if;

    select * into v_produto from produtos
      where id = (v_item->>'produto_id')::uuid
        and loja_id = v_loja.id;
    if not found or not v_produto.ativo then
      raise exception 'Produto indisponivel.';
    end if;

    v_preco_base := coalesce(v_produto.preco_promocional, v_produto.preco);
    v_extra := 0;
    v_opcoes := coalesce(v_item->'opcoes', '[]'::jsonb);

    if jsonb_typeof(v_opcoes) <> 'array' then
      raise exception 'Complementos invalidos.';
    end if;
    if jsonb_array_length(v_opcoes) > 50 then
      raise exception 'Complementos demais em "%".', v_produto.nome;
    end if;

    for v_opcao in select * from jsonb_array_elements(v_opcoes) loop
      v_qtd_opcao := coalesce((v_opcao->>'quantidade')::integer, 1);

      select * into v_compl from complementos
        where id = (v_opcao->>'complemento_id')::uuid and ativo;
      if not found then
        raise exception 'Complemento indisponivel.';
      end if;

      select * into v_grupo from grupos_complemento
        where id = v_compl.grupo_id and loja_id = v_loja.id and ativo;
      if not found then
        raise exception 'Complemento invalido.';
      end if;

      if not exists (
        select 1 from produto_grupos
        where produto_id = v_produto.id and grupo_id = v_grupo.id
      ) then
        raise exception 'O complemento "%" nao pertence a "%".', v_compl.nome, v_produto.nome;
      end if;

      if v_grupo.tipo_selecao = 'varias_repetir' then
        if v_qtd_opcao < 1 or v_qtd_opcao > coalesce(v_compl.qtd_max, 99) then
          raise exception 'Quantidade invalida em "%".', v_compl.nome;
        end if;
      elsif v_qtd_opcao <> 1 then
        raise exception 'A opcao "%" nao pode repetir.', v_compl.nome;
      end if;
    end loop;

    for v_grupo in
      select g.* from produto_grupos pg
      join grupos_complemento g on g.id = pg.grupo_id
      where pg.produto_id = v_produto.id
        and g.loja_id = v_loja.id
        and g.ativo
    loop
      select coalesce(sum(coalesce((o->>'quantidade')::integer, 1)), 0),
             count(distinct o->>'complemento_id')
        into v_escolhas, v_distintas
        from jsonb_array_elements(v_opcoes) o
        join complementos c on c.id = (o->>'complemento_id')::uuid
        where c.grupo_id = v_grupo.id;

      if v_escolhas < v_grupo.qtd_min then
        raise exception 'Escolha pelo menos % opcao(oes) em "%".', v_grupo.qtd_min, v_grupo.nome;
      end if;
      if v_escolhas > v_grupo.qtd_max then
        raise exception 'Escolha no maximo % opcao(oes) em "%".', v_grupo.qtd_max, v_grupo.nome;
      end if;
      if v_grupo.tipo_selecao <> 'varias_repetir' and v_distintas <> v_escolhas then
        raise exception 'Nao e permitido repetir a mesma opcao em "%".', v_grupo.nome;
      end if;
    end loop;

    for v_grupo_id in
      select distinct c.grupo_id
      from jsonb_array_elements(v_opcoes) o
      join complementos c on c.id = (o->>'complemento_id')::uuid
    loop
      select * into v_grupo from grupos_complemento
        where id = v_grupo_id and loja_id = v_loja.id;
      if not found then
        raise exception 'Complemento invalido.';
      end if;

      select array_agg(c.preco * coalesce((o->>'quantidade')::integer, 1))
        into v_precos
        from jsonb_array_elements(v_opcoes) o
        join complementos c on c.id = (o->>'complemento_id')::uuid
        where c.grupo_id = v_grupo_id and c.ativo;

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
      raise exception 'Preco invalido em "%".', v_produto.nome;
    end if;
    v_subtotal := v_subtotal + (v_unitario * v_qtd);
  end loop;

  if v_subtotal < coalesce(v_loja.pedido_minimo, 0) then
    raise exception 'O pedido minimo e de R$ %.',
      to_char(v_loja.pedido_minimo, 'FM999999990.00');
  end if;

  perform pg_advisory_xact_lock(hashtext(v_loja.id::text));
  select coalesce(max(numero), 0) + 1
    into v_numero
    from pedidos
    where loja_id = v_loja.id;

  insert into pedidos (
    loja_id, numero, cliente_nome, cliente_telefone, tipo, endereco,
    observacao, forma_pagamento, subtotal, total,
    data_hora_agendada, origem, status
  ) values (
    v_loja.id,
    v_numero,
    trim(p_cliente_nome),
    coalesce(trim(p_cliente_telefone), ''),
    p_tipo,
    nullif(trim(coalesce(p_endereco, '')), ''),
    nullif(trim(coalesce(p_observacao, '')), ''),
    p_forma_pagamento,
    v_subtotal,
    v_subtotal,
    case when p_tipo = 'encomenda' then p_data_hora_agendada else null end,
    p_origem,
    v_status_final
  ) returning id, token into v_pedido_id, v_token;

  -- Segunda passagem: persiste snapshots de itens e complementos validados.
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := coalesce((v_item->>'quantidade')::integer, 1);
    select * into v_produto from produtos
      where id = (v_item->>'produto_id')::uuid and loja_id = v_loja.id;

    v_preco_base := coalesce(v_produto.preco_promocional, v_produto.preco);
    v_extra := 0;
    v_opcoes := coalesce(v_item->'opcoes', '[]'::jsonb);

    for v_grupo_id in
      select distinct c.grupo_id
      from jsonb_array_elements(v_opcoes) o
      join complementos c on c.id = (o->>'complemento_id')::uuid
    loop
      select * into v_grupo from grupos_complemento where id = v_grupo_id;
      select array_agg(c.preco * coalesce((o->>'quantidade')::integer, 1))
        into v_precos
        from jsonb_array_elements(v_opcoes) o
        join complementos c on c.id = (o->>'complemento_id')::uuid
        where c.grupo_id = v_grupo_id and c.ativo;

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

    insert into pedido_itens (
      pedido_id, produto_id, nome, preco_unitario, quantidade, observacao, subtotal
    ) values (
      v_pedido_id,
      v_produto.id,
      v_produto.nome,
      v_unitario,
      v_qtd,
      nullif(trim(coalesce(v_item->>'observacao', '')), ''),
      v_unitario * v_qtd
    ) returning id into v_item_id;

    if jsonb_array_length(v_opcoes) > 0 then
      for v_opcao in select * from jsonb_array_elements(v_opcoes) loop
        select * into v_compl from complementos
          where id = (v_opcao->>'complemento_id')::uuid and ativo;
        if found then
          select * into v_grupo from grupos_complemento where id = v_compl.grupo_id;
          insert into pedido_item_opcoes (
            pedido_item_id, complemento_id, grupo_nome, nome, preco, quantidade
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

  return jsonb_build_object(
    'id', v_pedido_id,
    'numero', v_numero,
    'token', v_token,
    'subtotal', v_subtotal,
    'total', v_subtotal
  );
end;
$$;

revoke execute on function public.criar_pedido(
  text,text,text,text,text,text,text,jsonb,timestamptz,text,text
) from public, anon;
grant execute on function public.criar_pedido(
  text,text,text,text,text,text,text,jsonb,timestamptz,text,text
) to authenticated;

-- Defesa final do checkout publico. Pedidos manuais continuam autorizados para
-- os tipos gerais pelo nucleo acima; origem=site fica sujeita a loja aberta e
-- retirada habilitada.
create function public.cf_validar_operacao_pedido_site()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aberta boolean;
  v_retirada boolean;
begin
  if coalesce(new.origem, 'site') <> 'site' then
    return new;
  end if;

  select recebendo_encomendas, retirada_ativa
    into v_aberta, v_retirada
  from public.lojas
  where id = new.loja_id
  for share;

  if not found then
    raise exception 'Loja nao encontrada.';
  end if;
  if new.tipo <> 'retirada' then
    raise exception 'Pedidos do site aceitam somente retirada.';
  end if;
  if not v_aberta then
    raise exception 'A loja esta fechada e nao esta recebendo pedidos no momento.';
  end if;
  if new.tipo = 'retirada' and not v_retirada then
    raise exception 'A retirada esta indisponivel no momento.';
  end if;
  return new;
end;
$$;

revoke all on function public.cf_validar_operacao_pedido_site()
  from public, anon, authenticated;

create trigger cf_validar_operacao_pedido_site
before insert on public.pedidos
for each row execute function public.cf_validar_operacao_pedido_site();

-- Acompanhamento publico continua preservando endereco de encomendas, mas nao
-- expoe mais qualquer campo de taxa de entrega.
create function public.pedido_por_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
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
          from pedido_item_opcoes o
          where o.pedido_item_id = i.id
        ), '[]'::jsonb)
      ))
      from pedido_itens i
      where i.pedido_id = p.id
    ), '[]'::jsonb)
  ) into v
  from pedidos p
  join lojas l on l.id = p.loja_id
  where p.token = p_token;

  if v is null then
    raise exception 'Pedido nao encontrado.';
  end if;
  return v;
end;
$$;

revoke execute on function public.pedido_por_token(text) from public;
grant execute on function public.pedido_por_token(text) to anon, authenticated;

-- Maquina de estados geral: pronto segue diretamente para concluido.
create function public.transicionar_pedido(
  p_pedido_id uuid,
  p_status_esperado text,
  p_novo_status text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido pedidos%rowtype;
  v_transicoes_validas text[];
begin
  select p.* into v_pedido
  from pedidos p
  where p.id = p_pedido_id
  for update;

  if not found then
    raise exception 'Pedido nao encontrado.';
  end if;

  if not (
    exists (
      select 1 from lojas
      where id = v_pedido.loja_id and dono_id = auth.uid()
    )
    or is_admin()
  ) then
    raise exception 'Pedido nao encontrado.';
  end if;

  if p_novo_status not in (
    'pendente','confirmado','em_preparo','pronto','concluido','cancelado'
  ) then
    raise exception 'Status invalido.';
  end if;

  if v_pedido.status in ('concluido','cancelado') then
    raise exception 'Pedido ja esta %.', v_pedido.status;
  end if;
  if v_pedido.status <> p_status_esperado then
    raise exception 'CONFLITO' using errcode = '22023';
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
      raise exception 'Transicao de status invalida.';
    end if;
  end if;

  update pedidos
  set status = p_novo_status
  where id = p_pedido_id and status = p_status_esperado;

  return jsonb_build_object('ok', true, 'status', p_novo_status);
end;
$$;

revoke execute on function public.transicionar_pedido(uuid,text,text)
  from public, anon;
grant execute on function public.transicionar_pedido(uuid,text,text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 7. RPC publica limpa e exclusiva para retirada
-- ---------------------------------------------------------------------------

create or replace function public.criar_pedido_publico_retirada_v1(
  p_loja_slug text,
  p_cliente_nome text,
  p_cliente_telefone text,
  p_observacao text,
  p_forma_pagamento text,
  p_itens jsonb,
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
  v_loja_id uuid;
  v_existente record;
  v_pedido record;
  v_resultado jsonb;
  v_total_centavos integer;
  v_limite jsonb;
begin
  if p_idempotency_key is null then
    raise exception 'Requisicao sem identificador de repeticao.' using errcode = '22023';
  end if;
  if p_payload_hash is null or length(p_payload_hash) <> 64 then
    raise exception 'Requisicao invalida.' using errcode = '22023';
  end if;
  if p_forma_pagamento not in (
    'dinheiro',
    'cartao_credito',
    'cartao_debito',
    'pix_manual',
    'pagamento_retirada'
  ) then
    raise exception 'Forma de pagamento incompatível com retirada.' using errcode = '22023';
  end if;

  select id into v_loja_id
  from lojas
  where slug = p_loja_slug;
  if v_loja_id is null then
    raise exception 'Loja nao encontrada.';
  end if;

  select * into v_existente
  from pedido_idempotencia
  where loja_id = v_loja_id and idempotency_key = p_idempotency_key;

  if found then
    if v_existente.payload_hash <> p_payload_hash then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = '22023';
    end if;
    if v_existente.pedido_id is null then
      raise exception 'Pedido ainda sendo processado. Tente novamente em instantes.'
        using errcode = '22023';
    end if;

    select
      id, numero, token, subtotal, total, forma_pagamento, pagamento_status
      into v_pedido
    from pedidos
    where id = v_existente.pedido_id and tipo = 'retirada';

    if not found then
      raise exception 'Pedido nao encontrado.';
    end if;

    return jsonb_build_object(
      'id', v_pedido.id,
      'numero', v_pedido.numero,
      'token', v_pedido.token,
      'subtotal', v_pedido.subtotal,
      'total', v_pedido.total,
      'forma_pagamento', v_pedido.forma_pagamento,
      'pagamento_status', v_pedido.pagamento_status,
      'replay', true
    );
  end if;

  insert into pedido_idempotencia (loja_id, idempotency_key, payload_hash)
  values (v_loja_id, p_idempotency_key, p_payload_hash);

  v_limite := consumir_cota_checkout(p_chave_ip, p_chave_telefone);
  if (v_limite->>'permitido') is distinct from 'true' then
    raise exception 'RATE_LIMIT:%', coalesce(v_limite->>'motivo', 'LIMITE')
      using errcode = '22023';
  end if;

  v_resultado := criar_pedido(
    p_loja_slug,
    p_cliente_nome,
    p_cliente_telefone,
    'retirada',
    null,
    p_observacao,
    p_forma_pagamento,
    p_itens,
    null,
    'site',
    null
  );

  v_total_centavos := round((v_resultado->>'total')::numeric * 100);
  if p_total_esperado_centavos is not null
     and abs(v_total_centavos - p_total_esperado_centavos) > 5 then
    raise exception 'CART_CHANGED' using errcode = '22023';
  end if;

  update pedido_idempotencia
  set pedido_id = (v_resultado->>'id')::uuid
  where loja_id = v_loja_id and idempotency_key = p_idempotency_key;

  select forma_pagamento, pagamento_status
    into v_pedido
  from pedidos
  where id = (v_resultado->>'id')::uuid;

  return v_resultado || jsonb_build_object(
    'forma_pagamento', v_pedido.forma_pagamento,
    'pagamento_status', v_pedido.pagamento_status,
    'replay', false
  );
end;
$$;

revoke execute on function public.criar_pedido_publico_retirada_v1(
  text,text,text,text,text,jsonb,uuid,text,integer,text,text
) from public, anon, authenticated;
grant execute on function public.criar_pedido_publico_retirada_v1(
  text,text,text,text,text,jsonb,uuid,text,integer,text,text
) to service_role;

commit;
