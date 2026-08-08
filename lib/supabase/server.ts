import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Client de servidor (Server Components e Route Handlers). Lê a sessão
 * dos cookies da requisição.
 *
 * O try/catch no setAll existe porque Server Component não pode escrever
 * cookie: quem renova a sessão é o middleware. Sem o catch, todo render
 * de página logada quebraria.
 */
export async function criarClientServidor() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component: o middleware já cuida da renovação.
          }
        },
      },
    }
  );
}
