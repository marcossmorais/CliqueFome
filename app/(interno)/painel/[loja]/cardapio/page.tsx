import { obterLojaPorSlug } from '@/lib/loja';
import { criarClientServidor } from '@/lib/supabase/server';
import { CatalogoClient } from '../catalogo/CatalogoClient';
import type { Categoria, Produto, GrupoComplemento } from '@/lib/catalogo/tipos';

export default async function CardapioPage({
  params,
}: {
  params: Promise<{ loja: string }>;
}) {
  const { loja: slug } = await params;
  const { loja } = await obterLojaPorSlug(slug);
  if (!loja) return null;

  const sb = await criarClientServidor();

  const [{ data: categorias }, { data: produtos }, { data: grupos }] = await Promise.all([
    sb.from('categorias').select('*').eq('loja_id', loja.id).order('ordem'),
    sb.from('produtos').select('*, produto_grupos(grupo_id)').eq('loja_id', loja.id).order('ordem'),
    sb.from('grupos_complemento').select('*, complementos(*)').eq('loja_id', loja.id).order('ordem'),
  ]);

  const gruposOrdenados = ((grupos as GrupoComplemento[]) || []).map((g) => ({
    ...g,
    complementos: [...(g.complementos || [])].sort((a, b) => a.ordem - b.ordem),
  }));

  return (
    <CatalogoClient
      lojaId={loja.id}
      nicho={loja.nicho}
      categoriasIniciais={(categorias as Categoria[]) || []}
      produtosIniciais={(produtos as Produto[]) || []}
      gruposIniciais={gruposOrdenados}
    />
  );
}
