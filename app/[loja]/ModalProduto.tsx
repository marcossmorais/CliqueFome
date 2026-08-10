'use client';

import { useMemo, useState } from 'react';
import { useEscFechar } from '@/hooks/useEscFechar';
import {
  apareceNoTipo,
  extraDoGrupo,
  formatBRL,
  precoBase,
  regraTextoGrupo,
  type ComplementoPublico,
  type EscolhaComplemento,
  type GrupoPublico,
  type ProdutoPublico,
} from '@/lib/cardapio/tipos';

/**
 * Escolha dos complementos. Aplica as regras da lista:
 *  - escolha única (uma opção, ou máximo 1) vira radio: marcar troca
 *  - 'varias' aceita várias opções distintas, uma vez cada
 *  - 'varias_repetir' mostra um contador por opção, limitado pelo teto da
 *    própria opção e pelo máximo da lista
 *  - atingido o máximo, as demais opções ficam desabilitadas
 *  - só libera "Adicionar" quando toda lista obrigatória está satisfeita
 *
 * As mesmas regras são refeitas em criar_pedido(). Aqui elas existem pra
 * pessoa não errar; lá elas existem porque o navegador não é confiável.
 */

/** grupoId -> complementoId -> quantidade escolhida (sempre >= 1). */
type Selecoes = Record<string, Record<string, number>>;

function totalDoGrupo(selecoes: Selecoes, grupoId: string) {
  return Object.values(selecoes[grupoId] || {}).reduce((s, q) => s + q, 0);
}

/** Quantas vezes esta opção pode repetir: o menor entre o teto próprio e o
 * máximo da lista. Fora de 'varias_repetir', sempre 1. */
function tetoDaOpcao(g: GrupoPublico, c: ComplementoPublico) {
  if (g.tipo_selecao !== 'varias_repetir') return 1;
  return Math.min(c.qtd_max ?? g.qtd_max, g.qtd_max);
}

function ehEscolhaUnica(g: GrupoPublico) {
  return g.tipo_selecao === 'uma' || g.qtd_max === 1;
}

export function ModalProduto({
  produto,
  tipoPedido,
  onFechar,
  onAdicionar,
}: {
  produto: ProdutoPublico;
  tipoPedido: string;
  onFechar: () => void;
  onAdicionar: (escolhas: EscolhaComplemento[], observacao: string, qtd: number) => void;
}) {
  useEscFechar(onFechar);

  const [selecoes, setSelecoes] = useState<Selecoes>({});
  const [obs, setObs] = useState('');
  const [qtd, setQtd] = useState(1);
  const [tentouAdicionar, setTentouAdicionar] = useState(false);
  const [imgCarregada, setImgCarregada] = useState(false);

  // Lista restrita a outro tipo de pedido não aparece nem conta como
  // obrigatória — senão o produto ficaria impossível de adicionar.
  const grupos = useMemo(
    () => produto.grupos.filter((g) => apareceNoTipo(g.tipos_pedido, tipoPedido)),
    [produto.grupos, tipoPedido]
  );

  function alternar(g: GrupoPublico, c: ComplementoPublico) {
    setSelecoes((atual) => {
      const doGrupo = atual[g.id] || {};
      if (doGrupo[c.id]) {
        const copia = { ...doGrupo };
        delete copia[c.id];
        return { ...atual, [g.id]: copia };
      }
      if (ehEscolhaUnica(g)) return { ...atual, [g.id]: { [c.id]: 1 } };
      if (totalDoGrupo(atual, g.id) >= g.qtd_max) return atual;
      return { ...atual, [g.id]: { ...doGrupo, [c.id]: 1 } };
    });
  }

  function mudarRepeticao(g: GrupoPublico, c: ComplementoPublico, delta: number) {
    setSelecoes((atual) => {
      const doGrupo = { ...(atual[g.id] || {}) };
      const nova = (doGrupo[c.id] || 0) + delta;
      if (nova > tetoDaOpcao(g, c)) return atual;
      if (delta > 0 && totalDoGrupo(atual, g.id) >= g.qtd_max) return atual;
      if (nova <= 0) delete doGrupo[c.id];
      else doGrupo[c.id] = nova;
      return { ...atual, [g.id]: doGrupo };
    });
  }

  const escolhas = useMemo<EscolhaComplemento[]>(
    () =>
      grupos.flatMap((g) =>
        Object.entries(selecoes[g.id] || {})
          .map(([id, quantidade]) => ({ c: g.complementos.find((x) => x.id === id), quantidade }))
          .filter((x): x is { c: ComplementoPublico; quantidade: number } => !!x.c)
          .map(({ c, quantidade }) => ({
            complementoId: c.id,
            grupoId: g.id,
            grupoNome: g.nome,
            nome: c.nome,
            preco: Number(c.preco),
            quantidade,
            // Viaja junto pro carrinho: é o que permite recalcular
            // "média/maior/menor" sem ter o catálogo em mãos.
            modoPreco: g.modo_preco,
          }))
      ),
    [grupos, selecoes]
  );

  // Mesma função que o carrinho usa. Quando eram duas contas diferentes, o
  // modal mostrava R$ 45 e o carrinho cobrava R$ 90.
  const extra = grupos.reduce(
    (soma, g) => soma + extraDoGrupo(g, escolhas.filter((e) => e.grupoId === g.id)),
    0
  );

  const total = (precoBase(produto) + extra) * qtd;
  const gruposInvalidos = grupos.filter((g) => totalDoGrupo(selecoes, g.id) < g.qtd_min);
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
      <div className="produto-modal-sheet" role="dialog" aria-modal="true" aria-labelledby="tituloProduto">
        <button className="produto-modal-close" aria-label="Fechar" onClick={onFechar}>
          ✕
        </button>

        <div className="produto-modal-scroll">
          <div className="produto-modal-photo">
            {produto.imagem_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- foto do catálogo da loja, vinda do Storage
              <img
                src={produto.imagem_url}
                alt={produto.nome}
                className={'foto-produto' + (imgCarregada ? ' carregada' : '')}
                onLoad={() => setImgCarregada(true)}
              />
            ) : (
              <span className="menu-emoji">🖼️</span>
            )}
          </div>

          <div className="produto-modal-info">
            <h3 id="tituloProduto">{produto.nome}</h3>
            {produto.descricao && <p>{produto.descricao}</p>}
            <span className="produto-modal-preco-base">{formatBRL(precoBase(produto))}</span>
          </div>

          {grupos.map((g) => {
            const escolhidos = selecoes[g.id] || {};
            const noLimite = totalDoGrupo(selecoes, g.id) >= g.qtd_max;
            const invalido = tentouAdicionar && totalDoGrupo(selecoes, g.id) < g.qtd_min;
            const repetivel = g.tipo_selecao === 'varias_repetir';
            const unica = ehEscolhaUnica(g);

            return (
              <fieldset key={g.id} className={'grupo-bloco' + (invalido ? ' invalido' : '')}>
                <legend className="grupo-header">
                  <span className="grupo-nome">{g.nome}</span>
                  <span className="grupo-regra">{regraTextoGrupo(g)}</span>
                </legend>
                <div className="grupo-opcoes">
                  {g.complementos.map((c) => {
                    const qtdEscolhida = escolhidos[c.id] || 0;

                    if (repetivel) {
                      const teto = tetoDaOpcao(g, c);
                      return (
                        <div key={c.id} className="opcao-row">
                          <span className="opcao-nome">{c.nome}</span>
                          <span className="opcao-preco">
                            {Number(c.preco) > 0 ? '+ ' + formatBRL(Number(c.preco)) : ''}
                          </span>
                          <span className="opcao-stepper">
                            <button
                              type="button"
                              className="menu-qty-btn"
                              aria-label={`Tirar um ${c.nome}`}
                              disabled={qtdEscolhida === 0}
                              onClick={() => mudarRepeticao(g, c, -1)}
                            >
                              −
                            </button>
                            <span className="menu-qty-value">{qtdEscolhida}</span>
                            <button
                              type="button"
                              className="menu-qty-btn"
                              aria-label={`Adicionar um ${c.nome}`}
                              disabled={qtdEscolhida >= teto || noLimite}
                              onClick={() => mudarRepeticao(g, c, 1)}
                            >
                              +
                            </button>
                          </span>
                        </div>
                      );
                    }

                    const marcado = qtdEscolhida > 0;
                    const desabilitado = !marcado && noLimite;
                    return (
                      <label key={c.id} className={'opcao-row' + (desabilitado ? ' disabled' : '')}>
                        <input
                          type={unica ? 'radio' : 'checkbox'}
                          name={unica ? `grupo-${g.id}` : undefined}
                          checked={marcado}
                          disabled={desabilitado}
                          onChange={() => alternar(g, c)}
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
              </fieldset>
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
