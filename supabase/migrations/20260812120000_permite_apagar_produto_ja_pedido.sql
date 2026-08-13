-- Produto que já foi pedido uma vez ficava impossível de apagar.
--
-- O caminho do bug:
--   1. pedido_itens.produto_id tem `references produtos(id) on delete set null`
--      — de propósito: o item guarda nome, preço unitário e subtotal em
--      snapshot, então o histórico sobrevive ao produto sair do catálogo;
--   2. ao apagar o produto, o Postgres roda internamente
--      `update pedido_itens set produto_id = null where produto_id = <id>`;
--   3. isso acorda o trigger cf_validar_disponibilidade_item_pedido, que é
--      `before insert or update of pedido_id, produto_id`;
--   4. a primeira linha da função barra produto_id nulo e o DELETE inteiro
--      volta como `P0001: Produto indisponível.`
--
-- No painel isso aparecia como "não apaga": o dono confirmava, via a
-- mensagem de erro sumir junto com o modal e o card continuava lá.
--
-- A correção deixa passar exatamente uma transição — a de soltar o vínculo
-- de um item já gravado. Desligar produto_id de um item histórico não é
-- lançar pedido nenhum, e não muda o que foi cobrado: o valor do item mora
-- no snapshot, não no produto. Todo o resto da validação (esgotado, canal,
-- agendamento) continua valendo para insert e para troca de produto.
--
-- Rodar no SQL Editor do Supabase. Seguro rodar mais de uma vez.

begin;

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
  -- Saída única: o `on delete set null` do FK, disparado quando o dono apaga
  -- o produto do catálogo. Só vale saindo de um vínculo existente para nulo.
  if tg_op = 'UPDATE' and new.produto_id is null and old.produto_id is not null then
    return new;
  end if;

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

revoke all on function public.cf_validar_disponibilidade_item_pedido() from public, anon, authenticated;

commit;

-- ---------------------------------------------------------------
-- CONFERÊNCIA
-- ---------------------------------------------------------------
-- Precisa devolver uma linha, com a saída do tg_op = 'UPDATE' presente.
select pg_get_functiondef(p.oid) ilike '%tg_op = ''UPDATE''%' as tem_saida_do_fk
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'cf_validar_disponibilidade_item_pedido';
