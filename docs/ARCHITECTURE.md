# Arquitetura

## Três públicos, três áreas

| Área | Rota | Quem acessa | Marca |
|---|---|---|---|
| Landing | `/` | visitante | CliqueFome |
| Cardápio | `/[loja]` | cliente final, sem login | **da loja** (whitelabel) |
| Painel | `/admin/*` | dono da loja, logado | CliqueFome |

## Banco (Supabase)

```
lojas ──┬── categorias ── produtos ──┬── produto_grupos ── grupos_complemento ── complementos
        │                            │
        └── pedidos ── pedido_itens ── pedido_item_opcoes
```

Uma instância serve todas as lojas. `admins` é opcional: quem está nela é
super admin e enxerga qualquer loja.

**Snapshot nos pedidos:** `pedido_itens` guarda nome e preço do momento da
compra, não só a referência ao produto. Renomear ou reprecificar um item não
pode reescrever o histórico nem o financeiro.

## Camadas de segurança

Em ordem de importância:

1. **RLS** — a fronteira real. Toda tabela tem RLS ativo. Mesmo com cookie
   forjado, a query não retorna dado de outra loja.
2. **Funções `security definer`** — `criar_pedido()` é a única porta de
   entrada de pedido. O navegador manda ids e quantidades; o preço é
   recalculado no banco a partir do catálogo. Sem isso bastava o devtools pra
   mandar um total de R$ 0,01.
3. **`proxy.ts`** — redireciona quem não está logado pra fora de `/admin`.
   Usa `getUser()` (valida o token no servidor do Supabase), não
   `getSession()` (que só lê o cookie).
4. **Layout do painel** — revalida a sessão no servidor antes de renderizar.
   Redundante com o proxy de propósito.

O cliente anônimo só enxerga a *publishable key*, que é feita pra ser pública.

## Sessão

`@supabase/ssr` com cookies. O `proxy.ts` renova o cookie a cada request e
guarda `/admin/*`.

**Nota:** o cookie não é `httpOnly` — o client de navegador precisa lê-lo.
HttpOnly puro exigiria todo acesso server-side, o que tornaria o painel muito
menos reativo. A decisão está registrada em `DECISIONS.md`.

## Server vs. Client Components

Padrão: **página é Server Component** (busca dados), **interatividade é ilha
client**.

```
app/admin/(painel)/catalogo/page.tsx      Server — carrega loja + catálogo
  └── CatalogoClient.tsx                  Client — estado, modais, arrastar
```

`obterLojaAtual()` e `obterUsuario()` (`lib/loja.ts`) são memoizados com
`cache()` do React: layout e página rodam no mesmo passe de render e sem isso
cada um repetia as chamadas de rede. É memoização **por requisição** — o React
descarta entre requests, então nenhuma sessão vaza entre usuários.

## Hooks próprios

| Hook | Por quê |
|---|---|
| `useArrastar` | Pointer Events (o drag-and-drop nativo não funciona em touch, e o painel roda em tablet) |
| `useAgora` | Relógio com snapshot separado pro servidor — evita mismatch de hidratação |
| `useLocalStorage` | Mesmo motivo, pro carrinho |
| `useEscFechar` | Fechar modal com Escape |

Os três primeiros usam `useSyncExternalStore`. Ler relógio ou `localStorage`
no render quebra a hidratação; resolver com `useEffect` + `setState` dispara
render em cascata (o lint do React acusa).

## CSS

Sem framework. O CSS foi extraído dos `.html` originais quase sem alteração —
só as fontes viraram variável (`next/font`, self-host) e a cor da loja virou
`--marca`.

- `app/landing.css`
- `app/admin/admin.css`
- `app/[loja]/cardapio.css`

Manter os nomes de classe do original: divergir quebra o layout, porque o CSS
não foi reescrito.
