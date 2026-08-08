import { criarClientServidor } from '@/lib/supabase/server';

/**
 * Placeholder do catálogo. A migração da tela inteira é o próximo passo —
 * por ora serve pra validar o fluxo de login de ponta a ponta.
 */
export default async function CatalogoPage() {
  const sb = await criarClientServidor();
  const { data: { user } } = await sb.auth.getUser();

  return (
    <div id="main" style={{ padding: 40 }}>
      <h1>Catálogo</h1>
      <p className="sub">Sessão ativa: {user?.email}</p>
    </div>
  );
}
