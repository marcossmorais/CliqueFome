# Pendências

Ordenadas por dependência: o que está em cima destrava o que está embaixo.
O ledger completo da auditoria está em
[REMEDIATION_STATUS.md](REMEDIATION_STATUS.md).

## Antes do próximo deploy

Aplicar `supabase/migrations/20260811180000_rebuild_delivery_module.sql` no
Supabase depois de `20260811_remove_legacy_delivery_system.sql` e antes de
ativar o novo Delivery. O cardápio e a Retirada possuem fallback enquanto a
migration nova não existe, mas Delivery permanece desligado. Configurar
`GEOAPIFY_API_KEY` somente no servidor/Vercel; sem ela as cotações respondem
503. `DELIVERY_QUOTE_SECRET` continua obsoleta e pode permanecer removida.

## Feito em 2026-08-08 (migration + deploy confirmados em produção)

`schema-migracao-checkout-publico.sql` rodou em produção e foi confirmado
por smoke test real: `POST /api/lojas/hamburgueria-teste/pedidos` respondeu
`422` (validação de negócio, não `503` de config ausente) — prova que
`SUPABASE_SECRET_KEY` está setada na Vercel e o caminho completo
(Route Handler → RPC → banco) funciona em produção, não só localmente.
`main` está publicado com persistência do checkout público, menu reorganizado
com fundo verde e **Cozinha (KDS)**.

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
3. Confirmar `SUPABASE_SECRET_KEY` e `RATE_LIMIT_HMAC_SECRET` na Vercel. A
   primeira é o client privilegiado usado por `lib/pedidos/servidor.ts`; a
   segunda é o segredo do HMAC do rate limit, que deixou de reaproveitar a
   chave do Supabase. Sem qualquer uma, a rota responde 503 em vez de quebrar.
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
- **E2E de navegador** do checkout completo (retirada, duplo
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

Mesas e comandas · Caixa · Desempenho · Fiscal

"Ajuda e suporte" saiu desta lista porque `/admin/suporte` foi construída.

## Cobertura de teste

`tests/ajuda-suporte.test.mjs` e `tests/historico-pedidos.test.mjs` cobrem
lógica pura. Fluxos de UI (catálogo,
pedidos e carrinho) continuam só verificados à mão, no
navegador — nada disso pega regressão de layout ou de integração amanhã.

## Observabilidade, qualidade e CI — 2026-08-09

Adicionado nesta rodada: `instrumentation.ts` (OpenTelemetry via
`@vercel/otel`, ligado sozinho — sem conta nova, aparece no dashboard da
Vercel; Sentry via `@sentry/nextjs`, mas só ativa se `SENTRY_DSN` existir),
Knip (`npm run knip`), dois specs Playwright formalizados em
`tests/e2e/` (`npm run test:e2e`), `npm run test` agregando os testes
unitários com cobertura (`coverage/lcov.info`), e
`.github/workflows/ci.yml` rodando tudo isso a cada push/PR.

**O que falta pra cada peça funcionar de verdade em CI/produção** (nada
disso eu consigo fazer sozinho — precisa de conta/segredo do dono):

- **Sentry**: criar conta grátis em sentry.io, criar um projeto Next.js,
  colar o DSN em `SENTRY_DSN` nas env vars da Vercel. Sem isso, o código
  já está pronto mas fica inerte (nem tenta mandar nada).
- **Codecov**: criar conta em codecov.io (grátis pra repo público),
  pegar o token do repositório e cadastrar como secret `CODECOV_TOKEN`
  no GitHub (Settings → Secrets and variables → Actions). Sem o secret,
  o upload do `codecov-action` falha silenciosamente
  (`fail_ci_if_error: false`) — o resto do CI continua passando.
- **CI precisa dos secrets do Supabase**: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`, `E2E_LOJA_SLUG` e
  `RATE_LIMIT_HMAC_SECRET` — todos apontando para um projeto Supabase de
  TESTE/STAGING, **nunca** os valores de produção: o e2e cria e apaga pedido
  de verdade. Cadastrados como secrets do repositório no GitHub. Sem eles, os jobs `build` e `e2e` do workflow vão falhar (a
  aplicação não sobe sem essas variáveis).
- **e2e em CI**: além dos secrets do Supabase, precisa de
  `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` (login de uma loja de teste,
  nunca conta real) e opcionalmente `E2E_LOJA_SLUG` (default
  `lojateste`). Sem credenciais administrativas, o spec de login pula; sem
  as três variáveis Supabase, o checkout E2E também pula com motivo explícito.
  Com os secrets configurados, ambos executam normalmente.
- **Datadog / New Relic**: ficaram de fora de propósito — são APM pagos;
  avaliar quando o volume de tráfego justificar (o OpenTelemetry já
  instrumentado facilita plugar qualquer um dos dois depois, sem reescrever
  nada).
- **Knip não bloqueia o CI ainda**: hoje aponta ~14 exports e 11 types
  não usados (a maioria em `lib/*/tipos.ts`, provavelmente
  código morto de refatorações passadas) — não foram removidos nesta
  rodada pra não misturar limpeza de código com a adição da ferramenta.
  Vale uma passada dedicada depois.
