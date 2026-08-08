'use client';

import { useMemo, useState } from 'react';
import { useEscFechar } from '@/hooks/useEscFechar';
import { criarClientNavegador } from '@/lib/supabase/client';
import { criarPedidoManual, type ItemPedidoManual } from '@/lib/pedidos/acoes';
import {
  apareceNoTipo,
  extraDaLinha,
  formatBRL,
  precoBase,
  precoMinimo,
  subtotalLinha,
  type CategoriaPublica,
  type EscolhaComplemento,
  type LinhaCarrinho,
  type ProdutoPublico,
} from '@/lib/cardapio/tipos';
import { IconeBusca } from '@/components/admin/IconesCatalogo';
import { ModalDetalhesProdutoPedido } from './ModalDetalhesProdutoPedido';
import styles from './novoPedido.module.css';

type TipoManual = 'delivery' | 'retirada' | 'balcao' | 'mesa' | 'encomenda';

const NOMES_TIPO: Record<TipoManual, string> = {
  retirada: 'Retirada',
  delivery: 'Delivery',
  balcao: 'Balcão',
  mesa: 'Mesa',
  encomenda: 'Encomenda',
};

function IconeCaixaVazia() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8l9-5 9 5-9 5-9-5z" />
      <path d="M3 8v9l9 5 9-5V8" />
      <path d="M12 13v9" />
    </svg>
  );
}

export function NovoPedidoPainel({
  lojaSlug,
  categorias,
  produtos,
  onFechar,
  onCriado,
  onErro,
}: {
  lojaSlug: string;
  categorias: CategoriaPublica[];
  produtos: ProdutoPublico[];
  onFechar: () => void;
  onCriado: (numeroPedido: number) => Promise<void> | void;
  onErro: (msg: string) => void;
}) {
  useEscFechar(onFechar);

  const [categoriaId, setCategoriaId] = useState('todos');
  const [busca, setBusca] = useState('');
  const [produtoAberto, setProdutoAberto] = useState<ProdutoPublico | null>(null);
  const [linhas, setLinhas] = useState<LinhaCarrinho[]>([]);

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [tipo, setTipo] = useState<TipoManual>('balcao');
  const [endereco, setEndereco] = useState('');
  const [dataHora, setDataHora] = useState('');
  const [observacao, setObservacao] = useState('');
  const [obsAberta, setObsAberta] = useState(false);
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return produtos.filter((p) => {
      if (categoriaId !== 'todos' && p.categoria_id !== categoriaId) return false;
      if (!apareceNoTipo(p.tipos_pedido, tipo)) return false;
      if (termo && !`${p.nome} ${p.descricao || ''}`.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [produtos, busca, categoriaId, tipo]);

  const contagemPorCategoria = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const p of produtos) {
      if (!apareceNoTipo(p.tipos_pedido, tipo)) continue;
      const chave = p.categoria_id ?? '__sem_categoria__';
      mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
    }
    return mapa;
  }, [produtos, tipo]);

  function idDaLinha(produtoId: string, escolhas: EscolhaComplemento[], obs: string) {
    const chave = escolhas.map((c) => `${c.complementoId}x${c.quantidade}`).sort().join(',');
    return `${produtoId}::${chave}::${obs}`;
  }

  function adicionarLinha(p: ProdutoPublico, escolhas: EscolhaComplemento[], obs: string, qtd: number) {
    const lineId = idDaLinha(p.id, escolhas, obs);
    setLinhas((atual) => {
      const existente = atual.find((l) => l.lineId === lineId);
      if (existente) {
        return atual.map((l) => (l.lineId === lineId ? { ...l, qty: l.qty + qtd } : l));
      }
      return [
        ...atual,
        { lineId, produtoId: p.id, nome: p.nome, precoUnit: precoBase(p), complementos: escolhas, observacao: obs, qty: qtd },
      ];
    });
  }

  function aoClicarProduto(p: ProdutoPublico) {
    if (p.grupos.some((g) => apareceNoTipo(g.tipos_pedido, tipo))) {
      setProdutoAberto(p);
      return;
    }
    adicionarLinha(p, [], '', 1);
  }

  function mudarQtd(lineId: string, delta: number) {
    setLinhas((atual) =>
      atual.map((l) => (l.lineId === lineId ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0)
    );
  }

  function removerLinha(lineId: string) {
    setLinhas((atual) => atual.filter((l) => l.lineId !== lineId));
  }

  const subtotal = linhas.reduce((s, l) => s + subtotalLinha(l), 0);
  const totalItens = linhas.reduce((s, l) => s + l.qty, 0);

  async function salvar() {
    setErroLocal(null);
    if (!nome.trim() || !telefone.trim()) {
      setErroLocal('Informe nome e telefone do cliente.');
      return;
    }
    if (linhas.length === 0) {
      setErroLocal('Adicione pelo menos um item.');
      return;
    }
    if (tipo === 'delivery' && !endereco.trim()) {
      setErroLocal('Informe o endereço de entrega.');
      return;
    }
    if (tipo === 'encomenda' && !dataHora) {
      setErroLocal('Informe a data e hora combinada da encomenda.');
      return;
    }

    const itens: ItemPedidoManual[] = linhas.map((l) => ({
      produto_id: l.produtoId,
      quantidade: l.qty,
      observacao: l.observacao || undefined,
      opcoes: l.complementos.map((c) => ({ complemento_id: c.complementoId, quantidade: c.quantidade })),
    }));

    setSalvando(true);
    try {
      const sb = criarClientNavegador();
      const resultado = await criarPedidoManual(sb, {
        lojaSlug,
        clienteNome: nome,
        clienteTelefone: telefone,
        tipo,
        endereco: endereco || undefined,
        observacao: observacao || undefined,
        itens,
        dataHoraAgendada: tipo === 'encomenda' && dataHora ? new Date(dataHora).toISOString() : undefined,
        origem: 'telefone',
        statusInicial: 'confirmado',
      });
      await onCriado(resultado.numero);
      onFechar();
    } catch (err) {
      const msg = 'Não foi possível criar o pedido: ' + (err as Error).message;
      setErroLocal(msg);
      onErro(msg);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className={styles.overlay} role="presentation">
      <div className={styles.janela} role="dialog" aria-modal="true" aria-labelledby="novoPedidoTitulo">
        <div className={styles.topo}>
          <h2 id="novoPedidoTitulo">Novo pedido</h2>
          <button type="button" aria-label="Fechar" onClick={onFechar}>
            ✕
          </button>
        </div>

        <div className={styles.corpo}>
          <nav className={styles.colCategorias} aria-label="Categorias">
            <h3>Categorias</h3>
            <button
              type="button"
              className={categoriaId === 'todos' ? styles.categoriaAtiva : styles.categoria}
              onClick={() => setCategoriaId('todos')}
            >
              <span>Todos os itens</span>
              <span>{produtos.filter((p) => apareceNoTipo(p.tipos_pedido, tipo)).length}</span>
            </button>
            {categorias.map((c) => (
              <button
                type="button"
                key={c.id}
                className={categoriaId === c.id ? styles.categoriaAtiva : styles.categoria}
                onClick={() => setCategoriaId(c.id)}
              >
                <span>
                  {c.emoji ? c.emoji + ' ' : ''}
                  {c.nome}
                </span>
                <span>{contagemPorCategoria.get(c.id) ?? 0}</span>
              </button>
            ))}
          </nav>

          <section className={styles.colProdutos} aria-label="Produtos">
            <div className={styles.buscaProdutos}>
              <IconeBusca />
              <input
                type="text"
                placeholder="Encontre produtos por nome ou descrição"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>

            {filtrados.length === 0 ? (
              <p className={styles.produtosVazio}>Nenhum produto encontrado para {NOMES_TIPO[tipo].toLowerCase()}.</p>
            ) : (
              <div className={styles.grade}>
                {filtrados.map((p) => {
                  const minimo = precoMinimo(p);
                  const base = precoBase(p);
                  return (
                    <button type="button" key={p.id} className={styles.cardProduto} onClick={() => aoClicarProduto(p)}>
                      <span className={styles.cardFoto}>
                        {p.imagem_url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- foto do catálogo, vinda do Storage
                          <img src={p.imagem_url} alt={p.nome} loading="lazy" />
                        ) : (
                          <span aria-hidden="true">🖼️</span>
                        )}
                      </span>
                      <span className={styles.cardInfo}>
                        <strong>{p.nome}</strong>
                        <span>
                          {minimo > base && 'A partir de '}
                          {formatBRL(minimo > base ? minimo : base)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <aside className={styles.colCarrinho} aria-label="Novo pedido">
            <div className={styles.clienteCampo}>
              <label htmlFor="npNome">Nome do cliente</label>
              <input id="npNome" type="text" placeholder="Como se chama o cliente?" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className={styles.clienteCampo}>
              <label htmlFor="npTelefone">Telefone</label>
              <input id="npTelefone" type="tel" placeholder="(11) 91234-5678" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
            </div>

            <div className={styles.clienteCampo}>
              <label htmlFor="npTipo">Tipo do pedido</label>
              <select id="npTipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoManual)}>
                <option value="balcao">Balcão</option>
                <option value="mesa">Mesa</option>
                <option value="retirada">Retirada</option>
                <option value="delivery">Delivery</option>
                <option value="encomenda">Encomenda</option>
              </select>
            </div>

            {tipo === 'delivery' && (
              <div className={styles.clienteCampo}>
                <label htmlFor="npEndereco">Endereço de entrega</label>
                <input id="npEndereco" type="text" value={endereco} onChange={(e) => setEndereco(e.target.value)} />
              </div>
            )}
            {tipo === 'encomenda' && (
              <div className={styles.clienteCampo}>
                <label htmlFor="npDataHora">Data e hora combinada</label>
                <input id="npDataHora" type="datetime-local" value={dataHora} onChange={(e) => setDataHora(e.target.value)} />
              </div>
            )}

            <button type="button" className={styles.obsToggle} onClick={() => setObsAberta((v) => !v)}>
              <span>Observação do pedido</span>
              <span>{obsAberta ? '▲' : '▼'}</span>
            </button>
            {obsAberta && (
              <textarea
                className={styles.obsTexto}
                placeholder="Ex: troco para R$ 50, sem propaganda..."
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
              />
            )}

            <h3 className={styles.carrinhoTitulo}>Carrinho</h3>
            <div className={styles.carrinhoLista}>
              {linhas.length === 0 ? (
                <div className={styles.carrinhoVazio}>
                  <IconeCaixaVazia />
                  <span>Carrinho vazio</span>
                </div>
              ) : (
                linhas.map((l) => {
                  const precoUnit = l.precoUnit + extraDaLinha(l);
                  return (
                    <div key={l.lineId} className={styles.itemCarrinho}>
                      <div className={styles.itemCarrinhoInfo}>
                        <strong>{l.nome}</strong>
                        {l.complementos.length > 0 && (
                          <small>
                            {l.complementos.map((c) => (c.quantidade > 1 ? `${c.quantidade}x ${c.nome}` : c.nome)).join(', ')}
                          </small>
                        )}
                        <span>{formatBRL(precoUnit)} un.</span>
                      </div>
                      <div className={styles.itemCarrinhoQtd}>
                        <button type="button" aria-label="Diminuir" onClick={() => mudarQtd(l.lineId, -1)}>
                          −
                        </button>
                        <b>{l.qty}</b>
                        <button type="button" aria-label="Aumentar" onClick={() => mudarQtd(l.lineId, 1)}>
                          +
                        </button>
                      </div>
                      <button type="button" className={styles.itemCarrinhoRemover} onClick={() => removerLinha(l.lineId)} aria-label={`Remover ${l.nome}`}>
                        ✕
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {erroLocal && <p className={styles.erro}>{erroLocal}</p>}

            <div className={styles.rodapeCarrinho}>
              <div className={styles.rodapeTotalLinha}>
                <span>{totalItens} {totalItens === 1 ? 'item' : 'itens'}</span>
                <strong>{formatBRL(subtotal)}</strong>
              </div>
              <button type="button" className={styles.criarPedido} disabled={salvando || linhas.length === 0} onClick={salvar}>
                {salvando ? 'Criando pedido…' : `Criar pedido · ${formatBRL(subtotal)}`}
              </button>
            </div>
          </aside>
        </div>
      </div>

      {produtoAberto && (
        <ModalDetalhesProdutoPedido
          produto={produtoAberto}
          tipoPedido={tipo}
          onFechar={() => setProdutoAberto(null)}
          onAdicionar={(escolhas, obs, qtd) => {
            adicionarLinha(produtoAberto, escolhas, obs, qtd);
            setProdutoAberto(null);
          }}
        />
      )}
    </div>
  );
}
