'use client';

import { criarClientNavegador } from '@/lib/supabase/client';
import type { CicloCobranca } from './tipos';
import type { PlanoLoja } from '@/lib/avaliacoes/tipos';

/**
 * As três ações administrativas passam por RPC `security definer` que
 * confere `is_admin()` no banco e grava auditoria. Não existe caminho
 * daqui que escreva direto nas tabelas — a policy de escrita é só do
 * admin e mesmo ele não teria como registrar o evento junto.
 *
 * Não existe "marcar como pago" de propósito: dinheiro só entra por
 * confirmação do gateway.
 */
async function chamar(nome: string, args: Record<string, unknown>) {
  const sb = criarClientNavegador();
  const { error } = await sb.rpc(nome, args);
  if (error) throw new Error(error.message);
}

export function alterarPlano(
  lojaId: string,
  plano: PlanoLoja,
  ciclo: CicloCobranca,
  valor: number,
  motivo: string
) {
  return chamar('admin_alterar_plano', {
    p_loja_id: lojaId,
    p_plano: plano,
    p_ciclo: ciclo,
    p_valor: valor,
    p_motivo: motivo,
  });
}

export function cancelarRenovacao(lojaId: string, motivo: string) {
  return chamar('admin_cancelar_renovacao', { p_loja_id: lojaId, p_motivo: motivo });
}

export function liberarAcesso(lojaId: string, ate: string, motivo: string) {
  return chamar('admin_liberar_acesso', { p_loja_id: lojaId, p_ate: ate, p_motivo: motivo });
}
