import { NextResponse } from 'next/server';
import { geocodificarEndereco, ErroGeoapify } from '@/lib/delivery/geoapify';
import {
  enderecoEmLinha,
  enderecoEstruturadoValido,
  normalizarSetor,
  normalizarTexto,
  normalizarTipoTaxa,
  type EnderecoEstruturado,
} from '@/lib/delivery/tipos';
import { criarClientPrivilegiado } from '@/lib/delivery/servidor';
import { criarClientServidor } from '@/lib/supabase/server';
import { logger } from '@/lib/observabilidade/logger';

export const runtime = 'nodejs';

const ROTA = '/api/admin/delivery/configuracao';

function numero(valor: unknown) {
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : NaN;
}

async function autorizarLoja(lojaId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(lojaId)) return null;
  const sb = await criarClientServidor();
  const [{ data: usuario }, { data: souAdmin }] = await Promise.all([sb.auth.getUser(), sb.rpc('is_admin')]);
  if (!usuario.user) return null;
  const consulta = sb.from('lojas').select('id').eq('id', lojaId);
  const { data } = await (souAdmin ? consulta.maybeSingle() : consulta.eq('dono_id', usuario.user.id).maybeSingle());
  return data ? usuario.user.id : null;
}

export async function GET(request: Request) {
  const lojaId = new URL(request.url).searchParams.get('lojaId') || '';
  if (!(await autorizarLoja(lojaId))) {
    return NextResponse.json({ erro: 'Loja não autorizada.' }, { status: 403 });
  }
  try {
    const sb = criarClientPrivilegiado();
    const [{ data: config }, { data: cidades }, { data: endereco }] = await Promise.all([
      sb.from('configuracoes_delivery').select('*').eq('loja_id', lojaId).maybeSingle(),
      sb.from('configuracoes_delivery_cidades').select('cidade,taxa').eq('loja_id', lojaId).order('cidade'),
      sb
        .from('enderecos_estabelecimento')
        .select('cep,logradouro,numero,bairro,cidade,uf,complemento,endereco_formatado')
        .eq('loja_id', lojaId)
        .maybeSingle(),
    ]);
    return NextResponse.json(
      { config: config ?? null, cidades: cidades ?? [], endereco: endereco ?? null },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (falha) {
    logger.error({ err: falha, rota: ROTA, lojaId }, 'Falha ao carregar configuração de delivery');
    return NextResponse.json({ erro: 'Configuração de delivery indisponível.' }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch (falha) {
    logger.error({ err: falha, rota: ROTA }, 'JSON malformado no corpo da configuração de delivery');
    return NextResponse.json({ erro: 'Dados inválidos.' }, { status: 400 });
  }

  const lojaId = typeof corpo.lojaId === 'string' ? corpo.lojaId : '';
  const bruto = (corpo.endereco && typeof corpo.endereco === 'object' ? corpo.endereco : {}) as EnderecoEstruturado;
  const endereco: EnderecoEstruturado = {
    cep: String(bruto.cep || '').replace(/\D/g, ''),
    logradouro: String(bruto.logradouro || '').trim(),
    numero: String(bruto.numero || '').trim(),
    bairro: String(bruto.bairro || '').trim(),
    cidade: String(bruto.cidade || '').trim(),
    uf: String(bruto.uf || '').trim().toUpperCase(),
    complemento: String(bruto.complemento || '').trim(),
  };
  const setor = normalizarSetor(corpo.setor);
  const tipoTaxa = normalizarTipoTaxa(corpo.tipoTaxa);
  const taxaFixa = numero(corpo.taxaFixa);
  const valorPorKm = numero(corpo.valorPorKm);
  const taxaMaxima = numero(corpo.taxaMaxima);
  const distanciaMaximaKm = numero(corpo.distanciaMaximaKm);
  const cidadesEnviadas = Array.isArray(corpo.cidades) ? corpo.cidades : [];

  if (
    !/^[0-9a-f-]{36}$/i.test(lojaId) || !enderecoEstruturadoValido(endereco) ||
    !Number.isFinite(taxaFixa) || taxaFixa < 0 || taxaFixa > 200 ||
    !Number.isFinite(valorPorKm) || valorPorKm < 0 || valorPorKm > 50 ||
    !Number.isFinite(taxaMaxima) || taxaMaxima <= 0 || taxaMaxima > 200 ||
    !Number.isFinite(distanciaMaximaKm) || distanciaMaximaKm <= 0 || distanciaMaximaKm > 100 ||
    cidadesEnviadas.length > 60
  ) {
    return NextResponse.json({ erro: 'Revise o endereço e os valores informados.' }, { status: 400 });
  }
  if (tipoTaxa === 'fixa' && taxaFixa > taxaMaxima) {
    return NextResponse.json({ erro: 'A taxa fixa não pode ultrapassar o teto de segurança.' }, { status: 400 });
  }

  const cidades: { cidade: string; cidade_normalizada: string; taxa: number }[] = [];
  if (setor === 'avancado') {
    const vistas = new Set<string>();
    for (const item of cidadesEnviadas) {
      const linha = item as { cidade?: unknown; taxa?: unknown };
      const nome = typeof linha.cidade === 'string' ? linha.cidade.trim() : '';
      const taxa = numero(linha.taxa);
      const normalizada = normalizarTexto(nome);
      if (nome.length < 2 || nome.length > 100 || !Number.isFinite(taxa) || taxa < 0 || taxa > taxaMaxima) {
        return NextResponse.json({ erro: `Revise a cidade “${nome || 'sem nome'}”.` }, { status: 400 });
      }
      if (normalizada === normalizarTexto(endereco.cidade) || vistas.has(normalizada)) {
        return NextResponse.json({ erro: `A cidade “${nome}” está repetida.` }, { status: 400 });
      }
      vistas.add(normalizada);
      cidades.push({ cidade: nome, cidade_normalizada: normalizada, taxa });
    }
  }

  if (!(await autorizarLoja(lojaId))) {
    return NextResponse.json({ erro: 'Loja não autorizada.' }, { status: 403 });
  }

  let geocodificado: Awaited<ReturnType<typeof geocodificarEndereco>> | null = null;
  try {
    geocodificado = await geocodificarEndereco(enderecoEmLinha(endereco));
    if (!geocodificado.cidade || normalizarTexto(geocodificado.cidade) !== normalizarTexto(endereco.cidade)) {
      return NextResponse.json(
        { erro: 'O endereço não foi localizado na cidade informada. Confira CEP, cidade e UF.' },
        { status: 400 },
      );
    }
  } catch (erro) {
    logger.error({ err: erro, rota: ROTA, lojaId, tipoTaxa }, 'Falha ao geocodificar endereço da loja');
    // Taxa fixa não depende de rota. Uma indisponibilidade externa não pode
    // impedir a loja de salvar essa modalidade; as coordenadas serão exigidas
    // e recalculadas quando o dono mudar para "por km".
    if (tipoTaxa === 'fixa' && erro instanceof ErroGeoapify && [
      'CHAVE_AUSENTE', 'CHAVE_RECUSADA', 'LIMITE_ATINGIDO', 'SERVICO_INDISPONIVEL',
    ].includes(erro.codigo)) {
      geocodificado = null;
    } else {
      // CHAVE_*/LIMITE_ATINGIDO/SERVICO_INDISPONIVEL são falha externa (503,
      // tentar de novo resolve). ENDERECO_NAO_ENCONTRADO/IMPRECISO não são —
      // é o dado que a pessoa digitou que não bate com nada real, então o
      // status certo é 422: tentar de novo com o MESMO endereço não muda o
      // resultado, precisa corrigir o número/logradouro.
      const mensagensServico: Partial<Record<ErroGeoapify['codigo'], string>> = {
        CHAVE_AUSENTE: 'A chave da Geoapify não está configurada no ambiente de produção.',
        CHAVE_RECUSADA: 'A Geoapify recusou a chave configurada. Confira o valor e as restrições da chave.',
        LIMITE_ATINGIDO: 'O limite de consultas da Geoapify foi atingido. Tente novamente mais tarde.',
        SERVICO_INDISPONIVEL: 'O serviço de localização está indisponível. Tente novamente.',
      };
      if (erro instanceof ErroGeoapify && mensagensServico[erro.codigo]) {
        return NextResponse.json({ erro: mensagensServico[erro.codigo] }, { status: 503 });
      }
      const mensagem = erro instanceof ErroGeoapify && erro.codigo === 'ENDERECO_IMPRECISO'
        ? 'Esse endereço não ficou preciso o bastante pra calcular rota. Confirme o número e escolha uma sugestão da busca.'
        : 'Não encontramos esse endereço. Confira CEP, logradouro, número, bairro, cidade e UF, ou escolha uma sugestão da busca.';
      return NextResponse.json({ erro: mensagem }, { status: 422 });
    }
  }

  const enderecoFormatado = geocodificado?.formatado ?? enderecoEmLinha(endereco);

  try {
    const sb = criarClientPrivilegiado();
    const { error } = await sb.rpc('salvar_config_delivery_v2', {
      p_loja_id: lojaId,
      p_setor: setor,
      p_tipo_taxa: tipoTaxa,
      p_taxa_fixa: taxaFixa,
      p_valor_por_km: valorPorKm,
      p_taxa_maxima: taxaMaxima,
      p_distancia_maxima_km: distanciaMaximaKm,
      p_cep: endereco.cep,
      p_logradouro: endereco.logradouro,
      p_numero: endereco.numero,
      p_bairro: endereco.bairro,
      p_cidade: endereco.cidade,
      p_uf: endereco.uf,
      p_complemento: endereco.complemento || null,
      p_latitude: geocodificado?.latitude ?? null,
      p_longitude: geocodificado?.longitude ?? null,
      p_endereco_formatado: enderecoFormatado,
      p_cidades: cidades,
    });
    if (error) throw error;

    // Espelha a configuração na tabela v3.
    //
    // Sem isto, o backfill da migração seria a ÚNICA coisa que já povoou
    // `store_delivery_settings`: salvar o endereço pelo painel gravava só nas
    // tabelas v2, e `origin_lat/lng` ficava nulo pra sempre — o que deixaria
    // o bias de proximidade do autocomplete desligado justamente na loja que
    // acabou de cadastrar o endereço.
    //
    // A v2 continua sendo a fonte de verdade da cotação neste PR; aqui é
    // espelho. Falhar o espelho não pode desfazer um save que já foi
    // comitado, então o erro é registrado e o save segue válido.
    const { error: erroEspelho } = await sb.from('store_delivery_settings').upsert(
      {
        store_id: lojaId,
        calculation_type: tipoTaxa === 'por_km' ? 'PER_KM' : 'FIXED',
        fixed_fee_cents: Math.round(taxaFixa * 100),
        price_per_km_cents: Math.round(valorPorKm * 100),
        max_fee_cents: Math.round(taxaMaxima * 100),
        max_distance_meters: Math.round(distanciaMaximaKm * 1000),
        origin_formatted_address: enderecoFormatado,
        origin_street: endereco.logradouro,
        origin_number: endereco.numero,
        origin_neighborhood: endereco.bairro,
        origin_city: endereco.cidade,
        origin_city_normalized: normalizarTexto(endereco.cidade),
        origin_state: endereco.uf,
        origin_postal_code: endereco.cep,
        origin_lat: geocodificado?.latitude ?? null,
        origin_lng: geocodificado?.longitude ?? null,
      },
      { onConflict: 'store_id' },
    );
    if (erroEspelho) {
      logger.error(
        { err: erroEspelho, rota: ROTA, lojaId },
        'Configuração salva na v2, mas o espelho em store_delivery_settings falhou',
      );
    }

    return NextResponse.json({ ok: true, enderecoFormatado });
  } catch (falha) {
    logger.error({ err: falha, rota: ROTA, lojaId }, 'Falha ao salvar configuração de delivery');
    return NextResponse.json({ erro: 'Não foi possível salvar a configuração.' }, { status: 503 });
  }
}
