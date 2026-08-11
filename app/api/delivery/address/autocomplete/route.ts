import { NextRequest, NextResponse } from 'next/server';
import { autocompletarEndereco, ErroGeoapify, type CodigoErroGeoapify } from '@/lib/delivery/geoapify';
import { paraSugestaoPublica, sugestaoUtilizavel } from '@/lib/delivery/endereco';
import { criarClientPrivilegiado } from '@/lib/delivery/servidor';
import { criarClientServidor } from '@/lib/supabase/server';
import { logger } from '@/lib/observabilidade/logger';

export const runtime = 'nodejs';

const ROTA = '/api/delivery/address/autocomplete';

/** Abaixo disso a busca não tem sinal suficiente e só queima cota. */
const MINIMO_CARACTERES = 3;
const MAXIMO_CARACTERES = 120;

/**
 * Diferente do endpoint antigo (`/api/endereco/sugestoes`), este é PÚBLICO:
 * quem digita o endereço é o cliente do cardápio, que nunca tem sessão. Era
 * exatamente a exigência de login que fazia o autocomplete não funcionar no
 * checkout — o navegador tomava 401 e a tela caía no formulário manual.
 *
 * Sem sessão pra ancorar o limite, a proteção passa a ser em três camadas:
 *  1. mínimo de caracteres (acima) — corta o grosso das chamadas inúteis;
 *  2. o slug precisa ser de uma loja real com entrega ligada;
 *  3. teto por IP por minuto (abaixo).
 *
 * O contador é de processo, não compartilhado: numa serverless com várias
 * instâncias o teto real é por instância. É contenção de laço descontrolado,
 * não defesa contra ataque distribuído — pra isso a barreira é a cota da
 * própria Geoapify. Vale registrar como limitação conhecida.
 */
type Limite = { inicio: number; quantidade: number };
type LojaResolvida = {
  origem: { latitude: number; longitude: number } | null;
  permitida: boolean;
  expira: number;
};
const LIMITE_POR_MINUTO = 40;

const escopoGlobal = globalThis as typeof globalThis & {
  __cfAutocompleteLimites?: Map<string, Limite>;
  __cfAutocompleteLojas?: Map<string, LojaResolvida>;
};
const limites = escopoGlobal.__cfAutocompleteLimites ?? new Map<string, Limite>();
escopoGlobal.__cfAutocompleteLimites = limites;

/** Evita uma ida ao banco por tecla digitada: a origem da loja muda no
 *  máximo quando o dono reconfigura o endereço, então 5 minutos de cache
 *  não atrasa nada perceptível e tira a consulta do caminho quente. */
const lojasEmCache = escopoGlobal.__cfAutocompleteLojas ?? new Map<string, LojaResolvida>();
escopoGlobal.__cfAutocompleteLojas = lojasEmCache;
const TTL_CACHE_LOJA_MS = 5 * 60_000;

function respostaErro(erro: string, status: number) {
  return NextResponse.json({ erro }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function excedeuLimite(chave: string) {
  const agora = Date.now();
  const atual = limites.get(chave);
  if (!atual || agora - atual.inicio >= 60_000) {
    limites.set(chave, { inicio: agora, quantidade: 1 });
    if (limites.size > 5_000) limites.delete(limites.keys().next().value as string);
    return false;
  }
  atual.quantidade += 1;
  return atual.quantidade > LIMITE_POR_MINUTO;
}

/**
 * Resolve a loja SERVER-SIDE a partir do slug. O slug não é autoridade sobre
 * preço nenhum — serve só pra decidir se a busca é permitida e pra onde
 * enviesar o resultado. Quem define taxa é a cotação, noutra rota.
 *
 * `null` = loja inexistente ou com entrega desligada: não busca endereço.
 */
async function resolverLoja(slug: string): Promise<LojaResolvida> {
  const emCache = lojasEmCache.get(slug);
  if (emCache && emCache.expira > Date.now()) return emCache;

  const sb = criarClientPrivilegiado();
  const { data, error } = await sb
    .from('store_delivery_settings')
    .select('origin_lat,origin_lng,enabled,lojas!inner(slug,delivery_ativo)')
    .eq('lojas.slug', slug)
    .maybeSingle();

  // Falha de consulta não é "loja sem entrega": se a migração ainda não
  // rodou, a tabela não existe e engolir isso como 409 esconderia o motivo
  // real atrás de uma mensagem de negócio. Propaga pra virar 503 e log.
  if (error) throw new Error(`store_delivery_settings indisponível: ${error.message}`);

  const linha = data as unknown as {
    origin_lat: number | null;
    origin_lng: number | null;
    enabled: boolean;
    lojas: { delivery_ativo: boolean } | null;
  } | null;

  const habilitada = !!linha?.enabled && !!linha.lojas?.delivery_ativo;
  const origem =
    habilitada && linha.origin_lat != null && linha.origin_lng != null
      ? { latitude: Number(linha.origin_lat), longitude: Number(linha.origin_lng) }
      : null;

  const entrada: LojaResolvida = { origem, permitida: habilitada, expira: Date.now() + TTL_CACHE_LOJA_MS };
  if (lojasEmCache.size > 500) lojasEmCache.delete(lojasEmCache.keys().next().value as string);
  lojasEmCache.set(slug, entrada);
  return entrada;
}

/** Sessão do painel: só o dono da loja (ou o admin da plataforma) passa. */
async function donoDaLoja(slug: string) {
  try {
    const sb = await criarClientServidor();
    const { data: usuario } = await sb.auth.getUser();
    if (!usuario.user) return false;
    const { data: souAdmin } = await sb.rpc('is_admin');
    if (souAdmin === true) return true;
    // RLS já restringe `lojas` ao dono; o filtro explícito por dono_id é a
    // segunda barreira, não a única.
    const { data } = await sb
      .from('lojas')
      .select('id')
      .eq('slug', slug)
      .eq('dono_id', usuario.user.id)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const parametros = new URL(request.url).searchParams;
  const consulta = (parametros.get('q') || '').trim();
  const slug = (parametros.get('loja') || '').trim();

  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return respostaErro('Loja inválida.', 400);
  if (consulta.length > MAXIMO_CARACTERES) return respostaErro('Busca muito longa.', 400);
  // Abaixo do mínimo devolve lista vazia em vez de erro: é estado normal de
  // quem começou a digitar, não falha. E não chega a tocar a Geoapify.
  if (consulta.length < MINIMO_CARACTERES) {
    return NextResponse.json({ sugestoes: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconhecido';
  if (excedeuLimite(`${ip}:${slug}`)) {
    return respostaErro('Muitas buscas de endereço. Aguarde um instante.', 429);
  }

  let loja: LojaResolvida;
  try {
    loja = await resolverLoja(slug);
  } catch (erro) {
    logger.error({ err: erro, rota: ROTA, lojaSlug: slug }, 'Falha ao resolver loja para autocomplete de endereço');
    return respostaErro('Busca de endereço indisponível no momento.', 503);
  }
  // Loja com entrega desligada não serve o cliente do cardápio — mas o DONO
  // precisa buscar endereço justamente pra configurar a entrega pela primeira
  // vez, quando ela ainda está desligada e nem existe linha de configuração.
  // A checagem de sessão fica DEPOIS do caminho público de propósito: o caso
  // comum (cliente anônimo, loja ativa) não paga o getUser.
  if (!loja.permitida && !(await donoDaLoja(slug))) {
    return respostaErro('Esta loja não está aceitando entregas agora.', 409);
  }

  try {
    const encontrados = await autocompletarEndereco(consulta, { bias: loja.origem, limite: 5 });
    const sugestoes = encontrados.filter(sugestaoUtilizavel).map(paraSugestaoPublica);
    return NextResponse.json({ sugestoes }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (erro) {
    const mensagens: Partial<Record<CodigoErroGeoapify, string>> = {
      CHAVE_AUSENTE: 'A busca de endereço ainda não está disponível. Use a busca por CEP.',
      CHAVE_RECUSADA: 'A busca de endereço ainda não está disponível. Use a busca por CEP.',
      LIMITE_ATINGIDO: 'Muitas buscas de endereço agora. Tente de novo em instantes ou use o CEP.',
      SERVICO_INDISPONIVEL: 'A busca de endereço está fora do ar. Use a busca por CEP.',
    };
    const mensagem = erro instanceof ErroGeoapify
      ? mensagens[erro.codigo] ?? 'A busca de endereço está indisponível. Use a busca por CEP.'
      : 'A busca de endereço está indisponível. Use a busca por CEP.';
    logger.error({ err: erro, rota: ROTA, lojaSlug: slug }, 'Falha ao buscar sugestões de endereço');
    return respostaErro(mensagem, 503);
  }
}
