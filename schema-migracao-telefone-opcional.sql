-- CliqueFome — telefone opcional em pedido presencial (balcão/mesa)
-- Aplicar no Supabase antes do deploy do código que conta com isso.
--
-- criar_pedido() é a RPC do pedido lançado pelo DONO da loja (telefone,
-- Instagram, balcão, mesa...) — o checkout público usa outra função
-- (criar_pedido_publico_v1/v2, só delivery/retirada), então esta mudança
-- não afeta o cliente final em nenhuma hipótese.
--
-- Único comportamento novo: quando p_tipo é 'balcao' ou 'mesa', telefone
-- vazio deixa de ser erro (mas, se algo for digitado, ainda precisa ser um
-- telefone válido com DDD). Resto da função idêntico ao já publicado em
-- schema-migracao-checkout-publico.sql — só copiado aqui porque
-- `create or replace function` exige o corpo inteiro, não um diff.

begin;

create or replace function criar_pedido(
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
  v_taxa numeric(10,2) := 0;
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
    raise exception 'Informe o nome de quem está pedindo.';
  end if;
  if p_tipo not in ('balcao','mesa') then
    if p_cliente_telefone is null or length(regexp_replace(p_cliente_telefone, '\D', '', 'g')) < 10 then
      raise exception 'Informe um telefone válido com DDD.';
    end if;
  elsif p_cliente_telefone is not null and length(trim(p_cliente_telefone)) > 0
        and length(regexp_replace(p_cliente_telefone, '\D', '', 'g')) < 10 then
    raise exception 'Informe um telefone válido com DDD.';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'O pedido está vazio.';
  end if;
  if p_tipo not in ('delivery','retirada','balcao','mesa','encomenda') then
    raise exception 'Tipo de pedido inválido.';
  end if;

  if jsonb_array_length(p_itens) > 100 then
    raise exception 'Pedido com itens demais.';
  end if;
  if length(p_cliente_nome) > 80 then
    raise exception 'Nome muito longo.';
  end if;
  if length(p_cliente_telefone) > 20 then
    raise exception 'Telefone inválido.';
  end if;
  if p_endereco is not null and length(p_endereco) > 300 then
    raise exception 'Endereço muito longo.';
  end if;
  if p_observacao is not null and length(p_observacao) > 500 then
    raise exception 'Observação muito longa.';
  end if;
  if p_forma_pagamento is not null and length(p_forma_pagamento) > 40 then
    raise exception 'Forma de pagamento inválida.';
  end if;

  select * into v_loja from lojas where slug = p_loja_slug;
  if not found then
    raise exception 'Loja não encontrada.';
  end if;

  v_sou_dono := auth.uid() is not null and (
    exists (select 1 from lojas where id = v_loja.id and dono_id = auth.uid())
    or is_admin()
  );

  if p_origem not in ('site','instagram','telefone','outro') then
    raise exception 'Origem de pedido inválida.';
  end if;
  if p_origem <> 'site' and not v_sou_dono then
    raise exception 'Só o dono da loja pode registrar pedido de outra origem.';
  end if;

  if p_status_inicial is not null then
    if p_status_inicial not in ('pendente','confirmado') then
      raise exception 'Status inicial inválido.';
    end if;
    if p_status_inicial <> 'pendente' and not v_sou_dono then
      raise exception 'Só o dono da loja pode criar pedido já confirmado.';
    end if;
    v_status_final := p_status_inicial;
  end if;

  if p_tipo = 'delivery' and not v_loja.delivery_ativo then
    raise exception 'A loja não está aceitando pedidos de delivery no momento.';
  end if;
  if p_tipo = 'delivery' and (p_endereco is null or length(trim(p_endereco)) < 5) then
    raise exception 'Informe o endereço de entrega.';
  end if;

  if p_tipo = 'encomenda' and not v_loja.recebendo_encomendas then
    raise exception 'A loja não está recebendo encomendas no momento.';
  end if;
  if p_tipo = 'encomenda' and p_data_hora_agendada is null then
    raise exception 'Informe a data e hora combinada da encomenda.';
  end if;
  if p_tipo = 'encomenda' and p_data_hora_agendada < now() - interval '1 hour' then
    raise exception 'A data/hora da encomenda já passou.';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := coalesce((v_item->>'quantidade')::integer, 1);
    if v_qtd < 1 or v_qtd > 99 then
      raise exception 'Quantidade inválida.';
    end if;

    select * into v_produto from produtos
      where id = (v_item->>'produto_id')::uuid
        and loja_id = v_loja.id;
    if not found then
      raise exception 'Produto indisponível.';
    end if;
    if not v_produto.ativo then
      raise exception 'O item "%" está esgotado.', v_produto.nome;
    end if;

    v_preco_base := coalesce(v_produto.preco_promocional, v_produto.preco);
    v_extra := 0;

    v_opcoes := coalesce(v_item->'opcoes', '[]'::jsonb);
    if jsonb_typeof(v_opcoes) <> 'array' then
      raise exception 'Complementos inválidos.';
    end if;
    if jsonb_array_length(v_opcoes) > 50 then
      raise exception 'Complementos demais em "%".', v_produto.nome;
    end if;

    for v_opcao in select * from jsonb_array_elements(v_opcoes) loop
      v_qtd_opcao := coalesce((v_opcao->>'quantidade')::integer, 1);

      select * into v_compl from complementos
        where id = (v_opcao->>'complemento_id')::uuid and ativo;
      if not found then
        raise exception 'Complemento indisponível.';
      end if;

      select * into v_grupo from grupos_complemento
        where id = v_compl.grupo_id and loja_id = v_loja.id and ativo;
      if not found then
        raise exception 'Complemento inválido.';
      end if;

      if not exists (
        select 1 from produto_grupos
        where produto_id = v_produto.id and grupo_id = v_grupo.id
      ) then
        raise exception 'O complemento "%" não pertence a "%".', v_compl.nome, v_produto.nome;
      end if;

      if v_grupo.tipo_selecao = 'varias_repetir' then
        if v_qtd_opcao < 1 or v_qtd_opcao > coalesce(v_compl.qtd_max, 99) then
          raise exception 'Quantidade inválida em "%".', v_compl.nome;
        end if;
      elsif v_qtd_opcao <> 1 then
        raise exception 'A opção "%" não pode repetir.', v_compl.nome;
      end if;
    end loop;

    for v_grupo in
      select g.* from produto_grupos pg
      join grupos_complemento g on g.id = pg.grupo_id
      where pg.produto_id = v_produto.id and g.loja_id = v_loja.id and g.ativo
    loop
      select coalesce(sum(coalesce((o->>'quantidade')::integer, 1)), 0),
             count(distinct o->>'complemento_id')
        into v_escolhas, v_distintas
        from jsonb_array_elements(v_opcoes) o
        join complementos c on c.id = (o->>'complemento_id')::uuid
        where c.grupo_id = v_grupo.id;

      if v_escolhas < v_grupo.qtd_min then
        raise exception 'Escolha pelo menos % opção(ões) em "%".', v_grupo.qtd_min, v_grupo.nome;
      end if;
      if v_escolhas > v_grupo.qtd_max then
        raise exception 'Escolha no máximo % opção(ões) em "%".', v_grupo.qtd_max, v_grupo.nome;
      end if;
      if v_grupo.tipo_selecao <> 'varias_repetir' and v_distintas <> v_escolhas then
        raise exception 'Não dá pra repetir a mesma opção em "%".', v_grupo.nome;
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
        raise exception 'Complemento inválido.';
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
      raise exception 'Preço inválido em "%".', v_produto.nome;
    end if;
    v_subtotal := v_subtotal + (v_unitario * v_qtd);
  end loop;

  if p_tipo = 'delivery' or (p_tipo = 'encomenda' and p_endereco is not null and length(trim(p_endereco)) >= 5) then
    v_taxa := coalesce(v_loja.taxa_entrega, 0);
  end if;

  if v_subtotal < coalesce(v_loja.pedido_minimo, 0) then
    raise exception 'O pedido mínimo é de R$ %.', to_char(v_loja.pedido_minimo, 'FM999999990.00');
  end if;

  perform pg_advisory_xact_lock(hashtext(v_loja.id::text));
  select coalesce(max(numero), 0) + 1 into v_numero from pedidos where loja_id = v_loja.id;

  insert into pedidos (
    loja_id, numero, cliente_nome, cliente_telefone, tipo, endereco,
    observacao, forma_pagamento, subtotal, taxa_entrega, total,
    data_hora_agendada, origem, status
  ) values (
    v_loja.id, v_numero, trim(p_cliente_nome), coalesce(trim(p_cliente_telefone), ''), p_tipo,
    nullif(trim(coalesce(p_endereco, '')), ''), nullif(trim(coalesce(p_observacao, '')), ''),
    p_forma_pagamento, v_subtotal, v_taxa, v_subtotal + v_taxa,
    case when p_tipo = 'encomenda' then p_data_hora_agendada else null end,
    p_origem, v_status_final
  ) returning id, token into v_pedido_id, v_token;

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

    insert into pedido_itens (pedido_id, produto_id, nome, preco_unitario, quantidade, observacao, subtotal)
    values (v_pedido_id, v_produto.id, v_produto.nome, v_unitario, v_qtd,
            nullif(trim(coalesce(v_item->>'observacao', '')), ''), v_unitario * v_qtd)
    returning id into v_item_id;

    if jsonb_array_length(v_opcoes) > 0 then
      for v_opcao in select * from jsonb_array_elements(v_opcoes) loop
        select * into v_compl from complementos where id = (v_opcao->>'complemento_id')::uuid and ativo;
        if found then
          select * into v_grupo from grupos_complemento where id = v_compl.grupo_id;
          insert into pedido_item_opcoes (pedido_item_id, complemento_id, grupo_nome, nome, preco, quantidade)
          values (v_item_id, v_compl.id, v_grupo.nome, v_compl.nome, v_compl.preco,
                  coalesce((v_opcao->>'quantidade')::integer, 1));
        end if;
      end loop;
    end if;
  end loop;

  return jsonb_build_object(
    'id', v_pedido_id, 'numero', v_numero, 'token', v_token,
    'subtotal', v_subtotal, 'taxa_entrega', v_taxa, 'total', v_subtotal + v_taxa
  );
end;
$$;

-- Continua sem anon: quem cria pedido de origem 'site' sem sessão passa
-- pelo wrapper criar_pedido_publico_v1(), que é quem tem grant pra
-- service_role.
revoke execute on function criar_pedido(text,text,text,text,text,text,text,jsonb,timestamptz,text,text) from public, anon;
grant execute on function criar_pedido(text,text,text,text,text,text,text,jsonb,timestamptz,text,text) to authenticated;

commit;
