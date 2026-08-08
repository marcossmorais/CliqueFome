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

export const runtime = 'nodejs';

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
  } catch {
    return NextResponse.json({ erro: 'Configuração de delivery indisponível.' }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
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

  let geocodificado;
  try {
    geocodificado = await geocodificarEndereco(enderecoEmLinha(endereco));
    if (!geocodificado.cidade || normalizarTexto(geocodificado.cidade) !== normalizarTexto(endereco.cidade)) {
      return NextResponse.json(
        { erro: 'O endereço não foi localizado na cidade informada. Confira CEP, cidade e UF.' },
        { status: 400 },
      );
    }
  } catch (erro) {
    const mensagem =
      erro instanceof ErroGeoapify && erro.codigo !== 'SERVICO_INDISPONIVEL'
        ? 'Não encontramos esse endereço. Confira CEP, logradouro, número, bairro, cidade e UF.'
        : 'O serviço de localização está indisponível. Tente novamente.';
    return NextResponse.json({ erro: mensagem }, { status: 503 });
  }

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
      p_latitude: geocodificado.latitude,
      p_longitude: geocodificado.longitude,
      p_endereco_formatado: geocodificado.formatado,
      p_cidades: cidades,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, enderecoFormatado: geocodificado.formatado });
  } catch {
    return NextResponse.json({ erro: 'Não foi possível salvar a configuração.' }, { status: 503 });
  }
}
