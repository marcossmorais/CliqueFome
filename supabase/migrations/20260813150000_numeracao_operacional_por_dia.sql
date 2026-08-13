-- Numeração operacional do pedido: curta, por loja e por dia.
--
-- Antes o número era uma sequência que só crescia:
--   select coalesce(max(numero), 0) + 1 from pedidos where loja_id = ...
-- Uma loja com 40 pedidos/dia chega a #14.600 em um ano, e é esse número que
-- aparece na cozinha, na etiqueta, no acompanhamento e no grito do balcão.
--
-- O que muda:
--   * o identificador real continua sendo o `id` uuid — nada aqui o toca;
--   * `numero` passa a reiniciar a cada dia operacional, por loja;
--   * o dia operacional vira às 04:00, não à meia-noite: quem atende até
--     02h da manhã continua no mesmo dia e na mesma sequência;
--   * a chave única (loja_id, numero) vira (loja_id, dia_operacional, numero);
--   * pedido cancelado NÃO libera o número — a conta é max()+1, não count().
--
-- O que NÃO muda: nenhum pedido antigo é renumerado. O backfill só preenche o
-- dia operacional a partir de criado_em. Numa loja que já tem pedidos hoje, a
-- sequência curta começa a valer no próximo dia operacional; nas demais, já.
--
-- ---------------------------------------------------------------------------
-- POR QUE UM TRIGGER, E NÃO UMA EDIÇÃO EM criar_pedido
-- ---------------------------------------------------------------------------
-- A auditoria em pg_proc mostrou uma única função inserindo pedido:
-- criar_pedido. O caminho óbvio seria trocar a linha da numeração dentro dela.
--
-- Só que o corpo dela em produção não é o mesmo do staging, e nenhum dos dois
-- bate com qualquer arquivo .sql deste repositório (conferido por md5 em todas
-- as definições versionadas). Reescrever 340 linhas de validação de preço e
-- disponibilidade a partir de uma cópia que talvez não seja a que está no ar é
-- exatamente o tipo de risco que não se corre por causa de um número.
--
-- Então a numeração sai de dentro dela e vira um trigger BEFORE INSERT, que
-- funciona em qualquer versão da função e em qualquer writer futuro.
--
-- CONSEQUÊNCIA, e ela importa: o `numero` que criar_pedido() devolve no jsonb
-- é o que ela calculou ANTES do trigger, e passa a ser um palpite. Quem
-- precisa do número tem de ler a linha gravada. Os dois consumidores
-- (a rota do checkout e criarPedidoManual) já foram ajustados pra isso.
--
-- Rodar no SQL Editor do Supabase. Seguro rodar mais de uma vez.

begin;

-- ---------------------------------------------------------------
-- 1. Dia operacional — vira às 04:00 no fuso da loja
-- ---------------------------------------------------------------
create or replace function public.cf_dia_operacional(p_momento timestamptz default now())
returns date
language sql
stable
set search_path = public
as $fn$
  select (((p_momento at time zone 'America/Sao_Paulo') - interval '4 hours')::date);
$fn$;

revoke all on function public.cf_dia_operacional(timestamptz) from public, anon;
grant execute on function public.cf_dia_operacional(timestamptz) to authenticated;

-- ---------------------------------------------------------------
-- 2. Coluna + backfill, sem tocar em numero
-- ---------------------------------------------------------------
alter table public.pedidos add column if not exists dia_operacional date;
update public.pedidos set dia_operacional = public.cf_dia_operacional(criado_em)
  where dia_operacional is null;
alter table public.pedidos alter column dia_operacional set not null;
alter table public.pedidos alter column dia_operacional set default public.cf_dia_operacional();

-- ---------------------------------------------------------------
-- 3. Numeração no banco, dentro da própria transação do insert
-- ---------------------------------------------------------------
-- Sobrescreve o que o chamador tiver mandado em `numero`: a sequência é do
-- banco, ponto. Nada de frontend, e nada de confiar no que veio de fora.
create or replace function public.cf_numerar_pedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  new.dia_operacional := public.cf_dia_operacional();

  -- Serializa por (loja, dia). Duas lojas nunca esperam uma pela outra, e
  -- dois pedidos simultâneos da mesma loja saem com números diferentes. A
  -- unique lá embaixo é a rede, caso algum writer escape deste caminho.
  perform pg_advisory_xact_lock(
    hashtext(new.loja_id::text || ':' || new.dia_operacional::text)
  );

  -- max()+1 e não count()+1: pedido cancelado continua ocupando o número
  -- dele, e nenhum número é reaproveitado dentro do mesmo dia.
  select coalesce(max(numero), 0) + 1
    into new.numero
    from public.pedidos
   where loja_id = new.loja_id
     and dia_operacional = new.dia_operacional;

  return new;
end;
$fn$;

revoke all on function public.cf_numerar_pedido() from public, anon, authenticated;

drop trigger if exists cf_numerar_pedido on public.pedidos;
create trigger cf_numerar_pedido
before insert on public.pedidos
for each row execute function public.cf_numerar_pedido();

-- ---------------------------------------------------------------
-- 4. A chave única passa a incluir o dia
-- ---------------------------------------------------------------
-- Nenhuma FK aponta pra (loja_id, numero) — conferido em pg_constraint. As
-- referências de outras tabelas usam id ou (loja_id, id), que ficam intactas.
alter table public.pedidos drop constraint if exists pedidos_loja_id_numero_key;
do $chave$
begin
  -- `add constraint` não tem `if not exists`; sem esta guarda, rodar de novo
  -- morre com "relation already exists".
  if not exists (
    select 1 from pg_constraint
    where conname = 'pedidos_loja_dia_numero_key'
      and conrelid = 'public.pedidos'::regclass
  ) then
    alter table public.pedidos add constraint pedidos_loja_dia_numero_key
      unique (loja_id, dia_operacional, numero);
  end if;
end
$chave$;

-- Leitura por dia é o acesso novo mais comum (cozinha, gestão do dia).
create index if not exists idx_pedidos_loja_dia on public.pedidos (loja_id, dia_operacional);

commit;

-- ---------------------------------------------------------------
-- CONFERÊNCIA — as três precisam vir como esperado
-- ---------------------------------------------------------------
-- 1) a chave nova existe e a antiga sumiu
select conname, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid = 'public.pedidos'::regclass and contype = 'u'
order by conname;

-- 2) o dia operacional vira às 04:00 (o primeiro tem de ser o dia anterior)
select public.cf_dia_operacional('2026-08-14 02:30:00-03'::timestamptz) as as_2h30,
       public.cf_dia_operacional('2026-08-14 04:30:00-03'::timestamptz) as as_4h30;

-- 3) o trigger está no lugar
select tgname, tgenabled = 'O' as ativo
from pg_trigger
where tgrelid = 'public.pedidos'::regclass and tgname = 'cf_numerar_pedido';
