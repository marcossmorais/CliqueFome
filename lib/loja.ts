import { cache } from 'react';
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
  tempo_preparo_min: number | null;
  tempo_preparo_max: number | null;
  pedido_minimo: number;
  recebendo_encomendas: boolean;
  retirada_ativa: boolean;
};

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
 * Resolve a loja do painel a partir do slug da URL (/painel/<slug>/...).
 *
 * Antes disso a loja vinha de um cookie `cf_loja` que nenhum código deste
 * repositório chegava a escrever — o que deixava o "Trocar de loja"
 * quebrado e tornava impossível um dono com duas lojas abrir a segunda.
 * Com o slug na URL, a loja atual é explícita e compartilhável.
 *
 * Devolve `loja: null` tanto pra slug inexistente quanto pra loja de
 * outra pessoa, de propósito: quem chama responde 404 nos dois casos e
 * não confirma se aquela loja existe.
 *
 * Não dá pra confiar na RLS aqui — a policy de select em `lojas` é
 * pública (`using (true)`), porque o cardápio anônimo precisa dela. Quem
 * impede o acesso cruzado é o filtro por `dono_id` abaixo; o super admin
 * é a exceção, porque entrar em qualquer loja pra dar suporte é
 * exatamente a função dele.
 *
 * Memoizado por requisição: o layout do painel e a página chamam esta
 * função no mesmo passe de render, e sem o cache cada navegação pagaria
 * `is_admin()` + a query de lojas duas vezes.
 */
export const obterLojaPorSlug = cache(
  async (slug: string): Promise<{ loja: Loja | null; souAdmin: boolean }> => {
    const sb = await criarClientServidor();

    const [{ data: adminData }, user] = await Promise.all([sb.rpc('is_admin'), obterUsuario()]);

    const souAdmin = !!adminData;
    if (!user || !slug) return { loja: null, souAdmin };

    const consulta = sb.from('lojas').select('*').eq('slug', slug);
    const { data } = await (souAdmin ? consulta : consulta.eq('dono_id', user.id)).maybeSingle();

    return { loja: (data as Loja) ?? null, souAdmin };
  }
);

/**
 * Primeira loja do usuário logado — usada só por quem ainda não tem slug
 * na URL: a rota `/painel`, que resolve pra onde mandar a pessoa, e a
 * `/criar-loja`, que precisa saber se já existe alguma.
 */
export const obterPrimeiraLoja = cache(
  async (): Promise<{ loja: Loja | null; souAdmin: boolean }> => {
    const sb = await criarClientServidor();

    const [{ data: adminData }, user] = await Promise.all([sb.rpc('is_admin'), obterUsuario()]);

    const souAdmin = !!adminData;
    if (!user) return { loja: null, souAdmin };

    const { data } = await sb
      .from('lojas')
      .select('*')
      .eq('dono_id', user.id)
      .order('created_at')
      .limit(1)
      .maybeSingle();

    return { loja: (data as Loja) ?? null, souAdmin };
  }
);
