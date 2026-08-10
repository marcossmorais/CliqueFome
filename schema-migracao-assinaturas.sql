-- Faturamento do SaaS: assinaturas, pagamentos da plataforma e auditoria.
--
-- Como aplicar: Supabase > SQL Editor > New query > colar todo o arquivo > Run.
-- Seguro para execução repetida.
--
-- ATENÇÃO ao que este arquivo NÃO faz, de propósito:
--
--   * Não integra gateway nenhum. Enquanto não houver webhook,
--     `assinatura_pagamentos` fica VAZIA — e é assim que tem que ser. O
--     painel mostra zero em "receita recebida" em vez de número inventado.
--   * Não existe função de "marcar como pago". Dinheiro só entra por
--     confirmação do gateway; um admin marcando na mão criaria divergência
--     entre o nosso banco e o extrato de verdade. Liberar acesso por
--     cortesia é outra coisa e tem campo próprio (`liberado_ate`).
--   * Não mexe em `pedidos`/`pedido_itens`. Aquilo é o dinheiro do cliente
--     final indo pro restaurante; isto aqui é a mensalidade do restaurante
--     pra plataforma. As duas coisas nunca se misturam.

begin;

-- ---------------------------------------------------------------
-- 1. Assinatura da loja
-- ---------------------------------------------------------------
-- Mesma razão de `loja_planos` viver fora de `lojas`: a leitura de `lojas`
-- é pública e o dono pode atualizá-la. Se o plano/status morasse lá, o
-- navegador do lojista conseguiria se promover.
create table if not exists public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null unique references public.lojas(id) on delete cascade,
  plano text not null default 'basico'
    check (plano in ('basico', 'pro', 'pro_plus')),
  ciclo text not null default 'mensal'
    check (ciclo in ('mensal', 'semestral', 'anual')),
  status text not null default 'pendente'
    check (status in ('ativa', 'pendente', 'atrasada', 'cancelada')),
  -- Snapshot do preço acertado com esta loja. Não é lido da tabela de
  -- preços na hora de exibir: se a plataforma reajustar amanhã, o que foi
  -- combinado com quem já é cliente não muda sozinho.
  valor numeric(10,2) not null default 0 check (valor >= 0),
  iniciada_em timestamptz,
  proxima_cobranca_em timestamptz,
  cancelada_em timestamptz,
  -- Liberação administrativa (cortesia, trial, negociação): dá ACESSO sem
  -- fingir que entrou dinheiro. Nunca gerar linha em
  -- assinatura_pagamentos por causa disto.
  liberado_ate timestamptz,
  -- Preenchido quando existir gateway. `unique` já previne processar o
  -- mesmo webhook duas vezes.
  gateway_assinatura_id text unique,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_assinaturas_status on public.assinaturas(status, plano);

-- ---------------------------------------------------------------
-- 2. Pagamentos da plataforma
-- ---------------------------------------------------------------
-- Fica vazia até existir gateway. Plano e ciclo são snapshot: a cobrança
-- de março continua dizendo "Pro mensal" mesmo se a loja virar Pro+ depois.
create table if not exists public.assinatura_pagamentos (
  id uuid primary key default gen_random_uuid(),
  assinatura_id uuid not null references public.assinaturas(id) on delete cascade,
  -- Desnormalizado só pra filtrar por loja sem join.
  loja_id uuid not null references public.lojas(id) on delete cascade,
  valor numeric(10,2) not null check (valor >= 0),
  status text not null
    check (status in ('pago', 'pendente', 'falhou', 'estornado')),
  plano text not null,
  ciclo text not null,
  competencia date,
  pago_em timestamptz,
  gateway_pagamento_id text unique,
  gateway_payload jsonb,
  criado_em timestamptz not null default now()
);

create index if not exists idx_assinatura_pagamentos_loja
  on public.assinatura_pagamentos(loja_id, criado_em desc);
create index if not exists idx_assinatura_pagamentos_status
  on public.assinatura_pagamentos(status, criado_em desc);

-- ---------------------------------------------------------------
-- 3. Auditoria
-- ---------------------------------------------------------------
-- Primeira tabela de auditoria de verdade do projeto. Append-only: quem
-- mexeu em plano, quem liberou cortesia e quem entrou no painel de um
-- cliente pra dar suporte. Nenhum papel de cliente escreve aqui — só as
-- funções security definer abaixo.
create table if not exists public.assinatura_eventos (
  id uuid primary key default gen_random_uuid(),
  assinatura_id uuid references public.assinaturas(id) on delete set null,
  loja_id uuid references public.lojas(id) on delete set null,
  tipo text not null check (tipo in (
    'plano_alterado', 'renovacao_cancelada', 'liberacao_manual',
    'acesso_suporte', 'pagamento_registrado', 'status_alterado')),
  motivo text,
  detalhe jsonb,
  -- set null e não cascade: apagar o usuário não pode apagar o registro
  -- de que a ação aconteceu.
  ator_id uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);

create index if not exists idx_assinatura_eventos_loja
  on public.assinatura_eventos(loja_id, criado_em desc);

-- ---------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------
-- Nenhuma destas tabelas é lida por `anon` — o cardápio público não toca
-- nelas — então não existe grant de coluna como o de produtos/lojas. O
-- revoke é obrigatório mesmo assim: o Supabase concede privilégio de
-- tabela inteira a anon/authenticated por padrão.
alter table public.assinaturas enable row level security;
alter table public.assinatura_pagamentos enable row level security;
alter table public.assinatura_eventos enable row level security;

revoke all on table public.assinaturas from public, anon;
revoke all on table public.assinatura_pagamentos from public, anon;
revoke all on table public.assinatura_eventos from public, anon;

-- Escrita não é concedida a ninguém: toda alteração passa pelas RPCs.
grant select on table public.assinaturas to authenticated;
grant select on table public.assinatura_pagamentos to authenticated;
grant select on table public.assinatura_eventos to authenticated;

drop policy if exists "Dono le assinatura da propria loja" on public.assinaturas;
create policy "Dono le assinatura da propria loja"
on public.assinaturas for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.lojas l
    where l.id = loja_id and l.dono_id = auth.uid()
  )
);

drop policy if exists "Admin gerencia assinaturas" on public.assinaturas;
create policy "Admin gerencia assinaturas"
on public.assinaturas for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Dono le pagamentos da propria loja" on public.assinatura_pagamentos;
create policy "Dono le pagamentos da propria loja"
on public.assinatura_pagamentos for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.lojas l
    where l.id = loja_id and l.dono_id = auth.uid()
  )
);

drop policy if exists "Admin gerencia pagamentos" on public.assinatura_pagamentos;
create policy "Admin gerencia pagamentos"
on public.assinatura_pagamentos for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- A auditoria é só do admin. O lojista não vê nem os próprios eventos:
-- ela existe pra registrar o que a PLATAFORMA fez, inclusive entrar no
-- painel dele.
drop policy if exists "Admin le auditoria" on public.assinatura_eventos;
create policy "Admin le auditoria"
on public.assinatura_eventos for select to authenticated
using (public.is_admin());

-- ---------------------------------------------------------------
-- 5. Registro de evento (usado pelas RPCs abaixo)
-- ---------------------------------------------------------------
create or replace function public.registrar_evento_assinatura(
  p_loja_id uuid,
  p_tipo text,
  p_motivo text,
  p_detalhe jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assinatura_id uuid;
begin
  select id into v_assinatura_id from public.assinaturas where loja_id = p_loja_id;
  insert into public.assinatura_eventos (assinatura_id, loja_id, tipo, motivo, detalhe, ator_id)
  values (v_assinatura_id, p_loja_id, p_tipo, nullif(btrim(coalesce(p_motivo, '')), ''), p_detalhe, auth.uid());
end;
$$;

-- Função interna: nenhum papel de cliente chama direto.
revoke execute on function public.registrar_evento_assinatura(uuid, text, text, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 6. Ações administrativas
-- ---------------------------------------------------------------
-- Todas exigem is_admin() DENTRO da função: security definer ignora RLS,
-- então sem esta checagem qualquer autenticado viraria administrador da
-- plataforma. Todas gravam auditoria.

create or replace function public.admin_alterar_plano(
  p_loja_id uuid,
  p_plano text,
  p_ciclo text,
  p_valor numeric,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes public.assinaturas%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Somente administradores da plataforma podem alterar planos.'
      using errcode = '42501';
  end if;
  if p_plano not in ('basico', 'pro', 'pro_plus') then
    raise exception 'Plano inválido: %', p_plano using errcode = '22023';
  end if;
  if p_ciclo not in ('mensal', 'semestral', 'anual') then
    raise exception 'Ciclo inválido: %', p_ciclo using errcode = '22023';
  end if;
  if p_valor is null or p_valor < 0 then
    raise exception 'Valor inválido.' using errcode = '22023';
  end if;

  select * into v_antes from public.assinaturas where loja_id = p_loja_id;
  if not found then
    raise exception 'Loja sem assinatura.' using errcode = 'P0002';
  end if;

  update public.assinaturas
  set plano = p_plano, ciclo = p_ciclo, valor = p_valor, atualizado_em = now()
  where loja_id = p_loja_id;

  -- loja_planos continua sendo a fonte do feature-gating (avaliações já
  -- dependem dela). Manter as duas em sincronia na MESMA transação evita
  -- criar duas verdades sobre qual é o plano da loja.
  insert into public.loja_planos (loja_id, plano, atualizado_em)
  values (p_loja_id, p_plano, now())
  on conflict (loja_id) do update set plano = excluded.plano, atualizado_em = now();

  perform public.registrar_evento_assinatura(
    p_loja_id, 'plano_alterado', p_motivo,
    jsonb_build_object(
      'de', jsonb_build_object('plano', v_antes.plano, 'ciclo', v_antes.ciclo, 'valor', v_antes.valor),
      'para', jsonb_build_object('plano', p_plano, 'ciclo', p_ciclo, 'valor', p_valor)
    )
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_cancelar_renovacao(
  p_loja_id uuid,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Somente administradores da plataforma podem cancelar assinaturas.'
      using errcode = '42501';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Informe o motivo do cancelamento.' using errcode = '22023';
  end if;

  update public.assinaturas
  set status = 'cancelada', cancelada_em = now(), proxima_cobranca_em = null, atualizado_em = now()
  where loja_id = p_loja_id;

  if not found then
    raise exception 'Loja sem assinatura.' using errcode = 'P0002';
  end if;

  perform public.registrar_evento_assinatura(p_loja_id, 'renovacao_cancelada', p_motivo, null);
  return jsonb_build_object('ok', true);
end;
$$;

-- Cortesia/trial/negociação. Libera ACESSO até uma data — sem tocar em
-- pagamento nenhum, porque nenhum dinheiro entrou.
create or replace function public.admin_liberar_acesso(
  p_loja_id uuid,
  p_ate timestamptz,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Somente administradores da plataforma podem liberar acesso.'
      using errcode = '42501';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Informe o motivo da liberação.' using errcode = '22023';
  end if;
  if p_ate is null or p_ate <= now() then
    raise exception 'A data de liberação precisa ser no futuro.' using errcode = '22023';
  end if;

  update public.assinaturas
  set liberado_ate = p_ate, atualizado_em = now()
  where loja_id = p_loja_id;

  if not found then
    raise exception 'Loja sem assinatura.' using errcode = 'P0002';
  end if;

  perform public.registrar_evento_assinatura(
    p_loja_id, 'liberacao_manual', p_motivo, jsonb_build_object('liberado_ate', p_ate)
  );
  return jsonb_build_object('ok', true);
end;
$$;

-- Registra que a plataforma entrou no painel de um cliente pra dar
-- suporte. Um evento por entrada, não por página aberta.
create or replace function public.admin_registrar_acesso_suporte(p_loja_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Somente administradores da plataforma acessam o painel de outra loja.'
      using errcode = '42501';
  end if;

  perform public.registrar_evento_assinatura(p_loja_id, 'acesso_suporte', null, null);
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.admin_alterar_plano(uuid, text, text, numeric, text) from public, anon;
grant execute on function public.admin_alterar_plano(uuid, text, text, numeric, text) to authenticated;
revoke execute on function public.admin_cancelar_renovacao(uuid, text) from public, anon;
grant execute on function public.admin_cancelar_renovacao(uuid, text) to authenticated;
revoke execute on function public.admin_liberar_acesso(uuid, timestamptz, text) from public, anon;
grant execute on function public.admin_liberar_acesso(uuid, timestamptz, text) to authenticated;
revoke execute on function public.admin_registrar_acesso_suporte(uuid) from public, anon;
grant execute on function public.admin_registrar_acesso_suporte(uuid) to authenticated;

-- ---------------------------------------------------------------
-- 7. Loja nova já nasce com assinatura
-- ---------------------------------------------------------------
create or replace function public.inicializar_assinatura()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.assinaturas (loja_id)
  values (new.id)
  on conflict (loja_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.inicializar_assinatura() from public, anon, authenticated;

drop trigger if exists trg_inicializar_assinatura on public.lojas;
create trigger trg_inicializar_assinatura
after insert on public.lojas
for each row execute function public.inicializar_assinatura();

-- ---------------------------------------------------------------
-- 8. Backfill conservador
-- ---------------------------------------------------------------
-- Toda loja existente ganha uma assinatura com o plano que já está em
-- loja_planos e status 'pendente' — não 'ativa'. Ninguém pagou nada
-- ainda, e marcar como ativa aqui seria exatamente o tipo de número
-- inventado que este arquivo evita. Valor fica 0 até um admin definir.
insert into public.assinaturas (loja_id, plano, status)
select l.id, coalesce(lp.plano, 'basico'), 'pendente'
from public.lojas l
left join public.loja_planos lp on lp.loja_id = l.id
on conflict (loja_id) do nothing;

commit;

-- ---------------------------------------------------------------
-- CONFERÊNCIA (rodar depois; nada aqui altera dados)
-- ---------------------------------------------------------------
-- 1) Uma assinatura por loja:
-- select (select count(*) from public.lojas) as lojas,
--        (select count(*) from public.assinaturas) as assinaturas;
--
-- 2) anon NÃO pode ter privilégio nenhum nas tabelas novas. Precisa voltar VAZIO:
-- select table_name, privilege_type
-- from information_schema.table_privileges
-- where grantee = 'anon'
--   and table_name in ('assinaturas', 'assinatura_pagamentos', 'assinatura_eventos');
--
-- 3) Nenhum papel de cliente escreve direto. Só SELECT deve aparecer:
-- select table_name, privilege_type
-- from information_schema.table_privileges
-- where grantee = 'authenticated'
--   and table_name in ('assinaturas', 'assinatura_pagamentos', 'assinatura_eventos')
-- order by table_name, privilege_type;
--
-- 4) Pagamentos tem que estar vazio enquanto não houver gateway:
-- select count(*) as pagamentos_registrados from public.assinatura_pagamentos;
