import 'server-only';

import { criarClientPrivilegiado, hashLimite } from '@/lib/pedidos/servidor';

type Balde = { tentativas: number; reiniciaEm: number };

const globalComLimites = globalThis as typeof globalThis & {
  __limitesOperacaoDelivery?: Map<string, Balde>;
};

const limites =
  globalComLimites.__limitesOperacaoDelivery ??
  (globalComLimites.__limitesOperacaoDelivery = new Map<string, Balde>());

function chaveSegura(chave: string) {
  // HMAC com segredo server-side: mesmo que a tabela vaze, emails e IPs
  // comuns não podem ser recuperados por um dicionário de hashes.
  return hashLimite(chave);
}

export async function consumirLimitePersistente(
  chave: string,
  maximo: number,
  janelaMs: number
) {
  const sb = criarClientPrivilegiado();
  const { data, error } = await sb.rpc('consumir_cota_operacao_delivery_v1', {
    p_chave: chaveSegura(chave),
    p_limite: maximo,
    p_janela_segundos: Math.max(60, Math.ceil(janelaMs / 1_000)),
  });
  if (error) throw error;

  const resultado = data as {
    permitido?: boolean;
    tentar_em_segundos?: number;
  } | null;
  if (typeof resultado?.permitido !== 'boolean') {
    throw new Error('RESPOSTA_LIMITE_INVALIDA');
  }
  return {
    permitido: resultado.permitido,
    tentarEmSegundos: Number.isInteger(resultado.tentar_em_segundos)
      ? Math.max(0, Number(resultado.tentar_em_segundos))
      : 0,
  };
}

/**
 * Limite simples por instância da Function. É uma proteção adicional para
 * login e Supabase Auth Admin; a autorização/RLS continuam sendo a barreira
 * de segurança. Não guarda IP, email ou id de usuário em texto puro.
 */
export function consumirLimite(chave: string, maximo: number, janelaMs: number) {
  const agora = Date.now();
  if (limites.size > 5_000) {
    for (const [hash, balde] of limites) {
      if (balde.reiniciaEm <= agora) limites.delete(hash);
    }
    // Evita crescimento sem limite se alguém variar emails/identificadores
    // mais rápido do que a janela expira. Map preserva ordem de inserção.
    while (limites.size > 5_000) {
      const maisAntiga = limites.keys().next().value as string | undefined;
      if (!maisAntiga) break;
      limites.delete(maisAntiga);
    }
  }
  const hash = chaveSegura(chave);
  const atual = limites.get(hash);

  if (!atual || atual.reiniciaEm <= agora) {
    limites.set(hash, { tentativas: 1, reiniciaEm: agora + janelaMs });
    return { permitido: true as const, tentarEmSegundos: 0 };
  }

  if (atual.tentativas >= maximo) {
    return {
      permitido: false as const,
      tentarEmSegundos: Math.max(1, Math.ceil((atual.reiniciaEm - agora) / 1000)),
    };
  }

  atual.tentativas += 1;
  return { permitido: true as const, tentarEmSegundos: 0 };
}

export function ipDaRequisicao(request: Request) {
  // Em produção, a Vercel é o proxy confiável que define este cabeçalho.
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconhecido';
}
