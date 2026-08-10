'use client';

import { useState, type ReactNode } from 'react';
import styles from './delivery.module.css';

export function DeliveryHub({ configuracao }: { configuracao: ReactNode }) {
  const [aba, setAba] = useState<'entregas' | 'entregadores'>('entregas');

  return (
    <div className={styles.hub}>
      <div className={styles.abas} role="tablist" aria-label="Seções do delivery">
        <button type="button" role="tab" aria-selected={aba === 'entregas'} className={aba === 'entregas' ? styles.abaAtiva : ''} onClick={() => setAba('entregas')}>
          Configuração de entrega
        </button>
        <button type="button" role="tab" aria-selected={aba === 'entregadores'} className={aba === 'entregadores' ? styles.abaAtiva : ''} onClick={() => setAba('entregadores')}>
          Entregadores
        </button>
      </div>

      {aba === 'entregas' ? configuracao : (
        <section className={styles.entregadores} role="tabpanel">
          <span className={styles.sobretitulo}>Equipe de entrega</span>
          <h2>Entregadores</h2>
          <p>O cadastro e a vinculação de motoboys aos pedidos ficarão centralizados aqui.</p>
          <span className="badge-admin">Em breve</span>
        </section>
      )}
    </div>
  );
}
