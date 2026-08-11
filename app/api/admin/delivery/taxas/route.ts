import { NextResponse } from 'next/server';
import { autorizarLoja } from '@/lib/delivery/autorizacao';
import { criarClientPrivilegiado } from '@/lib/delivery/servidor';
import { normalizarTexto } from '@/lib/delivery/tipos';
import { logger } from '@/lib/observabilidade/logger';

export const runtime = 'nodejs';

const ROTA = '/api/admin/delivery/taxas';
const TETO_CENTS = 20000;
const MAXIMO_REGRAS = 200;

type RegraEntrada = {
  scope: 'CITY' | 'NEIGHBORHOOD';
  cidade: string;
  bairro?: string;
  uf?: string;
  feeCents: number;
};

function respostaErro(erro: string, status: number) {
  return NextResponse.json({ erro }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: Request) {
  const lojaId = new URL(request.url).searchParams.get('lojaId') || '';
  if (!(await autorizarLoja(lojaId))) return respostaErro('Loja não autorizada.', 403);

  try {
    const sb = criarClientPrivilegiado();
    const { data, error } = await sb
      .from('delivery_fee_overrides')
      .select('id,scope,state,city_display,neighborhood_display,fee_cents,active')
      .eq('store_id', lojaId)
      .order('scope')
      .order('city_display');
    if (error) throw error;
    return NextResponse.json({ taxas: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (falha) {
    logger.error({ err: falha, rota: ROTA, lojaId }, 'Falha ao listar taxas específicas');
    return respostaErro('Não foi possível carregar as taxas específicas.', 503);
  }
}

/**
 * Substitui o conjunto inteiro de regras da loja.
 *
 * "Manda tudo e o servidor reconcilia" em vez de PATCH por linha: a tela é uma
 * lista que o dono edita à vontade antes de salvar, e reconciliar de uma vez
 * evita meia dúzia de requests e o estado intermediário incoerente (regra de
 * bairro já gravada, a de cidade que a substituiria ainda não).
 *
 * O delete e o insert acontecem na ordem certa pro índice único não brigar com
 * uma regra que só mudou de valor.
 */
export async function PUT(request: Request) {
  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch (falha) {
    logger.error({ err: falha, rota: ROTA }, 'JSON malformado no corpo das taxas específicas');
    return respostaErro('Dados inválidos.', 400);
  }

  const lojaId = typeof corpo.lojaId === 'string' ? corpo.lojaId : '';
  if (!(await autorizarLoja(lojaId))) return respostaErro('Loja não autorizada.', 403);

  const brutas = Array.isArray(corpo.taxas) ? corpo.taxas : [];
  if (brutas.length > MAXIMO_REGRAS) return respostaErro('Regras demais. O limite é 200 por loja.', 422);

  const regras: RegraEntrada[] = [];
  for (const item of brutas) {
    const r = (item ?? {}) as Record<string, unknown>;
    const scope = r.scope === 'NEIGHBORHOOD' ? 'NEIGHBORHOOD' : 'CITY';
    const cidade = String(r.cidade ?? '').trim();
    const bairro = String(r.bairro ?? '').trim();
    const uf = String(r.uf ?? '').trim().toUpperCase();
    const feeCents = Number(r.feeCents);

    if (cidade.length < 2 || cidade.length > 100) {
      return respostaErro('Informe a cidade de cada regra (2 a 100 caracteres).', 422);
    }
    if (scope === 'NEIGHBORHOOD' && (bairro.length < 2 || bairro.length > 80)) {
      return respostaErro('Informe o bairro das regras por bairro (2 a 80 caracteres).', 422);
    }
    if (!Number.isInteger(feeCents) || feeCents < 0 || feeCents > TETO_CENTS) {
      return respostaErro('Cada taxa precisa ser um valor entre R$ 0,00 e R$ 200,00.', 422);
    }
    if (uf && !/^[A-Z]{2}$/.test(uf)) return respostaErro('UF inválida.', 422);

    regras.push({ scope, cidade, bairro: scope === 'NEIGHBORHOOD' ? bairro : undefined, uf, feeCents });
  }

  // Duplicata é barrada aqui e no índice único do banco. Aqui pra dar uma
  // mensagem que diz QUAL regra está repetida; lá porque a tela não é a única
  // porta de entrada.
  const vistas = new Set<string>();
  for (const regra of regras) {
    const chave = `${regra.scope}|${normalizarTexto(regra.cidade)}|${regra.bairro ? normalizarTexto(regra.bairro) : ''}`;
    if (vistas.has(chave)) {
      return respostaErro(
        `A regra de ${regra.bairro || regra.cidade} está repetida. Deixe só uma — a taxa específica substitui a regra base, não soma.`,
        422,
      );
    }
    vistas.add(chave);
  }

  try {
    const sb = criarClientPrivilegiado();

    const { error: erroDelete } = await sb.from('delivery_fee_overrides').delete().eq('store_id', lojaId);
    if (erroDelete) throw erroDelete;

    if (regras.length > 0) {
      const { error: erroInsert } = await sb.from('delivery_fee_overrides').insert(
        regras.map((regra) => ({
          store_id: lojaId,
          scope: regra.scope,
          state: regra.uf || null,
          city_display: regra.cidade,
          city_normalized: normalizarTexto(regra.cidade),
          neighborhood_display: regra.bairro ?? null,
          neighborhood_normalized: regra.bairro ? normalizarTexto(regra.bairro) : null,
          fee_cents: regra.feeCents,
          active: true,
        })),
      );
      if (erroInsert) throw erroInsert;
    }

    // Marca a configuração como alterada para invalidar toda cotação em voo:
    // mudou a regra de preço, nenhuma taxa calculada antes disso ainda vale.
    const { error: erroVersao } = await sb
      .from('store_delivery_settings')
      .update({ updated_at: new Date().toISOString() })
      .eq('store_id', lojaId);
    if (erroVersao) throw erroVersao;

    return NextResponse.json({ ok: true, total: regras.length }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (falha) {
    logger.error({ err: falha, rota: ROTA, lojaId }, 'Falha ao salvar taxas específicas');
    return respostaErro('Não foi possível salvar as taxas específicas.', 503);
  }
}
