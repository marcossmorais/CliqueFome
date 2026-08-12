import { redirect } from 'next/navigation';
import { criarClientServidor } from '@/lib/supabase/server';
import { LoginEntregador } from './LoginEntregador';

export default async function LoginEntregadorPage() {
  const sb = await criarClientServidor();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (user) {
    const { data: entregador } = await sb
      .from('delivery_drivers')
      .select('id, active')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (entregador?.active) redirect('/entregador');
  }

  return <LoginEntregador />;
}
