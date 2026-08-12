import 'server-only';

import { NextResponse } from 'next/server';
import { obterLojaPorSlug, obterUsuario, type Loja } from '@/lib/loja';
import { criarClientServidor } from '@/lib/supabase/server';
import type { EntregadorDelivery } from './tipos-operacao';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9-]{1,80}$/;

export class ErroApiDelivery extends Error {
  constructor(
    message: string,
    readonly status = 422,
    readonly codigo?: string
  ) {
    super(message);
    this.name = 'ErroApiDelivery';
  }
}

export function respostaJson(dados: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(dados, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}

export function respostaErroApi(erro: unknown, mensagemPadrao: string) {
  if (erro instanceof ErroApiDelivery) {
    return respostaJson(
      { erro: erro.message, ...(erro.codigo ? { codigo: erro.codigo } : {}) },
      erro.status
    );
  }
  return respostaJson({ erro: mensagemPadrao }, 500);
}

export async function lerJson(request: Request, limiteBytes = 12_000): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new ErroApiDelivery('Content-Type precisa ser application/json.', 415);
  }
  const texto = await request.text();
  if (texto.length > limiteBytes) throw new ErroApiDelivery('Dados grandes demais.', 413);
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    throw new ErroApiDelivery('Dados inválidos.', 422);
  }
}

export function objeto(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new ErroApiDelivery('Dados inválidos.');
  }
  return valor as Record<string, unknown>;
}

export function textoObrigatorio(
  valor: unknown,
  campo: string,
  minimo: number,
  maximo: number
) {
  if (typeof valor !== 'string') throw new ErroApiDelivery(`${campo} é obrigatório.`);
  const texto = valor.trim();
  if (texto.length < minimo || texto.length > maximo) {
    throw new ErroApiDelivery(`${campo} precisa ter entre ${minimo} e ${maximo} caracteres.`);
  }
  return texto;
}

export function booleano(valor: unknown, campo: string) {
  if (typeof valor !== 'boolean') throw new ErroApiDelivery(`${campo} inválido.`);
  return valor;
}

export function inteiroNaoNegativo(valor: unknown, campo: string, maximo = 100_000_000) {
  if (!Number.isSafeInteger(valor) || (valor as number) < 0 || (valor as number) > maximo) {
    throw new ErroApiDelivery(`${campo} inválido.`);
  }
  return valor as number;
}

export function uuid(valor: unknown, campo: string) {
  if (typeof valor !== 'string' || !UUID.test(valor)) {
    throw new ErroApiDelivery(`${campo} inválido.`);
  }
  return valor;
}

export function validarSlug(slug: string) {
  if (!SLUG.test(slug)) throw new ErroApiDelivery('Loja não encontrada.', 404);
  return slug;
}

export async function autorizarLojaAdministrativa(slugBruto: string): Promise<{
  loja: Loja;
  userId: string;
}> {
  const slug = validarSlug(slugBruto);
  const [usuario, lojaResolvida] = await Promise.all([
    obterUsuario(),
    obterLojaPorSlug(slug),
  ]);
  if (!usuario) throw new ErroApiDelivery('Não autenticado.', 401);
  if (!lojaResolvida.loja) throw new ErroApiDelivery('Loja não encontrada.', 404);
  return { loja: lojaResolvida.loja, userId: usuario.id };
}

export async function autorizarEntregador(): Promise<{
  entregador: EntregadorDelivery;
  userId: string;
  sb: Awaited<ReturnType<typeof criarClientServidor>>;
}> {
  const sb = await criarClientServidor();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new ErroApiDelivery('Não autenticado.', 401);

  const { data, error } = await sb
    .from('delivery_drivers')
    .select('id, store_id, name, phone, active, available, created_at, updated_at')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.active) throw new ErroApiDelivery('Acesso de entregador indisponível.', 403);

  return { entregador: data as EntregadorDelivery, userId: user.id, sb };
}
