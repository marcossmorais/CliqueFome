import { NextRequest, NextResponse } from 'next/server';
import { somenteDigitosCep, type EnderecoPorCep } from '@/lib/endereco/cep';
import { logger } from '@/lib/observabilidade/logger';

export const runtime = 'nodejs';

const ROTA = '/api/endereco/cep/[cep]';

type Limite = { inicio: number; quantidade: number };
const globalCep = globalThis as typeof globalThis & { __cfCepLimites?: Map<string, Limite> };
const limites = globalCep.__cfCepLimites ?? new Map<string, Limite>();
globalCep.__cfCepLimites = limites;

function respostaErro(erro: string, status: number) {
  return NextResponse.json({ erro }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function excedeuLimite(request: NextRequest) {
  const chave = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const agora = Date.now();
  const atual = limites.get(chave);
  if (!atual || agora - atual.inicio >= 60_000) {
    limites.set(chave, { inicio: agora, quantidade: 1 });
    return false;
  }
  atual.quantidade += 1;
  if (limites.size > 2_000) limites.delete(limites.keys().next().value as string);
  return atual.quantidade > 40;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ cep: string }> }) {
  const cep = somenteDigitosCep((await params).cep || '');
  if (!/^\d{8}$/.test(cep)) return respostaErro('Informe um CEP válido com 8 números.', 400);
  if (excedeuLimite(request)) return respostaErro('Muitas consultas de CEP. Aguarde um minuto.', 429);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      signal: controller.signal,
      next: { revalidate: 30 * 24 * 60 * 60 },
      headers: { Accept: 'application/json' },
    });
    if (!resposta.ok) return respostaErro('Consulta de CEP indisponível. Preencha manualmente.', 503);
    const dados = (await resposta.json()) as {
      erro?: boolean | 'true'; cep?: unknown; logradouro?: unknown; bairro?: unknown;
      localidade?: unknown; uf?: unknown;
    };
    if (dados.erro === true || dados.erro === 'true') return respostaErro('CEP não encontrado.', 404);

    const endereco: EnderecoPorCep = {
      cep,
      logradouro: typeof dados.logradouro === 'string' ? dados.logradouro.trim().slice(0, 120) : '',
      bairro: typeof dados.bairro === 'string' ? dados.bairro.trim().slice(0, 80) : '',
      cidade: typeof dados.localidade === 'string' ? dados.localidade.trim().slice(0, 100) : '',
      uf: typeof dados.uf === 'string' ? dados.uf.trim().toUpperCase().slice(0, 2) : '',
    };
    if (endereco.cidade.length < 2 || !/^[A-Z]{2}$/.test(endereco.uf)) {
      return respostaErro('O CEP retornou um endereço incompleto. Preencha manualmente.', 422);
    }
    return NextResponse.json(endereco, {
      headers: { 'Cache-Control': 'public, s-maxage=2592000, stale-while-revalidate=86400' },
    });
  } catch (falha) {
    logger.error({ err: falha, rota: ROTA, cep }, 'Falha ao consultar CEP na ViaCEP');
    return respostaErro('Consulta de CEP indisponível. Preencha manualmente.', 503);
  } finally {
    clearTimeout(timer);
  }
}
