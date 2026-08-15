import 'server-only';

import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';

import { logger } from '@/lib/observabilidade/logger';
import { criarClientServidor } from '@/lib/supabase/server';
import { criarClientPrivilegiado } from '@/lib/pedidos/servidor';
import { consumirLimitePersistente } from '@/lib/delivery/operacao-rate-limit';
import { ErroCadastro, slugDoNome, slugReservado, type EtapaCadastro } from './dados';

/**
 * Lado servidor do cadastro. Duas responsabilidades:
 *
 *  1. Resolver QUEM está pedindo — sempre pela sessão, nunca por um id que
 *     tenha vindo no corpo da requisição. Nenhuma rota deste fluxo aceita
 *     `store_id`: a loja é descoberta a partir do usuário autenticado, o que
 *     torna impossível um dono escrever na loja de outro mesmo forjando o
 *     JSON.
 *  2. Escrever com o client privilegiado, depois dessa checagem. `lojas` tem
 *     policy de insert por `dono_id = auth.uid()`, mas slug único, reserva de
 *     nome e quota por usuário são regras que o navegador não pode arbitrar.
 */

export class ErroCadastroApi extends Error {
  constructor(
    message: string,
    readonly status = 422
  ) {
    super(message);
    this.name = 'ErroCadastroApi';
  }
}

export function respostaJson(dados: unknown, status = 200) {
  return NextResponse.json(dados, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Erro esperado (validação, sessão ausente, limite) responde com a própria
 * mensagem e NÃO vira log de erro — seria ruído: são o caminho normal de quem
 * digita algo errado. Só o que sobra é registrado, e sem o corpo da
 * requisição, que carrega endereço e telefone.
 */
export function respostaDeErro(erro: unknown, mensagemPadrao: string, rota: string) {
  if (erro instanceof ErroCadastroApi) return respostaJson({ erro: erro.message }, erro.status);
  // ErroCadastro é validação de campo: o texto já é a mensagem do usuário.
  if (erro instanceof ErroCadastro) return respostaJson({ erro: erro.message }, 422);
  logger.error({ rota }, 'Falha inesperada no cadastro da loja');
  return respostaJson({ erro: mensagemPadrao }, 500);
}

export async function lerCorpo(request: Request, limiteBytes = 4_000) {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new ErroCadastroApi('Content-Type precisa ser application/json.', 415);
  }
  const texto = await request.text();
  if (texto.length > limiteBytes) throw new ErroCadastroApi('Dados grandes demais.', 413);
  let valor: unknown;
  try {
    valor = JSON.parse(texto);
  } catch {
    throw new ErroCadastroApi('Dados inválidos.');
  }
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new ErroCadastroApi('Dados inválidos.');
  }
  return valor as Record<string, unknown>;
}

/** Usuário da sessão. É o único elo entre a requisição e uma loja. */
export async function autorizarCadastro() {
  const sb = await criarClientServidor();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new ErroCadastroApi('Faça login para continuar o cadastro.', 401);
  return user.id;
}

export type LojaEmCadastro = {
  id: string;
  slug: string;
  nome: string;
  onboarding_etapa: EtapaCadastro;
};

/**
 * Loja do usuário logado — sempre a mais antiga.
 *
 * O cadastro cria no máximo uma loja por conta. Se um dia existir dono com
 * duas (o super admin faz isso hoje), o onboarding não é o lugar de escolher
 * entre elas: quem já tem loja pronta é mandado pro painel.
 */
export async function lojaDoUsuario(userId: string): Promise<LojaEmCadastro | null> {
  const sb = criarClientPrivilegiado();
  const { data, error } = await sb
    .from('lojas')
    .select('id, slug, nome, onboarding_etapa')
    .eq('dono_id', userId)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as LojaEmCadastro) ?? null;
}

/**
 * Slug livre a partir do nome.
 *
 * Consulta os candidatos de uma vez em vez de um SELECT por tentativa. A
 * corrida entre duas contas cadastrando "Pizzaria do Zé" no mesmo instante
 * não é resolvida aqui e nem precisa: o `unique` da coluna recusa a segunda,
 * e quem insere tenta de novo com sufixo aleatório.
 */
async function slugLivre(nome: string) {
  const base = slugDoNome(nome);
  const candidatos = [
    ...(slugReservado(base) ? [] : [base]),
    ...Array.from({ length: 8 }, (_, i) => `${base}-${i + 2}`),
  ];

  const sb = criarClientPrivilegiado();
  const { data, error } = await sb.from('lojas').select('slug').in('slug', candidatos);
  if (error) throw error;

  const ocupados = new Set((data ?? []).map((linha) => (linha as { slug: string }).slug));
  const livre = candidatos.find((slug) => !ocupados.has(slug));
  return livre ?? `${base}-${randomBytes(3).toString('hex')}`;
}

/**
 * Cria (ou atualiza) a loja da etapa 2.
 *
 * Idempotente de propósito: voltar um passo e avançar de novo, ou um duplo
 * clique no botão, tem que corrigir a mesma loja em vez de criar uma segunda.
 * O slug é decidido na criação e nunca muda depois — ele já é o link público
 * que o dono pode ter compartilhado.
 */
export async function salvarLojaDoCadastro(
  userId: string,
  dados: { nome: string; categoria: string; whatsapp: string }
): Promise<LojaEmCadastro> {
  const existente = await lojaDoUsuario(userId);
  const sb = criarClientPrivilegiado();

  const campos = {
    nome: dados.nome,
    nicho: dados.categoria,
    whatsapp_numero: dados.whatsapp,
  };

  if (existente) {
    if (existente.onboarding_etapa === 'DONE') {
      throw new ErroCadastroApi('Esta conta já tem uma loja ativa.', 409);
    }
    const { data, error } = await sb
      .from('lojas')
      .update(campos)
      .eq('id', existente.id)
      // Redundante com o `eq('id')` acima e mantido de propósito: o client
      // privilegiado ignora RLS, então o filtro por dono é a última barreira
      // caso o id venha errado de uma futura mudança neste arquivo.
      .eq('dono_id', userId)
      .select('id, slug, nome, onboarding_etapa')
      .single();
    if (error) throw error;
    return data as LojaEmCadastro;
  }

  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    const slug = await slugLivre(dados.nome);
    const { data, error } = await sb
      .from('lojas')
      .insert({ ...campos, slug, dono_id: userId, onboarding_etapa: 'ADDRESS' })
      .select('id, slug, nome, onboarding_etapa')
      .single();
    // 23505 = slug tomado entre a consulta e o insert. Tenta outro.
    if (error?.code === '23505') continue;
    if (error) throw error;
    return data as LojaEmCadastro;
  }
  throw new ErroCadastroApi('Não foi possível reservar o endereço da sua loja. Tente de novo.', 409);
}

/**
 * Limite por conta. Cadastro é fluxo de uma vez só: quem bate nestes números
 * está tentando outra coisa. A janela é curta o bastante pra não punir quem
 * corrigiu o endereço três vezes.
 */
export async function limitarCadastro(userId: string, escopo: string, maximo: number) {
  const limite = await consumirLimitePersistente(`cadastro:${escopo}:${userId}`, maximo, 15 * 60_000);
  if (!limite.permitido) {
    throw new ErroCadastroApi('Muitas tentativas em pouco tempo. Aguarde alguns minutos.', 429);
  }
}
