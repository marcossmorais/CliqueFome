# Decisões

Só o que foi decidido contra uma alternativa razoável, com o motivo.

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
