'use client';

import { useMemo, useState } from 'react';
import { useEscFechar } from '@/hooks/useEscFechar';
import {
  apareceNoTipo,
  extraDoGrupo,
  formatBRL,
  precoBase,
  type ComplementoPublico,
  type EscolhaComplemento,
  type GrupoPublico,
  type ProdutoPublico,
} from '@/lib/cardapio/tipos';
import styles from './novoPedido.module.css';

// Mesma máquina de regras do ModalProduto público (app/[loja]/ModalProduto.tsx):
// escolha única vira radio, 'varias_repetir' ganha contador por opção, o
// máximo do grupo desabilita o resto, e "Adicionar" só libera com toda
// lista obrigatória satisfeita. Reimplementado aqui (não importado) porque
// o styling é outro — o cardápio público é whitelabel (cor `--marca` da
// loja), o painel é sempre verde CliqueFome.
type Selecoes = Record<string, Record<string, number>>;

function totalDoGrupo(selecoes: Selecoes, grupoId: string) {
  return Object.values(selecoes[grupoId] || {}).reduce((s, q) => s + q, 0);
}

function tetoDaOpcao(g: GrupoPublico, c: ComplementoPublico) {
  if (g.tipo_selecao !== 'varias_repetir') return 1;
  return Math.min(c.qtd_max ?? g.qtd_max, g.qtd_max);
}

function ehEscolhaUnica(g: GrupoPublico) {
  return g.tipo_selecao === 'uma' || g.qtd_max === 1;
}

function IconeCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export function ModalDetalhesProdutoPedido({
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
            modoPreco: g.modo_preco,
          }))
      ),
    [grupos, selecoes]
  );

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
    <div className={styles.detalhesOverlay} role="presentation" onClick={onFechar}>
      <div
        className={styles.detalhesJanela}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detalhesProdutoTitulo"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.detalhesTopo}>
          <h2 id="detalhesProdutoTitulo">Detalhes do produto</h2>
          <button type="button" aria-label="Fechar" onClick={onFechar}>
            ✕
          </button>
        </div>

        <div className={styles.detalhesScroll}>
          {produto.imagem_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- foto do catálogo, vinda do Storage
            <img className={styles.detalhesFoto} src={produto.imagem_url} alt={produto.nome} />
          ) : (
            <div className={styles.detalhesFotoVazia}>🖼️</div>
          )}

          <div className={styles.detalhesInfo}>
            <h3>{produto.nome}</h3>
            {produto.descricao && <p>{produto.descricao}</p>}
            <span className={styles.detalhesPrecoBase}>{formatBRL(precoBase(produto))}</span>
          </div>

          {grupos.map((g) => {
            const escolhidos = selecoes[g.id] || {};
            const qtdEscolhida = totalDoGrupo(selecoes, g.id);
            const noLimite = qtdEscolhida >= g.qtd_max;
            const satisfeito = qtdEscolhida >= g.qtd_min;
            const invalido = tentouAdicionar && !satisfeito;
            const repetivel = g.tipo_selecao === 'varias_repetir';
            const unica = ehEscolhaUnica(g);

            return (
              <fieldset key={g.id} className={`${styles.grupoBloco} ${invalido ? styles.grupoInvalido : ''}`}>
                <legend className={styles.grupoHeader}>
                  <span className={styles.grupoTextos}>
                    <span className={styles.grupoNome}>{g.nome}</span>
                    <span className={styles.grupoRegra}>
                      Escolha de {g.qtd_min} a {g.qtd_max} opç{g.qtd_max === 1 ? 'ão' : 'ões'}
                    </span>
                  </span>
                  <span className={styles.grupoBadges}>
                    <span className={satisfeito ? styles.badgeOk : styles.badgeContagem}>
                      {qtdEscolhida}/{g.qtd_max}
                      {satisfeito && <IconeCheck />}
                    </span>
                    {g.qtd_min > 0 && !satisfeito && <span className={styles.badgeObrigatorio}>Obrigatório</span>}
                  </span>
                </legend>

                <div className={styles.grupoOpcoes}>
                  {g.complementos.map((c) => {
                    const qtdC = escolhidos[c.id] || 0;

                    if (repetivel) {
                      const teto = tetoDaOpcao(g, c);
                      return (
                        <div key={c.id} className={styles.opcaoRow}>
                          <span className={styles.opcaoNome}>{c.nome}</span>
                          <span className={styles.opcaoPreco}>
                            {Number(c.preco) > 0 ? '+ ' + formatBRL(Number(c.preco)) : ''}
                          </span>
                          <span className={styles.opcaoStepper}>
                            <button
                              type="button"
                              aria-label={`Tirar um ${c.nome}`}
                              disabled={qtdC === 0}
                              onClick={() => mudarRepeticao(g, c, -1)}
                            >
                              −
                            </button>
                            <b>{qtdC}</b>
                            <button
                              type="button"
                              aria-label={`Adicionar um ${c.nome}`}
                              disabled={qtdC >= teto || noLimite}
                              onClick={() => mudarRepeticao(g, c, 1)}
                            >
                              +
                            </button>
                          </span>
                        </div>
                      );
                    }

                    const marcado = qtdC > 0;
                    const desabilitado = !marcado && noLimite;
                    return (
                      <label key={c.id} className={`${styles.opcaoRow} ${desabilitado ? styles.opcaoDesabilitada : ''}`}>
                        <input
                          type={unica ? 'radio' : 'checkbox'}
                          name={unica ? `grupo-${g.id}` : undefined}
                          checked={marcado}
                          disabled={desabilitado}
                          onChange={() => alternar(g, c)}
                        />
                        <span className={styles.opcaoNome}>{c.nome}</span>
                        <span className={styles.opcaoPreco}>
                          {Number(c.preco) > 0 ? '+ ' + formatBRL(Number(c.preco)) : ''}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}

          {!produto.esconder_observacao && (
            <div className={styles.detalhesObs}>
              <label htmlFor="detalhesObsInput">Alguma observação?</label>
              <textarea
                id="detalhesObsInput"
                placeholder="Ex: sem cebola, ponto da carne bem passado"
                value={obs}
                onChange={(e) => setObs(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className={styles.detalhesRodape}>
          {!produto.esconder_quantidade && (
            <span className={styles.detalhesQty}>
              <button type="button" aria-label="Diminuir quantidade" onClick={() => setQtd((q) => Math.max(1, q - 1))}>
                −
              </button>
              <b>{qtd}</b>
              <button type="button" aria-label="Aumentar quantidade" onClick={() => setQtd((q) => q + 1)}>
                +
              </button>
            </span>
          )}
          <button type="button" className={styles.detalhesAdicionar} onClick={adicionar}>
            Adicionar · {formatBRL(total)}
          </button>
        </div>
      </div>
    </div>
  );
}
