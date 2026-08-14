'use client';

import { useSyncExternalStore } from 'react';
import styles from './temaAdmin.module.css';

type Tema = 'light' | 'dark';
/** Compartilhados com AplicaTema — os dois precisam falar do mesmo tema. */
export const CHAVE_TEMA = 'cf_admin_theme';
export const EVENTO_TEMA = 'cf-admin-theme-change';

function assinarTema(atualizar: () => void) {
  window.addEventListener(EVENTO_TEMA, atualizar);
  return () => window.removeEventListener(EVENTO_TEMA, atualizar);
}

function lerTema(): Tema {
  return document.documentElement.dataset.adminTheme === 'dark' ? 'dark' : 'light';
}

function lerTemaServidor(): Tema {
  return 'light';
}

export function TemaAdmin({ flutuante = false }: { flutuante?: boolean }) {
  const tema = useSyncExternalStore(assinarTema, lerTema, lerTemaServidor);

  function alternar() {
    const proximo: Tema = tema === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.adminTheme = proximo;
    try {
      localStorage.setItem(CHAVE_TEMA, proximo);
    } catch {
      // O tema continua funcionando nesta navegação mesmo com storage bloqueado.
    }
    window.dispatchEvent(new Event(EVENTO_TEMA));
  }

  const escuro = tema === 'dark';
  return (
    <button
      type="button"
      className={`${styles.botao} ${flutuante ? styles.flutuante : ''}`}
      onClick={alternar}
      aria-pressed={escuro}
      aria-label={`${escuro ? 'Desativar' : 'Ativar'} modo escuro`}
      title={`${escuro ? 'Desativar' : 'Ativar'} modo escuro`}
    >
      <span aria-hidden="true" className={styles.icone}>{escuro ? '☀' : '☾'}</span>
      <span className={styles.rotulo}>Dark <b>{escuro ? 'ON' : 'OFF'}</b></span>
    </button>
  );
}
