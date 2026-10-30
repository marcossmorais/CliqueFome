'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import styles from './avisoCookies.module.css';

/**
 * Aviso e preferências de cookies das páginas institucionais (landing e
 * documentos legais). NÃO entra no cardápio público: lá é whitelabel, e o
 * aviso carrega a marca FlouFood.
 *
 * Hoje o site só usa o essencial (sessão, segurança, carrinho). A categoria
 * de medição existe pra que a escolha já esteja registrada no dia em que um
 * analytics entrar — e esse analytics precisa consultar `consentiuMedicao()`
 * antes de carregar, nunca o contrário.
 *
 * Mudou o que é coletado? Suba VERSAO: escolhas antigas deixam de valer e o
 * aviso volta a aparecer.
 */

const CHAVE = 'ff_consentimento_cookies';
const VERSAO = 1;
const EVENTO_ABRIR = 'floufood:abrir-preferencias-cookies';

type Consentimento = { versao: number; medicao: boolean; em: string };

function consentimentoValido(valor: unknown): boolean {
  if (valor === null) return true;
  const c = valor as Consentimento;
  return !!c && typeof c === 'object' && typeof c.medicao === 'boolean' && typeof c.versao === 'number';
}

/** Pra quem um dia carregar script de medição: só com isto `true`. */
export function consentiuMedicao(): boolean {
  try {
    const c = JSON.parse(localStorage.getItem(CHAVE) ?? 'null') as Consentimento | null;
    return !!c && c.versao === VERSAO && c.medicao;
  } catch {
    return false;
  }
}

export function abrirPreferenciasCookies() {
  window.dispatchEvent(new Event(EVENTO_ABRIR));
}

export function AvisoCookies() {
  const [consentimento, setConsentimento] = useLocalStorage<Consentimento | null>(CHAVE, null, consentimentoValido);
  const [personalizando, setPersonalizando] = useState(false);
  const [reaberto, setReaberto] = useState(false);
  const [medicao, setMedicao] = useState(false);

  useEffect(() => {
    function abrir() {
      setMedicao(consentiuMedicao());
      setPersonalizando(true);
      setReaberto(true);
    }
    window.addEventListener(EVENTO_ABRIR, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR, abrir);
  }, []);

  const escolhido = consentimento !== null && consentimento.versao === VERSAO;
  if (escolhido && !reaberto) return null;

  function salvar(comMedicao: boolean) {
    setConsentimento({ versao: VERSAO, medicao: comMedicao, em: new Date().toISOString() });
    setPersonalizando(false);
    setReaberto(false);
  }

  return (
    <div className={styles.aviso} role="dialog" aria-modal="false" aria-labelledby="aviso-cookies-titulo">
      <div className={styles.topo}>
        <span className={styles.icone} aria-hidden="true">🍪</span>
        <div>
          <strong id="aviso-cookies-titulo">Sua privacidade importa</strong>
          <p>
            Usamos cookies essenciais pra manter seu login, a segurança e o carrinho funcionando. Cookies de
            medição são opcionais e só entram com a sua permissão.{' '}
            <Link href="/cookies">Política de Cookies</Link>
          </p>
        </div>
      </div>

      {personalizando && (
        <div className={styles.categorias}>
          <label className={styles.categoria}>
            <span>
              <strong>Essenciais</strong>
              <small>Login, segurança, preferências de tela e carrinho. Sem eles o site não funciona.</small>
            </span>
            <input type="checkbox" checked disabled aria-label="Cookies essenciais, sempre ativos" />
          </label>
          <label className={styles.categoria}>
            <span>
              <strong>Medição e desempenho</strong>
              <small>Estatísticas de uso pra melhorar o site. Hoje nenhuma ferramenta desse tipo está ativa.</small>
            </span>
            <input type="checkbox" checked={medicao} onChange={(e) => setMedicao(e.target.checked)} />
          </label>
        </div>
      )}

      <div className={styles.acoes}>
        {personalizando ? (
          <button type="button" className={styles.primario} onClick={() => salvar(medicao)}>
            Salvar preferências
          </button>
        ) : (
          <>
            <button type="button" className={styles.secundario} onClick={() => setPersonalizando(true)}>
              Personalizar
            </button>
            <button type="button" className={styles.secundario} onClick={() => salvar(false)}>
              Só essenciais
            </button>
            <button type="button" className={styles.primario} onClick={() => salvar(true)}>
              Aceitar todos
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Link "Preferências de cookies" do rodapé — reabre o aviso. */
export function BotaoPreferenciasCookies({ className }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={abrirPreferenciasCookies}>
      Preferências de cookies
    </button>
  );
}
