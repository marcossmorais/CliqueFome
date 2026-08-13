'use client';

import { useEffect, useRef } from 'react';

/**
 * Confirmação de ação destrutiva.
 *
 * Substitui o `confirm()` nativo, que o navegador desenha fora da página
 * (fonte do sistema, sem a marca, e no Chrome com a opção de silenciar
 * diálogos futuros — quem clica nela apaga sem confirmação nenhuma dali em
 * diante).
 *
 * Nasce por cima de um modal já aberto, e o modal de baixo também escuta
 * Escape em `document` (useEscFechar). Por isso o listener daqui é de
 * captura + stopImmediatePropagation: sem isso, uma tecla fecharia a
 * confirmação e o modal inteiro de uma vez só.
 */
export function DialogoConfirmar({
  titulo,
  mensagem,
  aviso,
  erro,
  textoConfirmar,
  emAndamento,
  onConfirmar,
  onCancelar,
}: {
  titulo: string;
  mensagem: string;
  aviso?: string;
  /** Falha da própria ação. Aparece aqui dentro porque a faixa de recado do
   *  painel fica atrás do modal e ninguém a enxergaria. */
  erro?: string | null;
  textoConfirmar: string;
  emAndamento?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  const cancelarRef = useRef<HTMLButtonElement>(null);

  // O foco começa em "Cancelar": Enter reflexo não deve apagar nada.
  useEffect(() => {
    cancelarRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onCancelar();
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onCancelar]);

  return (
    <div className="confirmar" role="alertdialog" aria-modal="true" aria-labelledby="confirmarTitulo">
      <div className="confirmar-backdrop" onClick={emAndamento ? undefined : onCancelar} />
      <div className="confirmar-caixa">
        <h3 id="confirmarTitulo">{titulo}</h3>
        <p>{mensagem}</p>
        {aviso && <p className="confirmar-aviso">{aviso}</p>}
        {erro && <p className="msg msg-erro confirmar-erro">{erro}</p>}
        <div className="confirmar-acoes">
          <button type="button" className="btn-ghost" ref={cancelarRef} disabled={emAndamento} onClick={onCancelar}>
            Cancelar
          </button>
          <button type="button" className="btn-danger" disabled={emAndamento} onClick={onConfirmar}>
            {emAndamento ? <><span className="btn-spinner" aria-hidden="true" />Apagando…</> : textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
