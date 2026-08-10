import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Roda antes de toda request (era middleware.ts no Next 15).
 * Duas funções:
 *  1. Renova o cookie de sessão a cada request (Server Components não podem
 *     escrever cookie, então a renovação precisa acontecer aqui).
 *  2. Barra a área interna pra quem não está logado — no SERVIDOR. Esconder
 *     botão no front não protege nada: sem isso, digitar a URL direto
 *     entrava. Quem impede um lojista de abrir o painel de OUTRA loja não é
 *     este arquivo, e sim o layout de /painel/[loja] (que resolve o slug
 *     filtrando por dono_id) mais a RLS.
 */
export async function proxy(request: NextRequest) {
  // Link antigo do cardápio: /cardapio.html?loja=oh-taal -> /oh-taal
  // Fica aqui e não no next.config porque lá a query string é repassada e
  // a URL nova sairia como /oh-taal?loja=oh-taal.
  if (request.nextUrl.pathname === '/cardapio.html') {
    const slug = request.nextUrl.searchParams.get('loja');
    const url = request.nextUrl.clone();
    url.pathname = slug ? `/${slug}` : '/';
    url.search = '';
    return NextResponse.redirect(url, 308);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() e não getSession(): getUser valida o token no servidor do
  // Supabase. getSession só lê o cookie, que o cliente pode ter forjado.
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const areaProtegida =
    pathname.startsWith('/painel') ||
    pathname.startsWith('/superadmin') ||
    pathname === '/criar-loja';

  if (areaProtegida && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/entrar';
    // Guarda pra onde a pessoa queria ir, pra devolver depois do login.
    url.searchParams.set('proximo', pathname);
    return NextResponse.redirect(url);
  }

  // Já logado não fica na tela de login. Vai pro /painel, que descobre a
  // loja e redireciona — aqui no Edge não dá pra consultar o banco pra
  // montar /painel/<slug> direto.
  if (pathname === '/entrar' && user) {
    const url = request.nextUrl.clone();
    url.pathname = '/painel';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Só as rotas do painel e o redirect de link antigo.
  //
  // O matcher anterior pegava TODAS as rotas, o que fazia a landing e o
  // cardápio público — que não têm sessão nem nada a proteger — pagarem uma
  // chamada de rede ao Supabase (getUser) a cada visita. Restringir aqui
  // não abre brecha: quem protege a área interna continua sendo este proxy,
  // e o layout do painel revalida a sessão no servidor por cima.
  matcher: ['/painel/:path*', '/superadmin/:path*', '/entrar', '/criar-loja', '/cardapio.html'],
};
