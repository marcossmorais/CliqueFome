# Pendências

Ordenadas por dependência: o que está em cima destrava o que está embaixo.

## Bloqueando

**Rodar `schema-migracao-pedidos.sql` no Supabase.** Sem isso `/admin/pedidos`
não carrega detalhe de pedido nem cria pedido manual — a função
`pedido_detalhe()` e o tipo `encomenda` não existem no banco. É seguro rodar
mais de uma vez.

**Commitar a migração do cardápio.** `app/[loja]/`, `lib/cardapio/` e
`hooks/useLocalStorage.ts` estão no working tree sem commit.

## Validação que só o usuário consegue fazer

- **Catálogo** (`/admin/catalogo`): criar/editar/apagar produto, categoria e
  lista de complemento; arrastar pra reordenar; upload de foto.
- **Gestão de pedidos** com um pedido real: criar manual, avançar status,
  marcar pagamento.
- **Medir performance em produção** (`npm run build && npm start`), não em dev.

## Depois de validado

- Apagar `index.html`, `cardapio.html`, `admin.html` da raiz.
- Conferir os redirects 301: `/cardapio.html?loja=x → /x`, `/admin.html →
  /admin/catalogo`, `/index.html → /`.
- Deploy na Vercel: cadastrar `NEXT_PUBLIC_SUPABASE_URL` e
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` nas variáveis de ambiente.

## Melhorias pedidas pelo usuário

**Formulário de pedido manual** — hoje só escolhe produto e quantidade. A
referência (Cardápio Web) mostra: coluna de categorias, grade de produtos com
busca, e carrinho lateral com complementos. Precisa reaproveitar o
`ModalProduto` do cardápio público.

**Fluidez do painel** — melhorou com o esqueleto de carregamento, mas o
usuário quer mais. Ideias não exploradas: `<Link prefetch>` nas rotas do menu,
Server Actions em vez de `router.refresh()` ao salvar.

## Telas ainda não construídas

Aparecem no menu com bolinha laranja e caem no placeholder "Em breve"
(`app/admin/(painel)/[area]/page.tsx`):

Mesas e comandas · KDS (cozinha) · Caixa · Áreas de entrega · Entregadores ·
Desempenho · Histórico de pedidos · Financeiro · Fiscal · Configurações ·
Avaliações · Dúvidas e suporte

O `schema-pedidos.sql` já tem a base pra Histórico e Financeiro.

## Versão Pro (fora do escopo atual)

Gateway de pagamento (ValidaPay). O webhook vai precisar de função própria com
validação de assinatura — **nunca deixar o navegador escrever em
`pagamento_status`**. Aí o cardápio público passa a gravar pedido de verdade
(hoje só manda pro WhatsApp) e entra a tela de acompanhamento
`/pedido/[token]`, cuja função `pedido_por_token()` já existe no banco.

## Segurança — não coberto ainda

- Sem limite de pedidos por telefone/IP: dá pra floodar a loja.
- Telefone do cliente não é verificado (nome e telefone são o que a pessoa
  digitou).
- CSP escrita mas nunca exercitada com o cardápio público em produção.
