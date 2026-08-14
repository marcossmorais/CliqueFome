'use client';

import { createContext, useContext, useState } from 'react';
import { useRouter } from 'next/navigation';
import { criarClientNavegador } from '@/lib/supabase/client';
import styles from './statusOperacional.module.css';

type EstadoOperacao = {
  lojaAberta: boolean;
  retirada: boolean;
};

type CampoOperacao = keyof EstadoOperacao;

type ContextoOperacao = EstadoOperacao & {
  salvando: CampoOperacao | null;
  erro: string | null;
  alterar: (campo: CampoOperacao, valor: boolean) => Promise<void>;
};

const OperacaoContext = createContext<ContextoOperacao | null>(null);

const COLUNA: Record<CampoOperacao, string> = {
  lojaAberta: 'recebendo_encomendas',
  retirada: 'retirada_ativa',
};

export function OperacaoProvider({
  lojaId,
  estadoInicial,
  children,
}: {
  lojaId: string;
  estadoInicial: EstadoOperacao;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [salvando, setSalvando] = useState<CampoOperacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Só o palpite otimista de enquanto o salvamento não voltou. A verdade é
  // sempre `estadoInicial`, que vem do servidor.
  const [otimista, setOtimista] = useState<EstadoOperacao | null>(null);

  /*
   * Antes isto era `useState(estadoInicial)` puro, que lê a prop uma vez e
   * nunca mais: quem mudava o status em outra tela via a loja fechar no
   * cardápio e a barra do topo continuar dizendo "aberta". O router.refresh()
   * trazia o dado novo, mas o estado local estava congelado.
   *
   * Comparar a chave durante o render é o jeito que o React documenta pra
   * reagir a mudança de prop — sem efeito, sem render extra comitado. Assim
   * que o servidor reporta um valor diferente do que estávamos exibindo, o
   * palpite otimista é descartado.
   */
  const chaveServidor = `${estadoInicial.lojaAberta}:${estadoInicial.retirada}`;
  const [ultimaChave, setUltimaChave] = useState(chaveServidor);
  if (chaveServidor !== ultimaChave) {
    setUltimaChave(chaveServidor);
    setOtimista(null);
  }

  const estado = otimista ?? estadoInicial;

  async function alterar(campo: CampoOperacao, valor: boolean) {
    if (salvando) return;
    const proximo = { ...estado, [campo]: valor };
    const alteracoesBanco = { [COLUNA[campo]]: valor };

    setOtimista(proximo);
    setSalvando(campo);
    setErro(null);

    const sb = criarClientNavegador();
    const { error } = await sb
      .from('lojas')
      .update(alteracoesBanco)
      .eq('id', lojaId);

    if (error) {
      setOtimista(null);
      setErro('Não foi possível alterar o status. Tente novamente.');
    } else {
      router.refresh();
    }
    setSalvando(null);
  }

  return (
    <OperacaoContext.Provider value={{ ...estado, salvando, erro, alterar }}>
      {children}
    </OperacaoContext.Provider>
  );
}

function useOperacao() {
  const contexto = useContext(OperacaoContext);
  if (!contexto) throw new Error('StatusOperacional precisa estar dentro de OperacaoProvider.');
  return contexto;
}

function Controle({ campo, nome, icone }: { campo: CampoOperacao; nome: string; icone: string }) {
  const operacao = useOperacao();
  const ativo = operacao[campo];
  const ocupado = operacao.salvando !== null;

  return (
    <label className={styles.controle}>
      <span className={styles.controleTexto}>
        <span aria-hidden="true">{icone}</span>
        <span><strong>{nome}</strong><small>{ativo ? 'Ativo' : 'Pausado'}</small></span>
      </span>
      <span className={styles.switch}>
        <input
          type="checkbox"
          checked={ativo}
          disabled={ocupado}
          onChange={(evento) => void operacao.alterar(campo, evento.target.checked)}
          aria-label={`${ativo ? 'Desativar' : 'Ativar'} ${nome.toLowerCase()}`}
        />
        <span />
      </span>
    </label>
  );
}

function ResumoStatus() {
  const operacao = useOperacao();
  return (
    <span className={styles.resumo}>
      <span className={operacao.lojaAberta ? styles.online : styles.offline}>● <b>{operacao.lojaAberta ? 'Aberta' : 'Pausada'}</b></span>
      <span>🛍 <b>{operacao.retirada ? 'ON' : 'OFF'}</b></span>
    </span>
  );
}

export function StatusOperacional({
  variante = 'compacto',
  popoverId = 'status-operacional-popover',
}: {
  variante?: 'compacto' | 'painel';
  popoverId?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const operacao = useOperacao();

  if (variante === 'painel') {
    return (
      <div className={styles.painel}>
        <div className={styles.painelTopo}>
          <div>
            <span className={styles.sobretitulo}>Status da operação</span>
            <strong>{operacao.lojaAberta ? 'Sua loja está aberta' : 'Sua loja está pausada'}</strong>
          </div>
          <ResumoStatus />
        </div>
        <div className={styles.gradeControles}>
          <Controle campo="lojaAberta" nome="Loja aberta" icone="●" />
          <Controle campo="retirada" nome="Retirada" icone="🛍" />
        </div>
        {operacao.erro && <p className={styles.erro} role="alert">{operacao.erro}</p>}
      </div>
    );
  }

  return (
    <div className={styles.compacto}>
      <button
        type="button"
        className={styles.gatilho}
        aria-expanded={aberto}
        aria-controls={popoverId}
        onClick={() => setAberto((valor) => !valor)}
      >
        <ResumoStatus />
        <span aria-hidden="true" className={styles.seta}>{aberto ? '▴' : '▾'}</span>
      </button>
      {aberto && (
        <div id={popoverId} className={styles.popover}>
          <div className={styles.popoverTitulo}>
            <strong>Status da loja</strong>
            <button type="button" onClick={() => setAberto(false)} aria-label="Fechar status">×</button>
          </div>
          <Controle campo="lojaAberta" nome="Loja aberta" icone="●" />
          <Controle campo="retirada" nome="Retirada" icone="🛍" />
          {operacao.erro && <p className={styles.erro} role="alert">{operacao.erro}</p>}
        </div>
      )}
    </div>
  );
}
