import { cache } from 'react';
import { cookies } from 'next/headers';
import { criarClientServidor } from './supabase/server';

export type Loja = {
  id: string;
  slug: string;
  nome: string;
  nicho: string | null;
  logo_url: string | null;
  banner_url: string | null;
  cor_marca: string;
  cidade: string | null;
  sobre: string | null;
  whatsapp_numero: string | null;
  tempo_entrega_min: number | null;
  tempo_entrega_max: number | null;
  taxa_entrega: number;
  pedido_minimo: number;
  delivery_ativo: boolean;
  recebendo_encomendas: boolean;
};

export const COOKIE_LOJA = 'cf_loja';

/**
 * Usuário da requisição atual.
 *
 * Envolto em cache() do React: layout e page são renderizados no mesmo
 * passe, e sem isso cada um faria a própria chamada de rede ao Supabase.
 * O cache é POR REQUISIÇÃO (o React descarta entre requests), então não há
 * risco de uma sessão vazar pra outro usuário — continua sendo getUser(),
 * que valida o token no servidor do Supabase, e não getSession().
 */
export const obterUsuario = cache(async () => {
  const sb = await criarClientServidor();
  const {
    data: { user },
  } = await sb.auth.getUser();
  return user;
});

/**
 * Resolve a loja do painel no servidor.
 *
 * No admin.html isso era estado em memória do JS. Aqui precisa vir a cada
 * request: dono normal cai na própria loja; super admin escolhe uma e a
 * escolha fica num cookie.
 *
 * Também memoizado por requisição — o layout do painel e a página chamam
 * esta função, e antes disso cada chamada repetia is_admin() + a query de
 * lojas, dobrando a latência de toda navegação.
 *
 * O cookie `cf_loja` é PREFERÊNCIA, não autorização — ver o filtro por
 * dono_id abaixo.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const obterLojaAtual = cache(async (): Promise<{ loja: Loja | null; souAdmin: boolean }> => {
  const sb = await criarClientServidor();

  const [{ data: adminData }, user, cookieStore] = await Promise.all([
    sb.rpc('is_admin'),
    obterUsuario(),
    cookies(),
  ]);

  const souAdmin = !!adminData;
  if (!user) return { loja: null, souAdmin };

  const lojaEscolhida = cookieStore.get(COOKIE_LOJA)?.value;

  if (lojaEscolhida && UUID.test(lojaEscolhida)) {
    // Não dá pra confiar na RLS aqui: a policy de select em `lojas` é
    // pública (`using (true)`), pra o cardápio anônimo funcionar. Um id
    // forjado neste cookie devolveria a loja de outra pessoa. Quem impede
    // isso é o filtro por dono_id — e o super admin é a exceção, porque
    // escolher qualquer loja é exatamente a função dele.
    const consulta = sb.from('lojas').select('*').eq('id', lojaEscolhida);
    const { data } = await (souAdmin ? consulta : consulta.eq('dono_id', user.id)).maybeSingle();
    if (data) return { loja: data as Loja, souAdmin };
  }

  const { data } = await sb
    .from('lojas')
    .select('*')
    .eq('dono_id', user.id)
    .order('created_at')
    .limit(1)
    .maybeSingle();

  return { loja: (data as Loja) ?? null, souAdmin };
});
