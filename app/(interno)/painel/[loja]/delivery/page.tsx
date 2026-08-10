import { ShellPainel } from '@/components/admin/ShellPainel';
import { obterLojaPorSlug } from '@/lib/loja';
import { DeliveryFacilitadoForm } from './DeliveryFacilitadoForm';
import { DeliveryHub } from './DeliveryHub';

/**
 * Configuração de "Áreas de entrega" — hoje só cobre o Delivery facilitado
 * (taxa única da cidade, ou taxa por km via Geoapify, mais o modo avançado
 * com cidades vizinhas). Áreas por raio/polígono/bairro do menu original
 * ficam para depois; o rótulo do menu já avisa isso.
 *
 * O carregamento inicial fica no client (DeliveryFacilitadoForm faz o GET)
 * e não aqui no server: os valores (endereço, coordenadas, cidades) só
 * existem atrás do client privilegiado, e replicar essa leitura aqui
 * duplicaria a lógica de autorização que já vive em
 * app/api/admin/delivery/configuracao/route.ts.
 */
export default async function DeliveryPage({
  params,
}: {
  params: Promise<{ loja: string }>;
}) {
  const { loja: slug } = await params;
  const { loja, souAdmin } = await obterLojaPorSlug(slug);
  if (!loja) return null;

  return (
    <ShellPainel lojaNome={loja.nome} lojaSlug={loja.slug} souAdmin={souAdmin} titulo="Delivery">
      <DeliveryHub configuracao={<DeliveryFacilitadoForm lojaId={loja.id} />} />
    </ShellPainel>
  );
}
