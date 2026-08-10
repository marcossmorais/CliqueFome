import { NextResponse, type NextRequest } from 'next/server';
import { criarClientServidor } from '@/lib/supabase/server';
import { logger } from '@/lib/observabilidade/logger';

export const runtime = 'nodejs';

/**
 * Entrada de suporte no painel de um cliente.
 *
 * Existe como rota, e não como link direto pra /painel/<slug>, porque a
 * entrada precisa ficar registrada ANTES do redirecionamento — é o único
 * jeito de o cliente poder cobrar depois "quem da plataforma abriu minha
 * loja e quando". Um evento por entrada, não por página aberta.
 *
 * A checagem de admin acontece duas vezes de propósito: aqui (pra não
 * gravar evento nem redirecionar quem não é da equipe) e dentro da RPC,
 * que é `security definer` e por isso ignora RLS.
 */
export async function GET(request: NextRequest, contexto: { params: Promise<{ id: string }> }) {
  const { id } = await contexto.params;
  const sb = await criarClientServidor();

  const [{ data: { user } }, { data: ehAdmin }] = await Promise.all([
    sb.auth.getUser(),
    sb.rpc('is_admin'),
  ]);

  if (!user) {
    return NextResponse.redirect(new URL('/entrar?proximo=/superadmin/clientes', request.url));
  }
  if (!ehAdmin) {
    // Mesma resposta de rota inexistente: não confirma que a área existe.
    return new NextResponse('Not found', { status: 404 });
  }

  const { data: loja } = await sb.from('lojas').select('slug, nome').eq('id', id).maybeSingle();
  if (!loja) {
    return new NextResponse('Not found', { status: 404 });
  }

  const { error } = await sb.rpc('admin_registrar_acesso_suporte', { p_loja_id: id });
  if (error) {
    // Não redireciona sem auditar: se o registro falhou, a entrada não
    // acontece. Auditoria que só funciona no caminho feliz não serve.
    logger.error({ err: error, lojaId: id, adminId: user.id }, 'falha ao registrar acesso de suporte');
    return new NextResponse('Não foi possível registrar o acesso de suporte.', { status: 500 });
  }

  logger.info({ lojaId: id, slug: loja.slug, adminId: user.id }, 'acesso de suporte ao painel da loja');
  return NextResponse.redirect(new URL(`/painel/${loja.slug}/inicio`, request.url));
}
