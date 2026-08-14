import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest, NextResponse } from 'next/server';

const DURACAO_SESSAO_SEGUNDOS = 60 * 60 * 24 * 365;
const INTERVALO_ATUALIZAR_USO_MS = 60 * 60 * 1000;

type CookieSessao = {
  nome: string;
  token: string;
};

export type SessaoCliente = {
  id: string;
  lojaId: string;
  telefoneNormalizado: string;
};

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function nomeCookieSessaoCliente(slug: string) {
  return `cf_cliente_${slug}`;
}

function validadeIso() {
  return new Date(Date.now() + DURACAO_SESSAO_SEGUNDOS * 1000).toISOString();
}

/**
 * Cria a autorização leve somente depois que o banco confirmou o pedido.
 * O token puro fica exclusivamente no cookie; o banco recebe apenas SHA-256.
 */
export async function prepararSessaoCliente(
  sb: SupabaseClient,
  request: NextRequest,
  dados: { lojaId: string; lojaSlug: string; telefoneNormalizado: string }
): Promise<CookieSessao> {
  const nome = nomeCookieSessaoCliente(dados.lojaSlug);
  const tokenAtual = request.cookies.get(nome)?.value;

  if (tokenAtual) {
    const { data: existente } = await sb
      .from('sessoes_clientes')
      .select('id, telefone_normalizado, expira_em')
      .eq('loja_id', dados.lojaId)
      .eq('token_hash', hashToken(tokenAtual))
      .gt('expira_em', new Date().toISOString())
      .maybeSingle();

    if (existente?.telefone_normalizado === dados.telefoneNormalizado) {
      await sb
        .from('sessoes_clientes')
        .update({ ultimo_uso_em: new Date().toISOString(), expira_em: validadeIso() })
        .eq('id', existente.id);
      return { nome, token: tokenAtual };
    }
  }

  const token = randomBytes(32).toString('base64url');
  const { error } = await sb.from('sessoes_clientes').insert({
    loja_id: dados.lojaId,
    telefone_normalizado: dados.telefoneNormalizado,
    token_hash: hashToken(token),
    expira_em: validadeIso(),
  });
  if (error) throw error;

  return { nome, token };
}

export function aplicarCookieSessaoCliente(resposta: NextResponse, cookie: CookieSessao) {
  resposta.cookies.set(cookie.nome, cookie.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DURACAO_SESSAO_SEGUNDOS,
  });
}

/** Resolve loja + telefone somente a partir do token opaco do cookie. */
export async function resolverSessaoCliente(
  sb: SupabaseClient,
  request: NextRequest,
  dados: { lojaId: string; lojaSlug: string }
): Promise<SessaoCliente | null> {
  const token = request.cookies.get(nomeCookieSessaoCliente(dados.lojaSlug))?.value;
  if (!token || token.length < 32 || token.length > 128) return null;

  const { data } = await sb
    .from('sessoes_clientes')
    .select('id, loja_id, telefone_normalizado, ultimo_uso_em')
    .eq('loja_id', dados.lojaId)
    .eq('token_hash', hashToken(token))
    .gt('expira_em', new Date().toISOString())
    .maybeSingle();
  if (!data) return null;

  const ultimoUso = new Date(data.ultimo_uso_em).getTime();
  if (!Number.isFinite(ultimoUso) || Date.now() - ultimoUso >= INTERVALO_ATUALIZAR_USO_MS) {
    await sb
      .from('sessoes_clientes')
      .update({ ultimo_uso_em: new Date().toISOString() })
      .eq('id', data.id);
  }

  return {
    id: data.id,
    lojaId: data.loja_id,
    telefoneNormalizado: data.telefone_normalizado,
  };
}
