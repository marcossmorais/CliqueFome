'use client';

import { useState } from 'react';
import { criarClientNavegador } from '@/lib/supabase/client';
import { IconeBusca } from '@/components/admin/IconesCatalogo';
import { ColunaCategorias } from './ColunaCategorias';
import { GridProdutos } from './GridProdutos';
import { ListaComplementos } from './ListaComplementos';
import { GridOpcoes } from './GridOpcoes';
import { ModalProduto } from './ModalProduto';
import { ModalCategoria } from './ModalCategoria';
import { ModalLista } from './ModalLista';
import type { Categoria, GrupoComplemento, Produto } from '@/lib/catalogo/tipos';

type Subtab = 'produtos' | 'complementos' | 'opcoes';

/**
 * Orquestrador do Catálogo — porta do bloco monolítico do admin.html
 * original, com o mesmo estado (subaba ativa, busca, categoria selecionada,
 * categorias/produtos/grupos) agora vivendo em React em vez de variáveis
 * globais + innerHTML.
 */
export function CatalogoClient({
  lojaId,
  categoriasIniciais,
  produtosIniciais,
  gruposIniciais,
}: {
  lojaId: string;
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
            className={'cat-subtab' + (subtab === 'opcoes' ? ' ativo' : '')}
            onClick={() => setSubtab('opcoes')}
          >
            Opções
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

      {subtab === 'opcoes' && (
        <div className="subtab ativo">
          <GridOpcoes grupos={grupos} busca={busca} onEditarLista={(g) => setModalLista({ aberto: true, lista: g })} />
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
          onApagado={async () => {
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
