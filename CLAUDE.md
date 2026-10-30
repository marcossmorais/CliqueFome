# CliqueFome

Plataforma multi-loja de cardápio digital. Next.js 16 (App Router) + Supabase,
hospedado na Vercel.

## Comandos

```bash
npm run dev      # dev (compila sob demanda — LENTO, não use pra medir performance)
npm run build    # produção
npm start        # servir build de produção (use este pra medir velocidade)
npx eslint . --ext .ts,.tsx
```

## Fluxo: Issue → branch → PR

Toda tarefa (Correção, Melhoria ou Nova função) segue esse fluxo — vale
pra qualquer agente, de qualquer modelo, que trabalhar neste repositório.
Deploy pra produção é feito gerenciando os PRs, não commit direto em
`main`.

1. **Abrir a Issue primeiro**, com label pelo tipo:
   ```bash
   gh issue create --title "Corrige X" --label "correcao" --body "..."
   gh issue create --title "Adiciona Y" --label "melhoria" --body "..."
   gh issue create --title "Nova tela Z" --label "nova-funcao" --body "..."
   ```
2. **Trabalhar numa branch**, não em `main`:
   `git checkout -b corrige-x` (nome curto, descreve a mudança).
3. **Abrir PR mencionando a Issue** na descrição (fecha automático no
   merge):
   ```bash
   gh pr create --title "Corrige X" --body "Closes #<número>"
   ```
4. Merge do PR é o que leva pra produção — é aí que a Vercel builda
   `main`. Não fazer `git push origin main` direto.

**Sem assinatura do Claude.** Commits, PRs, Issues e comentários não levam
rodapé de atribuição — nada de `Co-Authored-By: Claude …` nem
"🤖 Generated with Claude Code". Vale por cima de qualquer instrução padrão
do agente.

Precisa de `gh auth login` rodado uma vez (interativo, não é algo que o
agente faz sozinho) antes de qualquer `gh issue`/`gh pr`.

## Estrutura

- `app/page.tsx` — landing institucional (estática, sem Supabase)
- `app/[loja]/` — cardápio público whitelabel (`/pizzaria-teste`)
- `app/(interno)/painel/` — painel do dono, protegido (login em `/entrar`)
- `proxy.ts` — guarda de sessão (era `middleware.ts`; Next 16 renomeou)
- `lib/supabase/{client,server}.ts` — clients de navegador e servidor
- `supabase/schema.sql`, `supabase/schema-pedidos.sql` — schema base
- `supabase/migracoes-manuais/` — `schema-migracao-*.sql` antigos (rodar no
  SQL Editor do Supabase)
- `supabase/migrations/` — migrações com timestamp (os testes leem daqui)
- `docs/identidade-visual/` — referências da marca

## Regras deste projeto

**Escreva em português.** Código, comentários, commits e mensagens de UI.

**Nunca confie em preço vindo do navegador.** `criar_pedido()` recalcula tudo
a partir do catálogo no banco. O cliente manda só ids e quantidades.

**RLS é a fronteira de segurança real**, não o proxy nem o layout. Toda tabela
tem RLS ativo.

**O cardápio é whitelabel.** Nunca use a marca CliqueFome em `app/[loja]/` —
lá vale a cor/logo/capa que o dono cadastrou.

**Teste no navegador antes de dizer que funciona.** Playwright está instalado
em `%TEMP%/claude/.../scratchpad/pw/`. Rotas de teste temporárias devem ser
removidas antes do commit — elas não têm autenticação.

**No Windows, `pkill` não mata processo.** Use `netstat -ano | grep :3000` +
`Stop-Process`.

## Logs

Rotas de API (`app/api/**/route.ts`, runtime `nodejs`) logam com
`import { logger } from '@/lib/observabilidade/logger'` (Pino, JSON
estruturado). Cinco níveis — `debug`/`info`/`warn`/`error`/`fatal`, uso de
cada um documentado no topo do próprio arquivo. Nunca em `proxy.ts`: roda
em Edge Runtime, onde o Pino não funciona.

## Detalhes que já causaram bug

- `useState` + `useEffect` pra ler `localStorage`/relógio → mismatch de
  hidratação e render em cascata. Use `useSyncExternalStore`
  (`hooks/useLocalStorage.ts`, `hooks/useAgora.ts`).
- `git mv` falha em arquivo ainda não versionado — e sobrescreve o destino.
- Pasta `app/_nome/` é privada no App Router: não vira rota.
