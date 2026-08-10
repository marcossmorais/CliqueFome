'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogoCliqueFome } from '@/components/LogoCliqueFome';
import { criarClientNavegador } from '@/lib/supabase/client';
import { TemaAdmin } from '@/components/admin/TemaAdmin';

/**
 * Casca da área da plataforma. Não reaproveita a ShellPainel de propósito:
 * aquela monta o menu do lojista a partir de `/painel/<slug>` e mostra a
 * loja atual no topo — aqui não existe "loja atual", e misturar os dois
 * menus foi exatamente o que o pedido pediu pra não fazer. O CSS é o
 * mesmo (admin.css), só o conteúdo muda.
 */
const ITENS = [
  { href: '/superadmin', rotulo: 'Dashboard', icone: 'M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 9h8V3h-8z' },
  { href: '/superadmin/clientes', rotulo: 'Clientes', icone: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87' },
  { href: '/superadmin/assinaturas', rotulo: 'Assinaturas', icone: 'M3 7h18v12H3zM3 11h18M7 15h3M7 7V5h10v2' },
  { href: '/superadmin/pagamentos', rotulo: 'Pagamentos', icone: 'M2.5 5h19v14h-19zM2.5 10h19M6 15h4' },
];

export function ShellSuperAdmin({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);

  async function sair() {
    const sb = criarClientNavegador();
    await sb.auth.signOut();
    router.replace('/entrar');
    router.refresh();
  }

  return (
    <>
      <div id="sidebarBackdrop" className={aberto ? 'ativo' : ''} onClick={() => setAberto(false)} />

      <div id="appView" className="ativo">
        <aside id="sidebar" className={aberto ? 'aberto' : ''}>
          <div className="brand-logo">
            <LogoCliqueFome />
          </div>

          <div className="loja-chip">
            <div className="loja-nome">Plataforma</div>
            <div className="loja-slug">{email}</div>
            <span className="badge-admin">Super admin</span>
          </div>

          <nav id="menu">
            <div>
              <div className="nav-grupo-titulo">Administração</div>
              {ITENS.map((item) => {
                // O Dashboard é o prefixo de todos os outros, então só ele
                // usa comparação exata — senão ficaria sempre aceso.
                const ativo =
                  item.href === '/superadmin'
                    ? pathname === '/superadmin'
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={'nav-item' + (ativo ? ' ativo' : '')}
                    onClick={() => setAberto(false)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={item.icone} />
                    </svg>
                    <span className="rotulo">{item.rotulo}</span>
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className="sidebar-bottom">
            <Link href="/painel" className="btn-ghost btn-small" style={{ textAlign: 'center' }}>
              Ir para meu painel
            </Link>
            <button type="button" className="btn-ghost btn-small" onClick={sair}>
              Sair
            </button>
          </div>
        </aside>

        <main id="main">
          <div id="mainTop">
            <button id="menuToggle" aria-label="Abrir menu" onClick={() => setAberto(true)}>
              ☰
            </button>
            <h1>Plataforma</h1>
            <TemaAdmin />
          </div>
          {children}
        </main>
      </div>
    </>
  );
}
