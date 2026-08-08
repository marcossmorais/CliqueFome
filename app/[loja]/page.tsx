import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import './cardapio.css';
import { CardapioClient } from './CardapioClient';
import type { CategoriaPublica, GrupoPublico, LojaPublica, ProdutoPublico } from '@/lib/cardapio/tipos';

/**
 * Cardápio público de uma loja: /oh-taal
 *
 * Usa um client anônimo direto (não o de sessão): esta página não tem
 * login, e criar o client de cookies aqui obrigaria a rota a virar dinâmica
 * por causa da leitura de cookies — sem ganho nenhum, já que só lê dados
 * públicos protegidos por RLS de leitura aberta.
 */
function clientePublico() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

/** O grupo vem do banco com "ativo", que não entra no tipo público: uma
 * lista pausada é filtrada aqui e nunca chega ao cliente. */
type GrupoBruto = GrupoPublico & { ativo: boolean };

type RowProdutoGrupo = {
  ordem: number;
  grupos_complemento: GrupoBruto | null;
};

async function carregar(slug: string) {
  const sb = clientePublico();

  const { data: loja } = await sb.from('lojas').select('*').eq('slug', slug).maybeSingle();
  if (!loja) return null;

  const [{ data: categorias }, { data: produtos }] = await Promise.all([
    sb.from('categorias').select('id, nome, emoji, ordem').eq('loja_id', loja.id).eq('ativo', true).order('ordem'),
    sb
      .from('produtos')
      .select(
        'id, categoria_id, nome, descricao, preco, preco_promocional, imagem_url, etiqueta, destaque, esconder_observacao, esconder_quantidade, ativo, ordem, dias_semana, produto_grupos(ordem, grupos_complemento(id, nome, qtd_min, qtd_max, tipo_selecao, modo_preco, ordem, ativo, complementos(id, nome, preco, imagem_url, ativo, ordem)))'
      )
      .eq('loja_id', loja.id)
      // Traz também os inativos: viram card "Esgotado" em vez de sumir, pra
      // o cliente ver que o item existe.
      .order('ordem'),
  ]);

  const hoje = new Date().getDay();

  // Achata produto_grupos -> grupos e ordena tudo aqui, no servidor. O HTML
  // antigo refazia esse trabalho no navegador a cada render da lista.
  const produtosTratados: ProdutoPublico[] = ((produtos as unknown as (ProdutoPublico & {
    dias_semana: number[] | null;
    produto_grupos: RowProdutoGrupo[];
  })[]) || [])
    .filter((p) => !p.dias_semana?.length || p.dias_semana.includes(hoje))
    .map((p) => ({
      ...p,
      grupos: (p.produto_grupos || [])
        .map((pg) => ({ pg, g: pg.grupos_complemento }))
        .filter((x): x is { pg: RowProdutoGrupo; g: GrupoBruto } => !!x.g && x.g.ativo)
        .sort((a, b) => a.pg.ordem - b.pg.ordem)
        .map(({ g }) => ({
          ...g,
          complementos: (g.complementos || []).filter((c) => c.ativo).sort((a, b) => a.ordem - b.ordem),
        })),
    }));

  return {
    loja: loja as LojaPublica,
    categorias: (categorias as CategoriaPublica[]) || [],
    produtos: produtosTratados,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ loja: string }>;
}): Promise<Metadata> {
  const { loja: slug } = await params;
  const sb = clientePublico();
  const { data } = await sb.from('lojas').select('nome, sobre, banner_url').eq('slug', slug).maybeSingle();
  if (!data) return { title: 'Cardápio não encontrado' };
  return {
    title: `${data.nome} — Cardápio`,
    description: data.sobre || `Peça online no cardápio digital do ${data.nome}.`,
    openGraph: data.banner_url ? { images: [data.banner_url] } : undefined,
  };
}

export default async function CardapioPage({ params }: { params: Promise<{ loja: string }> }) {
  const { loja: slug } = await params;
  const dados = await carregar(slug);
  if (!dados) notFound();

  return (
    <CardapioClient loja={dados.loja} categorias={dados.categorias} produtos={dados.produtos} />
  );
}
