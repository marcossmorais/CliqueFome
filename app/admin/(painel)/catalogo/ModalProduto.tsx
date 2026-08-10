'use client';

import { useRef, useState } from 'react';
import { criarClientNavegador } from '@/lib/supabase/client';
import { subirImagemCatalogo } from '@/lib/catalogo/upload';
import { useEscFechar } from '@/hooks/useEscFechar';
import { ChipsToggle } from '@/components/admin/ChipsToggle';
import { DIAS, TIPOS_PEDIDO, type Categoria, type GrupoComplemento, type Produto } from '@/lib/catalogo/tipos';

type Pane = 'info' | 'compl' | 'disp';

export function ModalProduto({
  lojaId,
  produto,
  ordemNova,
  categorias,
  categoriaPreSelecionada,
  grupos,
  onFechar,
  onSalvo,
  onApagado,
  onErro,
}: {
  lojaId: string;
  produto: Produto | null;
  ordemNova: number;
  categorias: Categoria[];
  categoriaPreSelecionada: string | null;
  grupos: GrupoComplemento[];
  onFechar: () => void;
  onSalvo: () => void;
  onApagado: () => void;
  onErro: (msg: string) => void;
}) {
  useEscFechar(onFechar);

  const [pane, setPane] = useState<Pane>('info');

  const [nome, setNome] = useState(produto?.nome ?? '');
  const [categoriaId, setCategoriaId] = useState(produto ? produto.categoria_id ?? '' : categoriaPreSelecionada ?? '');
  const [etiqueta, setEtiqueta] = useState(produto?.etiqueta ?? '');
  const [destaque, setDestaque] = useState(produto?.destaque ?? false);
  const [preco, setPreco] = useState(produto ? String(produto.preco) : '');
  const [precoCusto, setPrecoCusto] = useState(produto?.preco_custo != null ? String(produto.preco_custo) : '');
  const [promocional, setPromocional] = useState(produto?.preco_promocional != null);
  const [precoPromo, setPrecoPromo] = useState(produto?.preco_promocional != null ? String(produto.preco_promocional) : '');
  const [descricao, setDescricao] = useState(produto?.descricao ?? '');

  const [avancadoAberto, setAvancadoAberto] = useState(false);
  const [codigoPdv, setCodigoPdv] = useState(produto?.codigo_pdv ?? '');
  const [unidade, setUnidade] = useState(produto?.unidade_medida ?? '');
  const [esconderObs, setEsconderObs] = useState(produto?.esconder_observacao ?? false);
  const [esconderQtd, setEsconderQtd] = useState(produto?.esconder_quantidade ?? false);

  const [listasSelecionadas, setListasSelecionadas] = useState<string[]>(
    produto ? (produto.produto_grupos || []).map((pg) => pg.grupo_id) : []
  );

  const [ativo, setAtivo] = useState(produto ? produto.ativo : true);
  const [diasSemana, setDiasSemana] = useState<string[]>((produto?.dias_semana || []).map(String));
  const [tiposPedido, setTiposPedido] = useState<string[]>(produto?.tipos_pedido || []);

  const [fotoPreview, setFotoPreview] = useState<string | null>(produto?.imagem_url ?? null);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  const [salvando, setSalvando] = useState(false);

  function onEscolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoPreview(URL.createObjectURL(file));
  }
  function removerFoto() {
    if (fotoInputRef.current) fotoInputRef.current.value = '';
    setFotoPreview(null);
  }

  function toggleLista(id: string) {
    setListasSelecionadas((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  }
  function toggleDia(id: string) {
    setDiasSemana((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  }
  function toggleTipo(id: string) {
    setTiposPedido((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  }

  async function salvar() {
    const nomeAparado = nome.trim();
    const precoNum = parseFloat(preco);
    if (!nomeAparado) {
      onErro('Dê um nome pro produto.');
      return;
    }
    if (isNaN(precoNum)) {
      onErro('Informe o preço de venda.');
      return;
    }

    let precoPromoNum: number | null = null;
    if (promocional) {
      precoPromoNum = parseFloat(precoPromo);
      if (isNaN(precoPromoNum)) {
        onErro('Informe o preço promocional ou desligue a promoção.');
        return;
      }
      if (precoPromoNum >= precoNum) {
        onErro('O preço promocional precisa ser menor que o preço de venda.');
        return;
      }
    }

    setSalvando(true);
    try {
      const sb = criarClientNavegador();

      let imagemUrl = produto?.imagem_url ?? null;
      const file = fotoInputRef.current?.files?.[0];
      if (file) imagemUrl = await subirImagemCatalogo(sb, lojaId, file);
      else if (!fotoPreview) imagemUrl = null;

      const dados: Record<string, unknown> = {
        loja_id: lojaId,
        nome: nomeAparado,
        descricao: descricao.trim() || null,
        preco: precoNum,
        preco_promocional: precoPromoNum,
        preco_custo: precoCusto === '' ? null : parseFloat(precoCusto),
        categoria_id: categoriaId || null,
        etiqueta: etiqueta || null,
        destaque,
        codigo_pdv: codigoPdv.trim() || null,
        unidade_medida: unidade.trim() || null,
        esconder_observacao: esconderObs,
        esconder_quantidade: esconderQtd,
        dias_semana: diasSemana.map(Number),
        tipos_pedido: tiposPedido,
        ativo,
        imagem_url: imagemUrl,
      };

      // Item novo entra no fim da lista; editando, a posição atual é
      // preservada (quem muda ordem é o arrasto).
      if (!produto) dados.ordem = ordemNova;

      let produtoId: string;
      if (produto) {
        const { error } = await sb.from('produtos').update(dados).eq('id', produto.id);
        if (error) throw error;
        produtoId = produto.id;
      } else {
        const { data: novo, error } = await sb.from('produtos').insert(dados).select().single();
        if (error) throw error;
        produtoId = novo.id;
      }

      const { error: delErr } = await sb.from('produto_grupos').delete().eq('produto_id', produtoId);
      if (delErr) throw delErr;
      if (listasSelecionadas.length > 0) {
        const links = listasSelecionadas.map((gid, i) => ({ produto_id: produtoId, grupo_id: gid, ordem: i }));
        const { error: linkErr } = await sb.from('produto_grupos').insert(links);
        if (linkErr) throw linkErr;
      }

      onSalvo();
    } catch (err) {
      onErro('Erro ao salvar: ' + (err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function apagar() {
    if (!produto) return;
    if (!confirm(`Apagar "${produto.nome}"? Não tem como desfazer.`)) return;
    const sb = criarClientNavegador();
    const { error } = await sb.from('produtos').delete().eq('id', produto.id);
    if (error) {
      onErro('Erro ao apagar: ' + error.message);
      return;
    }
    onApagado();
  }

  return (
    <div className="modal aberto">
      <div className="modal-backdrop" onClick={onFechar} />
      <div className="modal-sheet">
        <div className="modal-topo">
          <div className="modal-tabs">
            <button type="button" className={'modal-tab' + (pane === 'info' ? ' ativo' : '')} onClick={() => setPane('info')}>
              Informações
            </button>
            <button type="button" className={'modal-tab' + (pane === 'compl' ? ' ativo' : '')} onClick={() => setPane('compl')}>
              Complementos
            </button>
            <button type="button" className={'modal-tab' + (pane === 'disp' ? ' ativo' : '')} onClick={() => setPane('disp')}>
              Disponibilidade
            </button>
          </div>
          <button type="button" className="modal-fechar" aria-label="Fechar" onClick={onFechar}>
            ✕
          </button>
        </div>

        <div className="modal-corpo">
          <div className={'modal-pane' + (pane === 'info' ? ' ativo' : '')}>
            <div className="form-linha">
              <div className="foto-col">
                <label
                  className={'foto-slot' + (fotoPreview ? '' : '')}
                  title="Clique pra escolher uma imagem"
                  style={fotoPreview ? { backgroundImage: `url(${fotoPreview})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                >
                  {!fotoPreview && <span>🖼️</span>}
                  <input type="file" accept="image/*" ref={fotoInputRef} onChange={onEscolherFoto} style={{ display: 'none' }} />
                </label>
                {fotoPreview && (
                  <button type="button" className="btn-ghost btn-small" onClick={removerFoto}>
                    Remover imagem
                  </button>
                )}
              </div>
              <div>
                <label htmlFor="prodNome">Nome do produto *</label>
                <input type="text" id="prodNome" value={nome} onChange={(e) => setNome(e.target.value)} />
                <div className="form-linha">
                  <div>
                    <label htmlFor="prodCategoria">Categoria</label>
                    <select id="prodCategoria" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                      <option value="">Sem categoria</option>
                      {categorias.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="prodEtiqueta">Etiqueta</label>
                    <select id="prodEtiqueta" value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)}>
                      <option value="">Nenhuma etiqueta</option>
                      <option value="mais_pedido">Mais pedido</option>
                      <option value="novidade">Novidade</option>
                      <option value="recomendado">Recomendado</option>
                      <option value="edicao_limitada">Edição limitada</option>
                    </select>
                  </div>
                </div>
                <div className="campo-inline">
                  <label className="switch">
                    <input type="checkbox" checked={destaque} onChange={(e) => setDestaque(e.target.checked)} />
                    <span className="switch-track"></span>
                  </label>
                  <label>Destaque — sobe pro topo do cardápio</label>
                </div>
              </div>
            </div>

            <div className="form-linha">
              <div>
                <label htmlFor="prodPreco">Preço de venda *</label>
                <input type="number" id="prodPreco" step="0.01" min="0" value={preco} onChange={(e) => setPreco(e.target.value)} />
              </div>
              <div>
                <label htmlFor="prodPrecoCusto">Preço de custo</label>
                <input type="number" id="prodPrecoCusto" step="0.01" min="0" value={precoCusto} onChange={(e) => setPrecoCusto(e.target.value)} />
              </div>
            </div>

            <div className="campo-inline">
              <label className="switch">
                <input type="checkbox" checked={promocional} onChange={(e) => setPromocional(e.target.checked)} />
                <span className="switch-track"></span>
              </label>
              <label>Promocional</label>
            </div>
            {promocional && (
              <div>
                <label htmlFor="prodPrecoPromo">Preço promocional</label>
                <input type="number" id="prodPrecoPromo" step="0.01" min="0" value={precoPromo} onChange={(e) => setPrecoPromo(e.target.value)} />
                <p className="dica">É esse valor que vale na venda — o preço normal aparece riscado no cardápio.</p>
              </div>
            )}

            <label htmlFor="prodDescricao">Descrição do produto</label>
            <textarea id="prodDescricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} />

            <button type="button" className="avancado-toggle" onClick={() => setAvancadoAberto((v) => !v)}>
              Configurações avançadas
            </button>
            <div className={'avancado-corpo' + (avancadoAberto ? ' aberto' : '')}>
              <div className="form-linha">
                <div>
                  <label htmlFor="prodCodigoPdv">Código PDV</label>
                  <input type="text" id="prodCodigoPdv" value={codigoPdv} onChange={(e) => setCodigoPdv(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="prodCodigoInterno">Código interno</label>
                  <input type="text" id="prodCodigoInterno" readOnly value={produto?.codigo_interno ?? '(gerado ao salvar)'} />
                </div>
              </div>
              <label htmlFor="prodUnidade">Unidade de medida</label>
              <input type="text" id="prodUnidade" placeholder="ex: un, kg, 500ml" value={unidade} onChange={(e) => setUnidade(e.target.value)} />
              <p className="dica">A posição do item no cardápio é definida arrastando ele pela alça na lista.</p>
              <div className="campo-inline">
                <label className="switch">
                  <input type="checkbox" checked={esconderObs} onChange={(e) => setEsconderObs(e.target.checked)} />
                  <span className="switch-track"></span>
                </label>
                <label>Esconder campo de observação</label>
              </div>
              <div className="campo-inline">
                <label className="switch">
                  <input type="checkbox" checked={esconderQtd} onChange={(e) => setEsconderQtd(e.target.checked)} />
                  <span className="switch-track"></span>
                </label>
                <label>Esconder botões de quantidade</label>
              </div>
            </div>
          </div>

          <div className={'modal-pane' + (pane === 'compl' ? ' ativo' : '')}>
            <p className="sub">
              Marque as listas de complemento que aparecem neste produto. Pra criar ou editar uma lista, use
              a aba <strong>Complementos</strong> do catálogo.
            </p>
            {grupos.length === 0 ? (
              <div className="lista-vazia" style={{ paddingLeft: 0 }}>
                Nenhuma lista cadastrada ainda.
              </div>
            ) : (
              <ChipsToggle
                itens={grupos.map((g) => ({ id: g.id, nome: g.nome }))}
                selecionados={listasSelecionadas}
                onToggle={toggleLista}
              />
            )}
          </div>

          <div className={'modal-pane' + (pane === 'disp' ? ' ativo' : '')}>
            <div className="campo-inline">
              <label className="switch">
                <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
                <span className="switch-track"></span>
              </label>
              <label>Disponível no cardápio</label>
            </div>
            <label>Dias da semana</label>
            <p className="dica">Nenhum dia marcado = o item aparece todos os dias.</p>
            <ChipsToggle itens={DIAS} selecionados={diasSemana} onToggle={toggleDia} />
            <label>Tipos de pedido</label>
            <p className="dica">Nenhum marcado = canais normais. Marque Encomenda / agendamento para permitir pedidos futuros deste produto.</p>
            <ChipsToggle itens={TIPOS_PEDIDO} selecionados={tiposPedido} onToggle={toggleTipo} />
          </div>
        </div>

        <div className="modal-rodape">
          {produto && (
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
