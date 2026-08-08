import { NextRequest, NextResponse } from 'next/server';
import { criarTokenCotacao } from '@/lib/delivery/cotacao';
import { calcularDistanciaDeRota, ErroGeoapify, geocodificarEndereco } from '@/lib/delivery/geoapify';
import { criarClientPrivilegiado, hashEndereco, hashLimite } from '@/lib/delivery/servidor';
import { calcularTaxaPorDistancia, normalizarTexto, validarLimitesDaCotacao } from '@/lib/delivery/tipos';

export const runtime = 'nodejs';

type ConfigRow = {
  loja_id: string;
  setor: string;
  tipo_taxa: 'fixa' | 'por_km';
  cidade_atendida: string;
  taxa_fixa: number;
  valor_por_km: number;
  taxa_maxima: number;
  distancia_maxima_km: number;
  origem_latitude: number | null;
  origem_longitude: number | null;
  lojas: { delivery_ativo: boolean } | null;
};

type CacheRota = { distanciaMetros: number; enderecoFormatado: string; cidade: string | null; expira: number };
const globalCache = globalThis as typeof globalThis & { __cfDeliveryCache?: Map<string, CacheRota> };
const cacheRotas = globalCache.__cfDeliveryCache ?? new Map<string, CacheRota>();
globalCache.__cfDeliveryCache = cacheRotas;

function respostaErro(erro: string, status: number) {
  return NextResponse.json({ erro }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  let corpo: { lojaSlug?: unknown; endereco?: unknown; cidade?: unknown };
  try {
    corpo = (await request.json()) as typeof corpo;
  } catch {
    return respostaErro('Dados inválidos.', 400);
  }
  const slug = typeof corpo.lojaSlug === 'string' ? corpo.lojaSlug.trim() : '';
  const endereco = typeof corpo.endereco === 'string' ? corpo.endereco.trim() : '';
  // Só usada no modo avançado, onde o cliente escolhe a cidade numa lista.
  const cidadeEscolhida = typeof corpo.cidade === 'string' ? corpo.cidade.trim().slice(0, 100) : '';
  if (!/^[a-z0-9-]{1,80}$/.test(slug) || endereco.length < 8 || endereco.length > 240) {
    return respostaErro('Informe rua, número, bairro e CEP para calcular.', 400);
  }

  let sb;
  try {
    sb = criarClientPrivilegiado();
  } catch {
    return respostaErro('Cálculo de entrega ainda não configurado.', 503);
  }

  const { data, error } = await sb
    .from('configuracoes_delivery')
    .select(
      'loja_id,setor,tipo_taxa,cidade_atendida,taxa_fixa,valor_por_km,taxa_maxima,distancia_maxima_km,origem_latitude,origem_longitude,lojas!inner(delivery_ativo,slug)',
    )
    .eq('lojas.slug', slug)
    .maybeSingle();
  if (error || !data) return respostaErro('Entrega não configurada para esta loja.', 404);
  const config = data as unknown as ConfigRow;
  if (!config.lojas?.delivery_ativo) return respostaErro('A loja não está aceitando entregas agora.', 409);

  // ------------------------------------------------------------------
  // Modo avançado: cidade VIZINHA usa taxa fixa própria, escolhida pelo
  // cliente na lista — nunca geocodificada, nunca por rota. Se o cliente
  // escolher a cidade PRINCIPAL, a regra normal (fixa ou por km) vale
  // igual ao modo facilitado; "avançado" só acrescenta opções, não troca
  // como a cidade principal é calculada.
  // ------------------------------------------------------------------
  const cidadePrincipal = normalizarTexto(config.cidade_atendida);
  let taxaDaCidade: number | null = null;
  let cidadeResolvida = config.cidade_atendida;

  if (config.setor === 'avancado') {
    if (!cidadeEscolhida) return respostaErro('Escolha a cidade da entrega.', 400);
    const alvo = normalizarTexto(cidadeEscolhida);
    if (alvo !== cidadePrincipal) {
      const { data: linha } = await sb
        .from('configuracoes_delivery_cidades')
        .select('cidade,taxa')
        .eq('loja_id', config.loja_id)
        .eq('cidade_normalizada', alvo)
        .maybeSingle();
      if (!linha) return respostaErro('Esta loja ainda não entrega nessa cidade.', 422);
      taxaDaCidade = Number((linha as { taxa: number }).taxa);
      cidadeResolvida = (linha as { cidade: string }).cidade;
    }
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconhecido';
  const enderecoCompleto = `${endereco}, ${cidadeResolvida}, Brasil`;
  const chaveCache = hashEndereco(`${config.loja_id}|${normalizarTexto(enderecoCompleto)}`);
  const cache = cacheRotas.get(chaveCache);
  const cacheValido = cache && cache.expira > Date.now();
  // Só chama a Geoapify quando a cidade em questão é a PRINCIPAL e ela usa
  // taxa por km. Cidade vizinha (taxaDaCidade já resolvida) nunca gera
  // chamada externa nem consome a cota diária de rotas — só o limite por
  // minuto, que existe contra flood.
  const usaRotaExterna = taxaDaCidade == null && config.tipo_taxa === 'por_km' && !cacheValido;

  const { data: limite, error: erroLimite } = await sb.rpc('consumir_cota_delivery', {
    p_chave: hashLimite(ip),
    p_usa_rota: usaRotaExterna,
  });
  const limiteObj = limite as { permitido?: boolean; motivo?: string } | null;
  if (erroLimite || limiteObj?.permitido !== true) {
    const diario = limiteObj?.motivo === 'LIMITE_DIARIO';
    return respostaErro(
      diario ? 'Limite diário de rotas atingido. Confirme a taxa pelo WhatsApp.' : 'Muitas tentativas. Aguarde um minuto.',
      429,
    );
  }

  let distanciaMetros: number | null = null;
  let enderecoFormatado = taxaDaCidade != null ? `${endereco}, ${cidadeResolvida}` : endereco;
  if (taxaDaCidade == null && config.tipo_taxa === 'por_km') {
    if (config.origem_latitude == null || config.origem_longitude == null) {
      return respostaErro('Endereço do estabelecimento ainda não configurado.', 409);
    }
    try {
      if (cacheValido) {
        distanciaMetros = cache.distanciaMetros;
        enderecoFormatado = cache.enderecoFormatado;
      } else {
        const destino = await geocodificarEndereco(enderecoCompleto);
        if (!destino.cidade || normalizarTexto(destino.cidade) !== normalizarTexto(config.cidade_atendida)) {
          return respostaErro(`O endereço precisa estar em ${config.cidade_atendida}.`, 422);
        }
        distanciaMetros = await calcularDistanciaDeRota(
          { latitude: Number(config.origem_latitude), longitude: Number(config.origem_longitude) },
          { latitude: destino.latitude, longitude: destino.longitude },
        );
        enderecoFormatado = destino.formatado;
        if (cacheRotas.size >= 500) {
          for (const [chave, valor] of cacheRotas) if (valor.expira <= Date.now()) cacheRotas.delete(chave);
          if (cacheRotas.size >= 500) cacheRotas.delete(cacheRotas.keys().next().value as string);
        }
        cacheRotas.set(chaveCache, {
          distanciaMetros,
          enderecoFormatado,
          cidade: destino.cidade,
          expira: Date.now() + 10 * 60_000,
        });
      }
    } catch (erroGeo) {
      const mensagem =
        erroGeo instanceof ErroGeoapify && erroGeo.codigo !== 'SERVICO_INDISPONIVEL'
          ? 'Não encontramos uma rota segura para esse endereço. Revise rua, número, bairro e CEP.'
          : 'O serviço de rotas está indisponível. Tente novamente em instantes.';
      return respostaErro(mensagem, 503);
    }
  }

  const taxa =
    taxaDaCidade != null
      ? taxaDaCidade
      : config.tipo_taxa === 'fixa'
        ? Number(config.taxa_fixa)
        : calcularTaxaPorDistancia(distanciaMetros as number, Number(config.valor_por_km));
  const problema = validarLimitesDaCotacao({
    distanciaMetros,
    taxa,
    distanciaMaximaKm: Number(config.distancia_maxima_km),
    taxaMaxima: Number(config.taxa_maxima),
  });
  if (problema === 'FORA_DA_AREA') return respostaErro('Endereço fora da distância atendida pela loja.', 422);
  if (problema) return respostaErro('A taxa calculada ficou acima do limite seguro. Confirme pelo WhatsApp.', 422);

  const exp = Date.now() + 15 * 60_000;
  const enderecoHash = hashEndereco(normalizarTexto(enderecoCompleto));
  let token: string;
  try {
    token = criarTokenCotacao({
      lojaId: config.loja_id,
      enderecoHash,
      taxaCentavos: Math.round(taxa * 100),
      distanciaMetros,
      exp,
    });
  } catch {
    return respostaErro('Assinatura de cotação ainda não configurada.', 503);
  }

  return NextResponse.json(
    {
      taxa,
      distanciaKm: distanciaMetros == null ? null : Math.round((distanciaMetros / 1000) * 10) / 10,
      enderecoFormatado,
      expiraEm: new Date(exp).toISOString(),
      token,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
