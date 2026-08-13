-- Numeração operacional do pedido: curta, por loja e por dia.
--
-- Antes o número era uma sequência que só crescia:
--   select coalesce(max(numero), 0) + 1 from pedidos where loja_id = ...
-- Uma loja com 40 pedidos/dia chega a #14.600 em um ano, e é esse número que
-- aparece na cozinha, na etiqueta, no acompanhamento e no grito do balcão.
--
-- O que muda:
--   * o identificador real continua sendo o `id` uuid — nada aqui o toca;
--   * `numero` passa a reiniciar a cada dia operacional, por loja;
--   * o dia operacional vira às 04:00, não à meia-noite: quem atende até
--     02h da manhã continua no mesmo dia e na mesma sequência;
--   * a chave única (loja_id, numero) vira (loja_id, dia_operacional, numero);
--   * pedido cancelado NÃO libera o número — a conta é max()+1, não count().
--
-- O que NÃO muda: nenhum pedido antigo é renumerado. O backfill só preenche o
-- dia operacional a partir de criado_em. Numa loja que já tem pedidos hoje, a
-- sequência curta começa a valer no próximo dia operacional; nas demais, já.
--
-- Rodar no SQL Editor do Supabase. Seguro rodar mais de uma vez.

begin;

-- ---------------------------------------------------------------
-- 0. Trava de segurança
-- ---------------------------------------------------------------
-- O corpo de criar_pedido abaixo foi gerado a partir da função que estava no
-- ar, com três trechos trocados. Se o banco onde isto está rodando tiver uma
-- versão diferente, aplicar sobrescreveria alterações que não estão aqui —
-- então a migração para em vez de continuar.
--
--   429f97b4… = como estava antes desta migração
--   33100f6f… = como fica depois (deixa rodar de novo sem estragar nada)
do $guarda$
declare
  v_hash text;
begin
  select md5(prosrc) into v_hash
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'criar_pedido' and p.prokind = 'f';

  if v_hash is null then
    raise exception 'criar_pedido não existe neste banco. Pare e confira o ambiente.';
  end if;
  if v_hash not in ('429f97b431ec84beaa27f2d3e32904f7', '33100f6fd1285d18fd00bbe15df24b00') then
    raise exception 'criar_pedido aqui (md5 %) não é a versão em que esta migração foi baseada. Não aplique — a função precisa ser regerada a partir desta.', v_hash;
  end if;
end
$guarda$;

-- ---------------------------------------------------------------
-- 1. Dia operacional — vira às 04:00 no fuso da loja
-- ---------------------------------------------------------------
create or replace function public.cf_dia_operacional(p_momento timestamptz default now())
returns date
language sql
stable
set search_path = public
as $fn$
  select (((p_momento at time zone 'America/Sao_Paulo') - interval '4 hours')::date);
$fn$;

revoke all on function public.cf_dia_operacional(timestamptz) from public, anon;
grant execute on function public.cf_dia_operacional(timestamptz) to authenticated;

-- ---------------------------------------------------------------
-- 2. Coluna + backfill, sem tocar em numero
-- ---------------------------------------------------------------
alter table public.pedidos add column if not exists dia_operacional date;
update public.pedidos set dia_operacional = public.cf_dia_operacional(criado_em)
  where dia_operacional is null;
alter table public.pedidos alter column dia_operacional set not null;
alter table public.pedidos alter column dia_operacional set default public.cf_dia_operacional();

-- ---------------------------------------------------------------
-- 3. A chave única passa a incluir o dia
-- ---------------------------------------------------------------
-- Nenhuma FK aponta pra (loja_id, numero) — conferido em pg_constraint. As
-- referências de outras tabelas usam id ou (loja_id, id), que ficam intactas.
alter table public.pedidos drop constraint if exists pedidos_loja_id_numero_key;
do $chave$
begin
  -- `add constraint` não tem `if not exists`; sem esta guarda, rodar de novo
  -- morre com "relation already exists".
  if not exists (
    select 1 from pg_constraint
    where conname = 'pedidos_loja_dia_numero_key'
      and conrelid = 'public.pedidos'::regclass
  ) then
    alter table public.pedidos add constraint pedidos_loja_dia_numero_key
      unique (loja_id, dia_operacional, numero);
  end if;
end
$chave$;

-- Leitura por dia é o acesso novo mais comum (cozinha, gestão do dia).
create index if not exists idx_pedidos_loja_dia on public.pedidos (loja_id, dia_operacional);

-- ---------------------------------------------------------------
-- 4. criar_pedido — única função que insere pedido (auditado em pg_proc)
-- ---------------------------------------------------------------
-- Corpo idêntico ao que estava no ar, com três trechos trocados: a variável
-- do dia, o cálculo do número e a coluna no insert. Nenhuma regra de
-- validação, preço ou disponibilidade foi tocada.
CREATE OR REPLACE FUNCTION public.criar_pedido(p_loja_slug text, p_cliente_nome text, p_cliente_telefone text, p_tipo text, p_endereco text, p_observacao text, p_forma_pagamento text, p_itens jsonb, p_data_hora_agendada timestamp with time zone DEFAULT NULL::timestamp with time zone, p_origem text DEFAULT 'site'::text, p_status_inicial text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_loja lojas%rowtype;
  v_numero integer;
  v_dia date;
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

  -- Numeração operacional: reinicia a cada dia, por loja. O lock é por
  -- (loja, dia) e não só por loja — dois pedidos simultâneos da mesma loja
  -- serializam aqui, e a unique (loja_id, dia_operacional, numero) é a rede.
  -- max() e não count(): pedido cancelado NÃO devolve o número pro bolo.
  v_dia := cf_dia_operacional();
  perform pg_advisory_xact_lock(hashtext(v_loja.id::text || ':' || v_dia::text));
  select coalesce(max(numero), 0) + 1
    into v_numero
    from pedidos
    where loja_id = v_loja.id
      and dia_operacional = v_dia;

  insert into pedidos (
    loja_id, numero, dia_operacional, cliente_nome, cliente_telefone, tipo, endereco,
    observacao, forma_pagamento, subtotal, total,
    data_hora_agendada, origem, status
  ) values (
    v_loja.id,
    v_numero,
    v_dia,
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
$function$;

commit;

-- ---------------------------------------------------------------
-- CONFERÊNCIA — as três precisam vir como esperado
-- ---------------------------------------------------------------
-- 1) a chave nova existe e a antiga sumiu
select conname, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid = 'public.pedidos'::regclass and contype = 'u'
order by conname;

-- 2) o dia operacional vira às 04:00 (o primeiro tem de ser o dia anterior)
select public.cf_dia_operacional('2026-08-14 02:30:00-03'::timestamptz) as as_2h30,
       public.cf_dia_operacional('2026-08-14 04:30:00-03'::timestamptz) as as_4h30;

-- 3) criar_pedido já numera por dia
select prosrc ilike '%dia_operacional = v_dia%' as numera_por_dia
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'criar_pedido' and p.prokind = 'f';
