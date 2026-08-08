import { NextRequest, NextResponse } from 'next/server';
import { criarTokenCotacao } from '@/lib/delivery/cotacao';
import { calcularDistanciaDeRota, ErroGeoapify, geocodificarEndereco } from '@/lib/delivery/geoapify';
import { criarClientPrivilegiado, hashEndereco, hashLimite } from '@/lib/delivery/servidor';
import {
  calcularTaxaPorDistancia,
  enderecoEmLinha,
  enderecoEstruturadoValido,
  normalizarTexto,
  validarLimitesDaCotacao,
  type EnderecoEstruturado,
} from '@/lib/delivery/tipos';

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
  lojas: { delivery_ativo: boolean } | null;
  enderecos_estabelecimento: { latitude: number; longitude: number } | null;
};

type CacheRota = { distanciaMetros: number; enderecoFormatado: string; expira: number };
const globalCache = globalThis as typeof globalThis & { __cfDeliveryCache?: Map<string, CacheRota> };
const cacheRotas = globalCache.__cfDeliveryCache ?? new Map<string, CacheRota>();
globalCache.__cfDeliveryCache = cacheRotas;

function erro(mensagem: string, status: number) {
  return NextResponse.json({ erro: mensagem }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function limparEndereco(valor: unknown): EnderecoEstruturado {
  const e = (valor && typeof valor === 'object' ? valor : {}) as EnderecoEstruturado;
  return {
    cep: String(e.cep || '').replace(/\D/g, ''), logradouro: String(e.logradouro || '').trim(),
    numero: String(e.numero || '').trim(), bairro: String(e.bairro || '').trim(),
    cidade: String(e.cidade || '').trim(), uf: String(e.uf || '').trim().toUpperCase(),
    complemento: String(e.complemento || '').trim(), referencia: String(e.referencia || '').trim(),
  };
}

export async function POST(request: NextRequest) {
  let corpo: { lojaSlug?: unknown; endereco?: unknown; cidade?: unknown };
  try {
    corpo = (await request.json()) as typeof corpo;
  } catch {
    return erro('Dados inválidos.', 400);
  }
  const slug = typeof corpo.lojaSlug === 'string' ? corpo.lojaSlug.trim() : '';
  const endereco = limparEndereco(corpo.endereco);
  const cidadeEscolhida = typeof corpo.cidade === 'string' ? corpo.cidade.trim().slice(0, 100) : '';
  if (!/^[a-z0-9-]{1,80}$/.test(slug) || !enderecoEstruturadoValido(endereco)) {
    return erro('Preencha CEP, logradouro, número, bairro, cidade e UF corretamente.', 400);
  }

  let sb;
  try {
    sb = criarClientPrivilegiado();
  } catch {
    return erro('Cálculo de entrega ainda não configurado.', 503);
  }
  const { data, error } = await sb
    .from('configuracoes_delivery')
    .select(
      'loja_id,setor,tipo_taxa,cidade_atendida,taxa_fixa,valor_por_km,taxa_maxima,distancia_maxima_km,lojas!inner(delivery_ativo,slug),enderecos_estabelecimento!inner(latitude,longitude)',
    )
    .eq('lojas.slug', slug)
    .maybeSingle();
  if (error || !data) return erro('Entrega não configurada para esta loja.', 404);
  const config = data as unknown as ConfigRow;
  if (!config.lojas?.delivery_ativo) return erro('A loja não está aceitando entregas agora.', 409);

  let taxaCidade: number | null = null;
  let cidadeResolvida = config.cidade_atendida;
  if (config.setor === 'avancado') {
    if (!cidadeEscolhida) return erro('Escolha a cidade da entrega.', 400);
    const alvo = normalizarTexto(cidadeEscolhida);
    if (alvo !== normalizarTexto(config.cidade_atendida)) {
      const { data: linha } = await sb
        .from('configuracoes_delivery_cidades')
        .select('cidade,taxa')
        .eq('loja_id', config.loja_id)
        .eq('cidade_normalizada', alvo)
        .maybeSingle();
      if (!linha) return erro('Esta loja ainda não entrega nessa cidade.', 422);
      taxaCidade = Number((linha as { taxa: number }).taxa);
      cidadeResolvida = (linha as { cidade: string }).cidade;
    }
  }
  if (normalizarTexto(endereco.cidade) !== normalizarTexto(cidadeResolvida)) {
    return erro(`O endereço precisa estar em ${cidadeResolvida}.`, 422);
  }

  const enderecoCompleto = enderecoEmLinha(endereco);
  const chaveCache = hashEndereco(`${config.loja_id}|${normalizarTexto(enderecoCompleto)}`);
  const cache = cacheRotas.get(chaveCache);
  const cacheValido = !!cache && cache.expira > Date.now();
  const usaRota = taxaCidade == null && config.tipo_taxa === 'por_km' && !cacheValido;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconhecido';
  const { data: limite, error: erroLimite } = await sb.rpc('consumir_cota_delivery', {
    p_chave: hashLimite(ip), p_usa_rota: usaRota,
  });
  const l = limite as { permitido?: boolean; motivo?: string } | null;
  if (erroLimite || l?.permitido !== true) {
    return erro(
      l?.motivo === 'LIMITE_DIARIO'
        ? 'Limite diário de rotas atingido. Confirme a taxa pelo WhatsApp.'
        : 'Muitas tentativas. Aguarde um minuto.',
      429,
    );
  }

  let distanciaMetros: number | null = null;
  let enderecoFormatado = enderecoCompleto;
  if (taxaCidade == null && config.tipo_taxa === 'por_km') {
    if (!config.enderecos_estabelecimento) return erro('Endereço do estabelecimento não configurado.', 409);
    try {
      if (cacheValido && cache) {
        distanciaMetros = cache.distanciaMetros;
        enderecoFormatado = cache.enderecoFormatado;
      } else {
        const destino = await geocodificarEndereco(enderecoCompleto);
        if (!destino.cidade || normalizarTexto(destino.cidade) !== normalizarTexto(cidadeResolvida)) {
          return erro(`O endereço precisa estar em ${cidadeResolvida}.`, 422);
        }
        distanciaMetros = await calcularDistanciaDeRota(
          {
            latitude: Number(config.enderecos_estabelecimento.latitude),
            longitude: Number(config.enderecos_estabelecimento.longitude),
          },
          { latitude: destino.latitude, longitude: destino.longitude },
        );
        enderecoFormatado = destino.formatado;
        if (cacheRotas.size >= 500) cacheRotas.delete(cacheRotas.keys().next().value as string);
        cacheRotas.set(chaveCache, { distanciaMetros, enderecoFormatado, expira: Date.now() + 10 * 60_000 });
      }
    } catch (falha) {
      return erro(
        falha instanceof ErroGeoapify && falha.codigo !== 'SERVICO_INDISPONIVEL'
          ? 'Não encontramos uma rota segura. Confira todos os campos do endereço.'
          : 'O serviço de rotas está indisponível. Tente novamente.',
        503,
      );
    }
  }

  const taxa = taxaCidade ?? (
    config.tipo_taxa === 'fixa'
      ? Number(config.taxa_fixa)
      : calcularTaxaPorDistancia(distanciaMetros as number, Number(config.valor_por_km))
  );
  const problema = validarLimitesDaCotacao({
    distanciaMetros, taxa,
    distanciaMaximaKm: Number(config.distancia_maxima_km),
    taxaMaxima: Number(config.taxa_maxima),
  });
  if (problema === 'FORA_DA_AREA') return erro('Endereço fora da distância atendida pela loja.', 422);
  if (problema) return erro('A taxa calculada ficou acima do limite seguro. Confirme pelo WhatsApp.', 422);

  const exp = Date.now() + 15 * 60_000;
  const enderecoHash = hashEndereco(normalizarTexto(enderecoCompleto));
  try {
    const token = criarTokenCotacao({
      lojaId: config.loja_id, enderecoHash,
      taxaCentavos: Math.round(taxa * 100), distanciaMetros, exp,
    });
    return NextResponse.json(
      {
        taxa,
        distanciaKm: distanciaMetros == null ? null : Math.round((distanciaMetros / 1000) * 10) / 10,
        enderecoFormatado, expiraEm: new Date(exp).toISOString(), token,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return erro('Assinatura de cotação não configurada.', 503);
  }
}
