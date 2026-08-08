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
 * Resolve a loja do painel no servidor.
 *
 * No admin.html isso era estado em memória do JS. Aqui precisa vir a cada
 * request: dono normal cai na própria loja; super admin escolhe uma e a
 * escolha fica num cookie.
 *
 * A RLS é quem garante que ninguém abra loja alheia — mesmo forjando o
 * cookie, o select não retorna nada.
 */
export async function obterLojaAtual(): Promise<{ loja: Loja | null; souAdmin: boolean }> {
  const sb = await criarClientServidor();

  const { data: adminData } = await sb.rpc('is_admin');
  const souAdmin = !!adminData;

  const cookieStore = await cookies();
  const lojaEscolhida = cookieStore.get(COOKIE_LOJA)?.value;

  if (lojaEscolhida) {
    const { data } = await sb.from('lojas').select('*').eq('id', lojaEscolhida).maybeSingle();
    if (data) return { loja: data as Loja, souAdmin };
  }

  const { data: { user } } = await sb.auth.getUser();
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
