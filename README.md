# CliqueFome
Plataforma de pedidos de comida online com sistema de pagamento integrado

Cardápio digital multi-loja (lanchonete, hamburgueria, açaiteria, pizzaria etc.)
com painel de administrador. Front-end estático (HTML/CSS/JS puro) + Supabase
(banco de dados, autenticação e storage de imagens).

## Arquivos

- `index.html` — landing page institucional do CliqueFome (a marca da
  plataforma): resumo das funcionalidades, planos e botão "Acessar conta"
  que leva pro login em `admin.html`.
- `cardapio.html` — cardápio público que o cliente final de cada loja
  acessa. Uma loja é escolhida pela URL: `?loja=slug-da-loja` (o slug é
  definido ao criar a loja no admin). É whitelabel — usa a identidade da
  loja, nunca a marca CliqueFome.
- `admin.html` — painel do dono da loja: login, criação da loja, categorias,
  produtos, grupos de complemento (ex: "escolha o tamanho", "adicionais") e
  status de delivery/encomendas.
- `schema.sql` — schema do banco (tabelas, RLS, bucket de imagens). Um único
  projeto Supabase serve todas as lojas; cada dono só vê/edita a própria loja.
- `schema-migracao-catalogo.sql` — **rode se seu banco já existia antes do
  catálogo novo.** Adiciona os campos que o painel reconstruído usa
  (etiquetas, destaque, preço promocional/custo, disponibilidade por dia e
  tipo de pedido, tipo de seleção das listas de complemento). É seguro rodar
  mais de uma vez. Em banco novo não precisa: o `schema.sql` já vem com tudo.

## Deploy

### 1. Supabase (banco de dados)

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Em **SQL Editor → New query**, cole o conteúdo de `schema.sql` e rode.
3. Em **Storage**, confira se o bucket `imagens-cardapio` foi criado (o script
   já cria, mas se preferir pode criar manualmente marcando "Public bucket").
4. Em **Authentication → Users**, crie um usuário (email/senha) pra cada dono
   de loja que for logar no `admin.html`.
5. Em **Project Settings → API**, copie a **Project URL** e a **anon public
   key**.
6. Cole os dois valores no topo de `cardapio.html` (`SUPABASE_URL`,
   `SUPABASE_ANON_KEY`, `LOJA_SLUG_PADRAO`) e de `admin.html`
   (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).

### 2. Vercel (hospedagem)

Como é tudo estático, não precisa de build. Duas opções:

- **Dashboard (recomendado):** [vercel.com/new](https://vercel.com/new) →
  importar este repositório do GitHub → Deploy. Cada push na `main` gera um
  deploy novo automaticamente.
- **CLI:** `npx vercel` na raiz do projeto (pede login na primeira vez).

Depois do deploy, o cardápio de cada loja fica em
`https://seu-projeto.vercel.app/?loja=slug-da-loja` e o admin em
`https://seu-projeto.vercel.app/admin.html`.

### 3. Primeiro acesso

1. Abra `admin.html`, entre com o usuário criado no Supabase Auth.
2. No primeiro login, preencha "Criar minha loja" (nome, slug, nicho,
   WhatsApp).
3. Cadastre categorias, grupos de complemento e produtos.
4. Acesse `cardapio.html?loja=seu-slug` pra ver o cardápio publicado.
