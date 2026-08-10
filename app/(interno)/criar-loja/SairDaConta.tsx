'use client';

import { useRouter } from 'next/navigation';
import { criarClientNavegador } from '@/lib/supabase/client';

/** Única saída de quem caiu aqui sem loja — sem isto a pessoa fica presa
 * na conta, porque todo o resto do painel exige uma loja. */
export function SairDaConta() {
  const router = useRouter();

  async function sair() {
    const sb = criarClientNavegador();
    await sb.auth.signOut();
    router.replace('/entrar');
    router.refresh();
  }

  return (
    <button type="button" className="btn-ghost" onClick={sair}>
      Sair da conta
    </button>
  );
}
