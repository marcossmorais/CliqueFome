import { ConfigHub } from './ConfigHub';

export default async function ConfigPage({
  params,
}: {
  params: Promise<{ loja: string }>;
}) {
  const { loja: slug } = await params;

  return (
    <div className="area ativo">
      <ConfigHub lojaSlug={slug} />
    </div>
  );
}
