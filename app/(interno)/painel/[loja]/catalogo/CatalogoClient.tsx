'use client';

import { useState } from 'react';
import { criarClientNavegador } from '@/lib/supabase/client';
import { IconeBusca } from '@/components/admin/IconesCatalogo';
import { ColunaCategorias } from './ColunaCategorias';
import { GridProdutos } from './GridProdutos';
import { ListaComplementos } from './ListaComplementos';
import { ModalProduto } from './ModalProduto';
import { ModalCategoria } from './ModalCategoria';
import { ModalLista } from './ModalLista';
import type { Categoria, GrupoComplemento, Produto } from '@/lib/catalogo/tipos';
import { BEBIDAS_PRESET } from '@/lib/catalogo/presets';

type Subtab = 'produtos' | 'complementos' | 'sugestoes';

/**
 * Orquestrador do Catálogo — porta do bloco monolítico do admin.html
 * original, com o mesmo estado (subaba ativa, busca, categoria selecionada,
 * categorias/produtos/grupos) agora vivendo em React em vez de variáveis
 * globais + innerHTML.
 */
export function CatalogoClient({
  lojaId,
  nicho,
  categoriasIniciais,
  produtosIniciais,
  gruposIniciais,
}: {
  lojaId: string;
  nicho: string | null;
  categoriasIniciais: Categoria[];
  produtosIniciais: Produto[];
  gruposIniciais: GrupoComplemento[];
}) {
  const [subtab, setSubtab] = useState<Subtab>('produtos');
  const [busca, setBusca] = useState('');
  const [categoriaSelecionadaId, setCategoriaSelecionadaId] = useState<string | null>(null);

  const [categorias, setCategorias] = useState(categoriasIniciais);
  const [produtos, setProdutos] = useState(produtosIniciais);
  const [grupos, setGrupos] = useState(gruposIniciais);
  const [produtoAtualizandoId, setProdutoAtualizandoId] = useState<string | null>(null);

  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const [modalProduto, setModalProduto] = useState<{ aberto: boolean; produto: Produto | null }>({
    aberto: false,
    produto: null,
  });
  const [modalCategoria, setModalCategoria] = useState<{ aberto: boolean; categoria: Categoria | null }>({
    aberto: false,
    categoria: null,
  });
  const [modalLista, setModalLista] = useState<{ aberto: boolean; lista: GrupoComplemento | null }>({
    aberto: false,
    lista: null,
  });

  function mostrarMsg(texto: string, tipo: 'ok' | 'erro' = 'erro') {
    setMsg({ tipo, texto });
    if (tipo === 'ok') setTimeout(() => setMsg(null), 3500);
  }

  async function recarregarCategorias() {
    const sb = criarClientNavegador();
    const { data, error } = await sb.from('categorias').select('*').eq('loja_id', lojaId).order('ordem');
    if (error) {
      mostrarMsg('Erro ao carregar categorias: ' + error.message);
      return;
    }
    setCategorias((data as Categoria[]) || []);
  }

  async function recarregarProdutos() {
    const sb = criarClientNavegador();
    const { data, error } = await sb
      .from('produtos')
      .select('*, produto_grupos(grupo_id)')
      .eq('loja_id', lojaId)
      .order('ordem');
    if (error) {
      mostrarMsg('Erro ao carregar itens: ' + error.message);
      return;
    }
    setProdutos((data as Produto[]) || []);
  }

  async function recarregarGrupos() {
    const sb = criarClientNavegador();
    const { data, error } = await sb
      .from('grupos_complemento')
      .select('*, complementos(*)')
      .eq('loja_id', lojaId)
      .order('ordem');
    if (error) {
      mostrarMsg('Erro ao carregar listas: ' + error.message);
      return;
    }
    const ordenados = ((data as GrupoComplemento[]) || []).map((g) => ({
      ...g,
      complementos: [...(g.complementos || [])].sort((a, b) => a.ordem - b.ordem),
    }));
    setGrupos(ordenados);
  }

  // ---------- arrastar (grava a nova ordem no banco) ----------
  async function gravarOrdem(tabela: 'categorias' | 'produtos', ids: string[]) {
    const sb = criarClientNavegador();
    const resultados = await Promise.all(ids.map((id, i) => sb.from(tabela).update({ ordem: i }).eq('id', id)));
    const falhou = resultados.find((r) => r.error);
    if (falhou?.error) {
      mostrarMsg('Erro ao salvar a ordem: ' + falhou.error.message);
      return false;
    }
    return true;
  }

  async function onReordenarCategorias(ids: string[]) {
    if (await gravarOrdem('categorias', ids)) await recarregarCategorias();
  }
  async function onReordenarProdutos(ids: string[]) {
    if (await gravarOrdem('produtos', ids)) await recarregarProdutos();
  }

  // ---------- categorias ----------
  async function toggleVisibilidadeCategoria(c: Categoria) {
    const sb = criarClientNavegador();
    const { error } = await sb.from('categorias').update({ ativo: !c.ativo }).eq('id', c.id);
    if (error) {
      mostrarMsg('Erro ao atualizar: ' + error.message);
      return;
    }
    setCategorias((atual) => atual.map((x) => (x.id === c.id ? { ...x, ativo: !x.ativo } : x)));
  }

  async function adicionarBebidasProntas() {
    if (!confirm('Adicionar as bebidas nacionais mais comuns ao cardápio? Você poderá editar preços, fotos e disponibilidade depois.')) return;
    const sb = criarClientNavegador();
    let categoria = categorias.find((c) => c.nome.trim().toLowerCase() === 'bebidas');
    if (!categoria) {
      const { data, error } = await sb.from('categorias').insert({
        loja_id: lojaId, nome: 'Bebidas', emoji: null, icone: 'bebidas', ativo: true, ordem: categorias.length,
      }).select().single();
      if (error) { mostrarMsg('Erro ao criar categoria de bebidas: ' + error.message); return; }
      categoria = data as Categoria;
    }
    const existentes = new Set(produtos.map((p) => `${p.nome.trim().toLowerCase()}|${(p.descricao || '').trim().toLowerCase()}`));
    const origensExistentes = new Set(produtos.map((p) => p.preset_origem).filter(Boolean));
    const origemDoPreset = (imagemUrl: string) => `biblioteca:${imagemUrl.split('/').pop()?.replace(/\.webp$/, '')}`;
    const novos = BEBIDAS_PRESET.filter((b) => !origensExistentes.has(origemDoPreset(b.imagemUrl)) && !existentes.has(`${b.nome.toLowerCase()}|${b.volume.toLowerCase()}`));
    if (novos.length === 0) { mostrarMsg('As bebidas da biblioteca já estão no cardápio.', 'ok'); return; }
    const ordemInicial = produtos.length;
    const { error } = await sb.from('produtos').insert(novos.map((b, i) => ({
      loja_id: lojaId,
      categoria_id: categoria!.id,
      nome: b.nome,
      descricao: b.volume,
      preco: b.precoSugerido,
      imagem_url: b.imagemUrl,
      sugestao_carrinho: 'bebida',
      preset_origem: origemDoPreset(b.imagemUrl),
      unidade_medida: b.volume,
      ativo: true,
      ordem: ordemInicial + i,
      tipos_pedido: [],
      dias_semana: [],
    })));
    if (error) { mostrarMsg('Erro ao adicionar bebidas: ' + error.message); return; }
    mostrarMsg(`${novos.length} bebidas adicionadas. Confira os preços antes de publicar.`, 'ok');
    await Promise.all([recarregarCategorias(), recarregarProdutos()]);
  }

  async function toggleDisponibilidadeProduto(produto: Produto) {
    if (produtoAtualizandoId) return;
    const novoEstado = !produto.ativo;
    setProdutoAtualizandoId(produto.id);
    setProdutos((atual) => atual.map((item) => item.id === produto.id ? { ...item, ativo: novoEstado } : item));

    const sb = criarClientNavegador();
    const { error } = await sb
      .from('produtos')
      .update({ ativo: novoEstado })
      .eq('id', produto.id)
      .eq('loja_id', lojaId);

    if (error) {
      setProdutos((atual) => atual.map((item) => item.id === produto.id ? { ...item, ativo: produto.ativo } : item));
      mostrarMsg('Não foi possível alterar a disponibilidade do produto.');
    } else {
      mostrarMsg(novoEstado ? 'Produto disponível.' : 'Produto marcado como esgotado.', 'ok');
    }
    setProdutoAtualizandoId(null);
  }

  async function atualizarSugestao(produto: Produto, sugestao: '' | 'bebida' | 'acompanhamento') {
    const sb = criarClientNavegador();
    const valor = sugestao || null;
    const { error } = await sb.from('produtos').update({ sugestao_carrinho: valor }).eq('id', produto.id).eq('loja_id', lojaId);
    if (error) { mostrarMsg('Não foi possível atualizar a sugestão.'); return; }
    setProdutos((atual) => atual.map((item) => item.id === produto.id ? { ...item, sugestao_carrinho: valor } : item));
    mostrarMsg('Sugestão atualizada.', 'ok');
  }

  async function atualizarSugestaoComplemento(grupoId: string, complementoId: string, marcado: boolean) {
    const sb = criarClientNavegador();
    const { error } = await sb.from('complementos').update({ sugestao_carrinho: marcado }).eq('id', complementoId);
    if (error) { mostrarMsg('Não foi possível atualizar o complemento sugerido.'); return; }
    setGrupos((atual) => atual.map((grupo) => grupo.id !== grupoId ? grupo : {
      ...grupo,
      complementos: grupo.complementos.map((opcao) => opcao.id === complementoId ? { ...opcao, sugestao_carrinho: marcado } : opcao),
    }));
    mostrarMsg('Sugestão atualizada.', 'ok');
  }

  // ---------- botão "+ Novo" muda conforme a subaba ----------
  const botaoNovo =
    subtab === 'produtos'
      ? { label: '+ Novo produto', onClick: () => setModalProduto({ aberto: true, produto: null }) }
      : subtab === 'complementos'
      ? { label: '+ Nova lista', onClick: () => setModalLista({ aberto: true, lista: null }) }
      : null;

  return (
    <div className="area ativo">
      {msg && <div className={'msg msg-' + msg.tipo}>{msg.texto}</div>}

      <div className="cat-bar">
        <div className="cat-subtabs">
          <button
            type="button"
            className={'cat-subtab' + (subtab === 'produtos' ? ' ativo' : '')}
            onClick={() => setSubtab('produtos')}
          >
            Produtos
          </button>
          <button
            type="button"
            className={'cat-subtab' + (subtab === 'complementos' ? ' ativo' : '')}
            onClick={() => setSubtab('complementos')}
          >
            Complementos
          </button>
          <button
            type="button"
            className={'cat-subtab' + (subtab === 'sugestoes' ? ' ativo' : '')}
            onClick={() => setSubtab('sugestoes')}
          >
            Sugestões
          </button>
        </div>
        <div className="cat-acoes">
          <div className="cat-busca">
            <IconeBusca />
            <input
              type="text"
              placeholder="Pesquisar"
              value={busca}
              onChange={(e) => setBusca(e.target.value.trim().toLowerCase())}
            />
          </div>
          {botaoNovo && (
            <button type="button" className="btn-primary btn-small" onClick={botaoNovo.onClick}>
              {botaoNovo.label}
            </button>
          )}
          {subtab === 'produtos' && (
            <button type="button" className="btn-ghost btn-small" onClick={() => void adicionarBebidasProntas()}>
              + Bebidas prontas
            </button>
          )}
        </div>
      </div>

      {subtab === 'produtos' && (
        <div className="subtab ativo">
          <div className="catalogo-split">
            <ColunaCategorias
              categorias={categorias}
              produtos={produtos}
              categoriaSelecionadaId={categoriaSelecionadaId}
              busca={busca}
              onSelecionar={setCategoriaSelecionadaId}
              onNova={() => setModalCategoria({ aberto: true, categoria: null })}
              onEditar={(c) => setModalCategoria({ aberto: true, categoria: c })}
              onToggleVisibilidade={toggleVisibilidadeCategoria}
              onReordenar={onReordenarCategorias}
            />
            <GridProdutos
              produtos={produtos}
              categorias={categorias}
              categoriaSelecionadaId={categoriaSelecionadaId}
              busca={busca}
              onEditarCategoria={(c) => setModalCategoria({ aberto: true, categoria: c })}
              onEditarProduto={(p) => setModalProduto({ aberto: true, produto: p })}
              onToggleDisponibilidade={(p) => void toggleDisponibilidadeProduto(p)}
              produtoAtualizandoId={produtoAtualizandoId}
              onReordenar={onReordenarProdutos}
            />
          </div>
        </div>
      )}

      {subtab === 'complementos' && (
        <div className="subtab ativo">
          <ListaComplementos
            grupos={grupos}
            produtos={produtos}
            busca={busca}
            onEditar={(g) => setModalLista({ aberto: true, lista: g })}
          />
        </div>
      )}

      {subtab === 'sugestoes' && (
        <div className="subtab ativo">
          <div className="card" style={{ maxWidth: 920 }}>
            <h2>Sugestões do carrinho</h2>
            <p className="sub">Selecione o que pode aparecer no carrinho. Os modelos nunca sobrescrevem esta configuração.</p>
            <h3>Produtos do cardápio</h3>
            <div style={{ display: 'grid', gap: 8, marginBottom: 24 }}>
              {produtos.filter((p) => !busca || `${p.nome} ${p.descricao || ''}`.toLowerCase().includes(busca)).map((produto) => (
                <div key={produto.id} className="sugestao-produto-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 12, alignItems: 'center', padding: 10, border: '1px solid #e3e8e5', borderRadius: 10 }}>
                  <span><strong>{produto.nome}</strong><small style={{ display: 'block', opacity: .7 }}>{categorias.find((c) => c.id === produto.categoria_id)?.nome || 'Sem categoria'}</small></span>
                  <label><input type="checkbox" checked={produto.sugestao_carrinho === 'bebida'} onChange={(e) => void atualizarSugestao(produto, e.target.checked ? 'bebida' : '')} /> Para beber</label>
                  <label><input type="checkbox" checked={produto.sugestao_carrinho === 'acompanhamento'} onChange={(e) => void atualizarSugestao(produto, e.target.checked ? 'acompanhamento' : '')} /> Acompanhamento</label>
                </div>
              ))}
            </div>
            <h3>Complementos</h3>
            <p className="sub">Só aparecem quando pertencem ao produto do carrinho e ainda existe quantidade disponível na lista.</p>
            <div style={{ display: 'grid', gap: 12 }}>
              {grupos.map((grupo) => (
                <section key={grupo.id} style={{ padding: 12, border: '1px solid #e3e8e5', borderRadius: 10 }}>
                  <strong>{grupo.nome}</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
                    {grupo.complementos.map((opcao) => (
                      <label key={opcao.id}><input type="checkbox" checked={opcao.sugestao_carrinho || false} onChange={(e) => void atualizarSugestaoComplemento(grupo.id, opcao.id, e.target.checked)} /> {opcao.nome}</label>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}

      {modalProduto.aberto && (
        <ModalProduto
          lojaId={lojaId}
          produto={modalProduto.produto}
          ordemNova={produtos.length}
          categorias={categorias}
          categoriaPreSelecionada={categoriaSelecionadaId}
          grupos={grupos}
          onFechar={() => setModalProduto({ aberto: false, produto: null })}
          onErro={(m) => mostrarMsg(m, 'erro')}
          onSalvo={async () => {
            setModalProduto({ aberto: false, produto: null });
            mostrarMsg('Produto salvo.', 'ok');
            await recarregarProdutos();
          }}
          onApagado={async (produtoId) => {
            // Tira o card antes de qualquer ida ao servidor. O delete já
            // confirmou a linha removida; esperar o recarregamento deixava o
            // produto visível por mais um instante, e dava a impressão de
            // que nada tinha acontecido.
            setProdutos((atual) => atual.filter((p) => p.id !== produtoId));
            setModalProduto({ aberto: false, produto: null });
            mostrarMsg('Produto apagado.', 'ok');
            await recarregarProdutos();
          }}
        />
      )}

      {modalCategoria.aberto && (
        <ModalCategoria
          lojaId={lojaId}
          categoria={modalCategoria.categoria}
          ordemNova={categorias.length}
          onFechar={() => setModalCategoria({ aberto: false, categoria: null })}
          onErro={(m) => mostrarMsg(m, 'erro')}
          onSalvo={async () => {
            setModalCategoria({ aberto: false, categoria: null });
            mostrarMsg('Categoria salva.', 'ok');
            await recarregarCategorias();
          }}
          onApagado={async () => {
            if (categoriaSelecionadaId === modalCategoria.categoria?.id) setCategoriaSelecionadaId(null);
            setModalCategoria({ aberto: false, categoria: null });
            mostrarMsg('Categoria apagada.', 'ok');
            await recarregarCategorias();
            await recarregarProdutos();
          }}
        />
      )}

      {modalLista.aberto && (
        <ModalLista
          lojaId={lojaId}
          nicho={nicho}
          lista={modalLista.lista}
          categorias={categorias}
          produtos={produtos}
          onFechar={() => setModalLista({ aberto: false, lista: null })}
          onErro={(m) => mostrarMsg(m, 'erro')}
          onSalvo={async () => {
            setModalLista({ aberto: false, lista: null });
            mostrarMsg('Lista salva.', 'ok');
            await recarregarGrupos();
          }}
          onApagado={async () => {
            setModalLista({ aberto: false, lista: null });
            mostrarMsg('Lista apagada.', 'ok');
            await recarregarGrupos();
            await recarregarProdutos();
          }}
        />
      )}
    </div>
  );
}
