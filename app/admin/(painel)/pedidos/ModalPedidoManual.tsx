'use client';

import { useState } from 'react';
import { criarClientNavegador } from '@/lib/supabase/client';
import { useEscFechar } from '@/hooks/useEscFechar';
import { criarPedidoManual } from '@/lib/pedidos/acoes';
import { formatBRL } from '@/lib/pedidos/tipos';
import type { ProdutoPicker } from './page';

type TipoManual = 'delivery' | 'retirada' | 'balcao' | 'mesa' | 'encomenda';
type ItemSel = { produtoId: string; nome: string; preco: number; quantidade: number };

export function ModalPedidoManual({
  lojaSlug,
  produtos,
  onFechar,
  onCriado,
  onErro,
}: {
  lojaSlug: string;
  produtos: ProdutoPicker[];
  onFechar: () => void;
  onCriado: (numeroPedido: number) => Promise<void> | void;
  onErro: (msg: string) => void;
}) {
  useEscFechar(onFechar);

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [tipo, setTipo] = useState<TipoManual>('balcao');
  const [endereco, setEndereco] = useState('');
  const [dataHora, setDataHora] = useState('');
  const [formaPagamento, setFormaPagamento] = useState('');
  const [origem, setOrigem] = useState<'instagram' | 'telefone' | 'outro'>('telefone');
  const [statusInicial, setStatusInicial] = useState<'pendente' | 'confirmado'>('confirmado');
  const [observacao, setObservacao] = useState('');

  const [filtro, setFiltro] = useState('');
  const [itens, setItens] = useState<ItemSel[]>([]);
  const [salvando, setSalvando] = useState(false);

  const encontrados = filtro.trim()
    ? produtos.filter((p) => p.nome.toLowerCase().includes(filtro.trim().toLowerCase())).slice(0, 6)
    : [];

  function adicionarItem(p: ProdutoPicker) {
    const preco = p.preco_promocional ?? p.preco;
    setItens((atual) => {
      const existente = atual.find((i) => i.produtoId === p.id);
      if (existente) {
        return atual.map((i) => (i.produtoId === p.id ? { ...i, quantidade: i.quantidade + 1 } : i));
      }
      return [...atual, { produtoId: p.id, nome: p.nome, preco, quantidade: 1 }];
    });
    setFiltro('');
  }
  function mudarQtd(produtoId: string, delta: number) {
    setItens((atual) =>
      atual
        .map((i) => (i.produtoId === produtoId ? { ...i, quantidade: i.quantidade + delta } : i))
        .filter((i) => i.quantidade > 0)
    );
  }

  const totalEstimado = itens.reduce((s, i) => s + i.preco * i.quantidade, 0);

  async function salvar() {
    if (!nome.trim() || !telefone.trim()) {
      onErro('Informe nome e telefone do cliente.');
      return;
    }
    if (itens.length === 0) {
      onErro('Adicione pelo menos um item.');
      return;
    }
    if (tipo === 'encomenda' && !dataHora) {
      onErro('Informe a data e hora combinada da encomenda.');
      return;
    }
    if (tipo === 'delivery' && !endereco.trim()) {
      onErro('Informe o endereço de entrega.');
      return;
    }

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
        formaPagamento: formaPagamento || undefined,
        itens: itens.map((i) => ({ produto_id: i.produtoId, quantidade: i.quantidade })),
        dataHoraAgendada: tipo === 'encomenda' && dataHora ? new Date(dataHora).toISOString() : undefined,
        origem,
        statusInicial,
      });
      await onCriado(resultado.numero);
      onFechar();
    } catch (err) {
      onErro('Erro ao criar pedido: ' + (err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal aberto">
      <div className="modal-backdrop" onClick={onFechar} />
      <div className="modal-sheet">
        <div className="modal-topo">
          <div className="modal-titulo">Novo pedido manual</div>
          <button type="button" className="modal-fechar" aria-label="Fechar" onClick={onFechar}>
            ✕
          </button>
        </div>

        <div className="modal-corpo">
          <div className="form-linha">
            <div>
              <label htmlFor="pmNome">Nome do cliente *</label>
              <input type="text" id="pmNome" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div>
              <label htmlFor="pmTelefone">Telefone *</label>
              <input type="text" id="pmTelefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
            </div>
          </div>

          <div className="form-linha">
            <div>
              <label htmlFor="pmTipo">Tipo</label>
              <select id="pmTipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoManual)}>
                <option value="balcao">Balcão</option>
                <option value="mesa">Mesa</option>
                <option value="retirada">Retirada</option>
                <option value="delivery">Delivery</option>
                <option value="encomenda">Encomenda</option>
              </select>
            </div>
            <div>
              <label htmlFor="pmOrigem">Origem</label>
              <select id="pmOrigem" value={origem} onChange={(e) => setOrigem(e.target.value as typeof origem)}>
                <option value="telefone">Telefone</option>
                <option value="instagram">Instagram</option>
                <option value="outro">Outro</option>
              </select>
            </div>
          </div>

          {(tipo === 'delivery' || tipo === 'encomenda') && (
            <>
              <label htmlFor="pmEndereco">Endereço {tipo === 'delivery' ? '*' : '(vazio = retirada)'}</label>
              <input type="text" id="pmEndereco" value={endereco} onChange={(e) => setEndereco(e.target.value)} />
            </>
          )}

          {tipo === 'encomenda' && (
            <>
              <label htmlFor="pmDataHora">Data e hora combinada *</label>
              <input
                type="datetime-local"
                id="pmDataHora"
                value={dataHora}
                onChange={(e) => setDataHora(e.target.value)}
              />
            </>
          )}

          <label>Itens</label>
          <div className="cat-busca" style={{ marginBottom: 8 }}>
            <input
              type="text"
              placeholder="Buscar produto pra adicionar"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
            />
          </div>
          {encontrados.length > 0 && (
            <div className="pedido-manual-sugestoes">
              {encontrados.map((p) => (
                <button type="button" key={p.id} className="pedido-manual-sugestao" onClick={() => adicionarItem(p)}>
                  <span>{p.nome}</span>
                  <span>{formatBRL(p.preco_promocional ?? p.preco)}</span>
                </button>
              ))}
            </div>
          )}

          {itens.length === 0 ? (
            <p className="dica">Nenhum item adicionado ainda.</p>
          ) : (
            <div style={{ marginBottom: 16 }}>
              {itens.map((i) => (
                <div key={i.produtoId} className="pedido-manual-item">
                  <span className="pedido-manual-item-nome">{i.nome}</span>
                  <span className="stepper">
                    <button type="button" onClick={() => mudarQtd(i.produtoId, -1)}>
                      −
                    </button>
                    <b>{i.quantidade}</b>
                    <button type="button" onClick={() => mudarQtd(i.produtoId, 1)}>
                      +
                    </button>
                  </span>
                  <span>{formatBRL(i.preco * i.quantidade)}</span>
                </div>
              ))}
              <div className="pedido-total-linha pedido-total-final" style={{ marginTop: 8 }}>
                <span>Total</span>
                <span>{formatBRL(totalEstimado)}</span>
              </div>
              <p className="dica" style={{ marginBottom: 0 }}>
                Este pedido manual não passa pela escolha de complementos — cadastre um item já composto no
                catálogo se precisar disso (ex: &quot;Combo X&quot;).
              </p>
            </div>
          )}

          <div className="form-linha">
            <div>
              <label htmlFor="pmPagamento">Forma de pagamento</label>
              <input
                type="text"
                id="pmPagamento"
                placeholder="ex: Pix, Dinheiro, Cartão"
                value={formaPagamento}
                onChange={(e) => setFormaPagamento(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="pmStatus">Status inicial</label>
              <select id="pmStatus" value={statusInicial} onChange={(e) => setStatusInicial(e.target.value as typeof statusInicial)}>
                <option value="confirmado">Já confirmado</option>
                <option value="pendente">Pendente (revisar depois)</option>
              </select>
            </div>
          </div>

          <label htmlFor="pmObs">Observação</label>
          <textarea id="pmObs" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </div>

        <div className="modal-rodape">
          <button type="button" className="btn-ghost" onClick={onFechar}>
            Cancelar
          </button>
          <button type="button" className="btn-primary" disabled={salvando} onClick={salvar}>
            {salvando ? 'Salvando...' : 'Criar pedido'}
          </button>
        </div>
      </div>
    </div>
  );
}
