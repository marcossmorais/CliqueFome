import { criarClientServidor } from '@/lib/supabase/server';

/**
 * A loja pertence a quem está pedindo?
 *
 * Barreira de aplicação por cima da RLS, não no lugar dela: as rotas
 * administrativas do Delivery escrevem com client privilegiado (service_role),
 * que ignora RLS por definição. Sem esta checagem, o `lojaId` do corpo da
 * request viraria autoridade — e o dono da Loja A editaria a taxa da Loja B
 * só trocando um UUID.
 *
 * Devolve o id do usuário quando autorizado, `null` quando não.
 */
export async function autorizarLoja(lojaId: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(lojaId)) return null;

  const sb = await criarClientServidor();
  const [{ data: usuario }, { data: souAdmin }] = await Promise.all([
    sb.auth.getUser(),
    sb.rpc('is_admin'),
  ]);
  if (!usuario.user) return null;

  const consulta = sb.from('lojas').select('id').eq('id', lojaId);
  const { data } = await (souAdmin === true
    ? consulta.maybeSingle()
    : consulta.eq('dono_id', usuario.user.id).maybeSingle());

  return data ? usuario.user.id : null;
}
