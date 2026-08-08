# Estado do projeto

Atualizado em 2026-08-08, depois da auditoria `CF-AUDIT-20260808-a4844b1` e
da primeira rodada de remediação.

## Checkout público agora persiste pedido (2026-08-08, branch `checkout-persistente`)

Implementado nesta rodada, **ainda não aplicado em produção** — depende de
`schema-migracao-checkout-publico.sql` rodar no Supabase. Detalhe completo em
[DECISIONS.md](DECISIONS.md#substituído--checkout-público-passa-a-persistir-todo-pedido-2026-08-08).
Resumo: `POST /api/lojas/[slug]/pedidos` cria o pedido de verdade no banco
(idempotente, com rate limit e RPC estreita), a Gestão de pedidos ganhou
Realtime, e existe uma tela pública de acompanhamento em `/pedido/[token]`.
Ver `docs/PENDING_TASKS.md` pra checklist de deploy.

## Onde estamos

Migração de HTML/CSS/JS puro para Next.js concluída em telas. O que trava a
liberação agora não é migração — é a auditoria: **20 achados corrigidos, 7
parciais, 28 pendentes** de um total de 56. O ledger item a item está em
[REMEDIATION_STATUS.md](REMEDIATION_STATUS.md).

Branch: `catalogo-pedidos-pre-nextjs` (a `main` ficou no estado
pré-migração — e é justamente por isso que o achado SEC-02 existe).

## O que está pronto e validado

| Tela | Rota | Validado por |
|---|---|---|
| Landing | `/` | Comparação com o original: altura idêntica (3573px), preços e toggle conferidos |
| Login | `/admin/login` | Usuário logou e a sessão sobreviveu ao F5 (cookie, não localStorage) |
| Shell do painel | — | Usuário confirmou: 16 itens em 5 grupos, drawer no mobile |
| Links do cardápio | `/admin/links` | Usuário confirmou |
| Minha empresa | `/admin/empresa` | Usuário confirmou: cor ao vivo, upload de logo/capa, salvar |
| Catálogo | `/admin/catalogo` | Build e lint limpos — **falta teste manual do usuário** |
| Gestão de pedidos | `/admin/pedidos` | Testado com dados mockados — **falta teste com pedido real** |
| Cardápio público | `/[loja]` | Testado contra o Supabase real, incluindo carrinho corrompido e logo patológica |
| Conta sem loja | `/admin/criar-loja` | Rota criada nesta rodada; antes era 404 |
| Ajuda e suporte | `/admin/suporte` | 11 perguntas, 6 tutoriais, busca sem acento. Chatbot e atendimento humano marcados "Em breve" |
| Termos e privacidade | `/termos` | No ar com `noindex` e aviso de rascunho até os dados jurídicos serem preenchidos |

## Qualidade

| Gate | Estado |
|---|---|
| `npm run build` | passa |
| `npx tsc --noEmit` | passa |
| `npx eslint .` | passa — **eram 5 erros**, corrigidos nesta rodada |
| `npm run test:ajuda` | 5/5 — os **únicos** testes do projeto, cobrindo só a busca da Central de Ajuda e o bloqueio dos dados jurídicos |
| Testes do resto do sistema | **zero.** Preço, carrinho, pedidos e RLS não têm nenhum. Toda verificação é manual |

O `eslint-config-next` reporta cada erro **duas vezes**: ele registra o
plugin `@next/next` em dois blocos internos do `core-web-vitals`. É upstream,
não da nossa config — medido, não suposto.

## Migrações SQL

| Arquivo | Rodado? |
|---|---|
| `schema.sql` | sim |
| `schema-migracao-superadmin.sql` | sim |
| `schema-migracao-catalogo.sql` | sim |
| `schema-pedidos.sql` | sim |
| `schema-migracao-pedidos.sql` | sim (2026-08-08) |
| `schema-migracao-seguranca.sql` | **precisa rodar de novo** — ver abaixo |

### O `criar_pedido` duplicado

A primeira versão da função tinha **8 parâmetros**; a atual tem 11.
`create or replace` não substitui assinatura diferente — cria outra função.
O banco ficou com as duas, e a de 8:

- não tem nenhuma das validações novas de complemento;
- continuava concedida a `anon`;
- deixava o PostgREST sem saber qual chamar (`PGRST203`).

`schema-migracao-seguranca.sql` faz o `drop` dela. Confirmado por probe
anônimo contra o banco real: antes do drop, `POST /rpc/criar_pedido`
respondia `HTTP 300 PGRST203`.

### Por que a primeira tentativa de fechar as colunas não pegou

`revoke select (coluna)` **não tem efeito** enquanto existir `SELECT` na
tabela inteira — que é o que o Supabase concede por padrão. O SQL roda sem
erro e não muda nada. A versão corrigida revoga a tabela e concede coluna a
coluna. Probe anônimo confirmou que `preco_custo`, `codigo_pdv`,
`codigo_interno` e `dono_id` ainda eram legíveis depois da primeira
tentativa.

## Performance

Nunca foi medida em produção. Os números que existiam eram do `npm run dev`,
que compila sob demanda — não servem. A medição precisa ser em
`npm run build && npm start`, e ainda não foi feita.

Os 3 saltos de rede em série ao Supabase por navegação continuam (validar
sessão → resolver a loja → carregar a área), mitigados por `loading.tsx`.

## Limitações conhecidas

**Pedido manual não escolhe complemento.** Depois do endurecimento da RPC
isso deixou de ser cosmético: produto com lista obrigatória agora **falha**
no pedido manual, em vez de ser criado calado no preço base.

**Cardápio sem barra de navegação.** A nav do topo foi removida a pedido do
dono do projeto. O carrinho é acessível pelo botão flutuante, que só aparece
quando há item — com o carrinho vazio não há como abri-lo.

**Fuso fixo em `America/Sao_Paulo`.** Disponibilidade por dia da semana
deixou de usar o fuso do servidor, mas ainda não há fuso por loja.
