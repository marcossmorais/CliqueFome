-- CliqueFome — operação da loja e disponibilidade por canal
-- Aplicar no Supabase antes (ou junto) do deploy desta versão.

begin;

alter table public.lojas
  add column if not exists retirada_ativa boolean not null default true;

-- Loja fechada nunca pode manter delivery ligado. A regra fica no banco
-- para valer também em updates fora do painel (SQL, integração ou API).
create or replace function public.cf_normalizar_operacao_loja()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not new.recebendo_encomendas then
    new.delivery_ativo := false;
  end if;
  return new;
end;
$$;

drop trigger if exists cf_normalizar_operacao_loja on public.lojas;
create trigger cf_normalizar_operacao_loja
before insert or update of recebendo_encomendas, delivery_ativo
on public.lojas
for each row execute function public.cf_normalizar_operacao_loja();

-- Normaliza lojas que já estavam fechadas antes da criação do trigger.
update public.lojas
set delivery_ativo = false
where not recebendo_encomendas and delivery_ativo;

-- Defesa final do checkout público. O painel pode continuar lançando um
-- pedido manual mesmo com a vitrine fechada; origem=site nunca pode.
create or replace function public.cf_validar_operacao_pedido_site()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aberta boolean;
  v_delivery boolean;
  v_retirada boolean;
begin
  if coalesce(new.origem, 'site') <> 'site' then
    return new;
  end if;

  select recebendo_encomendas, delivery_ativo, retirada_ativa
    into v_aberta, v_delivery, v_retirada
  from public.lojas
  where id = new.loja_id
  for share;

  if not found then
    raise exception 'Loja não encontrada.';
  end if;
  if not v_aberta then
    raise exception 'A loja está fechada e não está recebendo pedidos no momento.';
  end if;
  if new.tipo = 'delivery' and not v_delivery then
    raise exception 'A loja não está aceitando entregas no momento.';
  end if;
  if new.tipo = 'retirada' and not v_retirada then
    raise exception 'A retirada está indisponível no momento.';
  end if;
  return new;
end;
$$;

drop trigger if exists cf_validar_operacao_pedido_site on public.pedidos;
create trigger cf_validar_operacao_pedido_site
before insert on public.pedidos
for each row execute function public.cf_validar_operacao_pedido_site();

-- Todo item é conferido novamente na mesma transação da gravação. Isso
-- protege checkout, Novo pedido e qualquer writer futuro contra produto
-- esgotado ou canal não permitido. Array vazio continua liberando os canais
-- normais; encomenda exige marcação explícita no catálogo.
create or replace function public.cf_validar_disponibilidade_item_pedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo text;
  v_nome text;
  v_ativo boolean;
  v_tipos text[];
begin
  if new.produto_id is null then
    raise exception 'Produto indisponível.';
  end if;

  select tipo into v_tipo
  from public.pedidos
  where id = new.pedido_id;

  select nome, ativo, tipos_pedido
    into v_nome, v_ativo, v_tipos
  from public.produtos
  where id = new.produto_id
  for share;

  if not found or not v_ativo then
    raise exception 'O item "%" está esgotado.', coalesce(v_nome, 'removido');
  end if;
  if v_tipo = 'encomenda' and not ('encomenda' = any(coalesce(v_tipos, '{}'::text[]))) then
    raise exception 'O item "%" não está disponível para agendamento.', v_nome;
  end if;
  if cardinality(coalesce(v_tipos, '{}'::text[])) > 0
     and not (v_tipo = any(v_tipos)) then
    raise exception 'O item "%" não está disponível para este tipo de pedido.', v_nome;
  end if;
  return new;
end;
$$;

drop trigger if exists cf_validar_disponibilidade_item_pedido on public.pedido_itens;
create trigger cf_validar_disponibilidade_item_pedido
before insert or update of pedido_id, produto_id
on public.pedido_itens
for each row execute function public.cf_validar_disponibilidade_item_pedido();

revoke all on function public.cf_normalizar_operacao_loja() from public, anon, authenticated;
revoke all on function public.cf_validar_operacao_pedido_site() from public, anon, authenticated;
revoke all on function public.cf_validar_disponibilidade_item_pedido() from public, anon, authenticated;

commit;
