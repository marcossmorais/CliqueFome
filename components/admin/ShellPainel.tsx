'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { MENU, ICONES } from '@/lib/menu';
import { LogoCliqueFome } from '@/components/LogoCliqueFome';
import { criarClientNavegador } from '@/lib/supabase/client';
import { StatusOperacional } from '@/components/admin/StatusOperacional';
import { TemaAdmin } from '@/components/admin/TemaAdmin';

function Icone({ chave }: { chave: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONES[chave]} />
    </svg>
  );
}

/**
 * Casca do painel: menu lateral + área de conteúdo, na mesma estrutura do
 * admin.html (#sidebar, #main, #mainTop). É client porque o drawer do
 * mobile e o item ativo do menu dependem de estado e da rota atual.
 */
export function ShellPainel({
  lojaNome,
  lojaSlug,
  souAdmin,
  titulo,
  children,
}: {
  lojaNome: string;
  lojaSlug: string;
  souAdmin: boolean;
  titulo: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  // Toda rota do painel é prefixada pela loja atual — a loja é segmento da
  // URL, não mais um cookie.
  const base = `/painel/${lojaSlug}`;
  const perfilAtivo = [`${base}/config`, `${base}/links`, `${base}/avaliacoes`].some(
    (rota) => pathname === rota || pathname.startsWith(`${rota}/`)
  );

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
            <div className="loja-nome">{lojaNome}</div>
            <div className="loja-slug">/{lojaSlug}</div>
            {souAdmin && <span className="badge-admin">Super admin</span>}
          </div>

          <nav id="menu">
            {MENU.map((grupo) => (
              <div key={grupo.grupo}>
                <div className="nav-grupo-titulo">{grupo.grupo}</div>
                {grupo.itens.map((item) => {
                  const href = `${base}/${item.id}`;
                  return (
                    <Link
                      key={item.id}
                      href={href}
                      className={'nav-item' + (pathname === href || pathname.startsWith(`${href}/`) ? ' ativo' : '')}
                      title={item.pronta ? undefined : 'Em breve'}
                      onClick={() => setAberto(false)}
                    >
                      <Icone chave={item.icone} />
                      <span className="rotulo">{item.nome}</span>
                      {!item.pronta && <span className="marca-breve" />}
                    </Link>
                  );
                })}
              </div>
            ))}
            <div className="menu-legenda">
              <span className="ponto" /> em breve
            </div>
          </nav>

          <div className="sidebar-bottom">
            <details className="perfil-menu" open={perfilAtivo || undefined}>
              <summary className={'nav-item' + (perfilAtivo ? ' ativo' : '')}>
                <Icone chave="empresa" />
                <span className="rotulo">Perfil</span>
                <span className="perfil-seta" aria-hidden="true">⌃</span>
              </summary>
              <div className="perfil-opcoes">
                <Link href={`${base}/config`} onClick={() => setAberto(false)}><Icone chave="config" /> Configurações</Link>
                <Link href={`${base}/links`} onClick={() => setAberto(false)}><Icone chave="links" /> Links</Link>
                <Link href={`${base}/avaliacoes`} onClick={() => setAberto(false)}><Icone chave="avaliacoes" /> Avaliações</Link>
              </div>
            </details>
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
            <h1>{titulo}</h1>
            <StatusOperacional />
            <TemaAdmin />
          </div>
          {children}
        </main>
      </div>
    </>
  );
}
