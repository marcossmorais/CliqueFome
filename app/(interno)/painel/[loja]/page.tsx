import { redirect } from 'next/navigation';

export default async function PainelLojaPage({
  params,
}: {
  params: Promise<{ loja: string }>;
}) {
  const { loja } = await params;
  redirect(`/painel/${loja}/inicio`);
}
