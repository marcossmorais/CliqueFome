-- Persistência do checkout público — TODO pedido finalizado no cardápio
-- passa a virar registro oficial em `pedidos`, independente do plano.
--
-- Decisão de produto (docs/DECISIONS.md): a persistência do pedido NÃO é
-- funcionalidade Pro. Só o PAGAMENTO ONLINE é que fica condicionado a
-- Pro/Pro+, e nem esse está habilitado ainda — não existe gateway, webhook
-- nem assinatura. Este arquivo prepara o terreno (capacidades_checkout) mas
-- não liga pagamento nenhum.
--
-- Como aplicar: Supabase → SQL Editor → New query → colar tudo → Run.
-- Depende de schema-pedidos.sql + schema-migracao-pedidos.sql já aplicados.
-- Seguro rodar mais de uma vez (create or replace / if not exists em tudo).
--
-- ROLLBACK: ver o bloco "ROLLBACK" no fim do arquivo — desliga o checkout
-- público sem apagar nenhum pedido já criado.

begin;

-- ---------------------------------------------------------------
-- IDEMPOTÊNCIA — a chave é reservada ANTES de criar o pedido. É o índice
-- único, não uma variável em memória ou o React, que impede duplo clique,
-- timeout com retry ou duas abas criarem dois pedidos.
-- ---------------------------------------------------------------
create table if not exists public.pedido_idempotencia (
  loja_id uuid not null references public.lojas(id) on delete cascade,
  idempotency_key uuid not null,
  payload_hash text not null,
  -- Nulo enquanto a criação ainda está em andamento nesta mesma corrida;
  -- preenchido só depois que criar_pedido() e a conferência de total
  -- passarem. Ver criar_pedido_publico_v1() abaixo.
  pedido_id uuid references public.pedidos(id) on delete set null,
  criado_em timestamptz not null default now(),
  primary key (loja_id, idempotency_key)
);

create index if not exists idx_pedido_idempotencia_pedido on public.pedido_idempotencia(pedido_id);

alter table public.pedido_idempotencia enable row level security;
-- Nenhum papel de cliente lê ou escreve aqui direto — só a RPC
-- SECURITY DEFINER abaixo, que roda com o privilégio do dono da função.
revoke all on table public.pedido_idempotencia from public, anon, authenticated;

-- ---------------------------------------------------------------
-- RATE LIMIT NO BANCO — mesmo padrão de delivery_cotacao_limites /
-- consumir_cota_delivery (schema-migracao-delivery-facilitado.sql). Não é
-- Map em memória: sobrevive a cold start de função serverless e é a mesma
-- contagem não importa qual instância da Vercel atendeu a requisição.
-- ---------------------------------------------------------------
create table if not exists public.pedido_checkout_limites (
  -- prefixo "ip:" ou "tel:" + hash — mesma tabela serve as duas contagens.
  chave text not null,
  janela timestamptz not null,
  quantidade integer not null default 0,
  primary key (chave, janela)
);

create table if not exists public.pedido_checkout_diario (
  dia date primary key,
  quantidade integer not null default 0
);

alter table public.pedido_checkout_limites enable row level security;
alter table public.pedido_checkout_diario enable row level security;
revoke all on table public.pedido_checkout_limites from public, anon, authenticated;
revoke all on table public.pedido_checkout_diario from public, anon, authenticated;

-- Limites: 8 tentativas / 10 min por IP+loja, 5 / 10 min por telefone+loja
-- (telefone é opcional na chamada — chega null quando ainda não deu pra
-- normalizar), teto de emergência de 5000 pedidos/dia por todo o sistema.
-- Números folgados pro uso real de uma lanchonete pequena e baratos de
-- ajustar depois sem migration (é só mudar a constante e trocar a função).
create or replace function public.consumir_cota_checkout(p_chave_ip text, p_chave_telefone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Janela de 10 minutos, truncada pra baixo — mesmas duas requisições
  -- dentro da janela caem no mesmo bucket sem precisar de tabela de sessão.
  v_janela timestamptz := to_timestamp(floor(extract(epoch from now()) / 600) * 600);
  v_qtd_ip integer;
  v_qtd_tel integer;
  v_qtd_dia integer;
begin
  if p_chave_ip is null or length(p_chave_ip) <> 64 then
    raise exception 'Chave de limite inválida.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('checkout-ip:' || p_chave_ip || ':' || v_janela::text));
  insert into public.pedido_checkout_limites (chave, janela, quantidade)
  values ('ip:' || p_chave_ip, v_janela, 1)
  on conflict (chave, janela) do update
    set quantidade = public.pedido_checkout_limites.quantidade + 1
  returning quantidade into v_qtd_ip;
  if v_qtd_ip > 8 then
    return jsonb_build_object('permitido', false, 'motivo', 'MUITAS_TENTATIVAS');
  end if;

  if p_chave_telefone is not null and length(p_chave_telefone) = 64 then
    perform pg_advisory_xact_lock(hashtext('checkout-tel:' || p_chave_telefone || ':' || v_janela::text));
    insert into public.pedido_checkout_limites (chave, janela, quantidade)
    values ('tel:' || p_chave_telefone, v_janela, 1)
    on conflict (chave, janela) do update
      set quantidade = public.pedido_checkout_limites.quantidade + 1
    returning quantidade into v_qtd_tel;
    if v_qtd_tel > 5 then
      return jsonb_build_object('permitido', false, 'motivo', 'MUITAS_TENTATIVAS');
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('checkout-dia:' || current_date::text));
  insert into public.pedido_checkout_diario (dia, quantidade)
  values (current_date, 1)
  on conflict (dia) do update
    set quantidade = public.pedido_checkout_diario.quantidade + 1
  returning quantidade into v_qtd_dia;
  if v_qtd_dia > 5000 then
    return jsonb_build_object('permitido', false, 'motivo', 'LIMITE_DIARIO');
  end if;

  return jsonb_build_object('permitido', true);
end;
$$;

revoke execute on function public.consumir_cota_checkout(text, text) from public, anon, authenticated;
grant execute on function public.consumir_cota_checkout(text, text) to service_role;

-- ---------------------------------------------------------------
-- criar_pedido() — CREATE OR REPLACE só pra acrescentar 'id', 'subtotal' e
-- 'taxa_entrega' no jsonb de retorno (chaves novas, ninguém que já lê
-- 'numero'/'token'/'total' quebra). Corpo idêntico ao de
-- schema-migracao-pedidos.sql — é o mesmo núcleo de validação usado pelo
-- pedido manual do painel (ModalPedidoManual → criarPedidoManual) e agora
-- também pelo wrapper público abaixo. Nenhuma regra de validação mudou
-- aqui: só o que a função devolve no final.
-- ---------------------------------------------------------------
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
  if p_cliente_telefone is null or length(regexp_replace(p_cliente_telefone, '\D', '', 'g')) < 10 then
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
-- service_role. Isso preserva a decisão de SEC-05 (rate limit fora do
-- banco não bastava; agora o limite mora dentro do banco, na RPC pública).
revoke execute on function criar_pedido(text,text,text,text,text,text,text,jsonb,timestamptz,text,text) from public, anon;
grant execute on function criar_pedido(text,text,text,text,text,text,text,jsonb,timestamptz,text,text) to authenticated;

-- ---------------------------------------------------------------
-- criar_pedido_publico_v1() — a ÚNICA porta do cardápio público. Chamada
-- só pelo Route Handler (POST /api/lojas/[slug]/pedidos), com o client
-- privilegiado (service_role). O navegador NUNCA chama isto direto.
--
-- Fixa internamente o que o navegador não pode escolher: origem='site',
-- status inicial='pendente' (via p_status_inicial=null), forma de
-- pagamento='A combinar pelo WhatsApp'. Reaproveita 100% da validação de
-- catálogo/preço de criar_pedido() — não duplica a lógica de item/opção.
-- ---------------------------------------------------------------
create or replace function public.criar_pedido_publico_v1(
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
    raise exception 'Requisição sem identificador de repetição.' using errcode = '22023';
  end if;
  if p_payload_hash is null or length(p_payload_hash) <> 64 then
    raise exception 'Requisição inválida.' using errcode = '22023';
  end if;

  select id into v_loja_id from lojas where slug = p_loja_slug;
  if v_loja_id is null then
    raise exception 'Loja não encontrada.';
  end if;

  select * into v_existente from pedido_idempotencia
    where loja_id = v_loja_id and idempotency_key = p_idempotency_key;

  if found then
    if v_existente.payload_hash <> p_payload_hash then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = '22023';
    end if;
    if v_existente.pedido_id is null then
      -- A primeira tentativa com esta chave ainda não terminou (ou morreu
      -- no meio sem limpar): pedir pro cliente tentar de novo em vez de
      -- travar aqui dentro da transação.
      raise exception 'Pedido ainda sendo processado. Tente novamente em instantes.' using errcode = '22023';
    end if;

    select id, numero, token, subtotal, taxa_entrega, total into v_pedido
      from pedidos where id = v_existente.pedido_id;
    if not found then
      raise exception 'Pedido não encontrado.';
    end if;
    return jsonb_build_object(
      'id', v_pedido.id, 'numero', v_pedido.numero, 'token', v_pedido.token,
      'subtotal', v_pedido.subtotal, 'taxa_entrega', v_pedido.taxa_entrega,
      'total', v_pedido.total, 'replay', true
    );
  end if;

  -- Reserva a chave AQUI, antes de tocar em `pedidos`. É a unique
  -- constraint (loja_id, idempotency_key) — não uma variável — que serializa
  -- duas requisições concorrentes com a mesma chave: a segunda vai bloquear
  -- neste insert até a primeira confirmar ou desfazer, e nunca as duas
  -- criam pedido.
  insert into pedido_idempotencia (loja_id, idempotency_key, payload_hash)
  values (v_loja_id, p_idempotency_key, p_payload_hash);

  v_limite := consumir_cota_checkout(p_chave_ip, p_chave_telefone);
  if (v_limite->>'permitido') is distinct from 'true' then
    raise exception 'RATE_LIMIT:%', coalesce(v_limite->>'motivo', 'LIMITE') using errcode = '22023';
  end if;

  v_resultado := criar_pedido(
    p_loja_slug, p_cliente_nome, p_cliente_telefone, p_tipo, p_endereco,
    p_observacao, 'A combinar pelo WhatsApp', p_itens, null, 'site', null
  );

  v_total_centavos := round((v_resultado->>'total')::numeric * 100);
  -- Tolerância de 5 centavos pra absorver arredondamento de ponto
  -- flutuante entre o que o navegador somou e o numeric(10,2) do banco —
  -- não é margem pra manipular preço, é só folga de arredondamento.
  if p_total_esperado_centavos is not null
     and abs(v_total_centavos - p_total_esperado_centavos) > 5 then
    raise exception 'CART_CHANGED' using errcode = '22023';
  end if;

  update pedido_idempotencia
    set pedido_id = (v_resultado->>'id')::uuid
    where loja_id = v_loja_id and idempotency_key = p_idempotency_key;

  return jsonb_build_object(
    'id', v_resultado->>'id',
    'numero', (v_resultado->>'numero')::integer,
    'token', v_resultado->>'token',
    'subtotal', (v_resultado->>'subtotal')::numeric,
    'taxa_entrega', (v_resultado->>'taxa_entrega')::numeric,
    'total', (v_resultado->>'total')::numeric,
    'replay', false
  );
end;
$$;

-- Só o backend (service_role) chama isto. anon e authenticated ficam de
-- fora de propósito: o navegador nunca fala direto com o Postgres aqui,
-- só via Route Handler, que é onde vivem o rate limit de borda e o CAPTCHA
-- opcional (ver app/api/lojas/[slug]/pedidos/route.ts).
revoke execute on function public.criar_pedido_publico_v1(text,text,text,text,text,text,jsonb,uuid,text,integer,text,text) from public, anon, authenticated;
grant execute on function public.criar_pedido_publico_v1(text,text,text,text,text,text,jsonb,uuid,text,integer,text,text) to service_role;

-- ---------------------------------------------------------------
-- FECHA O UPDATE AMPLO (achado de auditoria SEC-06) — a policy antiga
-- deixava o dono dar UPDATE em QUALQUER coluna de `pedidos`, inclusive
-- total/loja_id/cliente/token/origem. Ela sai, e no lugar entram duas RPCs
-- estreitas com compare-and-set e matriz de transição. Sem policy de
-- UPDATE nenhuma pra authenticated: só estas duas funções, que são
-- SECURITY DEFINER e rodam com o privilégio do dono da função.
-- ---------------------------------------------------------------
drop policy if exists "pedidos_update_dono" on public.pedidos;

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
  v_pedido pedidos%rowtype;
  v_transicoes_validas text[];
begin
  select p.* into v_pedido from pedidos p where p.id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido não encontrado.';
  end if;

  if not (
    exists (select 1 from lojas where id = v_pedido.loja_id and dono_id = auth.uid())
    or is_admin()
  ) then
    -- Mesma mensagem de "não encontrado": não confirma pra quem não é dono
    -- que o id existe em outra loja.
    raise exception 'Pedido não encontrado.';
  end if;

  if p_novo_status not in ('pendente','confirmado','em_preparo','pronto','saiu_entrega','concluido','cancelado') then
    raise exception 'Status inválido.';
  end if;

  if v_pedido.status in ('concluido','cancelado') then
    raise exception 'Pedido já está %.', v_pedido.status;
  end if;
  if v_pedido.status <> p_status_esperado then
    raise exception 'CONFLITO' using errcode = '22023';
  end if;

  -- Cancelar vale de qualquer status ativo. Fora isso, só anda pra frente —
  -- é a mesma progressão de lib/pedidos/tipos.ts (proximoStatus), espelhada
  -- aqui pra não confiar só no que o navegador manda.
  if p_novo_status <> 'cancelado' then
    v_transicoes_validas := case v_pedido.status
      when 'pendente'      then array['confirmado']
      when 'confirmado'    then array['em_preparo']
      when 'em_preparo'    then array['pronto']
      when 'pronto'        then array['saiu_entrega','concluido']
      when 'saiu_entrega'  then array['concluido']
      else array[]::text[]
    end;
    if not (p_novo_status = any(v_transicoes_validas)) then
      raise exception 'Transição de status inválida.';
    end if;
  end if;

  update pedidos set status = p_novo_status
    where id = p_pedido_id and status = p_status_esperado;

  return jsonb_build_object('ok', true, 'status', p_novo_status);
end;
$$;

revoke execute on function public.transicionar_pedido(uuid, text, text) from public, anon;
grant execute on function public.transicionar_pedido(uuid, text, text) to authenticated;

create or replace function public.marcar_pagamento_manual(
  p_pedido_id uuid,
  p_pagamento_esperado text,
  p_novo_pagamento text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido pedidos%rowtype;
begin
  select p.* into v_pedido from pedidos p where p.id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido não encontrado.';
  end if;

  if not (
    exists (select 1 from lojas where id = v_pedido.loja_id and dono_id = auth.uid())
    or is_admin()
  ) then
    raise exception 'Pedido não encontrado.';
  end if;

  if p_novo_pagamento not in ('pendente','confirmado','estornado') then
    raise exception 'Status de pagamento inválido.';
  end if;
  if v_pedido.pagamento_status = 'estornado' then
    raise exception 'Pagamento já estornado — não dá pra mudar de novo.';
  end if;
  if v_pedido.pagamento_status <> p_pagamento_esperado then
    raise exception 'CONFLITO' using errcode = '22023';
  end if;

  update pedidos set pagamento_status = p_novo_pagamento
    where id = p_pedido_id and pagamento_status = p_pagamento_esperado;

  return jsonb_build_object('ok', true, 'pagamento_status', p_novo_pagamento);
end;
$$;

revoke execute on function public.marcar_pagamento_manual(uuid, text, text) from public, anon;
grant execute on function public.marcar_pagamento_manual(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------
-- CAPACIDADES POR PLANO — domínio preparado, pagamento online DESLIGADO
-- pra todo mundo até existir gateway/webhook/antifraude de verdade.
-- `loja_planos` já existe (schema-migracao-avaliacoes.sql), server-owned:
-- o dono só lê o próprio plano, só admin/service_role escreve. Reaproveita
-- essa tabela em vez de criar uma `loja_capacidades` paralela.
-- ---------------------------------------------------------------
create or replace function public.capacidades_checkout(p_loja_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'plano', coalesce((select plano from loja_planos where loja_id = p_loja_id), 'basico'),
    'persistir_pedido', true,
    -- Fica false até o gateway existir de verdade — não é flag de plano,
    -- é flag de "a integração está pronta". Pro e Pro+ terão a MESMA
    -- capacidade de pagamento online quando isso ligar; nenhum dos dois
    -- ganha preço/benefício inventado aqui.
    'pagamento_online_habilitado', false,
    'whatsapp_manual', true
  );
$$;

revoke execute on function public.capacidades_checkout(uuid) from public;
grant execute on function public.capacidades_checkout(uuid) to anon, authenticated;

-- ---------------------------------------------------------------
-- REALTIME — Gestão de pedidos (PedidosClient.tsx) passa a assinar
-- mudanças em `pedidos` via postgres_changes, filtradas por loja_id, em
-- vez de esperar o polling de 20s trazer pedido novo. A RLS de
-- "pedidos_select_dono" continua sendo a autorização: o evento só avisa
-- que algo mudou, o cliente sempre confere com um SELECT de verdade
-- (nunca confia no payload bruto do evento).
-- ---------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pedidos'
  ) then
    alter publication supabase_realtime add table public.pedidos;
  end if;
end $$;

commit;

-- ---------------------------------------------------------------
-- CONFERÊNCIA — rode depois de aplicar. Nada deve dar erro; as duas
-- últimas consultas devem voltar vazias.
-- ---------------------------------------------------------------
select proname, pg_get_function_identity_arguments(oid) as args
from pg_proc
where proname in ('criar_pedido_publico_v1','transicionar_pedido','marcar_pagamento_manual','consumir_cota_checkout','capacidades_checkout')
  and pronamespace = 'public'::regnamespace;

-- anon não pode executar nada sensível daqui:
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('criar_pedido_publico_v1','transicionar_pedido','marcar_pagamento_manual','consumir_cota_checkout')
  and has_function_privilege('anon', p.oid, 'EXECUTE');

-- não deve sobrar policy de UPDATE amplo em pedidos:
select policyname from pg_policies where tablename = 'pedidos' and cmd = 'UPDATE';

-- confirma que `pedidos` está na publicação de realtime:
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pedidos';

-- ---------------------------------------------------------------
-- ROLLBACK — desliga o checkout público sem apagar nenhum pedido já criado.
-- Os pedidos que já existem continuam intactos em `pedidos`; isto só tira a
-- porta de entrada nova.
-- ---------------------------------------------------------------
-- begin;
--   revoke execute on function public.criar_pedido_publico_v1(text,text,text,text,text,text,jsonb,uuid,text,integer,text,text) from service_role;
--   -- Repor a policy antiga de UPDATE amplo, se for preciso voltar atrás
--   -- nas RPCs estreitas também (não recomendado — ela é o achado SEC-06):
--   -- create policy "pedidos_update_dono" on public.pedidos for update
--   --   to authenticated
--   --   using (loja_id in (select id from lojas where dono_id = auth.uid()) or is_admin())
--   --   with check (loja_id in (select id from lojas where dono_id = auth.uid()) or is_admin());
-- commit;
-- O Route Handler (app/api/lojas/[slug]/pedidos/route.ts) também pode ser
-- desligado sozinho, sem tocar no banco: basta a Vercel remover/reverter o
-- deploy do arquivo, ou colocar CHECKOUT_PUBLICO_ATIVO=false (ver .env.example)
-- pra ele responder 503 sem chamar a RPC.
