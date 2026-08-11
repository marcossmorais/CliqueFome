import { createHmac, timingSafeEqual } from 'node:crypto';
import type { RegraAplicada } from './taxas';

export type ConteudoTokenCotacao = {
  lojaId: string;
  enderecoHash: string;
  taxaCentavos: number;
  distanciaMetros: number | null;
  regra: RegraAplicada;
  overrideId: string | null;
  /**
   * `updated_at` da configuração de entrega no instante da cotação.
   *
   * É o que faz uma cotação morrer quando a loja mexe no preço: sem isto, o
   * cliente que deixou o checkout aberto por dez minutos enquanto a loja
   * dobrava a taxa conseguiria fechar o pedido pelo valor velho, porque a
   * assinatura continuaria válida e a expiração ainda não teria chegado.
   */
  configVersao: string;
  exp: number;
};

function segredo() {
  const dedicado = process.env.DELIVERY_QUOTE_SECRET?.trim();
  if (dedicado && dedicado.length >= 32) return dedicado;

  // Reserva histórica: a chave server-side da Geoapify. Funciona (é secreta e
  // longa), mas amarra dois assuntos independentes — rotacionar a chave do
  // provedor invalidaria toda cotação em voo. Configure DELIVERY_QUOTE_SECRET
  // em produção; está registrado em docs/PENDING_TASKS.md.
  const reserva = process.env.GEOAPIFY_API_KEY?.trim();
  if (!reserva || reserva.length < 32) throw new Error('DELIVERY_QUOTE_SECRET_NAO_CONFIGURADO');
  return reserva;
}

function assinatura(payload: string) {
  return createHmac('sha256', segredo()).update(payload).digest('base64url');
}

export function criarTokenCotacao(conteudo: ConteudoTokenCotacao) {
  const payload = Buffer.from(JSON.stringify(conteudo)).toString('base64url');
  return `${payload}.${assinatura(payload)}`;
}

/**
 * Verifica assinatura e expiração. NÃO confere loja nem versão da
 * configuração — isso é responsabilidade de quem chama (a criação do
 * pedido), que sabe qual loja e qual versão são as atuais.
 */
export function verificarTokenCotacao(token: string): ConteudoTokenCotacao | null {
  const [payload, recebida] = token.split('.');
  if (!payload || !recebida) return null;

  let esperada: string;
  try {
    esperada = assinatura(payload);
  } catch {
    return null;
  }

  const a = Buffer.from(recebida);
  const b = Buffer.from(esperada);
  // Comparação em tempo constante só faz sentido com o mesmo comprimento;
  // timingSafeEqual lança se diferirem, daí a checagem antes.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const conteudo = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ConteudoTokenCotacao;
    if (!conteudo.exp || conteudo.exp < Date.now()) return null;
    return conteudo;
  } catch {
    return null;
  }
}

export type MotivoRecusaCotacao =
  | 'TOKEN_INVALIDO'
  | 'OUTRA_LOJA'
  | 'OUTRO_ENDERECO'
  | 'CONFIG_MUDOU';

/**
 * Confere tudo que a criação do pedido precisa antes de aceitar a taxa.
 *
 * Separado de `verificarTokenCotacao` pra cada motivo de recusa poder virar
 * uma mensagem diferente na tela: "expirou" e "a loja mudou o preço" pedem
 * reações diferentes de quem está comprando.
 */
export function validarCotacaoParaPedido({
  token,
  lojaId,
  enderecoHash,
  configVersaoAtual,
}: {
  token: string;
  lojaId: string;
  enderecoHash: string;
  configVersaoAtual: string;
}): { ok: true; cotacao: ConteudoTokenCotacao } | { ok: false; motivo: MotivoRecusaCotacao } {
  const cotacao = verificarTokenCotacao(token);
  if (!cotacao) return { ok: false, motivo: 'TOKEN_INVALIDO' };
  if (cotacao.lojaId !== lojaId) return { ok: false, motivo: 'OUTRA_LOJA' };
  if (cotacao.enderecoHash !== enderecoHash) return { ok: false, motivo: 'OUTRO_ENDERECO' };
  // Comparação por igualdade e não por "mais novo que": qualquer alteração na
  // configuração invalida, inclusive uma que baixaria a taxa. Cobrar diferente
  // do que foi mostrado é o problema, pra cima ou pra baixo.
  if (cotacao.configVersao !== configVersaoAtual) return { ok: false, motivo: 'CONFIG_MUDOU' };
  return { ok: true, cotacao };
}

export const MENSAGEM_RECUSA_COTACAO: Record<MotivoRecusaCotacao, string> = {
  TOKEN_INVALIDO: 'O cálculo da entrega expirou. Confirme seu endereço para recalcular.',
  OUTRA_LOJA: 'O cálculo da entrega não corresponde a esta loja. Calcule novamente.',
  OUTRO_ENDERECO: 'O endereço mudou depois do cálculo. Confirme para recalcular a taxa.',
  CONFIG_MUDOU: 'A loja atualizou a taxa de entrega. Confira o novo valor antes de confirmar.',
};
