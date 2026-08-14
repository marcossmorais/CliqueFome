import { NextRequest, NextResponse } from 'next/server';
import {
  ErroValidacaoCheckout,
  itensParaRpc,
  payloadCanonico,
  validarEntradaCheckout,
  type PedidoCheckoutEntrada,
} from '@/lib/pedidos/checkout';
import { montarMensagemPedido } from '@/lib/pedidos/mensagemWhatsapp';
import { criarClientPrivilegiado, hashLimite, hashPayload } from '@/lib/pedidos/servidor';
import { logger } from '@/lib/observabilidade/logger';
import { normalizarTelefoneBrasil } from '@/lib/clientes/telefone';
import { aplicarCookieSessaoCliente, prepararSessaoCliente } from '@/lib/clientes/sessao-servidor';

export const runtime = 'nodejs';

const ROTA = '/api/lojas/[slug]/pedidos';

const TAMANHO_MAXIMO_BYTES = 60_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type EntradaPedido =
  | (PedidoCheckoutEntrada & { tipo: 'retirada'; quoteId: null })
  | (Omit<PedidoCheckoutEntrada, 'tipo'> & { tipo: 'delivery'; quoteId: string });

function validarEntradaPedido(corpo: unknown): EntradaPedido {
  const objeto = corpo && typeof corpo === 'object' ? corpo as Record<string, unknown> : null;
  if (objeto?.tipo !== 'delivery') {
    return { ...validarEntradaCheckout(corpo), quoteId: null };
  }

  const base = validarEntradaCheckout({ ...objeto, tipo: 'retirada' });
  const quoteId = String(objeto.quoteId ?? '');
  if (!UUID_RE.test(quoteId)) throw new ErroValidacaoCheckout('A taxa de entrega precisa ser recalculada.');
  if (base.formaPagamento === 'pagamento_retirada') {
    throw new ErroValidacaoCheckout('Escolha uma forma de pagamento válida para a entrega.');
  }
  return { ...base, tipo: 'delivery', quoteId };
}

function payloadCanonicoPedido(entrada: EntradaPedido) {
  if (entrada.tipo === 'retirada') return payloadCanonico(entrada);
  const baseRetirada: PedidoCheckoutEntrada = { ...entrada, tipo: 'retirada' };
  const base = JSON.parse(payloadCanonico(baseRetirada)) as Record<string, unknown>;
  return JSON.stringify({ ...base, tipo: 'delivery', quoteId: entrada.quoteId });
}

function respostaErro(erro: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ erro, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function mensagemNegocioSegura(mensagem: string) {
  if (mensagem.includes('Informe o nome') || mensagem.includes('Nome muito longo')) {
    return 'Informe corretamente o nome de quem está pedindo.';
  }
  if (mensagem.includes('telefone') || mensagem.includes('Telefone')) {
    return 'Informe um telefone válido com DDD.';
  }
  if (mensagem.includes('pedido esta vazio') || mensagem.includes('Pedido com itens demais')) {
    return 'Confira os itens do pedido.';
  }
  if (mensagem.includes('Produto indisponivel')) {
    return 'Um produto do carrinho não está mais disponível.';
  }
  if (
    mensagem.includes('Complemento') ||
    mensagem.includes('complemento') ||
    mensagem.includes('opcao') ||
    mensagem.includes('Escolha pelo menos') ||
    mensagem.includes('Escolha no maximo') ||
    mensagem.includes('Nao e permitido repetir')
  ) {
    return 'Confira as opções escolhidas nos produtos.';
  }
  if (mensagem.includes('Quantidade invalida') || mensagem.includes('Preco invalido')) {
    return 'O carrinho contém uma quantidade ou preço inválido.';
  }
  if (mensagem.includes('pedido minimo')) {
    return 'O pedido não atingiu o valor mínimo da loja.';
  }
  if (mensagem.includes('Forma de pagamento')) {
    return 'Escolha uma forma de pagamento válida.';
  }
  if (mensagem.includes('Observacao muito longa') || mensagem.includes('Endereco muito longo')) {
    return 'Revise os dados informados antes de continuar.';
  }
  if (mensagem.includes('Loja nao encontrada')) return 'Loja não encontrada.';
  if (mensagem.includes('loja esta fechada') || mensagem.includes('nao esta recebendo')) {
    return 'A loja não está recebendo pedidos no momento.';
  }
  if (mensagem.includes('retirada esta indisponivel')) {
    return 'A retirada está indisponível no momento.';
  }
  if (mensagem.includes('Delivery indisponivel')) {
    return 'O Delivery está indisponível no momento.';
  }
  if (mensagem.includes('Requisicao') || mensagem.includes('Pedidos do site')) {
    return 'Dados do pedido inválidos.';
  }
  return null;
}

/** Cloudflare Turnstile é opcional: sem TURNSTILE_SECRET_KEY configurada, a
 * checagem é pulada (documentado em docs/PENDING_TASKS.md — a defesa atual
 * contra abuso são os limites no banco, não CAPTCHA). Quando a chave existir,
 * passa a ser obrigatória de verdade, validada aqui no servidor. */
async function captchaValido(token: string | undefined) {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return true;
  if (!token) return false;
  try {
    const resposta = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(5000),
    });
    const dados = (await resposta.json().catch(() => null)) as { success?: boolean } | null;
    return dados?.success === true;
  } catch {
    logger.error({ rota: ROTA }, 'Falha ao verificar captcha (Turnstile) — tratando como inválido');
    return false;
  }
}

function ipDoCliente(request: NextRequest) {
  // A Vercel é o único proxy confiável na frente desta rota.
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconhecido';
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  // Kill switch de rollback: desliga o checkout público sem tocar no banco
  // nem reverter deploy (ver ROLLBACK em schema-migracao-checkout-publico.sql).
  if (process.env.CHECKOUT_PUBLICO_ATIVO === 'false') {
    return respostaErro('Pedido pelo site está temporariamente indisponível. Fale pelo WhatsApp da loja.', 503);
  }

  const { slug } = await params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) {
    return respostaErro('Loja não encontrada.', 404);
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return respostaErro('Content-Type precisa ser application/json.', 415);
  }

  const bruto = await request.text();
  if (bruto.length > TAMANHO_MAXIMO_BYTES) {
    return respostaErro('Pedido grande demais.', 413);
  }

  let corpoJson: unknown;
  try {
    corpoJson = JSON.parse(bruto);
  } catch {
    logger.warn({ rota: ROTA, lojaSlug: slug }, 'JSON malformado no corpo do pedido');
    return respostaErro('Dados inválidos.', 422);
  }

  let entrada;
  try {
    entrada = validarEntradaPedido(corpoJson);
  } catch (erro) {
    if (erro instanceof ErroValidacaoCheckout) return respostaErro(erro.message, 422);
    logger.error({ rota: ROTA, lojaSlug: slug }, 'Falha inesperada ao validar entrada do checkout');
    return respostaErro('Dados inválidos.', 422);
  }

  if (!(await captchaValido(entrada.captchaToken))) {
    return respostaErro('Verificação de segurança falhou. Recarregue a página e tente de novo.', 422);
  }

  let sb;
  try {
    sb = criarClientPrivilegiado();
  } catch {
    logger.error({ rota: ROTA, lojaSlug: slug }, 'Falha ao criar client privilegiado do Supabase');
    return respostaErro('Pedido pelo site ainda não configurado. Fale pelo WhatsApp da loja.', 503);
  }

  // A interface esconder uma opção é apenas UX. O servidor confere o
  // estado operacional de novo para impedir POST manual em loja fechada.
  const { data: lojaOperacao, error: erroLojaOperacao } = await sb
    .from('lojas')
    .select('id, whatsapp_numero, recebendo_encomendas, retirada_ativa')
    .eq('slug', slug)
    .maybeSingle();
  if (erroLojaOperacao) {
    logger.error(
      { codigo: erroLojaOperacao.code, rota: ROTA, lojaSlug: slug },
      'Falha ao consultar estado operacional da loja'
    );
    return respostaErro('Não foi possível confirmar se a loja está aberta. Tente novamente.', 503);
  }
  if (!lojaOperacao) return respostaErro('Loja não encontrada.', 404);
  if (!lojaOperacao.recebendo_encomendas) {
    return respostaErro('A loja está fechada e não está recebendo pedidos no momento.', 409);
  }
  if (entrada.tipo === 'retirada' && !lojaOperacao.retirada_ativa) {
    return respostaErro('A retirada está indisponível no momento.', 409);
  }

  const ip = ipDoCliente(request);
  let chaveIp: string;
  let chaveTelefone: string;
  try {
    chaveIp = hashLimite(`${ip}:${slug}`);
    chaveTelefone = hashLimite(`${entrada.clienteTelefone}:${slug}`);
  } catch {
    logger.error({ rota: ROTA, lojaSlug: slug }, 'Falha ao gerar hash de limite de pedidos');
    return respostaErro('Pedido pelo site ainda não configurado. Fale pelo WhatsApp da loja.', 503);
  }

  const payloadHash = hashPayload(payloadCanonicoPedido(entrada));
  const parametrosComuns = {
    p_loja_slug: slug,
    p_cliente_nome: entrada.clienteNome,
    p_cliente_telefone: entrada.clienteTelefone,
    p_observacao: entrada.observacao ?? null,
    p_forma_pagamento: entrada.formaPagamento,
    p_itens: itensParaRpc(entrada.itens),
    p_idempotency_key: entrada.idempotencyKey,
    p_payload_hash: payloadHash,
    p_total_esperado_centavos: entrada.totalEsperadoCentavos,
    p_chave_ip: chaveIp,
    p_chave_telefone: chaveTelefone,
  };
  const chamada = entrada.tipo === 'delivery'
    ? sb.rpc('criar_pedido_publico_delivery_v1', {
        p_loja_slug: parametrosComuns.p_loja_slug,
        p_cliente_nome: parametrosComuns.p_cliente_nome,
        p_cliente_telefone: parametrosComuns.p_cliente_telefone,
        p_observacao: parametrosComuns.p_observacao,
        p_forma_pagamento: parametrosComuns.p_forma_pagamento,
        p_itens: parametrosComuns.p_itens,
        p_quote_id: entrada.quoteId,
        p_idempotency_key: parametrosComuns.p_idempotency_key,
        p_payload_hash: parametrosComuns.p_payload_hash,
        p_total_esperado_centavos: parametrosComuns.p_total_esperado_centavos,
        p_chave_ip: parametrosComuns.p_chave_ip,
        p_chave_telefone: parametrosComuns.p_chave_telefone,
      })
    : sb.rpc('criar_pedido_publico_retirada_v1', parametrosComuns);
  const { data, error } = await chamada;

  if (error) {
    // Nunca repassar error.message inteiro sem checar: pode conter detalhe
    // interno do Postgres. Só os códigos que a própria RPC emite de
    // propósito (CART_CHANGED, RATE_LIMIT:*, IDEMPOTENCY_CONFLICT) viram
    // resposta específica; o resto vira mensagem genérica de validação —
    // que é segura porque criar_pedido() só levanta RAISE EXCEPTION com
    // texto pensado pra o cliente ler (mesma convenção do pedido manual).
    const msg = error.message || '';
    if (error.code === 'PGRST202' || msg.includes('criar_pedido_publico_retirada_v1') || msg.includes('criar_pedido_publico_delivery_v1')) {
      return respostaErro('O checkout está sendo atualizado. Tente novamente em alguns minutos.', 503);
    }
    if (msg.includes('CART_CHANGED')) {
      return respostaErro(
        'O cardápio mudou desde que você montou o carrinho. Atualize a página e confira os itens antes de finalizar.',
        409,
        { codigo: 'CART_CHANGED' }
      );
    }
    if (msg.includes('DELIVERY_QUOTE_STALE')) {
      return respostaErro(
        'A taxa de entrega precisa ser recalculada.',
        409,
        { codigo: 'DELIVERY_QUOTE_STALE' }
      );
    }
    if (msg.includes('IDEMPOTENCY_CONFLICT')) {
      return respostaErro('Esta tentativa de pedido já foi usada com dados diferentes. Recarregue e tente de novo.', 409);
    }
    if (msg.includes('RATE_LIMIT')) {
      return respostaErro('Muitos pedidos em pouco tempo. Aguarde alguns minutos e tente de novo.', 429);
    }
    if (msg.includes('Pedido ainda sendo processado')) {
      return respostaErro('Seu pedido ainda está sendo processado. Aguarde alguns segundos.', 409);
    }
    if (msg.includes('SUPABASE_SERVICE_ROLE') || msg.includes('SEGREDO_CHECKOUT')) {
      return respostaErro('Pedido pelo site ainda não configurado. Fale pelo WhatsApp da loja.', 503);
    }
    const mensagemSegura = mensagemNegocioSegura(msg);
    if (mensagemSegura) return respostaErro(mensagemSegura, 422);

    // Erro desconhecido nunca atravessa a fronteira pública. O código basta
    // para diagnóstico sem colocar endereço, telefone ou detalhe SQL em log.
    logger.error(
      { codigo: error.code, rota: ROTA, lojaSlug: slug },
      'Falha não classificada ao registrar pedido público'
    );
    return respostaErro('Não foi possível registrar o pedido. Tente novamente.', 500);
  }

  const resultado = data as {
    id: string;
    numero: number;
    token: string;
    subtotal: number;
    total: number;
    replay: boolean;
    forma_pagamento: string;
    pagamento_status: string;
    delivery_fee_cents?: number;
  };

  const origem = request.nextUrl.origin;
  const trackingUrl = `${origem}/pedido/${resultado.token}`;

  // Quem numera é o trigger cf_numerar_pedido, dentro da transação do insert.
  // O `numero` que a função devolve é o que ela calculou antes disso — um
  // palpite. O que vale é a linha gravada. Ver a migração
  // 20260813150000_numeracao_operacional_por_dia.sql.
  const { data: pedidoDb } = await sb
    .from('pedidos')
    .select('numero')
    .eq('id', resultado.id)
    .maybeSingle();
  const numeroPedidoGravado = pedidoDb?.numero ?? resultado.numero;

  const { data: itensDb } = await sb
    .from('pedido_itens')
    .select('nome, quantidade, subtotal, observacao, pedido_item_opcoes(grupo_nome, nome, preco, quantidade)')
    .eq('pedido_id', resultado.id);

  const itensMensagem = (itensDb || []).map((item) => ({
    nome: item.nome as string,
    quantidade: item.quantidade as number,
    subtotal: Number(item.subtotal),
    observacao: item.observacao as string | null,
    opcoes: ((item.pedido_item_opcoes as unknown[]) || []).map((op) => {
      const o = op as { grupo_nome: string; nome: string; preco: number; quantidade: number };
      return { grupo: o.grupo_nome, nome: o.nome, preco: Number(o.preco), quantidade: o.quantidade };
    }),
  }));

  const mensagemBase = montarMensagemPedido({
    numero: numeroPedidoGravado,
    clienteNome: entrada.clienteNome,
    itens: itensMensagem,
    total: Number(resultado.total),
    trackingUrl,
    formaPagamento: entrada.formaPagamento,
  });
  const mensagem = entrada.tipo === 'delivery'
    ? mensagemBase.replace('Retirada no local', 'Delivery')
    : mensagemBase;

  const numeroWhats = (lojaOperacao.whatsapp_numero || '').replace(/\D/g, '');
  const urlWhatsapp = numeroWhats ? `https://wa.me/${numeroWhats}?text=${encodeURIComponent(mensagem)}` : null;

  const resposta = NextResponse.json(
    {
      pedido: {
        numero: numeroPedidoGravado,
        token: resultado.token,
        status: 'pendente',
        tipo: entrada.tipo,
        pagamento_status: resultado.pagamento_status,
        forma_pagamento: resultado.forma_pagamento,
        subtotal: Number(resultado.subtotal),
        total: Number(resultado.total),
        tracking_url: trackingUrl,
      },
      proxima_acao: urlWhatsapp ? { tipo: 'whatsapp', url: urlWhatsapp } : null,
    },
    { status: resultado.replay ? 200 : 201, headers: { 'Cache-Control': 'no-store' } }
  );

  // A sessão nasce somente depois que o pedido existe. Falhar ao criar o
  // cookie não desfaz uma compra já confirmada; o cliente ainda conserva o
  // link individual de acompanhamento devolvido acima.
  const telefoneNormalizado = normalizarTelefoneBrasil(entrada.clienteTelefone);
  if (telefoneNormalizado) {
    try {
      const cookieSessao = await prepararSessaoCliente(sb, request, {
        lojaId: lojaOperacao.id,
        lojaSlug: slug,
        telefoneNormalizado,
      });
      aplicarCookieSessaoCliente(resposta, cookieSessao);
    } catch (erroSessao) {
      logger.error(
        { rota: ROTA, lojaSlug: slug, tipoErro: erroSessao instanceof Error ? erroSessao.name : 'desconhecido' },
        'Pedido criado, mas não foi possível preparar a sessão do cliente'
      );
    }
  }

  return resposta;
}
