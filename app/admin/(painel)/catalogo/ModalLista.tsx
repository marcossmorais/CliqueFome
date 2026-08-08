'use client';

import { useState } from 'react';
import { criarClientNavegador } from '@/lib/supabase/client';
import { subirImagemCatalogo } from '@/lib/catalogo/upload';
import { useArrastar } from '@/hooks/useArrastar';
import { useEscFechar } from '@/hooks/useEscFechar';
import { ChipsToggle } from '@/components/admin/ChipsToggle';
import { Alca } from '@/components/admin/IconesCatalogo';
import { TIPOS_PEDIDO, type Categoria, type GrupoComplemento, type Produto } from '@/lib/catalogo/tipos';

type TipoSelecao = 'uma' | 'varias' | 'varias_repetir';
type ModoPreco = 'soma' | 'media' | 'maior' | 'menor';

type OpcaoEdit = {
  uid: string;
  id?: string;
  nome: string;
  preco: string;
  qtdMax: string;
  imagemUrl: string | null;
  previewUrl: string | null;
  arquivo: File | null;
  ativo: boolean;
};

let uidSeq = 0;
function novoUid() {
  return 'u' + ++uidSeq;
}

const CARTOES_SELECAO: { valor: TipoSelecao; titulo: string; texto: string }[] = [
  { valor: 'uma', titulo: 'Apenas uma das opções', texto: 'Vira bolinha de marcar. Ex: tamanho — ou P, ou M, ou G.' },
  { valor: 'varias', titulo: 'Mais de uma, sem repetir', texto: 'Vira caixinha de marcar. Ex: adicionais — pode bacon e cheddar, 1x cada.' },
  { valor: 'varias_repetir', titulo: 'Mais de uma, podendo repetir', texto: 'Cada opção ganha − e +. Ex: 2x bacon no mesmo lanche.' },
];

const CARTOES_PRECO: { valor: ModoPreco; titulo: string; texto: string }[] = [
  { valor: 'soma', titulo: 'A soma dos preços', texto: 'Marcou 3 adicionais de R$ 2, soma R$ 6. É o normal.' },
  { valor: 'media', titulo: 'A média dos preços', texto: 'Meia pizza de R$ 40 com meia de R$ 50 sai R$ 45.' },
  { valor: 'maior', titulo: 'O preço da mais cara', texto: 'Meia de R$ 40 com meia de R$ 50 sai R$ 50.' },
  { valor: 'menor', titulo: 'O preço da mais barata', texto: 'Meia de R$ 40 com meia de R$ 50 sai R$ 40.' },
];

function opcoesIniciais(lista: GrupoComplemento | null): OpcaoEdit[] {
  if (lista && lista.complementos.length > 0) {
    return lista.complementos.map((o) => ({
      uid: novoUid(),
      id: o.id,
      nome: o.nome,
      preco: String(o.preco ?? 0),
      qtdMax: o.qtd_max != null ? String(o.qtd_max) : '',
      imagemUrl: o.imagem_url,
      previewUrl: null,
      arquivo: null,
      ativo: o.ativo,
    }));
  }
  return [{ uid: novoUid(), nome: '', preco: '0', qtdMax: '', imagemUrl: null, previewUrl: null, arquivo: null, ativo: true }];
}

export function ModalLista({
  lojaId,
  lista,
  categorias,
  produtos,
  onFechar,
  onSalvo,
  onApagado,
  onErro,
}: {
  lojaId: string;
  lista: GrupoComplemento | null;
  categorias: Categoria[];
  produtos: Produto[];
  onFechar: () => void;
  onSalvo: () => void;
  onApagado: () => void;
  onErro: (msg: string) => void;
}) {
  useEscFechar(onFechar);

  const [nome, setNome] = useState(lista?.nome ?? '');
  const [tipoSelecao, setTipoSelecao] = useState<TipoSelecao>(lista?.tipo_selecao ?? 'uma');
  const [modoPreco, setModoPreco] = useState<ModoPreco>(lista?.modo_preco ?? 'soma');
  const [qtdMin, setQtdMin] = useState(String(lista?.qtd_min ?? 0));
  const [qtdMax, setQtdMax] = useState(String(lista?.qtd_max ?? 1));
  const [tiposPedido, setTiposPedido] = useState<string[]>(lista?.tipos_pedido ?? []);
  const [ativo, setAtivo] = useState(lista ? lista.ativo : true);
  const [avancadoAberto, setAvancadoAberto] = useState(false);
  const [opcoes, setOpcoes] = useState<OpcaoEdit[]>(() => opcoesIniciais(lista));
  const [salvando, setSalvando] = useState(false);

  // O modo de seleção muda o que faz sentido mostrar: "escolher 1 até N" só
  // vale pra múltipla escolha, e o limite por opção só existe quando pode
  // repetir a mesma opção.
  function aplicarTipoSelecao(tipo: TipoSelecao) {
    setTipoSelecao(tipo);
    if (tipo === 'uma') {
      setQtdMax('1');
    } else if (parseInt(qtdMax, 10) <= 1) {
      setQtdMax('2');
    }
  }

  const dicaQtd =
    tipoSelecao === 'uma'
      ? 'Como só cabe uma escolha, o máximo é sempre 1. Deixe o mínimo em 0 pra deixar opcional, ou 1 pra obrigar o cliente a escolher.'
      : 'Mínimo 0 deixa o complemento opcional. Mínimo 1 ou mais obriga o cliente a escolher antes de adicionar ao carrinho.';

  function atualizarOpcao(uid: string, patch: Partial<OpcaoEdit>) {
    setOpcoes((atual) => atual.map((o) => (o.uid === uid ? { ...o, ...patch } : o)));
  }
  function removerOpcao(uid: string) {
    setOpcoes((atual) => atual.filter((o) => o.uid !== uid));
  }
  function adicionarOpcao() {
    setOpcoes((atual) => [
      ...atual,
      { uid: novoUid(), nome: '', preco: '0', qtdMax: '', imagemUrl: null, previewUrl: null, arquivo: null, ativo: true },
    ]);
  }
  function onEscolherFotoOpcao(uid: string, file: File) {
    atualizarOpcao(uid, { arquivo: file, previewUrl: URL.createObjectURL(file) });
  }
  function reordenarOpcoes(uids: string[]) {
    setOpcoes((atual) => {
      const porUid = new Map(atual.map((o) => [o.uid, o]));
      const reordenadas = uids.map((uid) => porUid.get(uid)).filter((o): o is OpcaoEdit => !!o);
      // Segurança: se algum uid não bateu (não deveria acontecer), preserva
      // as opções originais em vez de perder dado.
      return reordenadas.length === atual.length ? reordenadas : atual;
    });
  }
  const refOpcoes = useArrastar<HTMLDivElement>('.opcao-row', reordenarOpcoes);

  const usos = lista
    ? produtos.filter((p) => (p.produto_grupos || []).some((pg) => pg.grupo_id === lista.id))
    : [];

  async function salvar() {
    const nomeAparado = nome.trim();
    if (!nomeAparado) {
      onErro('Dê um nome pra lista.');
      return;
    }
    const min = parseInt(qtdMin, 10) || 0;
    const max = parseInt(qtdMax, 10) || 1;
    if (max < min) {
      onErro('O máximo precisa ser maior ou igual ao mínimo.');
      return;
    }
    const opcoesValidas = opcoes.filter((o) => o.nome.trim());
    if (opcoesValidas.length === 0) {
      onErro('Adicione pelo menos uma opção com nome.');
      return;
    }
    // Uma lista que exige 3 escolhas mas só tem 2 opções disponíveis torna o
    // produto impossível de pedir — o cliente nunca consegue satisfazer o
    // mínimo, e o banco recusa o pedido.
    const ativas = opcoesValidas.filter((o) => o.ativo).length;
    if (min > ativas) {
      onErro(
        `A lista exige ${min} escolha(s), mas só tem ${ativas} opção(ões) disponível(is). ` +
          'Reduza o mínimo ou ative mais opções.'
      );
      return;
    }
    if (opcoesValidas.some((o) => (parseFloat(o.preco) || 0) < 0)) {
      onErro('Preço de opção não pode ser negativo.');
      return;
    }

    setSalvando(true);
    try {
      const sb = criarClientNavegador();
      const dados = {
        loja_id: lojaId,
        nome: nomeAparado,
        tipo_selecao: tipoSelecao,
        qtd_min: min,
        qtd_max: max,
        modo_preco: modoPreco,
        tipos_pedido: tiposPedido,
        ativo,
      };

      // ORDEM IMPORTA. As fotos sobem ANTES de qualquer escrita destrutiva:
      // upload é a etapa mais lenta e a que mais falha (rede, tamanho,
      // permissão). Quando o delete vinha primeiro, um upload que falhava
      // deixava a lista sem nenhuma opção — e o produto que dependia dela
      // ficava impossível de pedir.
      const opcoesPreparadas = await Promise.all(
        opcoesValidas.map(async (o, i) => ({
          nome: o.nome.trim(),
          preco: parseFloat(o.preco) || 0,
          qtd_max: o.qtdMax === '' ? null : parseInt(o.qtdMax, 10) || null,
          imagem_url: o.arquivo ? await subirImagemCatalogo(sb, lojaId, o.arquivo, 'opcao') : o.imagemUrl,
          ativo: o.ativo,
          ordem: i,
        }))
      );

      let grupoId: string;
      if (lista) {
        const { error } = await sb.from('grupos_complemento').update(dados).eq('id', lista.id);
        if (error) throw error;
        grupoId = lista.id;
        // Regrava as opções do zero — mais simples que diffar linha a linha,
        // e a lista costuma ter poucas opções. Só chega aqui com as fotos
        // já no Storage, então a janela entre apagar e repor é uma ida ao
        // banco, não um upload.
        const { error: delErr } = await sb.from('complementos').delete().eq('grupo_id', grupoId);
        if (delErr) throw delErr;
      } else {
        const { data: nova, error } = await sb.from('grupos_complemento').insert(dados).select().single();
        if (error) throw error;
        grupoId = nova.id;
      }

      const { error: opErr } = await sb
        .from('complementos')
        .insert(opcoesPreparadas.map((o) => ({ ...o, grupo_id: grupoId })));
      if (opErr) throw opErr;

      onSalvo();
    } catch (err) {
      onErro('Erro ao salvar lista: ' + (err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function apagar() {
    if (!lista) return;
    if (!confirm(`Apagar a lista "${lista.nome}" e todas as suas opções? Ela sai de todos os produtos que a usam.`)) return;
    const sb = criarClientNavegador();
    const { error } = await sb.from('grupos_complemento').delete().eq('id', lista.id);
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
          <div className="modal-titulo">{lista ? 'Editar complemento' : 'Novo complemento'}</div>
          <button type="button" className="modal-fechar" aria-label="Fechar" onClick={onFechar}>
            ✕
          </button>
        </div>

        <div className="modal-corpo">
          <div className="lista-split">
            <div>
              <label htmlFor="listaNome">Nome do complemento *</label>
              <input
                type="text"
                id="listaNome"
                placeholder="ex: Escolha o tamanho"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
              <p className="dica">É o título que o cliente vê no cardápio, logo acima das opções.</p>

              <label>Opções</label>
              <p className="dica">
                São as escolhas que aparecem pro cliente. Arraste pela alça pra mudar a ordem. O desligado
                fica escondido do cardápio sem perder o cadastro.
              </p>
              <div id="listaOpcoes" ref={refOpcoes}>
                {opcoes.map((o) => {
                  const img = o.previewUrl || o.imagemUrl;
                  return (
                    <div key={o.uid} data-id={o.uid} className="opcao-row">
                      <Alca />
                      <label
                        className={'op-foto' + (img ? ' tem-img' : '')}
                        style={img ? { backgroundImage: `url(${img})` } : undefined}
                        title="Foto da opção"
                      >
                        {!img && <span>🖼️</span>}
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) onEscolherFotoOpcao(o.uid, file);
                          }}
                        />
                      </label>
                      <input
                        type="text"
                        className="op-nome"
                        placeholder="Nome da opção"
                        value={o.nome}
                        onChange={(e) => atualizarOpcao(o.uid, { nome: e.target.value })}
                      />
                      <label className="op-campo">
                        <span>Preço</span>
                        <input
                          type="number"
                          className="op-preco"
                          step="0.01"
                          min="0"
                          value={o.preco}
                          onChange={(e) => atualizarOpcao(o.uid, { preco: e.target.value })}
                        />
                      </label>
                      {tipoSelecao === 'varias_repetir' && (
                        <label className="op-campo op-campo-qtdmax">
                          <span>Máx. repetir</span>
                          <input
                            type="number"
                            className="op-qtdmax"
                            step="1"
                            min="1"
                            placeholder="—"
                            value={o.qtdMax}
                            onChange={(e) => atualizarOpcao(o.uid, { qtdMax: e.target.value })}
                          />
                        </label>
                      )}
                      <label className="switch" title="Opção disponível no cardápio">
                        <input
                          type="checkbox"
                          checked={o.ativo}
                          onChange={(e) => atualizarOpcao(o.uid, { ativo: e.target.checked })}
                        />
                        <span className="switch-track"></span>
                      </label>
                      <button
                        type="button"
                        className="btn-ghost btn-small op-remover"
                        title="Remover opção"
                        onClick={() => removerOpcao(o.uid)}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
              <button type="button" className="btn-ghost btn-small" style={{ marginTop: 12 }} onClick={adicionarOpcao}>
                + Adicionar opção
              </button>

              <label style={{ marginTop: 22 }}>O cliente poderá escolher</label>
              <div className="escolha-grid">
                {CARTOES_SELECAO.map((c) => (
                  <button
                    key={c.valor}
                    type="button"
                    className={'escolha-card' + (tipoSelecao === c.valor ? ' on' : '')}
                    onClick={() => aplicarTipoSelecao(c.valor)}
                  >
                    <strong>{c.titulo}</strong>
                    <span>{c.texto}</span>
                  </button>
                ))}
              </div>

              <div className="frase-qtd">
                <span>O cliente escolherá de</span>
                <input type="number" min="0" step="1" value={qtdMin} onChange={(e) => setQtdMin(e.target.value)} />
                <span>até</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={qtdMax}
                  disabled={tipoSelecao === 'uma'}
                  onChange={(e) => setQtdMax(e.target.value)}
                />
                <span>opções</span>
              </div>
              <p className="dica">{dicaQtd}</p>

              <button type="button" className="avancado-toggle" onClick={() => setAvancadoAberto((v) => !v)}>
                Configurações avançadas
              </button>
              <div className={'avancado-corpo' + (avancadoAberto ? ' aberto' : '')}>
                <label>O preço do complemento será</label>
                <div className="escolha-grid col2">
                  {CARTOES_PRECO.map((c) => (
                    <button
                      key={c.valor}
                      type="button"
                      className={'escolha-card' + (modoPreco === c.valor ? ' on' : '')}
                      onClick={() => setModoPreco(c.valor)}
                    >
                      <strong>{c.titulo}</strong>
                      <span>{c.texto}</span>
                    </button>
                  ))}
                </div>
                <p className="dica">&quot;Média&quot; e &quot;mais cara&quot; são as usadas em pizza meio a meio.</p>

                <label style={{ marginTop: 18 }}>Onde este complemento aparece</label>
                <p className="dica">Nenhum marcado = aparece em todos os tipos de pedido.</p>
                <ChipsToggle
                  itens={TIPOS_PEDIDO}
                  selecionados={tiposPedido}
                  onToggle={(id) =>
                    setTiposPedido((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]))
                  }
                />

                <div className="campo-inline">
                  <label className="switch">
                    <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
                    <span className="switch-track"></span>
                  </label>
                  <label>Visível no cardápio</label>
                </div>
              </div>
            </div>

            <aside className="lista-usos">
              <div className="usos-titulo">
                {lista
                  ? usos.length === 0
                    ? 'Nenhum produto usa este complemento'
                    : `${usos.length} produto${usos.length === 1 ? '' : 's'} usa${usos.length === 1 ? '' : 'm'} este complemento`
                  : 'Complemento novo'}
              </div>
              {usos.length > 0 && (
                <p className="usos-aviso">As alterações valem pra todos os produtos que usam ele.</p>
              )}
              {usos.length === 0 ? (
                <p className="dica" style={{ margin: 0 }}>
                  {lista
                    ? 'Vincule ele a um produto na aba Complementos do modal do produto.'
                    : 'Depois de salvar, vincule ele aos produtos que devem oferecer estas opções.'}
                </p>
              ) : (
                usos.map((p) => {
                  const cat = categorias.find((c) => c.id === p.categoria_id);
                  return (
                    <div key={p.id} className="uso-item">
                      {p.nome}
                      <span>{cat ? cat.nome : 'Sem categoria'}</span>
                    </div>
                  );
                })
              )}
            </aside>
          </div>
        </div>

        <div className="modal-rodape">
          {lista && (
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
