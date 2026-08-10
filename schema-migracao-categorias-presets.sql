-- Biblioteca global reutilizável. Execute uma vez no Supabase SQL Editor.
alter table categorias add column if not exists icone text;
do $$ begin
  alter table categorias add constraint categorias_icone_check
    check (icone is null or icone in ('hamburgueres','bebidas','pizzas','porcoes','sobremesas','combos','acai','cafes','saudaveis','generico'));
exception when duplicate_object then null; end $$;

create table if not exists catalogo_presets (
  id uuid primary key default gen_random_uuid(),
  chave text,
  tipo_item text not null default 'complemento' check (tipo_item in ('complemento','produto')),
  segmentos text[] not null default '{}',
  tipo_estabelecimento text not null default 'geral',
  categoria_nome text not null,
  grupo_nome text,
  item_nome text,
  volume text,
  preco_sugerido numeric(10,2) not null default 0 check (preco_sugerido >= 0),
  imagem_url text,
  ordem integer not null default 0,
  ativo boolean not null default true
);
alter table catalogo_presets add column if not exists chave text;
alter table catalogo_presets add column if not exists tipo_item text not null default 'complemento';
alter table catalogo_presets add column if not exists segmentos text[] not null default '{}';
alter table catalogo_presets add column if not exists volume text;
create unique index if not exists catalogo_presets_chave_uq on catalogo_presets(chave) where chave is not null;
create index if not exists idx_catalogo_presets_segmentos on catalogo_presets using gin(segmentos);
create index if not exists idx_catalogo_presets_tipo on catalogo_presets(tipo_item, ativo, ordem);
alter table catalogo_presets enable row level security;
drop policy if exists catalogo_presets_public_read on catalogo_presets;
drop policy if exists catalogo_presets_authenticated_read on catalogo_presets;
create policy catalogo_presets_authenticated_read on catalogo_presets for select to authenticated using (ativo = true);
revoke insert, update, delete on catalogo_presets from anon, authenticated;
grant select on catalogo_presets to authenticated;

insert into catalogo_presets
  (chave,tipo_item,segmentos,tipo_estabelecimento,categoria_nome,grupo_nome,item_nome,volume,preco_sugerido,imagem_url,ordem)
values
('borda-catupiry','complemento','{pizzaria}','pizzaria','Pizzas','Escolha a borda','Borda de catupiry',null,8,'/catalogo-presets/itens/borda-catupiry.webp',1),
('borda-cheddar','complemento','{pizzaria}','pizzaria','Pizzas','Escolha a borda','Borda de cheddar',null,8,'/catalogo-presets/itens/borda-cheddar.webp',2),
('borda-cream-cheese','complemento','{pizzaria}','pizzaria','Pizzas','Escolha a borda','Borda de cream cheese',null,9,'/catalogo-presets/itens/borda-catupiry.webp',3),
('borda-chocolate','complemento','{pizzaria}','pizzaria','Pizzas','Escolha a borda','Borda de chocolate',null,9,'/catalogo-presets/itens/cheddar.webp',4),
('borda-doce-leite','complemento','{pizzaria}','pizzaria','Pizzas','Escolha a borda','Borda de doce de leite',null,9,'/catalogo-presets/itens/leite-condensado.webp',5),
('extra-mussarela','complemento','{pizzaria,hamburgueria,lanchonete}','geral','Comidas','Adicionais','Mussarela extra',null,5,'/catalogo-presets/itens/mussarela.webp',10),
('extra-bacon','complemento','{pizzaria,hamburgueria,lanchonete,restaurante}','geral','Comidas','Adicionais','Bacon',null,5,'/catalogo-presets/itens/bacon.webp',11),
('extra-ovo','complemento','{pizzaria,hamburgueria,lanchonete,restaurante}','geral','Comidas','Adicionais','Ovo',null,3,'/catalogo-presets/itens/ovo.webp',12),
('extra-frango','complemento','{pizzaria,hamburgueria,lanchonete,restaurante}','geral','Comidas','Adicionais','Frango',null,5,'/catalogo-presets/itens/frango.webp',13),
('extra-cheddar','complemento','{pizzaria,hamburgueria,lanchonete}','geral','Comidas','Adicionais','Cheddar',null,4,'/catalogo-presets/itens/cheddar.webp',14),
('extra-catupiry','complemento','{pizzaria,hamburgueria,lanchonete}','geral','Comidas','Adicionais','Catupiry',null,4,'/catalogo-presets/itens/maionese.webp',15),
('extra-calabresa','complemento','{pizzaria}','pizzaria','Pizzas','Adicionais','Calabresa',null,5,'/catalogo-presets/itens/bacon.webp',16),
('extra-cebola','complemento','{pizzaria,hamburgueria,lanchonete}','geral','Comidas','Adicionais','Cebola',null,2,'/catalogo-presets/itens/mussarela.webp',17),
('extra-azeitona','complemento','{pizzaria}','pizzaria','Pizzas','Adicionais','Azeitona',null,2,'/catalogo-presets/itens/granola.webp',18),
('extra-milho','complemento','{pizzaria,hamburgueria,lanchonete}','geral','Comidas','Adicionais','Milho',null,2,'/catalogo-presets/itens/granola.webp',19),
('molho-ketchup','complemento','{pizzaria,hamburgueria,lanchonete,restaurante}','geral','Comidas','Molhos','Ketchup',null,1,'/catalogo-presets/itens/ketchup.webp',30),
('molho-maionese','complemento','{pizzaria,hamburgueria,lanchonete,restaurante}','geral','Comidas','Molhos','Maionese',null,1,'/catalogo-presets/itens/maionese.webp',31),
('molho-barbecue','complemento','{pizzaria,hamburgueria,lanchonete,restaurante}','geral','Comidas','Molhos','Molho barbecue',null,2,'/catalogo-presets/itens/barbecue.webp',32),
('molho-cheddar','complemento','{pizzaria,hamburgueria,lanchonete}','geral','Comidas','Molhos','Molho cheddar',null,3,'/catalogo-presets/itens/cheddar.webp',33),
('molho-alho','complemento','{pizzaria,hamburgueria,lanchonete}','geral','Comidas','Molhos','Molho de alho',null,2,'/catalogo-presets/itens/maionese.webp',34),
('acai-banana','complemento','{acaiteria}','acaiteria','Açaí','Frutas','Banana',null,2,'/catalogo-presets/itens/banana.webp',40),
('acai-morango','complemento','{acaiteria}','acaiteria','Açaí','Frutas','Morango',null,3,'/catalogo-presets/itens/morango.webp',41),
('acai-kiwi','complemento','{acaiteria}','acaiteria','Açaí','Frutas','Kiwi',null,3,'/catalogo-presets/itens/morango.webp',42),
('acai-manga','complemento','{acaiteria}','acaiteria','Açaí','Frutas','Manga',null,3,'/catalogo-presets/itens/banana.webp',43),
('acai-leite-condensado','complemento','{acaiteria}','acaiteria','Açaí','Cremes e caldas','Leite condensado',null,2,'/catalogo-presets/itens/leite-condensado.webp',50),
('acai-leite-po','complemento','{acaiteria}','acaiteria','Açaí','Cremes e caldas','Leite em pó',null,2,'/catalogo-presets/itens/leite-po.webp',51),
('acai-creme-avela','complemento','{acaiteria}','acaiteria','Açaí','Cremes e caldas','Creme de avelã',null,4,'/catalogo-presets/itens/barbecue.webp',52),
('acai-doce-leite','complemento','{acaiteria}','acaiteria','Açaí','Cremes e caldas','Doce de leite',null,3,'/catalogo-presets/itens/leite-condensado.webp',53),
('acai-granola','complemento','{acaiteria}','acaiteria','Açaí','Crocantes e confeitos','Granola',null,2,'/catalogo-presets/itens/granola.webp',60),
('acai-granulado','complemento','{acaiteria}','acaiteria','Açaí','Crocantes e confeitos','Granulado de chocolate',null,2,'/catalogo-presets/itens/granulado.webp',61),
('acai-pacoca','complemento','{acaiteria}','acaiteria','Açaí','Crocantes e confeitos','Paçoca',null,2,'/catalogo-presets/itens/granola.webp',62),
('acai-confete','complemento','{acaiteria}','acaiteria','Açaí','Crocantes e confeitos','Confete de chocolate',null,3,'/catalogo-presets/itens/granulado.webp',63),
('acai-chocoball','complemento','{acaiteria}','acaiteria','Açaí','Crocantes e confeitos','Chocoball',null,3,'/catalogo-presets/itens/granulado.webp',64),
('acai-amendoim','complemento','{acaiteria}','acaiteria','Açaí','Crocantes e confeitos','Amendoim',null,2,'/catalogo-presets/itens/granola.webp',65),
('bebida-coca-350','produto','{pizzaria,hamburgueria,acaiteria,restaurante,lanchonete,bebidas}','geral','Bebidas',null,'Coca-Cola Original','350 ml',6,'/catalogo-presets/itens/coca-cola-350.webp',100),
('bebida-coca-zero-350','produto','{pizzaria,hamburgueria,acaiteria,restaurante,lanchonete,bebidas}','geral','Bebidas',null,'Coca-Cola Sem Açúcar','350 ml',6,'/catalogo-presets/itens/coca-cola-zero-350.webp',101),
('bebida-coca-600','produto','{pizzaria,hamburgueria,acaiteria,restaurante,lanchonete,bebidas}','geral','Bebidas',null,'Coca-Cola Original','600 ml',9,'/catalogo-presets/itens/coca-cola-600.webp',102),
('bebida-coca-2l','produto','{pizzaria,hamburgueria,restaurante,lanchonete,bebidas}','geral','Bebidas',null,'Coca-Cola Original','2 L',14,'/catalogo-presets/itens/coca-cola-2l.webp',103),
('bebida-guarana-350','produto','{pizzaria,hamburgueria,acaiteria,restaurante,lanchonete,bebidas}','geral','Bebidas',null,'Guaraná Antarctica','350 ml',6,'/catalogo-presets/itens/guarana-antarctica-350.webp',104),
('bebida-guarana-2l','produto','{pizzaria,hamburgueria,restaurante,lanchonete,bebidas}','geral','Bebidas',null,'Guaraná Antarctica','2 L',13,'/catalogo-presets/itens/guarana-antarctica-2l.webp',105),
('bebida-fanta-350','produto','{pizzaria,hamburgueria,acaiteria,restaurante,lanchonete,bebidas}','geral','Bebidas',null,'Fanta Laranja','350 ml',6,'/catalogo-presets/itens/fanta-laranja-350.webp',106),
('bebida-fanta-2l','produto','{pizzaria,hamburgueria,restaurante,lanchonete,bebidas}','geral','Bebidas',null,'Fanta Laranja','2 L',13,'/catalogo-presets/itens/fanta-laranja-2l.webp',107),
('bebida-kuat-350','produto','{pizzaria,hamburgueria,restaurante,lanchonete,bebidas}','geral','Bebidas',null,'Kuat Guaraná','350 ml',5,'/catalogo-presets/itens/kuat-350.webp',108),
('bebida-monster-473','produto','{pizzaria,hamburgueria,acaiteria,restaurante,lanchonete,bebidas}','geral','Bebidas',null,'Monster Energy Original','473 ml',12,'/catalogo-presets/itens/monster-473.webp',109),
('bebida-redbull-250','produto','{pizzaria,hamburgueria,acaiteria,restaurante,lanchonete,bebidas}','geral','Bebidas',null,'Red Bull Energy Drink','250 ml',12,'/catalogo-presets/itens/red-bull-250.webp',110),
('bebida-baly-473','produto','{pizzaria,hamburgueria,acaiteria,restaurante,lanchonete,bebidas}','geral','Bebidas',null,'Baly Energy Drink','473 ml',9,'/catalogo-presets/itens/baly-473.webp',111)
on conflict (chave) where chave is not null do update set
  preco_sugerido=excluded.preco_sugerido, imagem_url=excluded.imagem_url, ativo=true;

insert into catalogo_presets
  (chave,tipo_item,segmentos,tipo_estabelecimento,categoria_nome,grupo_nome,item_nome,preco_sugerido,imagem_url,ordem)
values
('borda-sem-recheio','complemento','{pizzaria}','pizzaria','Pizzas','Escolha a borda','Sem borda recheada',0,'/catalogo-presets/itens/mussarela.webp',0),
('extra-hamburguer','complemento','{hamburgueria,lanchonete}','hamburgueria','Hambúrgueres','Adicionais','Hambúrguer extra',8,'/catalogo-presets/itens/bacon.webp',20),
('extra-cebola-caramelizada','complemento','{hamburgueria,lanchonete}','hamburgueria','Hambúrgueres','Adicionais','Cebola caramelizada',3,'/catalogo-presets/itens/barbecue.webp',21),
('extra-picles','complemento','{hamburgueria,lanchonete}','hamburgueria','Hambúrgueres','Adicionais','Picles',2,'/catalogo-presets/itens/granola.webp',22),
('extra-tomate','complemento','{pizzaria,hamburgueria,lanchonete}','geral','Comidas','Adicionais','Tomate',2,'/catalogo-presets/itens/morango.webp',23),
('extra-alface','complemento','{hamburgueria,lanchonete}','hamburgueria','Hambúrgueres','Adicionais','Alface',1,'/catalogo-presets/itens/granola.webp',24),
('molho-maionese-casa','complemento','{hamburgueria,lanchonete}','geral','Comidas','Molhos','Maionese da casa',2,'/catalogo-presets/itens/maionese.webp',35),
('molho-mostarda','complemento','{hamburgueria,lanchonete,restaurante}','geral','Comidas','Molhos','Mostarda',1,'/catalogo-presets/itens/cheddar.webp',36),
('molho-picante','complemento','{pizzaria,hamburgueria,lanchonete,restaurante}','geral','Comidas','Molhos','Molho picante',2,'/catalogo-presets/itens/ketchup.webp',37),
('acai-uva','complemento','{acaiteria}','acaiteria','Açaí','Frutas','Uva',3,'/catalogo-presets/itens/morango.webp',44),
('acai-creme-amendoim','complemento','{acaiteria}','acaiteria','Açaí','Cremes e caldas','Creme de amendoim',3,'/catalogo-presets/itens/barbecue.webp',54),
('acai-calda-chocolate','complemento','{acaiteria}','acaiteria','Açaí','Cremes e caldas','Calda de chocolate',2,'/catalogo-presets/itens/barbecue.webp',55),
('acai-calda-morango','complemento','{acaiteria}','acaiteria','Açaí','Cremes e caldas','Calda de morango',2,'/catalogo-presets/itens/ketchup.webp',56),
('acai-mel','complemento','{acaiteria}','acaiteria','Açaí','Cremes e caldas','Mel',2,'/catalogo-presets/itens/leite-condensado.webp',57),
('acai-flocos-milho','complemento','{acaiteria}','acaiteria','Açaí','Crocantes e confeitos','Flocos de milho',2,'/catalogo-presets/itens/granola.webp',66),
('acai-coco','complemento','{acaiteria}','acaiteria','Açaí','Crocantes e confeitos','Coco ralado',2,'/catalogo-presets/itens/leite-po.webp',67),
('acai-gotas-chocolate','complemento','{acaiteria}','acaiteria','Açaí','Crocantes e confeitos','Gotas de chocolate',3,'/catalogo-presets/itens/granulado.webp',68),
('acai-jujuba','complemento','{acaiteria}','acaiteria','Açaí','Crocantes e confeitos','Jujuba',3,'/catalogo-presets/itens/granulado.webp',69),
('rest-arroz','complemento','{restaurante}','restaurante','Comidas','Acompanhamentos','Arroz',4,'/catalogo-presets/itens/granola.webp',70),
('rest-feijao','complemento','{restaurante}','restaurante','Comidas','Acompanhamentos','Feijão',4,'/catalogo-presets/itens/barbecue.webp',71),
('rest-batata','complemento','{restaurante}','restaurante','Comidas','Acompanhamentos','Batata frita',6,'/catalogo-presets/itens/borda-cheddar.webp',72),
('rest-salada','complemento','{restaurante}','restaurante','Comidas','Acompanhamentos','Salada',4,'/catalogo-presets/itens/granola.webp',73),
('rest-farofa','complemento','{restaurante}','restaurante','Comidas','Acompanhamentos','Farofa',3,'/catalogo-presets/itens/granola.webp',74),
('rest-pure','complemento','{restaurante}','restaurante','Comidas','Acompanhamentos','Purê de batata',5,'/catalogo-presets/itens/maionese.webp',75),
('rest-macarrao','complemento','{restaurante}','restaurante','Comidas','Acompanhamentos','Macarrão',5,'/catalogo-presets/itens/frango.webp',76),
('rest-legumes','complemento','{restaurante}','restaurante','Comidas','Acompanhamentos','Legumes',5,'/catalogo-presets/itens/granola.webp',77),
('rest-proteina-frango','complemento','{restaurante}','restaurante','Comidas','Proteína extra','Frango',8,'/catalogo-presets/itens/frango.webp',78),
('rest-proteina-ovo','complemento','{restaurante}','restaurante','Comidas','Proteína extra','Ovo',3,'/catalogo-presets/itens/ovo.webp',79),
('rest-proteina-bacon','complemento','{restaurante}','restaurante','Comidas','Proteína extra','Bacon',5,'/catalogo-presets/itens/bacon.webp',80),
('rest-proteina-linguica','complemento','{restaurante}','restaurante','Comidas','Proteína extra','Linguiça',7,'/catalogo-presets/itens/bacon.webp',81),
('rest-proteina-carne','complemento','{restaurante}','restaurante','Comidas','Proteína extra','Carne bovina',10,'/catalogo-presets/itens/bacon.webp',82)
on conflict (chave) where chave is not null do update set
  preco_sugerido=excluded.preco_sugerido, imagem_url=excluded.imagem_url, ativo=true;
