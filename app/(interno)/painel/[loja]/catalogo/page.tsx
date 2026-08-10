import { redirect } from 'next/navigation';

export default async function CatalogoLegadoPage({
  params,
}: {
  params: Promise<{ loja: string }>;
}) {
  const { loja } = await params;
  redirect(`/painel/${loja}/cardapio`);
}
