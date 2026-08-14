'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { CHAVE_TEMA, EVENTO_TEMA } from './TemaAdmin';

/**
 * Reforço do script de tema do layout `(interno)`.
 *
 * Aquele script é inline via `dangerouslySetInnerHTML`, e o navegador NÃO
 * executa script inserido assim — só o que vem no HTML de uma carga real de
 * documento. Quem entrava no painel por navegação client-side (landing →
 * "Acessar conta" → login → dashboard) ficava com o tema errado: o painel
 * abria claro mesmo com o sistema em escuro, e só o F5 "acertava" sozinho.
 *
 * Recalcula a cada rota, e não só na montagem, porque a resposta certa muda
 * de rota pra rota: `/entrar` é sempre claro, o painel segue a preferência
 * salva ou a do sistema. Sem isso, quem chegasse ao painel vindo do login
 * herdava o claro forçado da tela de login.
 *
 * Não substitui o script — ele continua sendo quem evita o flash na primeira
 * pintura; este componente cobre só o caminho em que o script não roda. Como
 * mexe apenas num atributo do <html>, fora da árvore que o React renderiza,
 * não gera divergência de hidratação.
 */
export function AplicaTema() {
  const pathname = usePathname();

  useEffect(() => {
    const ehAuth = /^\/entrar(\/|$)/.test(pathname);

    let salvo: string | null = null;
    try {
      salvo = localStorage.getItem(CHAVE_TEMA);
    } catch {
      // Storage bloqueado: cai na preferência do sistema, como o script faz.
    }

    const tema = ehAuth
      ? 'light'
      : salvo === 'dark' || salvo === 'light'
      ? salvo
      : window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';

    if (document.documentElement.dataset.adminTheme === tema) return;
    document.documentElement.dataset.adminTheme = tema;
    // Mantém o botão de alternar em sincronia — ele lê o atributo por
    // useSyncExternalStore e só reavalia neste evento.
    window.dispatchEvent(new Event(EVENTO_TEMA));
  }, [pathname]);

  return null;
}
