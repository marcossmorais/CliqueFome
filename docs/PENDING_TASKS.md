# Pendências

Ordenadas por dependência: o que está em cima destrava o que está embaixo.
O ledger completo da auditoria está em
[REMEDIATION_STATUS.md](REMEDIATION_STATUS.md).

## Feito em 2026-08-08 (migration + deploy confirmados em produção)

`schema-migracao-checkout-publico.sql` rodou em produção e foi confirmado
por smoke test real: `POST /api/lojas/hamburgueria-teste/pedidos` respondeu
`422` (validação de negócio, não `503` de config ausente) — prova que
`SUPABASE_SERVICE_ROLE_KEY` está setada na Vercel e o caminho completo
(Route Handler → RPC → banco) funciona em produção, não só localmente.
`main` está publicado com: Delivery facilitado, persistência do checkout
público, menu reorganizado com fundo verde, e agora **Cozinha (KDS)**.

## Cozinha (KDS) — integrada em 2026-08-08

Handoff recebido de outra sessão (branch `feature/cozinha-pedido-detalhado`,
commits `20f183b` + `70247c9`, aplicados via `git am`) esperava exatamente o
contrato de `transicionar_pedido()` que a persistência do checkout já tinha
acabado de colocar em produção — nenhuma adaptação foi necessária em
`lib/cozinha/acoes.ts`. Testado autenticado via Playwright: pedido avançou
`confirmado → em_preparo → pronto`, contadores da fila atualizaram, zero
erro de console. 11 testes unitários de `tests/cozinha/fluxo.test.mjs`
passando.

Gates de polimento que o handoff original listou e **ainda não foram
feitos** (não bloqueiam o uso — a tela funciona sem eles):

- **`pronto_em`** — coluna nova pra ordenar "Prontos para encaminhamento"
  por quando ficou pronto, não por `criado_em`. Hoje a coluna "Prontos"
  ordena por `criado_em` decrescente, que não é a mesma coisa.
- **`pedidoEhEntrega` centralizado** — a lógica de "isso é uma entrega?"
  (delivery, ou encomenda com endereço) está reimplementada em mais de um
  lugar (Cozinha, Gestão). Devia virar uma função só, idealmente espelhada
  no banco.
- **Timezone da loja** nas datas exibidas (mesma pendência já registrada
  pro resto do painel — hoje é `America/Sao_Paulo` fixo no código).
- **Papel próprio de funcionário/cozinheiro.** Hoje quem acessa `/admin/kds`
  é dono ou super admin, igual a qualquer outra tela — não há um login
  "só cozinha".
- **E2E autenticado em 320/375/desktop.** Testado nesta sessão só em
  desktop (1280×900), via Playwright, uma vez.

## Bloqueava (resolvido) — persistência do checkout público

Antes de rodar em produção, o checklist era:

1. Rodar em staging primeiro. O arquivo tem um bloco de CONFERÊNCIA no fim
   — as três últimas consultas devem voltar vazias/corretas (nenhuma policy
   de UPDATE amplo sobrando, `anon` sem EXECUTE nas RPCs sensíveis,
   `pedidos` na publicação de realtime).
2. Testar com `anon`, com o dono da própria loja e com o dono de outra loja
   (RLS + as duas RPCs novas) antes de liberar o Route Handler.
3. Confirmar `SUPABASE_SERVICE_ROLE_KEY` na Vercel (já deve estar setada
   pelo Delivery facilitado — é o mesmo client privilegiado, reaproveitado
   em `lib/pedidos/servidor.ts`). Sem ela, a rota responde 503 em vez de
   quebrar.
4. Fazer deploy do backend com `CHECKOUT_PUBLICO_ATIVO=false` primeiro,
   rodar um smoke test manual direto na rota, e só então tirar a variável
   (ou setar qualquer valor diferente de `"false"`) pra ligar de vez. Ver
   `.env.example`.
5. Depois de confirmado em produção, criar um pedido de teste pelo
   cardápio público e verificar que ele aparece em **Gestão de pedidos**
   (coluna "Em andamento", status pendente) e no `/pedido/[token]` da
   resposta.

**Rollback sem apagar pedido nenhum:** `CHECKOUT_PUBLICO_ATIVO=false` desliga
a rota na hora. O bloco ROLLBACK comentado no fim do arquivo SQL cobre
reverter os grants, se precisar. Nenhum pedido já criado é afetado.

**O que ficou fora desta rodada, documentado mas não implementado** (pra não
fingir proteção que não existe):
- **CAPTCHA real.** `TURNSTILE_SECRET_KEY` é opcional — sem ela, a
  verificação é pulada. A defesa contra abuso hoje são só os limites em
  banco (`consumir_cota_checkout`: 8/10min por IP+loja, 5/10min por
  telefone+loja, teto de 5000/dia). Pra um lançamento maior, vale colocar
  o widget do Turnstile no carrinho e configurar a chave.
- **Tabela `pagamentos` separada.** O domínio está preparado
  (`capacidades_checkout()` sempre devolve `pagamento_online_habilitado:
  false`), mas a tabela com provider/referência externa/idempotência do
  webhook futuro não foi criada — não há gateway pra justificar o schema
  ainda. Ver seção "Pagamento online (Pro/Pro+)" abaixo.
- **Teste de carga/concorrência real** da idempotência (duas requisições
  literalmente simultâneas com a mesma chave). A lógica foi desenhada pra
  isso (constraint única reserva a chave antes de criar o pedido — é o
  índice do Postgres que serializa, não uma variável), mas só dá pra provar
  de verdade com um teste contra um Supabase real, fora do alcance desta
  sessão sem acesso à produção.
- **E2E de navegador** do checkout completo (retirada, delivery, duplo
  clique, mobile). `tests/checkout.test.mjs` cobre a validação de payload e
  o hash de idempotência — lógica pura, sem servidor.

## Pagamento online (Pro/Pro+)

Preparado, não ligado. `capacidades_checkout(loja_id)` (SQL) sempre devolve
`pagamento_online_habilitado: false` — não há gateway, webhook, assinatura
nem antifraude prontos. Quando isso for construído:

- Pro e Pro+ terão a **mesma** capacidade de pagamento online — nenhum dos
  dois ganha preço, limite ou benefício além do que já está decidido.
- Vai precisar de uma tabela `pagamentos` separada de `pedidos` (provider,
  referência externa, valor, moeda, status, chave de idempotência própria).
- O webhook deve validar assinatura sobre o raw body, rejeitar replay por
  `provider_event_id` único, conferir pedido/loja/moeda/valor, e nunca
  atualizar `pagamento_status` a partir de um redirect do navegador.
- `status` (operacional) e `pagamento_status` continuam campos separados —
  já é assim hoje.

## Delivery facilitado

**Rodar `schema-migracao-delivery-facilitado.sql`.** Cria
`configuracoes_delivery`, `configuracoes_delivery_cidades` e as funções de
cotação/limite. Sem isso, `config_delivery_publica` devolve `PGRST202` e o
cardápio cai no fallback de `lojas.taxa_entrega` fixo — o que não quebra a
loja, mas deixa a tela `/admin/delivery` sem ter o que carregar. Preencher
antes na Vercel: `SUPABASE_SERVICE_ROLE_KEY`, `GEOAPIFY_API_KEY` e
(recomendado) `DELIVERY_QUOTE_SECRET` — ver `.env.example`.

O que já está pronto e testado (`tests/delivery.test.mjs`, `tsc --noEmit`,
`eslint`, sem rodar contra produção ainda):
- `/admin/delivery` — escolha entre setor **facilitado** (taxa única da
  cidade, fixa ou por km) e **avançado** (mais cidades vizinhas com taxa fixa
  própria cada).
- `POST /api/delivery/cotacao` — cotação pública assinada (HMAC), usada pelo
  carrinho do cardápio (`app/[loja]/Carrinho.tsx`); Geoapify só é chamado no
  modo por km da cidade principal, nunca em taxa fixa nem cidade vizinha.
- `taxa_maxima` (default R$ 40) e `distancia_maxima_km` barram cotações fora
  do razoável antes de chegarem ao cliente — é a proteção contra o bug de
  "frete de R$ 200" citado na spec.
- Carrinho público: no modo entrega, se a loja tem delivery facilitado
  configurado, o cliente precisa clicar em "Calcular frete" (endereço válido,
  e cidade escolhida no modo avançado) antes de finalizar — qualquer edição
  no endereço ou na cidade invalida a cotação anterior.

O que ainda falta:
- **Pedido público não persiste no banco** (segue WhatsApp-only). O token
  HMAC da cotação é gerado e mostrado, mas nada no servidor valida esse token
  hoje — ele só existe pronto pra quando `criar_pedido` passar a ser chamado
  também pelo cardápio público (ver "Pedido público na versão Pro" abaixo).
- Testar contra produção real com endereço de verdade (a suíte só cobre a
  matemática pura de `lib/delivery/tipos.ts`).

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

**Preencher os dados jurídicos de `/termos`.** A página está no ar, mas com
`noindex` e um aviso visível de rascunho — de propósito, enquanto faltarem
`CLIQUEFOME_RAZAO_SOCIAL`, `CLIQUEFOME_CNPJ`, `CLIQUEFOME_ENDERECO`,
`CLIQUEFOME_EMAIL_PRIVACIDADE` e `CLIQUEFOME_DATA_VIGENCIA` nas variáveis de
ambiente da Vercel. São variáveis de servidor, não levam `NEXT_PUBLIC_`.

Preencher só apaga o aviso; **não** torna o texto válido. Ele é uma base
técnica e precisa ser confrontado com os contratos, os fornecedores reais e a
retenção de dados que o sistema de fato pratica, e revisado por profissional
jurídico antes de virar documento definitivo.

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

Mesas e comandas · KDS (cozinha) · Caixa · Entregadores ·
Desempenho · Histórico de pedidos · Financeiro · Fiscal · Configurações ·
Avaliações

"Ajuda e suporte" e "Áreas de entrega" saíram desta lista: `/admin/suporte` e
`/admin/delivery` foram construídas — a segunda ainda depende da migração
rodar em produção (ver "Bloqueando" acima).

## Cobertura de teste

`tests/ajuda-suporte.test.mjs`, `tests/historico-pedidos.test.mjs`,
`tests/avaliacoes.test.mjs` e `tests/delivery.test.mjs` (`npm run
test:delivery`) cobrem lógica pura. Fluxos de UI (catálogo, pedidos,
carrinho, formulário de delivery) continuam só verificados à mão, no
navegador — nada disso pega regressão de layout ou de integração amanhã.
