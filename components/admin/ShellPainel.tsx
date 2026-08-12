'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { MENU, ICONES } from '@/lib/menu';
import { LogoCliqueFome } from '@/components/LogoCliqueFome';
import { criarClientNavegador } from '@/lib/supabase/client';
import { StatusOperacional } from '@/components/admin/StatusOperacional';
import { TemaAdmin } from '@/components/admin/TemaAdmin';

/**
 * As quatro telas que ganham slot fixo na barra do mobile. Cozinha, PDV,
 * Ajuda e Perfil continuam no menu completo, atrás de "Mais": a Cozinha vive
 * num tablet na copa, e as outras são de configurar, não de operar.
 */
const ATALHOS = [
  { id: 'inicio', nome: 'Início', icone: 'inicio' },
  { id: 'pedidos', nome: 'Pedidos', icone: 'pedidos' },
  { id: 'cardapio', nome: 'Cardápio', icone: 'catalogo' },
  { id: 'delivery', nome: 'Delivery', icone: 'delivery' },
] as const;

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
            {souAdmin && (
              <Link href="/superadmin" className="btn-ghost btn-small" style={{ textAlign: 'center' }}>
                Painel da plataforma
              </Link>
            )}
            <button type="button" className="btn-ghost btn-small" onClick={sair}>
              Sair
            </button>
          </div>
        </aside>

        <main id="main">
          {/* Marca e identidade da loja, só no mobile: no desktop as duas já
              vivem no topo da sidebar, sempre visíveis. */}
          <div id="topoMarca">
            <div className="topo-marca-logo">
              <LogoCliqueFome />
            </div>
            <button
              type="button"
              className="topo-sino"
              disabled
              title="Avisos — em breve"
              aria-label="Avisos — em breve"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.7 21a2 2 0 0 1-3.4 0" />
              </svg>
              {/* Ponto laranja é o mesmo marcador de "em breve" do menu, e não
                  um contador de não lidas: ainda não existe o que notificar. */}
              <span className="marca-breve" aria-hidden="true" />
            </button>
          </div>

          <div id="lojaTopo">
            <div className="loja-topo-id">
              <strong>{lojaNome}</strong>
              <span>/{lojaSlug}</span>
            </div>
            {souAdmin && <span className="badge-admin">Super admin</span>}
          </div>

          <div id="mainTop">
            <h1>{titulo}</h1>
            <StatusOperacional />
            <TemaAdmin />
          </div>
          {children}
        </main>

        {/* Só aparece abaixo de 900px, onde a sidebar vira gaveta. Substitui o
            antigo botão ☰: as quatro telas do dia a dia ficam a um toque, e
            "Mais" abre a mesma gaveta, que segue sendo o menu completo. */}
        <nav id="navInferior" aria-label="Navegação principal">
          {ATALHOS.map((atalho) => {
            const href = `${base}/${atalho.id}`;
            const ativo = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={atalho.id}
                href={href}
                className={'nav-inferior-item' + (ativo ? ' ativo' : '')}
                aria-current={ativo ? 'page' : undefined}
                onClick={() => setAberto(false)}
              >
                <Icone chave={atalho.icone} />
                <span>{atalho.nome}</span>
              </Link>
            );
          })}
          <button
            type="button"
            className={'nav-inferior-item' + (aberto ? ' ativo' : '')}
            aria-expanded={aberto}
            onClick={() => setAberto((v) => !v)}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
            <span>Mais</span>
          </button>
        </nav>
      </div>
    </>
  );
}
