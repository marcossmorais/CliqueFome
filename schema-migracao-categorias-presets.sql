-- Execute no Supabase SQL Editor.
alter table categorias add column if not exists icone text;
alter table categorias add constraint categorias_icone_check check (icone is null or icone in ('hamburgueres','bebidas','pizzas','porcoes','sobremesas','combos','acai','cafes','saudaveis','generico'));
create table if not exists catalogo_presets (id uuid primary key default gen_random_uuid(), tipo_estabelecimento text not null, categoria_nome text not null, grupo_nome text, item_nome text, preco_sugerido numeric(10,2) not null default 0 check (preco_sugerido >= 0), imagem_url text, ordem integer not null default 0, ativo boolean not null default true, unique (tipo_estabelecimento, categoria_nome, grupo_nome, item_nome));
create index if not exists idx_catalogo_presets_tipo on catalogo_presets(tipo_estabelecimento, ativo, ordem);
alter table catalogo_presets enable row level security;
drop policy if exists catalogo_presets_public_read on catalogo_presets;
create policy catalogo_presets_public_read on catalogo_presets for select using (ativo = true);
insert into catalogo_presets (tipo_estabelecimento, categoria_nome, grupo_nome, item_nome, preco_sugerido, ordem) values
('pizzaria','Pizzas',null,null,0,1),('pizzaria','Bebidas',null,null,0,2),('pizzaria','Porções',null,null,0,3),('pizzaria','Sobremesas',null,null,0,4),('pizzaria','Pizzas','Bordas','Borda de catupiry',8,10),('pizzaria','Pizzas','Bordas','Borda cheddar',8,11),
('hamburgueria','Hambúrgueres',null,null,0,1),('hamburgueria','Porções',null,null,0,2),('hamburgueria','Bebidas',null,null,0,3),('hamburgueria','Hambúrgueres','Adicionais','Bacon',5,10),('hamburgueria','Hambúrgueres','Adicionais','Ovo',3,11),('hamburgueria','Hambúrgueres','Molhos','Barbecue',2,12),
('acaiteria','Açaí',null,null,0,1),('acaiteria','Bebidas',null,null,0,2),('acaiteria','Açaí','Frutas','Banana',2,10),('acaiteria','Açaí','Crocantes','Granola',2,11),
('cafeteria','Cafés',null,null,0,1),('cafeteria','Bebidas',null,null,0,2),('cafeteria','Cafés','Leites','Leite vegetal',3,10),('lanchonete','Lanches',null,null,0,1),('lanchonete','Porções',null,null,0,2),('lanchonete','Bebidas',null,null,0,3),('bebidas','Bebidas',null,null,0,1)
on conflict (tipo_estabelecimento, categoria_nome, grupo_nome, item_nome) do nothing;
