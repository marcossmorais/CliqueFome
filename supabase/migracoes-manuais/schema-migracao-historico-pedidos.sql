-- Histórico de pedidos: cancelamento com motivo e arquivamento lógico.
-- Aplique no Supabase antes de publicar a interface desta alteração.
begin;

alter table public.pedidos
  add column if not exists motivo_cancelamento text,
  add column if not exists historico_oculto_em timestamptz,
  add column if not exists historico_oculto_por uuid references auth.users(id) on delete set null;

alter table public.pedidos drop constraint if exists pedidos_motivo_cancelamento_tamanho;
alter table public.pedidos add constraint pedidos_motivo_cancelamento_tamanho
  check (motivo_cancelamento is null or char_length(motivo_cancelamento) between 3 and 300);

create index if not exists idx_pedidos_historico_visivel
  on public.pedidos (loja_id, criado_em desc)
  where status in ('concluido', 'cancelado') and historico_oculto_em is null;

create or replace function public.cancelar_pedido(
  p_pedido_id uuid,
  p_status_esperado text,
  p_motivo text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_motivo text := nullif(btrim(p_motivo), '');
begin
  if v_motivo is null or char_length(v_motivo) not between 3 and 300 then
    raise exception 'Informe um motivo entre 3 e 300 caracteres.' using errcode = '22023';
  end if;

  select p.* into v_pedido from public.pedidos p where p.id = p_pedido_id for update;
  if not found or not (
    exists (select 1 from public.lojas l where l.id = v_pedido.loja_id and l.dono_id = auth.uid())
    or public.is_admin()
  ) then
    raise exception 'Pedido não encontrado.';
  end if;
  if v_pedido.status in ('concluido', 'cancelado') then
    raise exception 'Pedido já está finalizado.';
  end if;
  if v_pedido.status <> p_status_esperado then
    raise exception 'CONFLITO' using errcode = '22023';
  end if;

  update public.pedidos
     set status = 'cancelado', motivo_cancelamento = v_motivo
   where id = p_pedido_id and status = p_status_esperado;

  return jsonb_build_object('ok', true, 'status', 'cancelado');
end;
$$;

revoke execute on function public.cancelar_pedido(uuid, text, text) from public, anon;
grant execute on function public.cancelar_pedido(uuid, text, text) to authenticated;

create or replace function public.arquivar_pedidos_historico(p_pedido_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_alterados integer;
begin
  select count(*) into v_total from (select distinct unnest(p_pedido_ids) id) selecionados;
  if v_total < 1 or v_total > 100 then
    raise exception 'Selecione entre 1 e 100 pedidos.' using errcode = '22023';
  end if;

  update public.pedidos p
     set historico_oculto_em = now(), historico_oculto_por = auth.uid()
   where p.id = any(p_pedido_ids)
     and p.status in ('concluido', 'cancelado')
     and p.historico_oculto_em is null
     and (
       exists (select 1 from public.lojas l where l.id = p.loja_id and l.dono_id = auth.uid())
       or public.is_admin()
     );
  get diagnostics v_alterados = row_count;

  if v_alterados <> v_total then
    raise exception 'SELECAO_INVALIDA' using errcode = '22023';
  end if;
  return jsonb_build_object('ok', true, 'arquivados', v_alterados);
end;
$$;

revoke execute on function public.arquivar_pedidos_historico(uuid[]) from public, anon;
grant execute on function public.arquivar_pedidos_historico(uuid[]) to authenticated;

commit;

-- Conferência:
-- select column_name from information_schema.columns
-- where table_schema='public' and table_name='pedidos'
-- and column_name in ('motivo_cancelamento','historico_oculto_em','historico_oculto_por');
