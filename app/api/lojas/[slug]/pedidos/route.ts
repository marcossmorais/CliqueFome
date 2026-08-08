import { NextRequest, NextResponse } from 'next/server';
import {
  ErroValidacaoCheckout,
  itensParaRpc,
  payloadCanonico,
  validarEntradaCheckout,
} from '@/lib/pedidos/checkout';
import { montarMensagemPedido } from '@/lib/pedidos/mensagemWhatsapp';
import { criarClientPrivilegiado, hashLimite, hashPayload } from '@/lib/pedidos/servidor';

export const runtime = 'nodejs';

const TAMANHO_MAXIMO_BYTES = 60_000;

function respostaErro(erro: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ erro, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } });
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
    return false;
  }
}

function ipDoCliente(request: NextRequest) {
  // Mesma leitura de x-forwarded-for já usada em app/api/delivery/cotacao —
  // a Vercel é o único proxy confiável na frente desta rota.
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
    return respostaErro('Dados inválidos.', 422);
  }

  let entrada;
  try {
    entrada = validarEntradaCheckout(corpoJson);
  } catch (erro) {
    if (erro instanceof ErroValidacaoCheckout) return respostaErro(erro.message, 422);
    return respostaErro('Dados inválidos.', 422);
  }

  if (!(await captchaValido(entrada.captchaToken))) {
    return respostaErro('Verificação de segurança falhou. Recarregue a página e tente de novo.', 422);
  }

  let sb;
  try {
    sb = criarClientPrivilegiado();
  } catch {
    return respostaErro('Pedido pelo site ainda não configurado. Fale pelo WhatsApp da loja.', 503);
  }

  const ip = ipDoCliente(request);
  let chaveIp: string;
  let chaveTelefone: string;
  try {
    chaveIp = hashLimite(`${ip}:${slug}`);
    chaveTelefone = hashLimite(`${entrada.clienteTelefone}:${slug}`);
  } catch {
    return respostaErro('Pedido pelo site ainda não configurado. Fale pelo WhatsApp da loja.', 503);
  }

  const payloadHash = hashPayload(payloadCanonico(entrada));

  const { data, error } = await sb.rpc('criar_pedido_publico_v1', {
    p_loja_slug: slug,
    p_cliente_nome: entrada.clienteNome,
    p_cliente_telefone: entrada.clienteTelefone,
    p_tipo: entrada.tipo,
    p_endereco: entrada.endereco ?? null,
    p_observacao: entrada.observacao ?? null,
    p_itens: itensParaRpc(entrada.itens),
    p_idempotency_key: entrada.idempotencyKey,
    p_payload_hash: payloadHash,
    p_total_esperado_centavos: entrada.totalEsperadoCentavos,
    p_chave_ip: chaveIp,
    p_chave_telefone: chaveTelefone,
  });

  if (error) {
    // Nunca repassar error.message inteiro sem checar: pode conter detalhe
    // interno do Postgres. Só os códigos que a própria RPC emite de
    // propósito (CART_CHANGED, RATE_LIMIT:*, IDEMPOTENCY_CONFLICT) viram
    // resposta específica; o resto vira mensagem genérica de validação —
    // que é segura porque criar_pedido() só levanta RAISE EXCEPTION com
    // texto pensado pra o cliente ler (mesma convenção do pedido manual).
    const msg = error.message || '';
    if (msg.includes('CART_CHANGED')) {
      return respostaErro(
        'O cardápio mudou desde que você montou o carrinho. Atualize a página e confira os itens antes de finalizar.',
        409,
        { codigo: 'CART_CHANGED' }
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
    // Mensagens de validação de negócio (nome, telefone, item esgotado,
    // pedido mínimo, delivery desligado etc.) — já pensadas pra tela.
    return respostaErro(msg || 'Não foi possível registrar o pedido.', 422);
  }

  const resultado = data as {
    id: string;
    numero: number;
    token: string;
    subtotal: number;
    taxa_entrega: number;
    total: number;
    replay: boolean;
  };

  const origem = request.nextUrl.origin;
  const trackingUrl = `${origem}/pedido/${resultado.token}`;

  const [{ data: loja }, { data: itensDb }] = await Promise.all([
    sb.from('lojas').select('whatsapp_numero').eq('slug', slug).maybeSingle(),
    sb
      .from('pedido_itens')
      .select('nome, quantidade, subtotal, observacao, pedido_item_opcoes(grupo_nome, nome, preco, quantidade)')
      .eq('pedido_id', resultado.id),
  ]);

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

  const mensagem = montarMensagemPedido({
    numero: resultado.numero,
    clienteNome: entrada.clienteNome,
    tipo: entrada.tipo,
    endereco: entrada.endereco ?? null,
    itens: itensMensagem,
    subtotal: Number(resultado.subtotal),
    taxaEntrega: Number(resultado.taxa_entrega),
    total: Number(resultado.total),
    trackingUrl,
  });

  const numeroWhats = (loja?.whatsapp_numero || '').replace(/\D/g, '');
  const urlWhatsapp = `https://wa.me/${numeroWhats}?text=${encodeURIComponent(mensagem)}`;

  return NextResponse.json(
    {
      pedido: {
        numero: resultado.numero,
        token: resultado.token,
        status: 'pendente',
        pagamento_status: 'pendente',
        subtotal: Number(resultado.subtotal),
        taxa_entrega: Number(resultado.taxa_entrega),
        total: Number(resultado.total),
        tracking_url: trackingUrl,
      },
      proxima_acao: { tipo: 'whatsapp', url: urlWhatsapp },
    },
    { status: resultado.replay ? 200 : 201, headers: { 'Cache-Control': 'no-store' } }
  );
}
