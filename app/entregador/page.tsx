import { redirect } from 'next/navigation';
import { criarClientServidor } from '@/lib/supabase/server';
import type { EntregaDelivery, EntregadorDelivery } from '@/lib/delivery/tipos-operacao';
import { PainelEntregador } from './PainelEntregador';

export const dynamic = 'force-dynamic';

export default async function EntregadorPage() {
  const sb = await criarClientServidor();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect('/entregador/login');

  const { data: entregador, error: erroEntregador } = await sb
    .from('delivery_drivers')
    .select('id, store_id, name, phone, active, available, created_at, updated_at')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (erroEntregador || !entregador?.active) {
    return (
      <main className="driverApp">
        <section className="driverVazio">
          <h1>Acesso indisponível</h1>
          <p>Peça ao responsável pela loja para conferir seu cadastro.</p>
        </section>
      </main>
    );
  }

  const { data: entregaBruta, error: erroEntrega } = await sb
    .from('deliveries')
    .select(`
      id, store_id, order_id, driver_id, status,
      assigned_at, started_at, delivered_at, created_at, updated_at,
      pedido:pedidos!deliveries_store_order_fkey(
        id, numero, cliente_nome, cliente_telefone, forma_pagamento,
        pagamento_status, total, delivery_postal_code, delivery_street,
        delivery_number, delivery_neighborhood, delivery_city, delivery_state,
        delivery_complement, delivery_latitude, delivery_longitude
      )
    `)
    .eq('driver_id', entregador.id)
    .in('status', ['ASSIGNED', 'OUT_FOR_DELIVERY'])
    .order('assigned_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const entrega = entregaBruta
    ? ({ ...entregaBruta, entregador: null } as unknown as EntregaDelivery)
    : null;

  return (
    <PainelEntregador
      entregador={entregador as EntregadorDelivery}
      entregaInicial={entrega}
      indisponivel={!!erroEntrega}
    />
  );
}
