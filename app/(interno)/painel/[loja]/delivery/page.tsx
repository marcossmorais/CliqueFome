import { obterLojaPorSlug } from '@/lib/loja';
import { criarClientServidor } from '@/lib/supabase/server';
import { ShellPainel } from '@/components/admin/ShellPainel';
import type {
  ConfiguracaoDelivery,
  EntregaDeliveryAdmin,
  EntregadorDelivery,
} from '@/lib/delivery/tipos-operacao';
import { DeliveryClient } from './DeliveryClient';
import { intervaloHojeEmSaoPaulo } from '@/lib/delivery/operacao-servidor';

export const dynamic = 'force-dynamic';

const CAMPOS_ENTREGA = `
  id, store_id, order_id, driver_id, status,
  assigned_at, started_at, delivered_at, created_at, updated_at,
  pedido:pedidos!deliveries_store_order_fkey(
    id, numero, cliente_nome, forma_pagamento,
    pagamento_status, total, delivery_street,
    delivery_number, delivery_neighborhood, delivery_city, delivery_state
  ),
  entregador:delivery_drivers!deliveries_store_driver_fkey(id, name)
`;

export default async function DeliveryPage({
  params,
}: {
  params: Promise<{ loja: string }>;
}) {
  const { loja: slug } = await params;
  const { loja, souAdmin } = await obterLojaPorSlug(slug);
  if (!loja) return null;

  const sb = await criarClientServidor();
  const hoje = intervaloHojeEmSaoPaulo();
  const [configuracao, entregadores, ativas, concluidas] = await Promise.all([
    sb
      .from('store_delivery_settings')
      .select(`
        store_id, enabled, fee_mode, fixed_fee_cents, price_per_km_cents,
        free_delivery_threshold_cents, origin_postal_code, origin_street,
        origin_number, origin_neighborhood, origin_city, origin_state,
        origin_latitude, origin_longitude, created_at, updated_at
      `)
      .eq('store_id', loja.id)
      .maybeSingle(),
    sb
      .from('delivery_drivers')
      .select('id, store_id, name, phone, active, available, created_at, updated_at')
      .eq('store_id', loja.id)
      .order('name'),
    sb
      .from('deliveries')
      .select(CAMPOS_ENTREGA)
      .eq('store_id', loja.id)
      .in('status', ['WAITING_DRIVER', 'ASSIGNED', 'OUT_FOR_DELIVERY'])
      .order('created_at'),
    sb
      .from('deliveries')
      .select(CAMPOS_ENTREGA)
      .eq('store_id', loja.id)
      .eq('status', 'DELIVERED')
      .gte('delivered_at', hoje.inicio)
      .lt('delivered_at', hoje.fim)
      .order('delivered_at', { ascending: false })
      .limit(100),
  ]);

  const houveErro = !!(
    configuracao.error ||
    entregadores.error ||
    ativas.error ||
    concluidas.error
  );
  const entregas = [
    ...((ativas.data || []) as unknown as EntregaDeliveryAdmin[]),
    ...((concluidas.data || []) as unknown as EntregaDeliveryAdmin[]),
  ];

  return (
    <ShellPainel
      lojaNome={loja.nome}
      lojaSlug={loja.slug}
      souAdmin={souAdmin}
      titulo="Delivery"
    >
      <DeliveryClient
        lojaSlug={loja.slug}
        dataHoje={hoje.data}
        configuracaoInicial={(configuracao.data as ConfiguracaoDelivery | null) ?? null}
        entregadoresIniciais={(entregadores.data as EntregadorDelivery[]) || []}
        entregasIniciais={entregas}
        indisponivel={houveErro}
      />
    </ShellPainel>
  );
}
