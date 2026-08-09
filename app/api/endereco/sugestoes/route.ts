import { NextRequest, NextResponse } from 'next/server';
import { autocompletarEndereco, ErroGeoapify } from '@/lib/delivery/geoapify';
import { criarClientServidor } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Autocomplete de endereço custa cota da Geoapify a cada tecla (mesmo com
// debounce no cliente). Diferente da consulta de CEP (ViaCEP, gratuita e
// sem teto prático), aqui a proteção primária é exigir sessão — só quem
// está logado no painel usa esta tela — e o limite por usuário abaixo é
// só uma segunda camada contra um único painel aberto martelando teclas.
type Limite = { inicio: number; quantidade: number };
const globalSugestoes = globalThis as typeof globalThis & { __cfEnderecoLimites?: Map<string, Limite> };
const limites = globalSugestoes.__cfEnderecoLimites ?? new Map<string, Limite>();
globalSugestoes.__cfEnderecoLimites = limites;

function respostaErro(erro: string, status: number) {
  return NextResponse.json({ erro }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function excedeuLimite(chave: string) {
  const agora = Date.now();
  const atual = limites.get(chave);
  if (!atual || agora - atual.inicio >= 60_000) {
    limites.set(chave, { inicio: agora, quantidade: 1 });
    return false;
  }
  atual.quantidade += 1;
  if (limites.size > 2_000) limites.delete(limites.keys().next().value as string);
  return atual.quantidade > 30;
}

export async function GET(request: NextRequest) {
  const sb = await criarClientServidor();
  const { data: usuario } = await sb.auth.getUser();
  if (!usuario.user) return respostaErro('Faça login para buscar endereços.', 401);
  if (excedeuLimite(usuario.user.id)) return respostaErro('Muitas buscas de endereço. Aguarde um minuto.', 429);

  const texto = (new URL(request.url).searchParams.get('texto') || '').trim();
  if (texto.length < 4) return NextResponse.json({ sugestoes: [] }, { headers: { 'Cache-Control': 'no-store' } });
  if (texto.length > 150) return respostaErro('Busca muito longa.', 400);

  try {
    const sugestoes = await autocompletarEndereco(texto);
    return NextResponse.json({ sugestoes }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (erro) {
    const mensagem = erro instanceof ErroGeoapify && erro.codigo === 'CHAVE_AUSENTE'
      ? 'A busca de endereço ainda não está configurada.'
      : 'A busca de endereço está indisponível no momento.';
    return respostaErro(mensagem, 503);
  }
}
