# Pendências

Ordenadas por dependência: o que está em cima destrava o que está embaixo.
O ledger completo da auditoria está em
[REMEDIATION_STATUS.md](REMEDIATION_STATUS.md).

## Bloqueando

**Rodar `schema-migracao-seguranca.sql` (versão corrigida).** A primeira
tentativa passou sem erro e sem efeito — `revoke select (coluna)` é ignorado
enquanto existe `SELECT` na tabela. O arquivo agora revoga a tabela e concede
coluna a coluna, e também **apaga a `criar_pedido` antiga de 8 parâmetros**,
que continuava concedida a `anon` sem nenhuma das validações novas.

Rode o bloco de CONFERÊNCIA no fim do arquivo. O esperado:
1. sobra **uma** `criar_pedido`, com 11 argumentos;
2. `anon` não aparece na lista de quem executa `criar_pedido` nem
   `pedido_detalhe`;
3. a consulta de colunas internas volta **vazia**;
4. o bucket mostra `file_size_limit = 3145728`.

**Confirmar o que a Vercel publica hoje** (SEC-02). Se for `origin/main`, o
HTML estático com `innerHTML` está no ar e é stored XSS. Nenhuma linha de
código resolve isso — é configuração de deploy.

## Decisões de produto que travam correções

- **Onboarding** (SEC-04): cadastro por convite, aprovação ou aberto? Quota
  de lojas por usuário? Slugs reservados? Enquanto não houver resposta, o
  signup externo deveria ficar desligado.
- **Pedido público na versão Pro**: quando o cardápio passar a gravar
  pedido, `criar_pedido` volta a precisar de `anon` — e aí o rate limit
  (SEC-05) deixa de ser opcional.
- **Fuso por loja**: hoje é `America/Sao_Paulo` fixo no código.

## Validação que só o usuário consegue fazer

- **Catálogo** (`/admin/catalogo`): criar/editar/apagar produto, categoria e
  lista; arrastar pra reordenar; upload de foto (agora com limite de 3 MB e
  checagem de tipo real).
- **Gestão de pedidos** com pedido real: criar manual, avançar status,
  marcar pagamento. Confirmar que o conflito entre duas abas mostra a
  mensagem de recarregar em vez de regredir o pedido.
- **Pedido manual com produto que tem lista obrigatória** — agora falha de
  propósito. Confirmar que a mensagem de erro faz sentido pra quem opera.
- **Medir performance em produção** (`npm run build && npm start`).

## Depois de validado

- Apagar `index.html`, `cardapio.html`, `admin.html` da raiz.
- Conferir os redirects 301/308: `/cardapio.html?loja=x → /x`,
  `/admin.html → /admin/catalogo`, `/index.html → /`.
- Deploy na Vercel: cadastrar `NEXT_PUBLIC_SUPABASE_URL` e
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Melhorias pedidas pelo usuário

**Formulário de pedido manual** — hoje só escolhe produto e quantidade.
Precisa de coluna de categorias, grade com busca e carrinho lateral com
complementos, reaproveitando o `ModalProduto` do cardápio público. Virou
mais urgente: sem complementos, produto com lista obrigatória não pode ser
lançado manualmente.

**Fluidez do painel** — `<Link prefetch>` nas rotas do menu, Server Actions
em vez de `router.refresh()` ao salvar.

## Achados da auditoria ainda abertos

Os 28 pendentes estão detalhados no ledger. Os de maior peso:

- **Acessibilidade** (UI-02 a UI-05, UI-11): cards do cardápio e do admin
  não recebem foco; carrinho não é diálogo; falta `aria-pressed` e região
  viva. É o bloco mais volumoso que sobrou.
- **Catálogo não transacional** (FUN-10, FUN-11): edição de produto e
  reordenação continuam em várias escritas soltas. Precisa de RPC.
- **`UPDATE` amplo em `pedidos`** (SEC-06): o compare-and-set resolve a
  disputa entre abas, mas o dono ainda pode escrever qualquer coluna.
- **Rotas inexistentes no menu** (FUN-02): `/admin/lojas`.
- **CSP com `unsafe-inline`** (SEC-11) e cookies sem `Secure` (SEC-12).

## Telas ainda não construídas

Aparecem no menu com bolinha laranja e caem no placeholder "Em breve":

Mesas e comandas · KDS (cozinha) · Caixa · Áreas de entrega · Entregadores ·
Desempenho · Histórico de pedidos · Financeiro · Fiscal · Configurações ·
Avaliações · Dúvidas e suporte

## Sem cobertura de teste

O repositório tem **zero** teste automatizado. Tudo nesta rodada foi
verificado à mão, no navegador, com o build de produção. Nada disso pega
regressão amanhã.
