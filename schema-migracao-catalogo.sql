-- Migração do módulo Catálogo — campos novos que o painel reconstruído usa
-- (etiquetas, destaque, preço promocional, disponibilidade, tipo de seleção
-- dos grupos de complemento etc).
--
-- Como usar: Supabase → SQL Editor → New query → cola tudo → Run.
-- É seguro rodar mais de uma vez: tudo usa "if not exists".
--
-- Se você está montando um projeto NOVO do zero, não precisa deste arquivo:
-- o schema.sql já vem com essas colunas.

-- ---------------------------------------------------------------
-- CATEGORIAS
-- ---------------------------------------------------------------
-- "ativo = false" esconde a categoria inteira do cardápio sem apagar nada
-- (é o ícone de olho cortado na lista de categorias do painel).
alter table categorias add column if not exists ativo boolean not null default true;
-- Emoji opcional que aparece junto do nome da categoria no painel.
alter table categorias add column if not exists emoji text;

-- ---------------------------------------------------------------
-- PRODUTOS
-- ---------------------------------------------------------------
-- Selo exibido no card do produto. null = sem etiqueta.
alter table produtos add column if not exists etiqueta text
  check (etiqueta is null or etiqueta in ('mais_pedido','novidade','recomendado','edicao_limitada'));

-- Produto em destaque sobe pro topo do cardápio.
alter table produtos add column if not exists destaque boolean not null default false;

-- Preço promocional: quando preenchido, é ele que vale na venda e o preço
-- normal aparece riscado. null = sem promoção rolando.
alter table produtos add column if not exists preco_promocional numeric(10,2);

-- Custo do produto — entra em relatório de margem, não aparece pro cliente.
alter table produtos add column if not exists preco_custo numeric(10,2);

-- Código usado pra casar o item com o PDV/sistema fiscal da loja.
alter table produtos add column if not exists codigo_pdv text;

-- Código interno sequencial, só pra referência rápida do dono da loja
-- ("me manda o 32886"). Gerado pelo banco, o painel mostra como leitura.
alter table produtos add column if not exists codigo_interno bigint;
create sequence if not exists produtos_codigo_interno_seq start 10000;
alter table produtos alter column codigo_interno set default nextval('produtos_codigo_interno_seq');
update produtos set codigo_interno = nextval('produtos_codigo_interno_seq') where codigo_interno is null;

alter table produtos add column if not exists unidade_medida text;

-- Esconde, só neste produto, o campo de observação e os botões de +/-
-- quantidade no cardápio (ex: item que não faz sentido pedir 2x).
alter table produtos add column if not exists esconder_observacao boolean not null default false;
alter table produtos add column if not exists esconder_quantidade boolean not null default false;

-- Disponibilidade: em quais dias e em quais tipos de pedido o item aparece.
-- Array vazio = sem restrição (aparece sempre / em todos os tipos).
-- dias_semana segue o padrão do JS: 0 = domingo … 6 = sábado.
alter table produtos add column if not exists dias_semana smallint[] not null default '{}';
alter table produtos add column if not exists tipos_pedido text[] not null default '{}';

-- ---------------------------------------------------------------
-- GRUPOS DE COMPLEMENTO (as "listas de complementos" da referência)
-- ---------------------------------------------------------------
-- Como o cliente escolhe dentro do grupo:
--   uma            = só uma opção (ex: tamanho)
--   varias         = mais de uma, sem repetir a mesma
--   varias_repetir = mais de uma, podendo repetir (ex: 2x bacon)
alter table grupos_complemento add column if not exists tipo_selecao text not null default 'uma'
  check (tipo_selecao in ('uma','varias','varias_repetir'));

-- Como o preço do grupo entra no total quando o cliente marca várias opções
-- (usado em pizza meio a meio: média ou mais caro em vez de somar).
alter table grupos_complemento add column if not exists modo_preco text not null default 'soma'
  check (modo_preco in ('soma','media','maior','menor'));

-- Em quais tipos de pedido esse grupo aparece. Vazio = todos.
alter table grupos_complemento add column if not exists tipos_pedido text[] not null default '{}';

alter table grupos_complemento add column if not exists ativo boolean not null default true;

-- ---------------------------------------------------------------
-- COMPLEMENTOS (as "opções" da referência)
-- ---------------------------------------------------------------
alter table complementos add column if not exists descricao text;
alter table complementos add column if not exists imagem_url text;

-- Quantas vezes a MESMA opção pode ser repetida, quando a lista está no modo
-- "mais de uma opção, podendo repetir" (ex: no máximo 3x bacon). null = sem
-- limite próprio, vale só o máximo da lista.
alter table complementos add column if not exists qtd_max integer;

-- ---------------------------------------------------------------
-- IDENTIDADE DA LOJA (hero do cardápio)
-- ---------------------------------------------------------------
-- Cor que o dono escolhe pra marca dele. É ela que pinta a faixa do topo,
-- os botões e os destaques do cardápio — o cardápio é whitelabel, então
-- nunca usa o verde do CliqueFome.
alter table lojas add column if not exists cor_marca text not null default '#1E7A4E';
-- Cidade/UF que aparece no hero ("Itabaiana - PB").
alter table lojas add column if not exists cidade text;
-- Texto livre do "Mais informações" (endereço completo, formas de pagamento,
-- observações da loja).
alter table lojas add column if not exists sobre text;
