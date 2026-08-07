-- Schema multi-tenant — várias lojas (restaurantes/lanchonetes/açaiterias/
-- hamburguerias) em um único projeto Supabase.
-- Base: index.html + admin.html
--
-- Como usar: Supabase → seu projeto → SQL Editor → New query → cola tudo
-- → Run. Pode rodar uma vez só. Se precisar rodar de novo, apague as
-- tabelas antes (na ordem: produto_grupos, complementos, grupos_complemento,
-- produtos, categorias, lojas;) senão vai dar erro de "já existe".
--
-- Modelo (o mesmo desenho usado por iFood, Anota AI, Goomer — funciona
-- pra qualquer nicho sem mudar estrutura):
--   lojas → categorias → produtos
--   produtos ↔ grupos_complemento (n:n via produto_grupos)
--   grupos_complemento → complementos
-- Um grupo (ex: "Escolha o tamanho") define qtd_min/qtd_max de opções que
-- o cliente pode escolher; qtd_min = 0 é opcional, qtd_min ≥ 1 é
-- obrigatório. Cada opção (complemento) tem preço próprio (pode ser 0) e
-- pode ser reaproveitada em vários produtos.

create table lojas (
  id uuid primary key default gen_random_uuid(),
  dono_id uuid not null unique references auth.users(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  nome text not null,
  nicho text,
  logo_url text,
  banner_url text,
  whatsapp_numero text,
  tempo_entrega_min integer,
  tempo_entrega_max integer,
  taxa_entrega numeric(10,2) not null default 0,
  pedido_minimo numeric(10,2) not null default 0,
  delivery_ativo boolean not null default true,
  recebendo_encomendas boolean not null default true,
  created_at timestamptz not null default now()
);

alter table lojas enable row level security;

-- Qualquer visitante pode ver os dados públicos da loja (o cardápio
-- público precisa disso pra saber nome, taxa de entrega etc).
create policy "lojas_select_publico"
  on lojas for select
  using (true);

-- Um usuário autenticado só cria a PRÓPRIA loja (uma por conta).
create policy "lojas_insert_dono"
  on lojas for insert
  to authenticated
  with check (dono_id = auth.uid());

-- E só edita a própria loja. Sem policy de delete de propósito — apagar
-- loja é uma ação sensível demais pra deixar solta no cliente Supabase.
create policy "lojas_update_dono"
  on lojas for update
  to authenticated
  using (dono_id = auth.uid());

create table categorias (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  nome text not null,
  ordem integer not null default 0
);

create index idx_categorias_loja on categorias(loja_id);

alter table categorias enable row level security;

create policy "categorias_select_publico"
  on categorias for select
  using (true);

create policy "categorias_all_dono"
  on categorias for all
  to authenticated
  using (loja_id in (select id from lojas where dono_id = auth.uid()))
  with check (loja_id in (select id from lojas where dono_id = auth.uid()));

create table produtos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  categoria_id uuid references categorias(id) on delete set null,
  nome text not null,
  descricao text,
  preco numeric(10,2) not null,
  imagem_url text,
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_produtos_loja on produtos(loja_id);
create index idx_produtos_categoria on produtos(categoria_id);

alter table produtos enable row level security;

create policy "produtos_select_publico"
  on produtos for select
  using (true);

create policy "produtos_all_dono"
  on produtos for all
  to authenticated
  using (loja_id in (select id from lojas where dono_id = auth.uid()))
  with check (loja_id in (select id from lojas where dono_id = auth.uid()));

-- Grupo de complementos (ex: "Escolha o tamanho", "Escolha a borda",
-- "Adicionais"). Pertence à loja, não ao produto, pra poder ser
-- reaproveitado (ex: "Escolha a bebida" serve pra vários combos).
create table grupos_complemento (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  nome text not null,
  qtd_min integer not null default 0,
  qtd_max integer not null default 1,
  ordem integer not null default 0,
  constraint grupos_complemento_min_max check (qtd_min >= 0 and qtd_max >= qtd_min)
);

create index idx_grupos_complemento_loja on grupos_complemento(loja_id);

alter table grupos_complemento enable row level security;

create policy "grupos_complemento_select_publico"
  on grupos_complemento for select
  using (true);

create policy "grupos_complemento_all_dono"
  on grupos_complemento for all
  to authenticated
  using (loja_id in (select id from lojas where dono_id = auth.uid()))
  with check (loja_id in (select id from lojas where dono_id = auth.uid()));

-- Opção dentro de um grupo (ex: "Grande", "Borda de catupiry", "Bacon
-- extra"). Preço pode ser 0. "ativo = false" pausa só aquela opção (ex:
-- acabou o morango) sem mexer no grupo nem no produto.
create table complementos (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references grupos_complemento(id) on delete cascade,
  nome text not null,
  preco numeric(10,2) not null default 0,
  ativo boolean not null default true,
  ordem integer not null default 0
);

create index idx_complementos_grupo on complementos(grupo_id);

alter table complementos enable row level security;

create policy "complementos_select_publico"
  on complementos for select
  using (true);

create policy "complementos_all_dono"
  on complementos for all
  to authenticated
  using (grupo_id in (
    select gc.id from grupos_complemento gc
    join lojas l on l.id = gc.loja_id
    where l.dono_id = auth.uid()
  ))
  with check (grupo_id in (
    select gc.id from grupos_complemento gc
    join lojas l on l.id = gc.loja_id
    where l.dono_id = auth.uid()
  ));

-- Liga produtos a grupos de complemento (n:n) — um produto pode ter vários
-- grupos, um grupo pode servir vários produtos.
create table produto_grupos (
  produto_id uuid not null references produtos(id) on delete cascade,
  grupo_id uuid not null references grupos_complemento(id) on delete cascade,
  ordem integer not null default 0,
  primary key (produto_id, grupo_id)
);

create index idx_produto_grupos_grupo on produto_grupos(grupo_id);

alter table produto_grupos enable row level security;

create policy "produto_grupos_select_publico"
  on produto_grupos for select
  using (true);

create policy "produto_grupos_all_dono"
  on produto_grupos for all
  to authenticated
  using (produto_id in (
    select p.id from produtos p join lojas l on l.id = p.loja_id where l.dono_id = auth.uid()
  ))
  with check (produto_id in (
    select p.id from produtos p join lojas l on l.id = p.loja_id where l.dono_id = auth.uid()
  ));

-- Bucket de imagens do cardápio (Storage), compartilhado por todas as
-- lojas — cada arquivo fica em um caminho "<loja_id>/nome-do-arquivo" e as
-- políticas abaixo garantem que cada dono só escreve dentro da própria
-- pasta. Pode criar o bucket por aqui via SQL, ou clicando em Storage →
-- New bucket → nome "imagens-cardapio" → marcar "Public bucket". Se criar
-- clicando, pule o insert abaixo (já existirá) e rode só as políticas.
insert into storage.buckets (id, name, public)
values ('imagens-cardapio', 'imagens-cardapio', true)
on conflict (id) do nothing;

create policy "imagens_cardapio_select_publico"
  on storage.objects for select
  using (bucket_id = 'imagens-cardapio');

create policy "imagens_cardapio_insert_dono"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'imagens-cardapio'
    and (storage.foldername(name))[1] in (select id::text from lojas where dono_id = auth.uid())
  );

create policy "imagens_cardapio_update_dono"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'imagens-cardapio'
    and (storage.foldername(name))[1] in (select id::text from lojas where dono_id = auth.uid())
  );

create policy "imagens_cardapio_delete_dono"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'imagens-cardapio'
    and (storage.foldername(name))[1] in (select id::text from lojas where dono_id = auth.uid())
  );

-- Não tem seed de exemplo aqui de propósito: os dados agora pertencem a
-- uma loja específica (loja_id), e a loja só existe depois que um dono
-- loga pela primeira vez no admin.html e preenche o formulário
-- "Criar minha loja". A partir daí, categorias/produtos/grupos são
-- cadastrados pelo próprio admin.
