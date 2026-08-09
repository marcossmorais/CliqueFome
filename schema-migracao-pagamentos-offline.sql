-- CliqueFome — pagamentos manuais/offline do checkout público
-- Aplicar no Supabase ANTES do deploy do código que chama esta RPC.
-- Não cria pagamento online e não altera a máquina de estados do pedido.

begin;

create or replace function public.criar_pedido_publico_offline_v1(
  p_loja_slug text,
  p_cliente_nome text,
  p_cliente_telefone text,
  p_tipo text,
  p_endereco text,
  p_observacao text,
  p_forma_pagamento text,
  p_itens jsonb,
  p_idempotency_key uuid,
  p_payload_hash text,
  p_total_esperado_centavos integer,
  p_chave_ip text,
  p_chave_telefone text,
  p_taxa_entrega_validada numeric default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resultado jsonb;
  v_pagamento_status text;
begin
  if p_tipo not in ('delivery', 'retirada') then
    raise exception 'Tipo de pedido inválido.' using errcode = '22023';
  end if;

  if p_forma_pagamento not in (
    'dinheiro_entrega',
    'cartao_credito_entrega',
    'cartao_debito_entrega',
    'pix_manual',
    'pagamento_retirada'
  ) then
    raise exception 'Forma de pagamento inválida.' using errcode = '22023';
  end if;

  if p_tipo = 'delivery' and p_forma_pagamento = 'pagamento_retirada' then
    raise exception 'Forma de pagamento incompatível com entrega.' using errcode = '22023';
  end if;
  if p_tipo = 'retirada' and p_forma_pagamento not in ('pagamento_retirada', 'pix_manual') then
    raise exception 'Forma de pagamento incompatível com retirada.' using errcode = '22023';
  end if;

  -- V1/V2 continuam sendo a única implementação de idempotência, rate
  -- limit, catálogo, preços, complementos e taxa. Esta camada apenas inclui
  -- a forma offline na MESMA transação; se qualquer etapa falhar, tudo volta.
  if p_taxa_entrega_validada is null then
    v_resultado := public.criar_pedido_publico_v1(
      p_loja_slug, p_cliente_nome, p_cliente_telefone, p_tipo, p_endereco,
      p_observacao, p_itens, p_idempotency_key, p_payload_hash,
      p_total_esperado_centavos, p_chave_ip, p_chave_telefone
    );
  else
    v_resultado := public.criar_pedido_publico_v2(
      p_loja_slug, p_cliente_nome, p_cliente_telefone, p_tipo, p_endereco,
      p_observacao, p_itens, p_idempotency_key, p_payload_hash,
      p_total_esperado_centavos, p_chave_ip, p_chave_telefone,
      p_taxa_entrega_validada
    );
  end if;

  update public.pedidos
  set forma_pagamento = p_forma_pagamento
  where id = (v_resultado->>'id')::uuid
  returning pagamento_status into v_pagamento_status;

  if not found then
    raise exception 'Pedido não encontrado.';
  end if;

  return v_resultado || jsonb_build_object(
    'forma_pagamento', p_forma_pagamento,
    'pagamento_status', v_pagamento_status
  );
end;
$$;

revoke execute on function public.criar_pedido_publico_offline_v1(
  text,text,text,text,text,text,text,jsonb,uuid,text,integer,text,text,numeric
) from public, anon, authenticated;
grant execute on function public.criar_pedido_publico_offline_v1(
  text,text,text,text,text,text,text,jsonb,uuid,text,integer,text,text,numeric
) to service_role;

commit;

-- Verificação esperada: service_role=true; anon=false; authenticated=false.
select
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_pode,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_pode,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as autenticado_pode
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'criar_pedido_publico_offline_v1';
