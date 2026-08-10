-- Schema multi-tenant — várias lojas (restaurantes/lanchonetes/açaiterias/
-- hamburguerias) em um único projeto Supabase.
-- Base: cardapio.html + admin.html
--
-- Como usar: Supabase → seu projeto → SQL Editor → New query → cola tudo
-- → Run. Pode rodar uma vez só. Se precisar rodar de novo, apague as
-- tabelas antes (na ordem: produto_grupos, complementos, grupos_complemento,
-- produtos, categorias, lojas, admins;) senão vai dar erro de "já existe".
-- Se seu projeto já tinha esse schema rodado ANTES da tabela "admins"
-- existir, use schema-migracao-superadmin.sql em vez de rodar este de novo.
--
-- Modelo (o mesmo desenho usado por iFood, Anota AI, Goomer — funciona
-- pra qualquer nicho sem mudar estrutura):
--   lojas → categorias → produtos
--   produtos ↔ grupos_complemento (n:n via produto_grupos)
--   grupos_complemento → complementos
-- Um grupo (ex: "Escolha o tamanho") define qtd_min/qtd_max de opções que
-- o cliente pode escolher; qtd_min = 0 é opcional, qtd_min ≥ 1 é
-- obrigatório. Cada opção (complemento) tem preço próprio (pode ser 0) e
-- pode ser reaproveitada em vários produtos. A tabela "admins" é opcional:
-- só quem estiver nela consegue criar/editar QUALQUER loja (útil pra criar
-- lojas de teste antes do site abrir pra cadastro público).

create table lojas (
  id uuid primary key default gen_random_uuid(),
  -- Sem "unique": um dono pode ter mais de uma loja (ex: o super admin
  -- criando lojas de teste na própria conta antes de repassar pro dono real).
  dono_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  nome text not null,
  nicho text,
  logo_url text,
  banner_url text,
  -- Cor da marca DA LOJA (não do CliqueFome): pinta a faixa do topo, os
  -- botões e os destaques do cardápio, que é whitelabel.
  cor_marca text not null default '#1E7A4E',
  cidade text,
  sobre text,
  whatsapp_numero text,
  tempo_entrega_min integer,
  tempo_entrega_max integer,
  taxa_entrega numeric(10,2) not null default 0,
  pedido_minimo numeric(10,2) not null default 0,
  delivery_ativo boolean not null default true,
  recebendo_encomendas boolean not null default true,
  retirada_ativa boolean not null default true,
  created_at timestamptz not null default now()
);

alter table lojas enable row level security;

-- Qualquer visitante pode ver os dados públicos da loja (o cardápio
-- público precisa disso pra saber nome, taxa de entrega etc).
create policy "lojas_select_publico"
  on lojas for select
  using (true);

-- Super admins: pessoas da equipe da plataforma (não donos de loja) que
-- podem criar/editar QUALQUER loja — hoje serve pra criar lojas de teste
-- antes do site abrir pra cadastro público. Tabela sem nenhuma policy de
-- select: ninguém lê ela via API, só é consultada por dentro da função
-- is_admin() abaixo (que roda com privilégio elevado via "security definer",
-- então não esbarra na própria RLS da tabela).
create table admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table admins enable row level security;

create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

grant execute on function is_admin() to authenticated;

-- Um usuário autenticado cria a própria loja, ou (se for admin) qualquer loja.
create policy "lojas_insert_dono"
  on lojas for insert
  to authenticated
  with check (dono_id = auth.uid() or is_admin());

-- E só edita a própria loja (ou qualquer uma, se for admin). Sem policy de
-- delete de propósito — apagar loja é uma ação sensível demais pra deixar
-- solta no cliente Supabase.
create policy "lojas_update_dono"
  on lojas for update
  to authenticated
  using (dono_id = auth.uid() or is_admin());

create table categorias (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  nome text not null,
  emoji text,
  -- "ativo = false" esconde a categoria inteira do cardápio sem apagar nada.
  ativo boolean not null default true,
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
  using (loja_id in (select id from lojas where dono_id = auth.uid()) or is_admin())
  with check (loja_id in (select id from lojas where dono_id = auth.uid()) or is_admin());

create sequence produtos_codigo_interno_seq start 10000;

create table produtos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  categoria_id uuid references categorias(id) on delete set null,
  nome text not null,
  descricao text,
  preco numeric(10,2) not null,
  -- Quando preenchido, é o preço que vale na venda e o normal aparece
  -- riscado. null = sem promoção rolando.
  preco_promocional numeric(10,2),
  -- Custo entra em relatório de margem; nunca aparece pro cliente.
  preco_custo numeric(10,2),
  imagem_url text,
  -- Selo no card do produto. null = sem etiqueta.
  etiqueta text check (etiqueta is null or etiqueta in ('mais_pedido','novidade','recomendado','edicao_limitada')),
  -- Produto em destaque sobe pro topo do cardápio.
  destaque boolean not null default false,
  codigo_pdv text,
  -- Código sequencial só pra referência rápida do dono ("me manda o 32886").
  codigo_interno bigint default nextval('produtos_codigo_interno_seq'),
  unidade_medida text,
  -- Escondem, só neste produto, o campo de observação e os botões de
  -- quantidade no cardápio.
  esconder_observacao boolean not null default false,
  esconder_quantidade boolean not null default false,
  -- Disponibilidade: array vazio = sem restrição. dias_semana segue o
  -- padrão do JS (0 = domingo … 6 = sábado).
  dias_semana smallint[] not null default '{}',
  tipos_pedido text[] not null default '{}',
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
  using (loja_id in (select id from lojas where dono_id = auth.uid()) or is_admin())
  with check (loja_id in (select id from lojas where dono_id = auth.uid()) or is_admin());

-- Grupo de complementos (ex: "Escolha o tamanho", "Escolha a borda",
-- "Adicionais"). Pertence à loja, não ao produto, pra poder ser
-- reaproveitado (ex: "Escolha a bebida" serve pra vários combos).
create table grupos_complemento (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  nome text not null,
  qtd_min integer not null default 0,
  qtd_max integer not null default 1,
  -- Como o cliente escolhe dentro do grupo:
  --   uma            = só uma opção (ex: tamanho)
  --   varias         = mais de uma, sem repetir a mesma
  --   varias_repetir = mais de uma, podendo repetir (ex: 2x bacon)
  tipo_selecao text not null default 'uma' check (tipo_selecao in ('uma','varias','varias_repetir')),
  -- Como o preço entra no total quando o cliente marca várias opções
  -- (pizza meio a meio costuma usar média ou mais caro em vez de somar).
  modo_preco text not null default 'soma' check (modo_preco in ('soma','media','maior','menor')),
  -- Em quais tipos de pedido o grupo aparece. Vazio = todos.
  tipos_pedido text[] not null default '{}',
  ativo boolean not null default true,
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
  using (loja_id in (select id from lojas where dono_id = auth.uid()) or is_admin())
  with check (loja_id in (select id from lojas where dono_id = auth.uid()) or is_admin());

-- Opção dentro de um grupo (ex: "Grande", "Borda de catupiry", "Bacon
-- extra"). Preço pode ser 0. "ativo = false" pausa só aquela opção (ex:
-- acabou o morango) sem mexer no grupo nem no produto.
create table complementos (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references grupos_complemento(id) on delete cascade,
  nome text not null,
  descricao text,
  preco numeric(10,2) not null default 0,
  -- Quantas vezes a MESMA opção pode repetir quando a lista está no modo
  -- "varias_repetir" (ex: no máximo 3x bacon). null = sem limite próprio.
  qtd_max integer,
  imagem_url text,
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
  using (is_admin() or grupo_id in (
    select gc.id from grupos_complemento gc
    join lojas l on l.id = gc.loja_id
    where l.dono_id = auth.uid()
  ))
  with check (is_admin() or grupo_id in (
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
  using (is_admin() or produto_id in (
    select p.id from produtos p join lojas l on l.id = p.loja_id where l.dono_id = auth.uid()
  ))
  with check (is_admin() or produto_id in (
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
    and (is_admin() or (storage.foldername(name))[1] in (select id::text from lojas where dono_id = auth.uid()))
  );

create policy "imagens_cardapio_update_dono"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'imagens-cardapio'
    and (is_admin() or (storage.foldername(name))[1] in (select id::text from lojas where dono_id = auth.uid()))
  );

create policy "imagens_cardapio_delete_dono"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'imagens-cardapio'
    and (is_admin() or (storage.foldername(name))[1] in (select id::text from lojas where dono_id = auth.uid()))
  );

-- Não tem seed de exemplo aqui de propósito: os dados agora pertencem a
-- uma loja específica (loja_id), e a loja só existe depois que um dono
-- loga pela primeira vez no admin.html e preenche o formulário
-- "Criar minha loja". A partir daí, categorias/produtos/grupos são
-- cadastrados pelo próprio admin.

-- Pra virar super admin (poder criar/editar qualquer loja no admin.html,
-- útil pra criar lojas de teste antes do site abrir pra cadastro público):
-- troque o email abaixo pelo email do usuário (criado em Authentication →
-- Users) e rode só essa linha.
-- insert into admins (user_id) select id from auth.users where email = 'COLE_SEU_EMAIL_AQUI';
