-- Pedido cancelado podia ser marcado como pago.
--
-- `marcar_pagamento_manual` conferia dono, valores válidos, estorno anterior e
-- o status esperado do pagamento — mas nunca olhava o status do PEDIDO. Um
-- pedido cancelado aceitava `confirmado` normalmente, e o financeiro passava a
-- contar dinheiro de uma venda que não aconteceu.
--
-- O botão no painel é a primeira barreira; esta função é a fronteira. Quem tem
-- a chave anon chama o RPC direto, sem passar pela tela.
--
-- O que continua permitido em pedido cancelado: voltar para `pendente` e
-- marcar `estornado`. Cancelar depois de já ter recebido é exatamente o caso
-- em que a loja precisa registrar a devolução.
--
-- Rodar no SQL Editor do Supabase. Seguro rodar mais de uma vez.

begin;

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

  -- A regra nova. Só barra a CONFIRMAÇÃO: desmarcar e estornar seguem
  -- liberados, porque é o que a loja faz pra devolver o dinheiro.
  if v_pedido.status = 'cancelado' and p_novo_pagamento = 'confirmado' then
    raise exception 'Pedido cancelado não pode ser marcado como pago.';
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

commit;

-- ---------------------------------------------------------------
-- CONFERÊNCIA — precisa devolver true.
-- ---------------------------------------------------------------
select pg_get_functiondef(p.oid) ilike '%não pode ser marcado como pago%' as tem_a_regra
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'marcar_pagamento_manual';
