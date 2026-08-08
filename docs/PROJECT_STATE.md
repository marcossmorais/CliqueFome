# Estado do projeto

Atualizado em 2026-08-08.

## Onde estamos

Migração de HTML/CSS/JS puro para Next.js **praticamente concluída**. Todas as
telas foram portadas; falta validar em produção e apagar os `.html` antigos.

Branch: `catalogo-pedidos-pre-nextjs` (a `main` ficou no estado pré-migração).

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
| Cardápio público | `/[loja]` | Testado contra o Supabase real (`pizzaria-teste`) |

## Não commitado

A migração do cardápio público (`app/[loja]/`, `lib/cardapio/`,
`hooks/useLocalStorage.ts`) está no working tree, **sem commit**. Build e lint
passam; testado contra o banco real.

## Migrações SQL

| Arquivo | Rodado? |
|---|---|
| `schema.sql` | sim |
| `schema-migracao-superadmin.sql` | sim |
| `schema-migracao-catalogo.sql` | sim |
| `schema-pedidos.sql` | sim |
| `schema-migracao-pedidos.sql` | **NÃO** — sem ele, encomenda, origem do pedido e `pedido_detalhe()` não existem |

## Performance

Medido no log do dev server:

```
GET /admin/catalogo  1633ms (proxy: 296ms, application-code: 1072ms)
GET /admin/pedidos    263ms (proxy: 226ms, application-code:   22ms)  ← cache quente
```

São 3 saltos de rede em série ao Supabase por navegação (validar sessão →
resolver a loja → carregar a área). O `loja.id` é dependência das queries,
então não dá pra paralelizar. Mitigado com `loading.tsx` (esqueleto).

O usuário testou em `npm run dev`, que compila sob demanda — **a medição real
precisa ser em `npm run build && npm start`**. Isso ainda não foi feito.

## Limitação conhecida do formulário de pedido manual

Não permite escolher complementos — só produto e quantidade. Quem precisa de
item composto tem que cadastrar um produto já montado no catálogo. O usuário
já sinalizou que quer melhorar isso.
