'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { MENU, ICONES } from '@/lib/menu';
import { LogoFlouFood } from '@/components/LogoFlouFood';
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

const TITULOS_ROTAS: Record<string, string> = {
  inicio: 'Início',
  pedidos: 'Gestão de pedidos',
  historico: 'Gestão de pedidos · Histórico',
  kds: 'Cozinha',
  delivery: 'Delivery',
  cardapio: 'Cardápio',
  pdv: 'PDV',
  desempenho: 'Desempenho',
  clientes: 'Clientes',
  config: 'Configurações',
  links: 'Links do cardápio',
  suporte: 'Ajuda e suporte',
  mesas: 'Mesas e comandas',
  financeiro: 'Financeiro',
  caixa: 'Caixa',
  estoque: 'Estoque',
  fiscal: 'Nota fiscal',
};

const TITULOS_CONFIG: Record<string, string> = {
  perfil: 'Meu perfil',
  loja: 'Minha loja',
  funcionamento: 'Funcionamento',
  assinatura: 'Plano e assinatura',
};

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
  children,
}: {
  lojaNome: string;
  lojaSlug: string;
  souAdmin: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  // Toda rota do painel é prefixada pela loja atual — a loja é segmento da
  // URL, não mais um cookie.
  const base = `/painel/${lojaSlug}`;
  const segmentos = pathname.slice(base.length).split('/').filter(Boolean);
  const titulo = segmentos[0] === 'config' && segmentos[1]
    ? TITULOS_CONFIG[segmentos[1]] ?? 'Configurações'
    : segmentos[0] === 'pedidos' && segmentos[1] === 'historico'
    ? 'Gestão de pedidos · Histórico'
    : TITULOS_ROTAS[segmentos[0] ?? 'inicio'] ?? 'Painel';
  const subtitulo = segmentos[0] === 'pedidos' && !segmentos[1]
    ? 'Acompanhe e gerencie todos os pedidos em tempo real'
    : null;
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
        <header id="painelTopo">
          <div className="painel-topo-marca">
            <LogoFlouFood />
          </div>
          <div className="painel-topo-acoes">
            <StatusOperacional popoverId="status-operacional-topo" />
            <TemaAdmin />
          </div>
        </header>

        <aside id="sidebar" className={aberto ? 'aberto' : ''}>
          <div className="brand-logo">
            <LogoFlouFood />
          </div>

          <div className="loja-chip">
            <div className="loja-nome">{lojaNome}</div>
            <div className="loja-slug">/{lojaSlug}</div>
            {souAdmin && <span className="badge-admin">Super admin</span>}
          </div>

          <nav id="menu">
            {MENU.map((grupo) => (
              <div key={grupo.grupo} className="nav-grupo">
                <div className="nav-grupo-titulo">{grupo.grupo}</div>
                {grupo.itens.map((item) => {
                  const href = `${base}/${item.rota ?? item.id}`;
                  return (
                    <Link
                      key={item.id}
                      href={href}
                      className={'nav-item' + (pathname === href || pathname.startsWith(`${href}/`) ? ' ativo' : '')}
                      title={item.pronta ? undefined : `${item.nome} — em breve`}
                      onClick={() => setAberto(false)}
                    >
                      <Icone chave={item.icone} />
                      <span className="rotulo">{item.nome}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="sidebar-bottom">
            <Link href={`${base}/suporte`} className="sidebar-ajuda" onClick={() => setAberto(false)}>
              <Icone chave="suporte" />
              <span>Ajuda e suporte</span>
            </Link>
            <div className="sidebar-acoes">
              <Link href={`${base}/config/perfil`} className="sidebar-acao" title="Meu perfil" aria-label="Conta do usuário" onClick={() => setAberto(false)}>
                <Icone chave="empresa" />
              </Link>
              <button type="button" className="sidebar-acao" title="Sair" aria-label="Sair" onClick={sair}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10 17l5-5-5-5M15 12H3M15 3h5v18h-5" />
                </svg>
              </button>
            </div>
            {souAdmin && (
              <Link href="/superadmin" className="sidebar-voltar-admin" onClick={() => setAberto(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10 7l-5 5 5 5M5 12h14M19 5v14" />
                </svg>
                <span>Voltar ao painel superadmin</span>
              </Link>
            )}
          </div>
        </aside>

        <main id="main">
          {/* Marca e identidade da loja, só no mobile: no desktop as duas já
              vivem no topo da sidebar, sempre visíveis. */}
          <div id="topoMarca">
            <div className="topo-marca-logo">
              <LogoFlouFood />
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

          <div id="mainContent">
            <div id="mainTop">
              <div className="main-top-titulo">
                <h1>{titulo}</h1>
                {subtitulo && <p>{subtitulo}</p>}
              </div>
              <div className="main-top-acoes-mobile">
                <StatusOperacional popoverId="status-operacional-mobile" />
                <TemaAdmin />
              </div>
            </div>
            {children}
          </div>
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
