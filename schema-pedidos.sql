-- ===================================================================
-- PEDIDOS — CliqueFome
-- ===================================================================
-- Como usar: Supabase → SQL Editor → New query → cola tudo → Run.
-- Roda depois de schema.sql (+ schema-migracao-catalogo.sql).
--
-- ---------------------------------------------------------------
-- O DESENHO DE SEGURANÇA (leia antes de mexer)
-- ---------------------------------------------------------------
-- O cardápio é público e não tem login: qualquer pessoa com o link faz
-- pedido. Isso significa que TUDO que vem do navegador é suspeito. Três
-- decisões seguram isso:
--
-- 1. O NAVEGADOR NUNCA MANDA PREÇO. Ele manda só ids de produto/opção e
--    quantidades. A função criar_pedido() busca os preços no banco e faz
--    a conta. Sem isso, bastava abrir o devtools e mandar total = 0,01.
--
-- 2. O NAVEGADOR NUNCA ESCREVE EM "pedidos" DIRETO. Não existe policy de
--    insert/update pra anon. A única porta é criar_pedido(), que é
--    "security definer" (roda com privilégio elevado). Assim o cliente
--    não consegue criar pedido já com status "confirmado" nem marcar o
--    próprio pagamento como pago.
--
-- 3. O CLIENTE SÓ LÊ O PRÓPRIO PEDIDO. Não há policy de select pra anon —
--    ele consulta por pedido_por_token(), que exige o token aleatório
--    devolvido na criação. Sem listagem, não dá pra varrer pedidos dos
--    outros nem adivinhar por número sequencial.
--
-- Quem muda status é só o dono da loja, autenticado, e apenas na própria
-- loja — via as policies de update mais abaixo.
-- ===================================================================

create table if not exists pedidos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,

  -- Número curto e sequencial POR LOJA — é o que cliente e atendente
  -- falam em voz alta ("pedido 42"). O id uuid não serve pra isso.
  numero integer not null,

  -- Segredo de acompanhamento. Vai na URL que o cliente recebe e funciona
  -- como senha do pedido: quem não tem, não lê.
  token text not null unique default encode(gen_random_bytes(16), 'hex'),

  cliente_nome text not null,
  cliente_telefone text not null,

  tipo text not null check (tipo in ('delivery','retirada','balcao','mesa')),
  endereco text,
  observacao text,
  forma_pagamento text,

  -- Fluxo do pedido. "pendente" = caiu no painel e a loja ainda não
  -- confirmou; é o estado em que o cliente vê "aguardando confirmação".
  status text not null default 'pendente'
    check (status in ('pendente','confirmado','em_preparo','pronto','saiu_entrega','concluido','cancelado')),

  -- Pagamento anda separado do preparo: dá pra estar "em_preparo" com
  -- pagamento ainda pendente (dinheiro na entrega), ou já pago e ainda
  -- não confirmado pela loja. Quando a ValidaPay entrar, é este campo
  -- que o webhook do checkout vai atualizar.
  pagamento_status text not null default 'pendente'
    check (pagamento_status in ('pendente','confirmado','estornado')),

  -- Valores calculados pelo banco em criar_pedido(). Ficam gravados
  -- porque são o que foi cobrado — se a loja mudar o preço amanhã, o
  -- pedido de ontem não pode mudar junto.
  subtotal numeric(10,2) not null default 0,
  taxa_entrega numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,

  criado_em timestamptz not null default now(),
  confirmado_em timestamptz,
  concluido_em timestamptz,

  unique (loja_id, numero)
);

create index if not exists idx_pedidos_loja_status on pedidos(loja_id, status);
create index if not exists idx_pedidos_criado on pedidos(loja_id, criado_em desc);

-- Item do pedido. Guarda o NOME e o PREÇO do momento da compra (snapshot),
-- não só a referência ao produto — senão renomear ou reprecificar um item
-- reescreveria o histórico e o financeiro.
create table if not exists pedido_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos(id) on delete cascade,
  produto_id uuid references produtos(id) on delete set null,
  nome text not null,
  preco_unitario numeric(10,2) not null,
  quantidade integer not null check (quantidade > 0),
  observacao text,
  subtotal numeric(10,2) not null
);

create index if not exists idx_pedido_itens_pedido on pedido_itens(pedido_id);

-- Opções escolhidas dentro de cada item (os complementos), também em
-- snapshot.
create table if not exists pedido_item_opcoes (
  id uuid primary key default gen_random_uuid(),
  pedido_item_id uuid not null references pedido_itens(id) on delete cascade,
  complemento_id uuid references complementos(id) on delete set null,
  grupo_nome text not null,
  nome text not null,
  preco numeric(10,2) not null,
  quantidade integer not null default 1
);

create index if not exists idx_pedido_item_opcoes_item on pedido_item_opcoes(pedido_item_id);

-- ---------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------
alter table pedidos enable row level security;
alter table pedido_itens enable row level security;
alter table pedido_item_opcoes enable row level security;

-- Sem policy de select/insert pra anon de propósito (ver cabeçalho).
-- O dono da loja lê e atualiza só os pedidos da própria loja.
drop policy if exists "pedidos_select_dono" on pedidos;
create policy "pedidos_select_dono"
  on pedidos for select
  to authenticated
  using (loja_id in (select id from lojas where dono_id = auth.uid()) or is_admin());

drop policy if exists "pedidos_update_dono" on pedidos;
create policy "pedidos_update_dono"
  on pedidos for update
  to authenticated
  using (loja_id in (select id from lojas where dono_id = auth.uid()) or is_admin())
  with check (loja_id in (select id from lojas where dono_id = auth.uid()) or is_admin());

drop policy if exists "pedido_itens_select_dono" on pedido_itens;
create policy "pedido_itens_select_dono"
  on pedido_itens for select
  to authenticated
  using (pedido_id in (
    select p.id from pedidos p join lojas l on l.id = p.loja_id
    where l.dono_id = auth.uid()
  ) or is_admin());

drop policy if exists "pedido_item_opcoes_select_dono" on pedido_item_opcoes;
create policy "pedido_item_opcoes_select_dono"
  on pedido_item_opcoes for select
  to authenticated
  using (pedido_item_id in (
    select pi.id from pedido_itens pi
    join pedidos p on p.id = pi.pedido_id
    join lojas l on l.id = p.loja_id
    where l.dono_id = auth.uid()
  ) or is_admin());

-- ---------------------------------------------------------------
-- criar_pedido() — a única porta de entrada de pedido
-- ---------------------------------------------------------------
-- p_itens é um jsonb no formato:
--   [{ "produto_id": "uuid",
--      "quantidade": 2,
--      "observacao": "sem cebola",
--      "opcoes": [{ "complemento_id": "uuid", "quantidade": 1 }, ...] }]
--
-- Devolve { "numero": 42, "token": "abc...", "total": 61.80 }.
create or replace function criar_pedido(
  p_loja_slug text,
  p_cliente_nome text,
  p_cliente_telefone text,
  p_tipo text,
  p_endereco text,
  p_observacao text,
  p_forma_pagamento text,
  p_itens jsonb
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
  -- acumuladores por grupo, pro modo de preço (soma/media/maior/menor)
  v_grupo_id uuid;
  v_precos numeric[];
  v_modo text;
begin
  if p_cliente_nome is null or length(trim(p_cliente_nome)) < 2 then
    raise exception 'Informe o nome de quem está pedindo.';
  end if;
  if p_cliente_telefone is null or length(regexp_replace(p_cliente_telefone, '\D', '', 'g')) < 10 then
    raise exception 'Informe um telefone válido com DDD.';
  end if;
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'O pedido está vazio.';
  end if;

  select * into v_loja from lojas where slug = p_loja_slug;
  if not found then
    raise exception 'Loja não encontrada.';
  end if;

  -- Loja fechada não recebe pedido de delivery. A checagem é aqui e não
  -- só na tela: o botão escondido no front não impede um POST direto.
  if p_tipo = 'delivery' and not v_loja.delivery_ativo then
    raise exception 'A loja não está aceitando pedidos de delivery no momento.';
  end if;
  if p_tipo = 'delivery' and (p_endereco is null or length(trim(p_endereco)) < 5) then
    raise exception 'Informe o endereço de entrega.';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := coalesce((v_item->>'quantidade')::integer, 1);
    if v_qtd < 1 or v_qtd > 99 then
      raise exception 'Quantidade inválida.';
    end if;

    select * into v_produto from produtos
      where id = (v_item->>'produto_id')::uuid
        and loja_id = v_loja.id;   -- impede pedir item de OUTRA loja
    if not found then
      raise exception 'Produto indisponível.';
    end if;
    if not v_produto.ativo then
      raise exception 'O item "%" está esgotado.', v_produto.nome;
    end if;

    -- Preço promocional manda quando existe.
    v_preco_base := coalesce(v_produto.preco_promocional, v_produto.preco);
    v_extra := 0;

    -- Soma os complementos respeitando o modo de preço de cada grupo.
    if v_item ? 'opcoes' then
      for v_grupo_id in
        select distinct c.grupo_id
        from jsonb_array_elements(v_item->'opcoes') o
        join complementos c on c.id = (o->>'complemento_id')::uuid
      loop
        select * into v_grupo from grupos_complemento
          where id = v_grupo_id and loja_id = v_loja.id;
        if not found then
          raise exception 'Complemento inválido.';
        end if;
        v_modo := v_grupo.modo_preco;

        select array_agg(c.preco * coalesce((o->>'quantidade')::integer, 1))
          into v_precos
          from jsonb_array_elements(v_item->'opcoes') o
          join complementos c on c.id = (o->>'complemento_id')::uuid
          where c.grupo_id = v_grupo_id and c.ativo;

        if v_precos is not null then
          v_extra := v_extra + case v_modo
            when 'soma'  then (select coalesce(sum(x), 0) from unnest(v_precos) x)
            when 'media' then (select coalesce(avg(x), 0) from unnest(v_precos) x)
            when 'maior' then (select coalesce(max(x), 0) from unnest(v_precos) x)
            when 'menor' then (select coalesce(min(x), 0) from unnest(v_precos) x)
            else (select coalesce(sum(x), 0) from unnest(v_precos) x)
          end;
        end if;
      end loop;
    end if;

    v_unitario := v_preco_base + v_extra;
    v_subtotal := v_subtotal + (v_unitario * v_qtd);
  end loop;

  if p_tipo = 'delivery' then
    v_taxa := coalesce(v_loja.taxa_entrega, 0);
  end if;

  if v_subtotal < coalesce(v_loja.pedido_minimo, 0) then
    raise exception 'O pedido mínimo é de R$ %.', to_char(v_loja.pedido_minimo, 'FM999999990.00');
  end if;

  -- Trava por loja pra dois pedidos simultâneos não pegarem o mesmo número.
  perform pg_advisory_xact_lock(hashtext(v_loja.id::text));
  select coalesce(max(numero), 0) + 1 into v_numero from pedidos where loja_id = v_loja.id;

  insert into pedidos (
    loja_id, numero, cliente_nome, cliente_telefone, tipo, endereco,
    observacao, forma_pagamento, subtotal, taxa_entrega, total
  ) values (
    v_loja.id, v_numero, trim(p_cliente_nome), trim(p_cliente_telefone), p_tipo,
    nullif(trim(coalesce(p_endereco, '')), ''), nullif(trim(coalesce(p_observacao, '')), ''),
    p_forma_pagamento, v_subtotal, v_taxa, v_subtotal + v_taxa
  ) returning id, token into v_pedido_id, v_token;

  -- Segunda passada: grava os itens já com os valores calculados.
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := coalesce((v_item->>'quantidade')::integer, 1);
    select * into v_produto from produtos
      where id = (v_item->>'produto_id')::uuid and loja_id = v_loja.id;

    v_preco_base := coalesce(v_produto.preco_promocional, v_produto.preco);
    v_extra := 0;

    if v_item ? 'opcoes' then
      for v_grupo_id in
        select distinct c.grupo_id
        from jsonb_array_elements(v_item->'opcoes') o
        join complementos c on c.id = (o->>'complemento_id')::uuid
      loop
        select * into v_grupo from grupos_complemento where id = v_grupo_id;
        select array_agg(c.preco * coalesce((o->>'quantidade')::integer, 1))
          into v_precos
          from jsonb_array_elements(v_item->'opcoes') o
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
    end if;

    v_unitario := v_preco_base + v_extra;

    insert into pedido_itens (pedido_id, produto_id, nome, preco_unitario, quantidade, observacao, subtotal)
    values (v_pedido_id, v_produto.id, v_produto.nome, v_unitario, v_qtd,
            nullif(trim(coalesce(v_item->>'observacao', '')), ''), v_unitario * v_qtd)
    returning id into v_item_id;

    if v_item ? 'opcoes' then
      for v_opcao in select * from jsonb_array_elements(v_item->'opcoes') loop
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

grant execute on function criar_pedido(text,text,text,text,text,text,text,jsonb) to anon, authenticated;

-- ---------------------------------------------------------------
-- pedido_por_token() — o cliente acompanha o próprio pedido
-- ---------------------------------------------------------------
-- Exige o token, então não dá pra varrer pedido dos outros. Devolve só o
-- que a tela de acompanhamento precisa — telefone e endereço ficam de
-- fora do payload público exceto o que o próprio cliente digitou.
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
-- Carimbo de data nas transições de status
-- ---------------------------------------------------------------
create or replace function pedidos_marcar_tempos()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'confirmado' and old.status is distinct from 'confirmado' then
    new.confirmado_em := now();
  end if;
  if new.status = 'concluido' and old.status is distinct from 'concluido' then
    new.concluido_em := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pedidos_tempos on pedidos;
create trigger trg_pedidos_tempos
  before update on pedidos
  for each row execute function pedidos_marcar_tempos();

-- ---------------------------------------------------------------
-- AINDA NÃO COBERTO (deixado explícito de propósito)
-- ---------------------------------------------------------------
-- • Limite de pedidos por telefone/IP. Hoje dá pra floodar a loja com
--   pedidos falsos. Quando a ValidaPay entrar, o pagamento antecipado
--   resolve boa parte; até lá, o dono cancela pelo painel.
-- • Confirmação do telefone (SMS/WhatsApp). Sem isso, o nome e telefone
--   do pedido são o que a pessoa digitou, não um dado verificado.
-- • pagamento_status só muda pelo painel por enquanto. O webhook da
--   ValidaPay vai precisar de uma função própria, com validação de
--   assinatura — nunca deixe o navegador escrever nesse campo.
