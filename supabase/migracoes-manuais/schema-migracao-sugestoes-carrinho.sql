-- Produtos escolhidos pelo dono para aparecer como sugestão no carrinho.
-- Não altera produtos existentes e o preset nunca sobrescreve escolhas da loja.
alter table produtos add column if not exists sugestao_carrinho text;
alter table produtos add column if not exists preset_origem text;
alter table complementos add column if not exists sugestao_carrinho boolean not null default false;
do $$ begin
  alter table produtos add constraint produtos_sugestao_carrinho_check
    check (sugestao_carrinho is null or sugestao_carrinho in ('bebida','acompanhamento'));
exception when duplicate_object then null; end $$;
create index if not exists idx_produtos_sugestao_carrinho
  on produtos(loja_id, sugestao_carrinho, ativo)
  where sugestao_carrinho is not null;
create unique index if not exists idx_produtos_preset_origem_loja
  on produtos(loja_id, preset_origem)
  where preset_origem is not null;
create index if not exists idx_complementos_sugestao_carrinho
  on complementos(grupo_id, ativo)
  where sugestao_carrinho = true;
