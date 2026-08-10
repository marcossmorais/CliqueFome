'use client';

import { useState } from 'react';
import { criarClientNavegador } from '@/lib/supabase/client';
import { useEscFechar } from '@/hooks/useEscFechar';
import type { Categoria } from '@/lib/catalogo/tipos';

export function ModalCategoria({
  lojaId,
  categoria,
  ordemNova,
  onFechar,
  onSalvo,
  onApagado,
  onErro,
}: {
  lojaId: string;
  categoria: Categoria | null;
  ordemNova: number;
  onFechar: () => void;
  onSalvo: () => void;
  onApagado: () => void;
  onErro: (msg: string) => void;
}) {
  useEscFechar(onFechar);

  const [nome, setNome] = useState(categoria?.nome ?? '');
  const [emoji, setEmoji] = useState(categoria?.emoji ?? '');
  const [icone, setIcone] = useState(categoria?.icone ?? '');
  const [ativo, setAtivo] = useState(categoria ? categoria.ativo : true);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    const nomeAparado = nome.trim();
    if (!nomeAparado) {
      onErro('Dê um nome pra categoria.');
      return;
    }
    setSalvando(true);
    const sb = criarClientNavegador();
    const dados: Record<string, unknown> = {
      loja_id: lojaId,
      nome: nomeAparado,
      emoji: emoji.trim() || null,
      icone: icone.trim() || null,
      ativo,
    };
    // Categoria nova entra no fim; editando, a posição atual é preservada
    // (quem muda ordem é o arrasto).
    if (!categoria) dados.ordem = ordemNova;

    const { error } = categoria
      ? await sb.from('categorias').update(dados).eq('id', categoria.id)
      : await sb.from('categorias').insert(dados);

    setSalvando(false);
    if (error) {
      onErro('Erro ao salvar categoria: ' + error.message);
      return;
    }
    onSalvo();
  }

  async function apagar() {
    if (!categoria) return;
    if (!confirm(`Apagar a categoria "${categoria.nome}"? Os produtos dela ficam sem categoria.`)) return;
    const sb = criarClientNavegador();
    const { error } = await sb.from('categorias').delete().eq('id', categoria.id);
    if (error) {
      onErro('Erro ao apagar: ' + error.message);
      return;
    }
    onApagado();
  }

  return (
    <div className="modal aberto">
      <div className="modal-backdrop" onClick={onFechar} />
      <div className="modal-sheet estreito">
        <div className="modal-topo">
          <div className="modal-titulo">{categoria ? 'Editar categoria' : 'Nova categoria'}</div>
          <button type="button" className="modal-fechar" aria-label="Fechar" onClick={onFechar}>
            ✕
          </button>
        </div>
        <div className="modal-corpo">
          <div className="form-linha">
            <div style={{ flex: '0 0 88px' }}>
              <label htmlFor="catEmoji">Emoji</label>
              <input
                type="text"
                id="catEmoji"
                maxLength={4}
                placeholder="🍟"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="catNome">Nome *</label>
              <input type="text" id="catNome" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
          </div>
          <div className="form-linha">
            <div>
              <label htmlFor="catIcone">Ícone</label>
              <select id="catIcone" value={icone} onChange={(e) => setIcone(e.target.value)}>
                <option value="">Automático pelo nome</option>
                <option value="hamburgueres">Hambúrgueres / lanches</option>
                <option value="bebidas">Bebidas</option>
                <option value="pizzas">Pizzas</option>
                <option value="porcoes">Porções / petiscos</option>
                <option value="sobremesas">Sobremesas</option>
                <option value="combos">Combos</option>
                <option value="acai">Açaí</option>
                <option value="cafes">Cafés</option>
                <option value="saudaveis">Saudáveis</option>
                <option value="generico">Genérico</option>
              </select>
            </div>
          </div>
          <p className="dica" style={{ marginTop: 0 }}>
            A ordem das categorias no cardápio é definida arrastando elas pela alça na lista.
          </p>
          <div className="campo-inline">
            <label className="switch">
              <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
              <span className="switch-track"></span>
            </label>
            <label>Visível no cardápio</label>
          </div>
        </div>
        <div className="modal-rodape">
          {categoria && (
            <button type="button" className="btn-danger" style={{ marginRight: 'auto' }} onClick={apagar}>
              Apagar
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={onFechar}>
            Cancelar
          </button>
          <button type="button" className="btn-primary" disabled={salvando} onClick={salvar}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
