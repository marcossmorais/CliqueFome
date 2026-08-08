import { createHmac, timingSafeEqual } from 'node:crypto';

export type ConteudoTokenCotacao = {
  lojaId: string;
  enderecoHash: string;
  taxaCentavos: number;
  distanciaMetros: number | null;
  exp: number;
};

function segredo() {
  // Segredo dedicado é recomendado. A chave server-side da Geoapify é um
  // fallback seguro para o MVP e evita uma configuração obrigatória extra.
  const valor = process.env.DELIVERY_QUOTE_SECRET?.trim() || process.env.GEOAPIFY_API_KEY?.trim();
  if (!valor || valor.length < 32) throw new Error('DELIVERY_QUOTE_SECRET_NAO_CONFIGURADO');
  return valor;
}

function assinatura(payload: string) {
  return createHmac('sha256', segredo()).update(payload).digest('base64url');
}

export function criarTokenCotacao(conteudo: ConteudoTokenCotacao) {
  const payload = Buffer.from(JSON.stringify(conteudo)).toString('base64url');
  return `${payload}.${assinatura(payload)}`;
}

export function verificarTokenCotacao(token: string): ConteudoTokenCotacao | null {
  const [payload, recebida] = token.split('.');
  if (!payload || !recebida) return null;
  const esperada = assinatura(payload);
  const a = Buffer.from(recebida);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const conteudo = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ConteudoTokenCotacao;
    if (!conteudo.exp || conteudo.exp < Date.now()) return null;
    return conteudo;
  } catch {
    return null;
  }
}
