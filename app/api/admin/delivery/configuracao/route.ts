import { NextResponse } from 'next/server';
import { geocodificarEndereco, ErroGeoapify } from '@/lib/delivery/geoapify';
import { normalizarSetor, normalizarTexto, normalizarTipoTaxa } from '@/lib/delivery/tipos';
import { criarClientPrivilegiado } from '@/lib/delivery/servidor';
import { criarClientServidor } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function numero(valor: unknown) {
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : NaN;
}

/** Confere que quem chama é dono da loja (ou super admin) e devolve o id
 * autorizado. As duas rotas (GET e PUT) fazem a mesma checagem — a policy
 * de RLS em `configuracoes_delivery` cobre o SELECT direto, mas aqui a
 * escrita passa pelo client privilegiado, que ignora RLS de propósito.
 */
async function autorizarLoja(lojaId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(lojaId)) return null;
  const sbUsuario = await criarClientServidor();
  const [{ data: usuario }, { data: souAdmin }] = await Promise.all([
    sbUsuario.auth.getUser(),
    sbUsuario.rpc('is_admin'),
  ]);
  if (!usuario.user) return null;
  const consulta = sbUsuario.from('lojas').select('id').eq('id', lojaId);
  const { data: loja } = await (souAdmin ? consulta.maybeSingle() : consulta.eq('dono_id', usuario.user.id).maybeSingle());
  return loja ? usuario.user.id : null;
}

export async function GET(request: Request) {
  const lojaId = new URL(request.url).searchParams.get('lojaId') || '';
  if (!(await autorizarLoja(lojaId))) return NextResponse.json({ erro: 'Loja não autorizada.' }, { status: 403 });

  const sbAdmin = criarClientPrivilegiado();
  const [{ data: config }, { data: cidades }] = await Promise.all([
    sbAdmin.from('configuracoes_delivery').select('*').eq('loja_id', lojaId).maybeSingle(),
    sbAdmin.from('configuracoes_delivery_cidades').select('cidade,taxa').eq('loja_id', lojaId).order('cidade'),
  ]);
  return NextResponse.json({ config: config ?? null, cidades: cidades ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(request: Request) {
  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ erro: 'Dados inválidos.' }, { status: 400 });
  }

  const lojaId = typeof corpo.lojaId === 'string' ? corpo.lojaId : '';
  const cidade = typeof corpo.cidade === 'string' ? corpo.cidade.trim() : '';
  const setor = normalizarSetor(corpo.setor);
  const tipoTaxa = normalizarTipoTaxa(corpo.tipoTaxa);
  const taxaFixa = numero(corpo.taxaFixa);
  const valorPorKm = numero(corpo.valorPorKm);
  const taxaMaxima = numero(corpo.taxaMaxima);
  const distanciaMaximaKm = numero(corpo.distanciaMaximaKm);
  const enderecoInformado = typeof corpo.enderecoOrigem === 'string' ? corpo.enderecoOrigem.trim() : '';
  // No modo avançado, uma cidade vizinha por linha. A normalização acontece
  // aqui, não no banco: fazer em SQL exigiria a extensão unaccent.
  const cidadesEnviadas = Array.isArray(corpo.cidades) ? corpo.cidades : [];

  if (
    !/^[0-9a-f-]{36}$/i.test(lojaId) ||
    cidade.length < 2 || cidade.length > 100 ||
    !Number.isFinite(taxaFixa) || taxaFixa < 0 || taxaFixa > 200 ||
    !Number.isFinite(valorPorKm) || valorPorKm < 0 || valorPorKm > 50 ||
    !Number.isFinite(taxaMaxima) || taxaMaxima <= 0 || taxaMaxima > 200 ||
    !Number.isFinite(distanciaMaximaKm) || distanciaMaximaKm <= 0 || distanciaMaximaKm > 100 ||
    cidadesEnviadas.length > 60
  ) {
    return NextResponse.json({ erro: 'Revise os valores informados.' }, { status: 400 });
  }
  if (tipoTaxa === 'fixa' && taxaFixa > taxaMaxima) {
    return NextResponse.json({ erro: 'A taxa fixa não pode ultrapassar o teto de segurança.' }, { status: 400 });
  }

  const cidadesValidadas: { cidade: string; cidade_normalizada: string; taxa: number }[] = [];
  if (setor === 'avancado') {
    const vistas = new Set<string>();
    for (const item of cidadesEnviadas) {
      const nome = typeof (item as { cidade?: unknown })?.cidade === 'string' ? (item as { cidade: string }).cidade.trim() : '';
      const taxa = numero((item as { taxa?: unknown })?.taxa);
      if (nome.length < 2 || nome.length > 100 || !Number.isFinite(taxa) || taxa < 0 || taxa > taxaMaxima) {
        return NextResponse.json({ erro: `Revise a cidade "${nome || '(sem nome)'}".` }, { status: 400 });
      }
      const normalizada = normalizarTexto(nome);
      if (normalizada === normalizarTexto(cidade)) {
        return NextResponse.json(
          { erro: `"${nome}" é a cidade principal — a taxa dela é a taxa fixa acima, não precisa repetir.` },
          { status: 400 },
        );
      }
      if (vistas.has(normalizada)) {
        return NextResponse.json({ erro: `"${nome}" está duplicada na lista.` }, { status: 400 });
      }
      vistas.add(normalizada);
      cidadesValidadas.push({ cidade: nome, cidade_normalizada: normalizada, taxa });
    }
  }

  const usuarioId = await autorizarLoja(lojaId);
  if (!usuarioId) return NextResponse.json({ erro: 'Loja não autorizada.' }, { status: 403 });

  let enderecoOrigem: string | null = null;
  let origemLatitude: number | null = null;
  let origemLongitude: number | null = null;

  if (tipoTaxa === 'por_km') {
    if (enderecoInformado.length < 8 || enderecoInformado.length > 240) {
      return NextResponse.json({ erro: 'Informe o endereço completo do estabelecimento.' }, { status: 400 });
    }
    try {
      const origem = await geocodificarEndereco(`${enderecoInformado}, ${cidade}, Brasil`);
      if (!origem.cidade || normalizarTexto(origem.cidade) !== normalizarTexto(cidade)) {
        return NextResponse.json(
          { erro: 'O endereço do estabelecimento não foi localizado na cidade informada.' },
          { status: 400 },
        );
      }
      enderecoOrigem = origem.formatado;
      origemLatitude = origem.latitude;
      origemLongitude = origem.longitude;
    } catch (erro) {
      const texto =
        erro instanceof ErroGeoapify && erro.codigo !== 'SERVICO_INDISPONIVEL'
          ? 'Não encontramos o endereço do estabelecimento. Inclua rua, número, bairro e CEP.'
          : 'O serviço de localização está indisponível. Tente novamente.';
      return NextResponse.json({ erro: texto }, { status: 503 });
    }
  }

  try {
    const sbAdmin = criarClientPrivilegiado();
    const { error } = await sbAdmin.rpc('salvar_config_delivery', {
      p_loja_id: lojaId,
      p_tipo_taxa: tipoTaxa,
      p_cidade: cidade,
      p_taxa_fixa: taxaFixa,
      p_valor_por_km: valorPorKm,
      p_taxa_maxima: taxaMaxima,
      p_distancia_maxima_km: distanciaMaximaKm,
      p_endereco_origem: enderecoOrigem,
      p_origem_latitude: origemLatitude,
      p_origem_longitude: origemLongitude,
      p_setor: setor,
      p_cidades: cidadesValidadas,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, enderecoOrigem });
  } catch {
    return NextResponse.json({ erro: 'Não foi possível salvar a configuração.' }, { status: 503 });
  }
}
