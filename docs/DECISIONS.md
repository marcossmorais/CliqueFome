# Decisões

Só o que foi decidido contra uma alternativa razoável, com o motivo.

---

## SUBSTITUÍDO — Checkout público passa a persistir todo pedido (2026-08-08)

As três decisões abaixo ("`criar_pedido()` não é executável por `anon`",
"Compare-and-set no cliente, em vez de RPC de transição" e "Cardápio público
não grava pedido") **não valem mais**. Ficam registradas por histórico, não
apagadas.

**Nova decisão, pedida explicitamente pelo dono do projeto:** todo pedido
finalizado no cardápio público precisa virar registro oficial em `pedidos`,
**independente do plano da loja**. A persistência do pedido não é
funcionalidade Pro — só o **pagamento online** é que fica condicionado a
Pro/Pro+, e mesmo esses dois planos não têm pagamento habilitado ainda (não
existe gateway, webhook, assinatura nem antifraude prontos).

O que mudou pra isso ser seguro:
- `criar_pedido()` continua sem grant pra `anon`. Quem cria pedido de origem
  "site" é a nova `criar_pedido_publico_v1()`, chamada só pelo backend
  (`service_role`) a partir de `POST /api/lojas/[slug]/pedidos` — nunca
  direto do navegador. O rate limit que faltava (SEC-05) agora mora dentro
  do banco (`consumir_cota_checkout`), não em memória.
- A RPC pública fixa internamente `origem='site'`, status inicial
  `'pendente'` e forma de pagamento "A combinar pelo WhatsApp" — nenhum
  desses três vem do navegador.
- Idempotência por `(loja_id, idempotency_key)` com constraint única:
  duplo clique, timeout com retry ou duas abas nunca criam dois pedidos.
- O `UPDATE` amplo em `pedidos` (SEC-06) foi fechado de vez: não existe mais
  policy de UPDATE pra `authenticated`. `transicionar_pedido()` e
  `marcar_pagamento_manual()` são as únicas portas de escrita depois da
  criação, com `SELECT FOR UPDATE`, matriz de transição e compare-and-set.
  `lib/pedidos/acoes.ts` passou a chamar essas RPCs; a assinatura das
  funções exportadas não mudou, então `PedidosClient.tsx` e
  `PainelDetalhePedido.tsx` não precisaram de alteração nenhuma.
- WhatsApp só abre **depois** do commit no banco, com botão explícito (não
  `window.open` automático) e mensagem montada a partir do snapshot
  persistido, nunca do carrinho em memória.

Ver `schema-migracao-checkout-publico.sql` e
`app/api/lojas/[slug]/pedidos/route.ts` pro detalhe técnico completo.

---

## `criar_pedido()` não é executável por `anon`

Na versão básica o cardápio público não grava pedido — monta a mensagem do
WhatsApp. Quem lança pedido é a loja, logada, pelo painel. Manter a
concessão a `anon` deixava aberta uma porta que ninguém usa e que dá pra
floodar sem custo.

**Alternativa rejeitada:** manter `anon` "pro futuro". Custava uma migração
a mais depois e uma superfície anônima agora.

Quando a versão Pro passar a persistir pedido do cliente, a concessão volta
— **junto** com rate limit fora do banco, não antes.

---

## Item esgotado continua aparecendo, contra a recomendação da auditoria

A auditoria de 2026-08-08 manda "produto inativo deve ficar invisível". Isso
contraria a decisão registrada mais abaixo neste arquivo, tomada com motivo:
mostrar comunica que o item existe e volta.

**Decisão mantida.** Foi corrigida só a parte que era bug de verdade:
produto de **categoria inativa** vazava no filtro "Todos" — esse o dono
escondeu de propósito, e agora some.

---

## Compare-and-set no cliente, em vez de RPC de transição

As transições de pedido passaram a casar o status esperado
(`.eq('status', esperado)`), o que é uma única instrução atômica no Postgres:
ou casa, ou não altera linha nenhuma.

**Alternativa rejeitada (por ora):** `transicionar_pedido()` como RPC
estreita com `SELECT FOR UPDATE`, revogando o `UPDATE` amplo — que é o que a
auditoria pede. Resolve mais: estreita a superfície de escrita, não só a
disputa. Mas exige migração, mudança de policy e retrabalho no painel.

O compare-and-set fecha o bug relatado (duas abas regredindo ou
ressuscitando pedido) sem migração. A RPC continua na lista como SEC-06.

---

## Uma função só calcula preço de complemento

`combinarPrecos` é a única implementação da regra no front — modal, carrinho
e mensagem do WhatsApp passam por ela. Cada escolha carrega o `modoPreco` da
lista pro carrinho poder recalcular sem ter o catálogo em mãos.

**Motivo:** eram três contas diferentes. Numa lista "média", o modal
mostrava R$ 45 e o carrinho cobrava R$ 90.

O formato espelha o SQL de propósito: cada opção entra como
`preço × quantidade`, um elemento por opção distinta — exatamente o que
`array_agg(c.preco * quantidade)` faz em `criar_pedido()`. Manter a mesma
forma é o que garante que os dois lados cheguem ao mesmo centavo.

---

## Carrinho inválido é removido com aviso, não bloqueado

Linha cujo produto saiu do cardápio, esgotou ou perdeu uma opção é removida
na conferência com o catálogo, e a pessoa vê um aviso nomeando o item.
Mudança de preço atualiza e avisa.

**Alternativa rejeitada:** manter a linha e travar o checkout, como a
auditoria sugere. Deixa o carrinho num estado que a pessoa não sabe
desfazer. Remover mantém o carrinho sempre finalizável; o aviso é que
carrega a explicação.

---

## Cardápio sem barra de navegação

A nav do topo (logo, "Cardápio", "Peça agora", ícone do carrinho) foi
removida a pedido do dono do projeto. O cardápio de uma loja é uma página
só, e a nav repetia o que o `HeroLoja` logo abaixo já mostra.

**Consequência aceita:** com o carrinho vazio não há mais como abri-lo. O
botão flutuante aparece assim que há item — e carrinho vazio não tem o que
mostrar.

**Efeito colateral bom:** era na logo da nav que morava o pior bug visual do
cardápio (UI-01) — imagem sem dimensão CSS cobrindo a página e bloqueando o
carrinho no celular. A logo agora só aparece no `HeroLoja`, onde entra como
`background-image` de uma caixa de tamanho fixo.

---

## Preço calculado no banco, nunca no navegador

`criar_pedido()` recebe ids e quantidades, busca os preços no catálogo e faz a
conta. **Alternativa rejeitada:** aceitar o total do cliente. Bastaria abrir o
devtools pra mandar R$ 0,01.

Consequência: o front calcula preço só pra exibir. Se as duas contas
divergirem, quem manda é o banco.

---

## Colunas de status, sem arrastar-e-soltar

Gestão de pedidos usa colunas por status; o pedido anda por botão.
**Alternativa rejeitada:** Kanban com drag-and-drop. Numa cozinha corrida
arrastar é lento e erra fácil — decisão do usuário, e mantida mesmo depois de
ele pedir o visual em colunas da referência (a referência também não arrasta).

---

## Prioridade por "tempo até o prazo"

Uma fórmula só pros dois casos: pronta-entrega tem prazo implícito
(`criado_em + 30min`, ajustável em `lib/pedidos/prioridade.ts`), encomenda usa
a data/hora combinada. Ordena pelo tempo restante.

Resolve o que o usuário pediu: encomenda pra daqui a 2h fica atrás de um
balcão parado há 25min, mas encomenda pra daqui a 3 dias não sobe pro topo.

**Detalhe:** a *cor* do indicador usa tempo **decorrido** na pronta-entrega
(não restante) — é assim que o negócio pensa espera de cliente. Inverter isso
foi um bug real, pego em teste: pedido de 5 min aparecia amarelo.

---

## `getUser()` no proxy, mesmo custando ~230ms

**Alternativa rejeitada:** `getSession()`, que lê o cookie sem ir à rede e
economizaria ~230ms por navegação. A Supabase desaconselha explicitamente
`getSession()` em middleware, e não fomos contra a recomendação do fornecedor
sem o usuário saber.

O que foi feito no lugar: deduplicar as chamadas com `cache()` do React,
paralelizar `is_admin` + `getUser` + cookies, e restringir o matcher do proxy
a `/admin/:path*` (a landing e o cardápio público não pagam mais validação de
sessão).

---

## Sessão em cookie não-httpOnly

O usuário pediu httpOnly. **Não é possível** mantendo o client de navegador —
ele precisa ler o cookie. HttpOnly puro exigiria todo acesso server-side, e o
painel é muito interativo (arrastar salva a cada solta, toggles, modais):
viraria um round-trip por ação.

Além disso, httpOnly protege contra *roubo* de token, mas não contra *ação*:
com XSS o atacante faz requisições pela sessão do usuário de qualquer jeito. A
defesa que vale contra XSS é o escape (React faz por padrão) + CSP, e as duas
estão no lugar.

---

## Cardápio público não grava pedido (versão básica)

Manda o pedido pro WhatsApp, como o HTML original. A `criar_pedido()` existe e
funciona, mas na versão básica quem lança pedido no sistema é a loja, pelo
painel. Gravar automático fica pra versão Pro, com gateway.

---

## Item esgotado aparece, não some

Card apagado com fita "Esgotado". Antes o produto inativo sumia do cardápio.
Mostrar comunica que o item existe e volta.

A trava de clique está no **comportamento**, não só no CSS — senão bastava
clicar no card pra furar e adicionar item esgotado ao carrinho.

---

## Ordem por arrasto, não por campo numérico

Categorias, produtos e opções se reordenam arrastando. O campo "ordem" saiu
dos formulários. Pointer Events e não HTML5 drag-and-drop, porque o nativo não
funciona em touch e o painel roda em tablet no balcão.

O número ao lado do produto é a **posição na lista exibida** (1, 2, 3...), não
o `ordem` bruto do banco — que tem buracos, já que o arrasto só reindexa o que
está visível.

---

## Cartões de escolha no lugar de `<select>`

Em "O cliente poderá escolher" e "O preço do complemento será", cada opção é
um cartão com exemplo ("Meia pizza de R$ 40 com meia de R$ 50 sai R$ 45").
**Motivo:** o usuário disse que não entendia o que cada opção significava.

---

## `/[loja]` em vez de `?loja=slug`

Melhor pra SEO e compartilhamento. Redirect 308 no `proxy.ts` cobre os links
antigos — feito lá e não no `next.config` porque o Next repassa a query string
e a URL sairia como `/oh-taal?loja=oh-taal`.

---

## `useSyncExternalStore` pro relógio e pro localStorage

**Alternativa rejeitada:** `useState` + `useEffect`. Causa duas coisas: o
servidor renderiza um valor e o cliente outro (mismatch de hidratação), e
`setState` dentro de efeito dispara render em cascata — o lint do React acusa
os dois. `useSyncExternalStore` tem `getServerSnapshot` justamente pra isso.

---

## Delivery v3: um campo de endereço, não CEP + oito campos

O autocomplete existia desde a v2 (`lib/delivery/geoapify.ts`), mas só o
painel do lojista o usava — o endpoint que o servia exigia `auth.getUser()`,
e o cliente do cardápio, que é anônimo, tomava 401. Por isso o checkout
tinha CEP → oito campos manuais → botão "Calcular taxa de entrega".

Agora é um campo só ("Digite sua rua e número"), servido por
`/api/delivery/address/autocomplete`, que é **público**. Sem sessão pra
ancorar o limite, a proteção passou a ser mínimo de 3 caracteres + slug de
loja real com entrega ativa + teto por IP.

**Alternativa rejeitada:** manter o endpoint autenticado e criar um segundo
público. Dois caminhos pro mesmo provedor divergem com o tempo — foi
exatamente assim que o painel ficou com autocomplete e o checkout não.

O ViaCEP continua, mas como **fallback** atrás de um link, não como fluxo
principal.

---

## Dinheiro do Delivery em centavos inteiros

`store_delivery_settings` e `delivery_fee_overrides` guardam `*_cents` como
`integer`. As tabelas da v2 usavam `numeric(10,2)` em reais, e o cálculo por
km fazia `* 100 / 100` em float no meio do caminho.

`pedidos.taxa_entrega` continua em reais **por enquanto** — a conversão dele
alcança histórico, dashboard e mensagem de WhatsApp, e foi separada num
passo próprio pra poder ser revisada sozinha.

---

## Tabelas da v2 preservadas, não migradas por movimentação

`configuracoes_delivery`, `configuracoes_delivery_cidades` e
`enderecos_estabelecimento` seguem populadas e intactas. A migração v3
**copia** delas. Reverter é parar de ler as novas, sem restore de backup.

**Motivo:** o motor de taxas antigo ainda serve as cotações até o PR
seguinte. Derrubar a origem dos dados antes disso derrubaria o checkout.

---

## Modo "avançado" sem `<select>` de cidade

O cliente escolhia a cidade num `<select>` antes de digitar o endereço.
Agora a cidade sai do endereço que o autocomplete resolveu — perguntar a
cidade a quem já disse a rua é passo redundante.

Continua sendo só conveniência de tela: quem decide se a loja atende aquela
cidade, e por qual taxa, é o servidor na cotação. As cidades cadastradas
viraram `delivery_fee_overrides` com `scope='CITY'` no backfill.
