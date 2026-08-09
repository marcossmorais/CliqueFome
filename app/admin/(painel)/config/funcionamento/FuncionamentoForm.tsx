'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { criarClientNavegador } from '@/lib/supabase/client';
import type { Loja } from '@/lib/loja';

export function FuncionamentoForm({ loja }: { loja: Loja }) {
  const router = useRouter();

  const [tempoMin, setTempoMin] = useState(loja.tempo_entrega_min?.toString() ?? '');
  const [tempoMax, setTempoMax] = useState(loja.tempo_entrega_max?.toString() ?? '');
  const [retirada, setRetirada] = useState(loja.retirada_ativa);
  const [delivery, setDelivery] = useState(loja.delivery_ativo);
  const [pedidoMinimo, setPedidoMinimo] = useState(String(loja.pedido_minimo ?? 0));

  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setMsg(null);

    const sb = criarClientNavegador();
    const dados = {
      tempo_entrega_min: tempoMin ? parseInt(tempoMin, 10) : null,
      tempo_entrega_max: tempoMax ? parseInt(tempoMax, 10) : null,
      retirada_ativa: retirada,
      delivery_ativo: delivery,
      pedido_minimo: parseFloat(pedidoMinimo) || 0,
    };
    const { error } = await sb.from('lojas').update(dados).eq('id', loja.id);

    if (error) {
      setMsg({ tipo: 'erro', texto: 'Erro ao salvar: ' + error.message });
      setSalvando(false);
      return;
    }

    setMsg({ tipo: 'ok', texto: 'Funcionamento salvo.' });
    setSalvando(false);
    router.refresh();
  }

  return (
    <div className="card">
      <h2>Funcionamento</h2>
      <p className="sub">Regras operacionais que valem pro cardápio inteiro.</p>

      {msg && <div className={'msg msg-' + msg.tipo}>{msg.texto}</div>}

      <div className="switch-row" style={{ opacity: 0.6 }}>
        <label className="switch">
          <input type="checkbox" checked={false} disabled readOnly />
          <span className="switch-track"></span>
        </label>
        <div>
          <strong>Horários de funcionamento</strong>{' '}
          <span className="badge-admin">Em breve</span>
          <p className="dica" style={{ margin: '4px 0 0' }}>
            Grade de horário por dia da semana. Por enquanto, use o botão &quot;Loja aberta&quot; em
            Minha loja pra pausar manualmente.
          </p>
        </div>
      </div>

      <form onSubmit={salvar}>
        <div className="row2">
          <div>
            <label htmlFor="tempoMin">Tempo mín. de preparo (min)</label>
            <input
              type="number" id="tempoMin" step="1" min="0"
              value={tempoMin} onChange={(e) => setTempoMin(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="tempoMax">Tempo máx. de preparo (min)</label>
            <input
              type="number" id="tempoMax" step="1" min="0"
              value={tempoMax} onChange={(e) => setTempoMax(e.target.value)}
            />
          </div>
        </div>

        <label htmlFor="pedidoMinimo">Pedido mínimo (R$)</label>
        <input
          type="number" id="pedidoMinimo" step="0.01" min="0"
          value={pedidoMinimo} onChange={(e) => setPedidoMinimo(e.target.value)}
        />

        <div className="switch-row">
          <label className="switch">
            <input type="checkbox" checked={retirada} onChange={(e) => setRetirada(e.target.checked)} />
            <span className="switch-track"></span>
          </label>
          <label style={{ margin: 0 }}>Permitir retirada</label>
        </div>

        <div className="switch-row">
          <label className="switch">
            <input type="checkbox" checked={delivery} onChange={(e) => setDelivery(e.target.checked)} />
            <span className="switch-track"></span>
          </label>
          <label style={{ margin: 0 }}>Permitir Delivery</label>
        </div>

        <button type="submit" className="btn-primary btn-small" disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar funcionamento'}
        </button>
      </form>
    </div>
  );
}
