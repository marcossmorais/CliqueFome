# Remediação da auditoria de 2026-08-08

Ledger dos 56 achados da auditoria `CF-AUDIT-20260808-a4844b1` (commit
auditado `a4844b1`). Nenhum item some desta lista: o que não foi corrigido
fica como **PENDENTE** com o motivo.

**Estado:** 22 corrigidos · 6 parciais · 27 pendentes · 1 positivo. (SEC-05 e
SEC-06 fechados em 2026-08-08 pela persistência do checkout público — ver
`docs/PENDING_TASKS.md`, ainda não aplicado em produção.)

**SEC-02 saiu de "condicionado" para CONFIRMADO NO AR** — ver a seção logo
abaixo. É o item mais urgente da lista, e a contenção leva 30 segundos.

## SEC-02 está no ar — confirmado em 2026-08-08

`https://cliquefome.vercel.app` serve o **HTML estático antigo**. O commit
publicado é `e3578d7` (o terceiro do repositório), identificado pelo tamanho
exato dos arquivos: `index.html` 55787 bytes, `admin.html` 43601 bytes.

```
/                200   "Sua marca — Cardápio"
/admin.html      200   "Admin — Cardápio"     ← o painel está publicado
/pizzaria-teste  404                          ← o app Next NÃO está no ar
```

O sink, verificado no arquivo publicado (`e3578d7:index.html:1163`):

```js
'<img src="' + p.imagem_url + '" alt="' + p.nome + '" loading="lazy">'
```

`p` vem da tabela `produtos` sem escape nenhum e cai em `innerHTML`.

**Cadeia de ataque com o que está configurado hoje:** signup aberto →
qualquer pessoa cria conta e loja → payload no nome do produto → manda
`?loja=loja-dela` pra um dono logado → script roda na mesma origem do
`/admin.html` → lê o `localStorage` → assume a sessão da vítima.

Contenção imediata, sem redeploy: Vercel → Settings → Deployment Protection
→ Vercel Authentication → All Deployments. Depois, desligar o signup no
Supabase. A cura definitiva é publicar o app Next (com o preset trocado de
"Other" pra "Next.js") e apagar os `.html` da raiz.

## Estado do banco em 2026-08-08 — fechado, medido por probe anônimo

As duas migrações foram rodadas. Probe anônimo contra o banco real:

```
produtos.preco_custo      HTTP 401  permission denied
produtos.codigo_interno   HTTP 401  permission denied
produtos select=*         HTTP 401  permission denied
lojas.dono_id             HTTP 401  permission denied
criar_pedido (anon)       HTTP 401  permission denied for function
colunas públicas          HTTP 200  seguem funcionando
```

O `PGRST203` desapareceu, o que confirma que a `criar_pedido` duplicada foi
apagada. **SEC-01 e SEC-03 fechados.**

Dois problemas apareceram só ao testar contra o banco real, e nenhum dos
dois estava na auditoria — ficam registrados porque explicam por que a
primeira tentativa da migração passou sem erro e sem efeito:

### `criar_pedido()` existe em duas versões

A original tinha **8 parâmetros**; a atual tem 11. `create or replace` não
substitui assinatura diferente — cria outra função. Sobraram as duas, e a
de 8 parâmetros:

- não tem nenhuma das validações novas de complemento;
- continuava concedida a `anon` (o `revoke` mirava só a de 11);
- deixava o PostgREST sem saber qual chamar.

Probe anônimo: `POST /rest/v1/rpc/criar_pedido` → `HTTP 300 PGRST203`.
`schema-migracao-seguranca.sql` agora faz `drop function if exists` nela.

### `revoke select (coluna)` não faz nada sozinho

Em Postgres, privilégio de coluna não restringe enquanto existe `SELECT` na
tabela inteira — que é o que o Supabase concede por padrão. O SQL roda,
retorna sucesso e não muda nada. Probe anônimo depois da primeira tentativa:

```
produtos.preco_custo      HTTP 200  [{"preco_custo":null}]
produtos.codigo_interno   HTTP 200  [{"codigo_interno":10000}]
lojas.dono_id             HTTP 200  [{"dono_id":"379482c3-..."}]
```

A versão corrigida revoga a tabela e concede coluna a coluna, e já está
aplicada — é o que o probe acima confirma.

**Lição que vale pro resto da lista:** as duas falhas passaram por revisão
de arquivo sem serem notadas, e só apareceram ao chamar o banco de verdade.
O que está no `.sql` não é necessariamente o que está no Postgres. Todo item
de banco ainda pendente merece um probe antes de ser marcado como fechado.

### O que muda no comportamento

- **`criar_pedido()` não é mais executável por `anon`** (decisão registrada em
  [DECISIONS.md](DECISIONS.md)). O cardápio público manda pro WhatsApp e não
  grava pedido, então nada quebra hoje.
- **Pedido manual com produto que tem lista obrigatória passa a falhar.** A
  RPC agora exige `qtd_min`, e o formulário manual só manda produto e
  quantidade. Antes o pedido era criado calado, no preço base. É a limitação
  que já estava em PENDING_TASKS, agora com efeito visível.
- **Lista com mínimo maior que o número de opções ativas** deixa de salvar.

## Verificado no navegador

Build de produção (`npm start`), Chromium via Playwright:

| O que | Resultado |
|---|---|
| Carrinho corrompido (`{}`, `"texto"`, `[1,2,3]`, item sem forma) | 4 de 4 carregam, 0 erro de página |
| Logo 4000×4000 em 375px | Renderiza 36×36; centro do botão do carrinho atinge o botão; sem overflow horizontal |
| `.icon-btn` | `background: rgba(0,0,0,0)`, `appearance: none` |
| `/admin/criar-loja` sem sessão | 200 via `/admin/login?proximo=…` (antes: 404) |
| Modal de produto | Abre, 2 listas, `<legend>` presente, `aria-labelledby` correto, 0 erro |
| Total modal × carrinho | R$ 44,90 = R$ 44,90 |
| Regra de preço nos 4 modos | soma 90 · média 45 · maior 50 · menor 40 — modal e carrinho idênticos |

`npm run build` e `npx eslint .` passam limpos.

## Segurança (SEC-01 a SEC-16)

| ID | Sev | Achado | Estado | Onde |
|---|---|---|---|---|
| SEC-01 | CRÍTICO | Manipulação de preço e regras em `criar_pedido()` | **FECHADO** | `schema-migracao-pedidos.sql`: vínculo `produto_grupos`, `qtd_min`/`qtd_max`, `tipo_selecao`, quantidade por opção, tetos de payload. Exige rodar a migração. |
| SEC-02 | **CRÍTICO** | Stored XSS na versão estática publicada | **CONFIRMADO NO AR** | `cliquefome.vercel.app` serve o commit `e3578d7`, incluindo `/admin.html`. Sink verificado em `index.html:1163`. Ver seção acima. |
| SEC-03 | ALTO | Leitura anônima alcança colunas internas | **FECHADO** | `revoke select (preco_custo, codigo_pdv, codigo_interno)` e `select (dono_id)` + colunas explícitas em `app/[loja]/page.tsx`. |
| SEC-04 | ALTO | Signup externo cria lojas sem quota | **PENDENTE — URGENTE** | Depende do modelo de onboarding. Mas hoje é o que abre a cadeia do SEC-02: é o signup que deixa um estranho plantar o payload. Desligar no dashboard enquanto não se decide. |
| SEC-05 | ALTO | RPC sem rate limit nem limites de cardinalidade | **CORRIGIDO** (2026-08-08, `schema-migracao-checkout-publico.sql`) | O checkout público (`POST /api/lojas/[slug]/pedidos`) chama `criar_pedido_publico_v1()`, que passa por `consumir_cota_checkout()` — rate limit **dentro do banco** (8/10min por IP+loja, 5/10min por telefone+loja, teto de 5000/dia), não Edge Function nem Map em memória. `criar_pedido()` continua sem grant pra `anon`. Falta rodar em produção. |
| SEC-06 | ALTO | Dono pode atualizar todos os campos de `pedidos` | **CORRIGIDO** (2026-08-08, `schema-migracao-checkout-publico.sql`) | A policy `pedidos_update_dono` (UPDATE amplo) foi removida. As únicas escritas pós-criação são `transicionar_pedido()` e `marcar_pagamento_manual()`, RPCs com `SELECT FOR UPDATE`, matriz de transição e compare-and-set — não dá mais pra sobrescrever `total`/`loja_id`/`token`/`origem`. Falta rodar em produção. |
| SEC-07 | ALTO | Uploads sem tamanho, MIME ou quota | **CORRIGIDO** | `lib/catalogo/upload.ts` valida tamanho, MIME e *magic bytes*; bucket ganha `file_size_limit` e `allowed_mime_types`. Falta quota por loja. |
| SEC-08 | MÉDIO | Open redirect depois do login | **PENDENTE** | `FormularioLogin.tsx` ainda aceita destino sem allowlist. |
| SEC-09 | MÉDIO | Cookie `cf_loja` tratado como autorização | **CORRIGIDO** | `lib/loja.ts` valida o UUID e filtra por `dono_id` quando não é super admin. O comentário anterior afirmava que a RLS bloqueava — não bloqueava. |
| SEC-10 | MÉDIO | `SECURITY DEFINER` com grants e `search_path` amplos | **PARCIAL** | `is_admin()` ganhou `search_path` fixo; `execute` revogado de `public` em `is_admin` e `pedido_detalhe`. Falta varrer as demais. |
| SEC-11 | MÉDIO | CSP mantém `script-src unsafe-inline` | **PENDENTE** | Migrar para nonce por request. |
| SEC-12 | MÉDIO | Cookies Supabase sem `Secure` explícito | **PENDENTE** | Definir em produção. |
| SEC-13 | MÉDIO | Integridade multi-tenant incompleta | **PENDENTE** | Faltam FKs compostas garantindo categoria/grupo da mesma loja. |
| SEC-14 | MÉDIO | Token de acompanhamento sem expiração | **PENDENTE** | `pedido_por_token` continua concedida a `anon`; a rota `/pedido/[token]` ainda não existe. |
| SEC-15 | BAIXO cond. | Links derivados do header `Host` | **PENDENTE** | `links/page.tsx`. Usar origem canônica. |
| SEC-16 | MÉDIO | Drift entre schema implantado e documentação | **CORRIGIDO** | `PROJECT_STATE.md` e `PENDING_TASKS.md` corrigidos. Migrations versionadas via CLI continuam pendentes. |

## Funcional (FUN-01 a FUN-25)

| ID | Sev | Achado | Estado | Onde |
|---|---|---|---|---|
| FUN-01 | ALTO | Dono sem loja cai em rota inexistente | **CORRIGIDO** | `app/admin/criar-loja/`, fora do grupo `(painel)`, com saída da conta. |
| FUN-02 | ALTO | Link `/admin/lojas` inexistente | **PENDENTE** | `ShellPainel.tsx` aponta pra rota que não existe. |
| FUN-03 | ALTO | Produto de categoria inativa aparece em "Todos" | **CORRIGIDO** | `page.tsx` cruza o produto com o conjunto de categorias ativas. |
| FUN-04 | ALTO | Preço diverge entre modal, carrinho e WhatsApp | **CORRIGIDO** | `combinarPrecos` / `extraDoGrupo` / `extraDaLinha`: uma regra só, conferida nos 4 modos. |
| FUN-05 | ALTO | Destaque não altera a ordem pública | **CORRIGIDO** | Destaque ordena primeiro; ordem manual desempata. |
| FUN-06 | ALTO | `tipos_pedido` ignorado no cardápio | **CORRIGIDO** | Carregado e aplicado a produto e lista, seguindo o modo escolhido no carrinho. |
| FUN-07 | ALTO | `varias_repetir` e `qtd_max` por opção não funcionam | **CORRIGIDO** | `ModalProduto` guarda `{complementoId, quantidade}` e mostra contador nas listas que repetem. |
| FUN-08 | ALTO | Disponibilidade semanal usa fuso do servidor | **PARCIAL** | Passou a calcular em `America/Sao_Paulo`. Fuso por loja exige coluna nova. |
| FUN-09 | ALTO | Carrinho persistido não é reconciliado | **CORRIGIDO** | `reconciliarCarrinho` + `ehCarrinhoValido`, com aviso na tela. |
| FUN-10 | ALTO | Edição de listas não é transacional | **PARCIAL** | Uploads passaram pra antes do `delete` — a janela de perda deixou de conter rede lenta. RPC transacional continua pendente. |
| FUN-11 | ALTO | Edição de produto e reordenação não são atômicas | **PENDENTE** | `ModalProduto` do admin e `CatalogoClient`. |
| FUN-12 | ALTO | Transições de pedido sem compare-and-set | **CORRIGIDO** | `avancarStatus`, `cancelarPedido` e `marcarPagamento` casam o status esperado e lançam `ConflitoDePedido`. |
| FUN-13 | ALTO | Erros do Supabase viram vazio ou 404 | **CORRIGIDO** | `page.tsx` trata `error` e lança; `app/[loja]/error.tsx` separa falha de "não existe". Admin ainda engole alguns. |
| FUN-14 | ALTO | Encomenda com endereço pula `saiu_para_entrega` | **PENDENTE** | `proximoStatus` só testa `tipo === 'delivery'`. |
| FUN-15 | ALTO | Sem controle de delivery e encomendas no Next | **PENDENTE** | Decisão sua: o card "Status da loja" foi adiado de propósito, pra ser repensado. |
| FUN-16 | ALTO | Preço negativo é aceito | **CORRIGIDO** | `CHECK >= 0` em `produtos`, `complementos` e `lojas`, mais validação no `ModalLista`. |
| FUN-17 | MÉDIO | Busca do admin remove espaço ao digitar | **PENDENTE** | `trim` no `onChange`. |
| FUN-18 | MÉDIO | Histórico reordena por urgência | **PENDENTE** | — |
| FUN-19 | MÉDIO | Espera média inclui encomendas futuras | **PENDENTE** | — |
| FUN-20 | MÉDIO | Pedido manual mostra total sem entrega | **PENDENTE** | Junto com a melhoria do formulário manual. |
| FUN-21 | MÉDIO | Lista exige mais opções ativas do que possui | **CORRIGIDO** | `ModalLista` recusa. Virou bloqueante depois que a RPC passou a exigir `qtd_min`. |
| FUN-22 | MÉDIO | `delivery_ativo` rotulado como "Aberto agora" | **PENDENTE** | `HeroLoja.tsx`. |
| FUN-23 | MÉDIO | WhatsApp e tempos sem validação semântica | **PENDENTE** | `DadosLojaForm.tsx`. |
| FUN-24 | MÉDIO | localStorage bloqueado perde o estado | **CORRIGIDO** | `useLocalStorage` cai para espelho em memória quando a escrita é recusada. |
| FUN-25 | MÉDIO | Documentação diverge do sistema | **CORRIGIDO** | Docs atualizados nesta rodada. |

## UI e acessibilidade (UI-01 a UI-15)

| ID | Sev | Achado | Estado | Onde |
|---|---|---|---|---|
| UI-01 | ALTO | Logo real quebra o cardápio mobile | **CORRIGIDO** | Primeiro com `.logo-nav-img` dimensionada (a classe não existia no CSS). Depois a nav inteira foi removida a pedido do dono, o que elimina a causa: a logo agora só aparece no `HeroLoja`, como `background-image` de caixa fixa. |
| UI-02 | ALTO | Cards de produto fora da ordem de Tab | **PENDENTE** | `<article onClick>` no cardápio. |
| UI-03 | ALTO | Cards acionáveis do admin sem teclado | **PENDENTE** | Mesmo padrão nos grids e nos cards de pedido. |
| UI-04 | ALTO | Carrinho não é diálogo e não gerencia foco | **PENDENTE** | Continua `<section>`, sem foco, Escape ou isolamento. |
| UI-05 | ALTO | Modais com foco e nome acessível incompletos | **PARCIAL** | Modal de produto ganhou `aria-labelledby` e `fieldset`/`legend`. Contenção de Tab e restauração de foco continuam pendentes. |
| UI-06 | MÉDIO | Botão do carrinho vira círculo branco sem ícone | **CORRIGIDO** | `.icon-btn` zera `appearance` e o fundo nativo — virou `<button>` e herdava o fundo do sistema. |
| UI-07 | MÉDIO | Carrinho vazio cortado em 320×568 | **PENDENTE** | — |
| UI-08 | MÉDIO | Contraste 2,36:1 no login | **PENDENTE** | Precisa de um laranja textual próprio. |
| UI-09 | MÉDIO | Contraste 4,41:1 na regra da lista | **PENDENTE** | — |
| UI-10 | MÉDIO | Toggle de planos com caixa de foco 0×0 | **PENDENTE** | `PlanosSecao.tsx` + `landing.css`. |
| UI-11 | MÉDIO | Estados e mensagens não são anunciados | **PENDENTE** | Falta `aria-pressed`, região viva, `main` e hierarquia de títulos. |
| UI-12 | MÉDIO | Alvos menores que o mínimo WCAG 2.2 | **PARCIAL** | `.icon-btn` com alvo de 44px. Quantidade, fechar e "Mais informações" continuam pequenos. |
| UI-13 | BAIXO | Fonte de assinatura não é carregada | **PENDENTE** | `--fonte-script` é usada mas nunca definida. |
| UI-14 | MÉDIO cond. | Formulário de opções pode estourar no mobile | **PARCIAL** | `min-width: 0` e `overflow-wrap` na `.opcao-row` do cardápio. Falta conferir o form do admin logado. |
| UI-15 | POSITIVO | Landing e cardápio sem logo não têm overflow | **N/A** | Achado positivo; mantido pela verificação de 375px acima. |

## O que o relatório pediu e não foi feito

O plano de 7 fases é um programa, não uma varredura. Ficaram de fora, por
escopo:

- **Harness de testes e CI** (Fase 1): Vitest, Playwright, axe, pgTAP,
  Supabase local, banco efêmero com quatro identidades. O repositório
  continua com **zero teste automatizado** — as verificações desta rodada
  foram feitas à mão e estão registradas acima, não são regressão.
- **Projeção pública versionada** (`cardapio_publico_v1`): o cardápio ainda
  lê as tabelas-base, agora com colunas explícitas e grants restritos.
- **RPCs transacionais de catálogo** (`salvar_produto_com_grupos`,
  `salvar_grupo_com_opcoes`, reordenação atômica).
- **`transicionar_pedido` como RPC estreita** com `SELECT FOR UPDATE` e
  revogação do `UPDATE` amplo. O compare-and-set resolve a disputa entre
  abas sem migração, mas não estreita a superfície de escrita.
- **Budgets de performance medidos** e migração para `next/image`.

## Correções ao próprio relatório

Três pontos em que a auditoria erra ou não tinha contexto:

1. **SEC-01 — a manchete está imprecisa.** "Aceita quantidades negativas"
   não vale para a quantidade do *item*, que já era validada
   (`v_qtd < 1 or v_qtd > 99`). O vetor real é a quantidade do
   *complemento*, que entrava crua na multiplicação. A conclusão continua
   certa; o caminho descrito, não.
2. **FUN-15 e "produto inativo deve ficar invisível" contrariam decisões
   suas.** O card "Status da loja" foi adiado a seu pedido, e
   [DECISIONS.md](DECISIONS.md) registra que item esgotado *aparece* com
   fita, em vez de sumir. Mantidas as suas decisões; corrigida só a parte
   que era bug de verdade (produto de categoria inativa vazando).
3. **A auditoria não viu a `criar_pedido` duplicada.** Ela leu o SQL do
   repositório, onde só existe uma definição, e concluiu "confirmado no
   SQL". No banco havia duas — e a antiga, concedida a `anon`, era a mais
   perigosa das duas. Um probe de assinatura teria pego; revisão estática de
   arquivo, não. Vale como lição pro que ainda está pendente: o que está no
   arquivo não é necessariamente o que está no banco.
4. **A duplicação do ESLint não vem da nossa config.** O relatório manda
   "eliminar configuração ESLint duplicada" em `eslint.config.mjs`. Medido:
   `eslint-config-next/core-web-vitals` registra `@next/next` em dois blocos
   internos (índices 0 e 3), com a mesma instância do plugin, e o ESLint
   reporta cada erro duas vezes. É upstream. Mexer na nossa config não
   resolve, e contornar o pacote sairia mais caro que conviver com a
   mensagem dobrada — que agora, com o lint limpo, não aparece.
