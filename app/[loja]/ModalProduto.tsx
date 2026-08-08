'use client';

import { useMemo, useState } from 'react';
import { useEscFechar } from '@/hooks/useEscFechar';
import {
  extraDoGrupo,
  formatBRL,
  precoBase,
  regraTextoGrupo,
  type EscolhaComplemento,
  type ProdutoPublico,
} from '@/lib/cardapio/tipos';

/**
 * Escolha dos complementos. Aplica as regras do grupo:
 *  - qtd_max = 1 vira escolha única (marcar um desmarca o outro)
 *  - atingido o máximo, as demais opções ficam desabilitadas
 *  - só libera "Adicionar" quando todo grupo obrigatório está satisfeito
 */
export function ModalProduto({
  produto,
  onFechar,
  onAdicionar,
}: {
  produto: ProdutoPublico;
  onFechar: () => void;
  onAdicionar: (escolhas: EscolhaComplemento[], observacao: string, qtd: number) => void;
}) {
  useEscFechar(onFechar);

  const [selecoes, setSelecoes] = useState<Record<string, string[]>>({});
  const [obs, setObs] = useState('');
  const [qtd, setQtd] = useState(1);
  const [tentouAdicionar, setTentouAdicionar] = useState(false);

  function alternar(grupoId: string, complementoId: string, qtdMax: number) {
    setSelecoes((atual) => {
      const escolhidos = atual[grupoId] || [];
      const jaTem = escolhidos.includes(complementoId);
      if (jaTem) return { ...atual, [grupoId]: escolhidos.filter((id) => id !== complementoId) };
      // Grupo de escolha única: marcar troca em vez de somar.
      if (qtdMax === 1) return { ...atual, [grupoId]: [complementoId] };
      if (escolhidos.length >= qtdMax) return atual;
      return { ...atual, [grupoId]: [...escolhidos, complementoId] };
    });
  }

  const escolhas = useMemo<EscolhaComplemento[]>(
    () =>
      produto.grupos.flatMap((g) =>
        (selecoes[g.id] || [])
          .map((id) => g.complementos.find((c) => c.id === id))
          .filter((c): c is NonNullable<typeof c> => !!c)
          .map((c) => ({
            complementoId: c.id,
            grupoId: g.id,
            grupoNome: g.nome,
            nome: c.nome,
            preco: Number(c.preco),
          }))
      ),
    [produto.grupos, selecoes]
  );

  // O extra respeita o modo de preço de cada grupo (soma/média/maior/menor),
  // igual à conta que o banco refaz na hora de gravar o pedido.
  const extra = produto.grupos.reduce((soma, g) => {
    const escolhidos = (selecoes[g.id] || [])
      .map((id) => g.complementos.find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => !!c);
    return soma + extraDoGrupo(g, escolhidos);
  }, 0);

  const total = (precoBase(produto) + extra) * qtd;
  const gruposInvalidos = produto.grupos.filter((g) => (selecoes[g.id] || []).length < g.qtd_min);
  const valido = gruposInvalidos.length === 0;

  function adicionar() {
    if (!valido) {
      setTentouAdicionar(true);
      return;
    }
    onAdicionar(escolhas, obs.trim(), qtd);
  }

  return (
    <div className="produto-modal open">
      <div className="produto-modal-backdrop" onClick={onFechar} />
      <div className="produto-modal-sheet" role="dialog" aria-modal="true">
        <button className="produto-modal-close" aria-label="Fechar" onClick={onFechar}>
          ✕
        </button>

        <div className="produto-modal-scroll">
          <div className="produto-modal-photo">
            {produto.imagem_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- foto do catálogo da loja, vinda do Storage
              <img src={produto.imagem_url} alt={produto.nome} />
            ) : (
              <span className="menu-emoji">🖼️</span>
            )}
          </div>

          <div className="produto-modal-info">
            <h3>{produto.nome}</h3>
            {produto.descricao && <p>{produto.descricao}</p>}
            <span className="produto-modal-preco-base">{formatBRL(precoBase(produto))}</span>
          </div>

          {produto.grupos.map((g) => {
            const escolhidos = selecoes[g.id] || [];
            const noLimite = escolhidos.length >= g.qtd_max;
            const invalido = tentouAdicionar && escolhidos.length < g.qtd_min;
            return (
              <div key={g.id} className={'grupo-bloco' + (invalido ? ' invalido' : '')}>
                <div className="grupo-header">
                  <h4>{g.nome}</h4>
                  <span className="grupo-regra">{regraTextoGrupo(g)}</span>
                </div>
                <div className="grupo-opcoes">
                  {g.complementos.map((c) => {
                    const marcado = escolhidos.includes(c.id);
                    const desabilitado = !marcado && noLimite;
                    return (
                      <label key={c.id} className={'opcao-row' + (desabilitado ? ' disabled' : '')}>
                        <input
                          type="checkbox"
                          checked={marcado}
                          disabled={desabilitado}
                          onChange={() => alternar(g.id, c.id, g.qtd_max)}
                        />
                        <span className="opcao-nome">{c.nome}</span>
                        <span className="opcao-preco">
                          {Number(c.preco) > 0 ? '+ ' + formatBRL(Number(c.preco)) : ''}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="grupo-erro">
                  Escolha {g.qtd_min === g.qtd_max ? g.qtd_min : `pelo menos ${g.qtd_min}`}
                  {g.qtd_min > 1 ? ' opções' : ' opção'}.
                </p>
              </div>
            );
          })}

          {!produto.esconder_observacao && (
            <div className="produto-modal-obs">
              <label htmlFor="obsInput">Alguma observação?</label>
              <textarea
                id="obsInput"
                placeholder="Ex: sem cebola, ponto da carne bem passado"
                value={obs}
                onChange={(e) => setObs(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="produto-modal-footer">
          {!produto.esconder_quantidade && (
            <div className="produto-modal-qty">
              <button
                type="button"
                className="menu-qty-btn"
                aria-label="Diminuir quantidade"
                onClick={() => setQtd((q) => Math.max(1, q - 1))}
              >
                −
              </button>
              <span className="menu-qty-value">{qtd}</span>
              <button
                type="button"
                className="menu-qty-btn"
                aria-label="Aumentar quantidade"
                onClick={() => setQtd((q) => q + 1)}
              >
                +
              </button>
            </div>
          )}
          <button type="button" className="btn-primary produto-modal-add" onClick={adicionar}>
            Adicionar · {formatBRL(total)}
          </button>
        </div>
      </div>
    </div>
  );
}
