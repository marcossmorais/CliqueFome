import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import './cardapio.css';
import './vitrine.css';
import './cliente.css';
import { CardapioClient } from './CardapioClient';
import type { CategoriaPublica, GrupoPublico, LojaPublica, ProdutoPublico } from '@/lib/cardapio/tipos';

// O catálogo é público e igual para todos os visitantes. Um cache curto faz
// o prefetch da navegação cliente reaproveitar a página inteira, sem deixar
// alterações do lojista antigas por mais de alguns segundos.
export const revalidate = 30;

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

const DIAS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** O catálogo de demonstração foi criado quando o projeto ainda usava o
 * domínio cliquefome.vercel.app. Os mesmos arquivos vivem em /public; usar o
 * caminho relativo evita uma ida a um domínio legado que hoje responde 404. */
function urlImagemPublica(url: string | null) {
  if (!url) return null;
  try {
    const analisada = new URL(url);
    if (analisada.hostname === 'cliquefome.vercel.app' && analisada.pathname.startsWith('/demo/')) {
      return analisada.pathname;
    }
  } catch {
    // Caminhos relativos e URLs de storage válidas continuam como vieram.
  }
  return url;
}

/**
 * Dia da semana no fuso da loja, não no do servidor. Na Vercel o servidor
 * roda em UTC: às 21h de sábado no Brasil já é domingo lá, e um produto
 * configurado só pra sábado sumia do cardápio no melhor horário.
 *
 * O fuso é fixo por enquanto — quando `lojas` ganhar uma coluna de
 * timezone, é só passar ela aqui.
 */
function diaDaSemanaNaLoja() {
  const abrev = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
  }).format(new Date());
  return DIAS[abrev] ?? new Date().getDay();
}

/** Erro de infraestrutura não é "loja não encontrada". Sem esta distinção,
 * Supabase fora do ar vira 404 e o cliente acha que a loja fechou. */
class FalhaAoCarregar extends Error {}

async function carregar(slug: string) {
  const sb = clientePublico();

  // Colunas explícitas, nunca `*`: o cardápio é anônimo, e `select('*')`
  // devolveria também `dono_id` e o que for adicionado à tabela no futuro.
  // A migração de segurança revoga essas colunas de `anon`, então `*` aqui
  // passaria a falhar de qualquer forma.
  const { data: loja, error: erroLoja } = await sb
    .from('lojas')
    .select(
      // `nicho` fica de fora de propósito: schema-migracao-seguranca.sql
      // não concede essa coluna ao anon (é metadado de catálogo/preset, não
      // usado por CardapioClient.tsx) — incluir aqui derruba a consulta
      // inteira com "permission denied for table lojas".
      'id, slug, nome, logo_url, banner_url, cor_marca, cidade, sobre, whatsapp_numero, tempo_preparo_min, tempo_preparo_max, pedido_minimo, recebendo_encomendas, retirada_ativa'
    )
    .eq('slug', slug)
    .maybeSingle();
  if (erroLoja) throw new FalhaAoCarregar(erroLoja.message);
  if (!loja) return null;

  const [
    { data: categorias, error: erroCategorias },
    { data: produtos, error: erroProdutos },
    { data: deliveryAtiva, error: erroDelivery },
  ] = await Promise.all([
    sb.from('categorias').select('id, nome, emoji, icone, ordem').eq('loja_id', loja.id).eq('ativo', true).order('ordem'),
    sb
      .from('produtos')
      .select(
        // `sugestao_carrinho` só pode entrar aqui depois de
        // schema-migracao-grant-sugestao-carrinho.sql: schema-migracao-seguranca.sql
        // revoga o SELECT da tabela inteira pro papel `anon` e concede coluna a
        // coluna, e uma só coluna sem permissão derruba a consulta inteira
        // ("permission denied for table produtos") — o que já tirou TODO o
        // cardápio público do ar uma vez. Sem esta coluna as sugestões do
        // carrinho ficam sempre vazias, porque o filtro é por ela.
        'id, categoria_id, nome, descricao, preco, preco_promocional, imagem_url, etiqueta, destaque, esconder_observacao, esconder_quantidade, ativo, ordem, dias_semana, tipos_pedido, sugestao_carrinho, produto_grupos(ordem, grupos_complemento(id, nome, qtd_min, qtd_max, tipo_selecao, modo_preco, tipos_pedido, ordem, ativo, complementos(id, nome, preco, qtd_max, imagem_url, ativo, ordem, sugestao_carrinho)))'
      )
      .eq('loja_id', loja.id)
      // Traz também os inativos: viram card "Esgotado" em vez de sumir, pra
      // o cliente ver que o item existe.
      .order('ordem'),
    // A função expõe somente um booleano; configuração e preços
    // continuam privados. Durante deploy gradual, função ausente significa
    // apenas Delivery desligado — nunca derruba o cardápio de retirada.
    sb.rpc('delivery_disponibilidade_publica', { p_loja_id: loja.id }),
  ]);
  if (erroCategorias) throw new FalhaAoCarregar(erroCategorias.message);
  if (erroProdutos) throw new FalhaAoCarregar(erroProdutos.message);

  const hoje = diaDaSemanaNaLoja();
  const listaCategorias = (categorias as CategoriaPublica[]) || [];
  // Só as categorias ativas vieram na consulta acima. Este conjunto é o que
  // impede o produto de uma categoria pausada de continuar aparecendo no
  // filtro "Todos" — o dono escondeu a categoria e o item vazava assim.
  const categoriasAtivas = new Set(listaCategorias.map((c) => c.id));

  // Achata produto_grupos -> grupos e ordena tudo aqui, no servidor. O HTML
  // antigo refazia esse trabalho no navegador a cada render da lista.
  const produtosTratados: ProdutoPublico[] = ((produtos as unknown as (ProdutoPublico & {
    dias_semana: number[] | null;
    produto_grupos: RowProdutoGrupo[];
  })[]) || [])
    .filter((p) => p.categoria_id === null || categoriasAtivas.has(p.categoria_id))
    .filter((p) => !p.dias_semana?.length || p.dias_semana.includes(hoje))
    .map((p) => ({
      ...p,
      imagem_url: urlImagemPublica(p.imagem_url),
      grupos: (p.produto_grupos || [])
        .map((pg) => ({ pg, g: pg.grupos_complemento }))
        .filter((x): x is { pg: RowProdutoGrupo; g: GrupoBruto } => !!x.g && x.g.ativo)
        .sort((a, b) => a.pg.ordem - b.pg.ordem)
        .map(({ g }) => ({
          ...g,
          complementos: (g.complementos || [])
            .filter((c) => c.ativo)
            .sort((a, b) => a.ordem - b.ordem)
            .map((c) => ({ ...c, imagem_url: urlImagemPublica(c.imagem_url) })),
        })),
    }))
    // Destaque sobe pro topo — é o que o painel promete ao marcar a opção.
    // A ordem manual continua desempatando dentro de cada faixa.
    .sort((a, b) => Number(b.destaque) - Number(a.destaque) || a.ordem - b.ordem);

  return {
    loja: {
      ...loja,
      logo_url: urlImagemPublica(loja.logo_url),
      banner_url: urlImagemPublica(loja.banner_url),
    } as LojaPublica,
    categorias: listaCategorias,
    produtos: produtosTratados,
    deliveryAtiva: !erroDelivery && deliveryAtiva === true,
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
    <CardapioClient
      loja={dados.loja}
      categorias={dados.categorias}
      produtos={dados.produtos}
      deliveryAtiva={dados.deliveryAtiva}
    />
  );
}
