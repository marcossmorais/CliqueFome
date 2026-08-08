'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { criarClientNavegador } from '@/lib/supabase/client';
import type { Loja } from '@/lib/loja';

const NICHOS = ['Lanchonete', 'Hamburgueria', 'Pizzaria', 'Açaiteria', 'Doceria', 'Outro'];

export function DadosLojaForm({ loja }: { loja: Loja }) {
  const router = useRouter();

  const [nome, setNome] = useState(loja.nome);
  const [nicho, setNicho] = useState(loja.nicho || 'Outro');
  const [whatsapp, setWhatsapp] = useState(loja.whatsapp_numero || '');
  const [taxaEntrega, setTaxaEntrega] = useState(String(loja.taxa_entrega ?? 0));
  const [pedidoMinimo, setPedidoMinimo] = useState(String(loja.pedido_minimo ?? 0));
  const [tempoMin, setTempoMin] = useState(loja.tempo_entrega_min?.toString() ?? '');
  const [tempoMax, setTempoMax] = useState(loja.tempo_entrega_max?.toString() ?? '');

  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setMsg(null);

    const sb = criarClientNavegador();
    const dados = {
      nome: nome.trim(),
      nicho,
      whatsapp_numero: whatsapp.trim(),
      taxa_entrega: parseFloat(taxaEntrega) || 0,
      pedido_minimo: parseFloat(pedidoMinimo) || 0,
      tempo_entrega_min: tempoMin ? parseInt(tempoMin, 10) : null,
      tempo_entrega_max: tempoMax ? parseInt(tempoMax, 10) : null,
    };
    const { error } = await sb.from('lojas').update(dados).eq('id', loja.id);

    if (error) {
      setMsg({ tipo: 'erro', texto: 'Erro ao salvar dados da loja: ' + error.message });
      setSalvando(false);
      return;
    }

    setMsg({ tipo: 'ok', texto: 'Dados da loja salvos.' });
    setSalvando(false);
    // Nome da loja aparece no menu lateral e no hero — atualiza a árvore
    // toda a partir do servidor pra não duplicar esse estado no client.
    router.refresh();
  }

  return (
    <div className="card">
      <h2>Dados da loja</h2>
      <p className="sub">Nome, nicho, contato e as regras de entrega que aparecem no cardápio.</p>

      {msg && <div className={'msg msg-' + msg.tipo}>{msg.texto}</div>}

      <form onSubmit={salvar}>
        <label htmlFor="editNome">Nome</label>
        <input type="text" id="editNome" required value={nome} onChange={(e) => setNome(e.target.value)} />

        <div className="row2">
          <div>
            <label htmlFor="editNicho">Nicho</label>
            <select id="editNicho" value={nicho} onChange={(e) => setNicho(e.target.value)}>
              {NICHOS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="editWhatsapp">WhatsApp</label>
            <input
              type="text"
              id="editWhatsapp"
              required
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
            />
          </div>
        </div>

        <div className="row2">
          <div>
            <label htmlFor="editTaxaEntrega">Taxa de entrega (R$)</label>
            <input
              type="number"
              id="editTaxaEntrega"
              step="0.01"
              min="0"
              value={taxaEntrega}
              onChange={(e) => setTaxaEntrega(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="editPedidoMinimo">Pedido mínimo (R$)</label>
            <input
              type="number"
              id="editPedidoMinimo"
              step="0.01"
              min="0"
              value={pedidoMinimo}
              onChange={(e) => setPedidoMinimo(e.target.value)}
            />
          </div>
        </div>

        <div className="row2">
          <div>
            <label htmlFor="editTempoMin">Tempo mín. de entrega (min)</label>
            <input
              type="number"
              id="editTempoMin"
              step="1"
              min="0"
              value={tempoMin}
              onChange={(e) => setTempoMin(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="editTempoMax">Tempo máx. de entrega (min)</label>
            <input
              type="number"
              id="editTempoMax"
              step="1"
              min="0"
              value={tempoMax}
              onChange={(e) => setTempoMax(e.target.value)}
            />
          </div>
        </div>

        <button type="submit" className="btn-primary btn-small" disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar dados da loja'}
        </button>
      </form>
    </div>
  );
}
