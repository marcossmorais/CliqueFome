-- Migração incremental sobre schema-pedidos.sql — adiciona encomenda (tipo
-- + data/hora combinada), origem do pedido e suporte a pedido criado
-- manualmente pelo dono da loja (telefone, Instagram etc).
--
-- Traz junto o ENDURECIMENTO de criar_pedido(): a versão de
-- schema-pedidos.sql valida a quantidade do item, mas aceita qualquer
-- complemento de qualquer produto, em qualquer quantidade — inclusive
-- negativa, que abate o total. Aqui entram vínculo produto_grupos,
-- qtd_min/qtd_max, tipo_selecao e tetos de payload. Rodar isto substitui a
-- definição antiga da função.
--
-- Como usar: Supabase → SQL Editor → New query → cola tudo → Run.
-- Precisa do schema-pedidos.sql já aplicado antes. Seguro rodar mais de
-- uma vez.

-- ---------------------------------------------------------------
-- PEDIDOS: novas colunas
-- ---------------------------------------------------------------
alter table pedidos drop constraint if exists pedidos_tipo_check;
alter table pedidos add constraint pedidos_tipo_check
  check (tipo in ('delivery','retirada','balcao','mesa','encomenda'));

-- Data/hora combinada de entrega ou retirada da encomenda. Obrigatória só
-- quando tipo = 'encomenda' — a função criar_pedido() garante isso.
alter table pedidos add column if not exists data_hora_agendada timestamptz;

-- De onde veio o pedido. 'site' é o padrão (cardápio público, sem sessão);
-- os outros só entram via painel, autenticado — ver checagem de permissão
-- dentro de criar_pedido() abaixo.
alter table pedidos add column if not exists origem text not null default 'site'
  check (origem in ('site','instagram','telefone','outro'));

create index if not exists idx_pedidos_agendado on pedidos(loja_id, data_hora_agendada)
  where data_hora_agendada is not null;

-- ---------------------------------------------------------------
-- CATÁLOGO: preço nunca negativo
-- ---------------------------------------------------------------
-- criar_pedido() confia no preço do catálogo pra fazer a conta. Sem estes
-- CHECKs, um preço negativo cadastrado no painel vira desconto em pedido —
-- a validação do formulário não é fronteira de segurança.
-- Se algum destes falhar, existe dado negativo gravado: rode o select
-- comentado ao lado pra achar e corrigir antes de tentar de novo.
--   select id, nome, preco, preco_promocional from produtos where preco < 0 or preco_promocional < 0;
--   select id, nome, preco from complementos where preco < 0;
alter table produtos drop constraint if exists produtos_preco_nao_negativo;
alter table produtos add constraint produtos_preco_nao_negativo
  check (preco >= 0 and (preco_promocional is null or preco_promocional >= 0)
         and (preco_custo is null or preco_custo >= 0));

alter table complementos drop constraint if exists complementos_preco_nao_negativo;
alter table complementos add constraint complementos_preco_nao_negativo
  check (preco >= 0);

alter table lojas drop constraint if exists lojas_valores_nao_negativos;
alter table lojas add constraint lojas_valores_nao_negativos
  check (taxa_entrega >= 0 and pedido_minimo >= 0);

-- ---------------------------------------------------------------
-- criar_pedido() — adiciona encomenda, origem e status inicial manual
-- ---------------------------------------------------------------
-- CREATE OR REPLACE só aceita ACRESCENTAR parâmetros no fim, com default —
-- por isso os três novos entram depois de p_itens, sem mexer na ordem dos
-- que já existem (o cardápio público, que já chama esta função, continua
-- funcionando sem alteração nenhuma).
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
  -- Validação de complementos (ver bloco "regras do grupo" abaixo).
  v_opcoes jsonb;
  v_qtd_opcao integer;
  v_escolhas integer;
  v_distintas integer;
begin
  if p_cliente_nome is null or length(trim(p_cliente_nome)) < 2 then
    raise exception 'Informe o nome de quem está pedindo.';
  end if;
  if p_cliente_telefone is null or length(regexp_replace(p_cliente_telefone, '\D', '', 'g')) < 10 then
    raise exception 'Informe um telefone válido com DDD.';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'O pedido está vazio.';
  end if;
  if p_tipo not in ('delivery','retirada','balcao','mesa','encomenda') then
    raise exception 'Tipo de pedido inválido.';
  end if;

  -- Tetos de payload. A função é chamável por anon: sem isso, um único POST
  -- pode mandar um array gigante e transformar a RPC em amplificador de
  -- CPU/armazenamento. Os limites são folgados pro uso real e baratos de
  -- checar antes de qualquer ida ao catálogo.
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

  -- Pedido criado pelo próprio dono (ou super admin) via painel — é essa
  -- checagem que autoriza origem != 'site' e status_inicial != null. Sem
  -- ela, qualquer visitante anônimo do cardápio público poderia se passar
  -- por "pedido manual" já confirmado, pulando a etapa de revisão da loja.
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

  -- Encomenda reaproveita o toggle "recebendo_encomendas" da loja, que já
  -- existia no schema mas até aqui não era checado em lugar nenhum.
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

    -- --------------------------------------------------------------
    -- Regras do complemento. Sem este bloco a RPC aceita qualquer opção
    -- de qualquer produto, em qualquer quantidade — inclusive negativa,
    -- que abate o total. O navegador não é fonte confiável de nada disso:
    -- ele manda ids, e é aqui que se decide se aquele conjunto de ids é
    -- um pedido legítimo.
    -- --------------------------------------------------------------
    v_opcoes := coalesce(v_item->'opcoes', '[]'::jsonb);
    if jsonb_typeof(v_opcoes) <> 'array' then
      raise exception 'Complementos inválidos.';
    end if;
    if jsonb_array_length(v_opcoes) > 50 then
      raise exception 'Complementos demais em "%".', v_produto.nome;
    end if;

    -- 1) cada opção existe, está ativa e pertence a um grupo DESTE produto.
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

      -- É o vínculo em produto_grupos que impede pendurar o adicional
      -- barato de um produto no produto caro de outro.
      if not exists (
        select 1 from produto_grupos
        where produto_id = v_produto.id and grupo_id = v_grupo.id
      ) then
        raise exception 'O complemento "%" não pertence a "%".', v_compl.nome, v_produto.nome;
      end if;

      -- Repetir a mesma opção só vale em lista 'varias_repetir', e ainda
      -- assim até o teto da própria opção (ex: no máximo 3x bacon).
      if v_grupo.tipo_selecao = 'varias_repetir' then
        if v_qtd_opcao < 1 or v_qtd_opcao > coalesce(v_compl.qtd_max, 99) then
          raise exception 'Quantidade inválida em "%".', v_compl.nome;
        end if;
      elsif v_qtd_opcao <> 1 then
        raise exception 'A opção "%" não pode repetir.', v_compl.nome;
      end if;
    end loop;

    -- 2) mínimo, máximo e repetição de cada lista ligada ao produto. Roda
    -- sobre os grupos do produto (não sobre o que veio no JSON), senão
    -- omitir o grupo obrigatório inteiro passaria batido.
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

    -- Preço dos complementos, respeitando o modo de preço de cada lista.
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
    -- Rede de segurança: preço negativo no catálogo (ou conta que deu
    -- errado) nunca vira desconto em pedido.
    if v_unitario < 0 then
      raise exception 'Preço inválido em "%".', v_produto.nome;
    end if;
    v_subtotal := v_subtotal + (v_unitario * v_qtd);
  end loop;

  -- Encomenda com endereço preenchido é tratada como entrega (cobra taxa);
  -- sem endereço, é retirada (sem taxa).
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
    v_loja.id, v_numero, trim(p_cliente_nome), trim(p_cliente_telefone), p_tipo,
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
    -- Mesmíssima conta da primeira passada — inclusive a fonte (v_opcoes).
    -- Se as duas divergirem, o pedido grava um total diferente do que foi
    -- somado e conferido contra o pedido mínimo.
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

  return jsonb_build_object('numero', v_numero, 'token', v_token, 'total', v_subtotal + v_taxa);
end;
$$;

-- Quem executa criar_pedido(). Na versão básica o cardápio público NÃO
-- grava pedido — ele monta a mensagem do WhatsApp (ver docs/DECISIONS.md).
-- Quem lança pedido no sistema é a loja, logada, pelo painel. Manter a
-- concessão a anon deixava aberta uma porta que ninguém usa e que dá pra
-- floodar sem custo. Quando a versão Pro passar a persistir pedido do
-- cliente, esta concessão volta JUNTO com rate limit fora do banco.
revoke execute on function criar_pedido(text,text,text,text,text,text,text,jsonb,timestamptz,text,text) from public;
revoke execute on function criar_pedido(text,text,text,text,text,text,text,jsonb,timestamptz,text,text) from anon;
grant execute on function criar_pedido(text,text,text,text,text,text,text,jsonb,timestamptz,text,text) to authenticated;

-- ---------------------------------------------------------------
-- pedido_por_token() — inclui os campos novos na tela de acompanhamento
-- ---------------------------------------------------------------
create or replace function pedido_por_token(p_token text)
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
    'taxa_entrega', p.taxa_entrega,
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
          select jsonb_agg(jsonb_build_object('grupo', o.grupo_nome, 'nome', o.nome, 'preco', o.preco, 'quantidade', o.quantidade))
          from pedido_item_opcoes o where o.pedido_item_id = i.id
        ), '[]'::jsonb)
      ))
      from pedido_itens i where i.pedido_id = p.id
    ), '[]'::jsonb)
  ) into v
  from pedidos p
  join lojas l on l.id = p.loja_id
  where p.token = p_token;

  if v is null then
    raise exception 'Pedido não encontrado.';
  end if;
  return v;
end;
$$;

grant execute on function pedido_por_token(text) to anon, authenticated;

-- ---------------------------------------------------------------
-- pedido_detalhe() — o painel busca itens + opções sob demanda (só quando
-- o dono abre o card), pra não carregar tudo isso na lista inteira a cada
-- atualização.
-- ---------------------------------------------------------------
create or replace function pedido_detalhe(p_pedido_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not exists (
    select 1 from pedidos p join lojas l on l.id = p.loja_id
    where p.id = p_pedido_id and (l.dono_id = auth.uid() or is_admin())
  ) then
    raise exception 'Pedido não encontrado.';
  end if;

  select jsonb_agg(jsonb_build_object(
    'id', i.id,
    'nome', i.nome,
    'quantidade', i.quantidade,
    'preco_unitario', i.preco_unitario,
    'subtotal', i.subtotal,
    'observacao', i.observacao,
    'opcoes', coalesce((
      select jsonb_agg(jsonb_build_object('grupo', o.grupo_nome, 'nome', o.nome, 'preco', o.preco, 'quantidade', o.quantidade))
      from pedido_item_opcoes o where o.pedido_item_id = i.id
    ), '[]'::jsonb)
  )) into v
  from pedido_itens i where i.pedido_id = p_pedido_id;

  return coalesce(v, '[]'::jsonb);
end;
$$;

grant execute on function pedido_detalhe(uuid) to authenticated;
