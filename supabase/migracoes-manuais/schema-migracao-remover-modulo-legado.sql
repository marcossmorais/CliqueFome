-- Remove do banco o módulo descontinuado. A assinatura passa a ser a única
-- fonte do plano contratado pela loja.
--
-- Como aplicar: Supabase > SQL Editor > New query > colar todo o arquivo > Run.
-- Execute depois de `schema-migracao-assinaturas.sql`.

begin;

-- A capacidade de checkout deixa de consultar a tabela de plano antiga antes
-- que ela seja removida. Pagamento online continua desligado até a integração
-- real com gateway e webhook ser implantada.
create or replace function public.capacidades_checkout(p_loja_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'plano', coalesce((select plano from assinaturas where loja_id = p_loja_id), 'basico'),
    'persistir_pedido', true,
    'pagamento_online_habilitado', false,
    'whatsapp_manual', true
  );
$$;

drop trigger if exists trg_inicializar_plano_e_avaliacoes on public.lojas;

do $$
begin
  if to_regclass('public.loja_planos') is not null then
    execute 'drop trigger if exists trg_aplicar_regra_avaliacoes_do_plano on public.loja_planos';
  end if;
end;
$$;

drop function if exists public.configurar_avaliacoes(uuid, boolean, boolean);
drop function if exists public.aplicar_regra_avaliacoes_do_plano();
drop function if exists public.inicializar_plano_e_avaliacoes();
drop table if exists public.configuracoes_avaliacoes;
drop table if exists public.loja_planos;

commit;
