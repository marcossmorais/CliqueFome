'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { PainelDetalhePedido } from '../pedidos/PainelDetalhePedido';
import { formatBRL, NOMES_ORIGEM, NOMES_TIPO } from '@/lib/pedidos/tipos';
import { useAgora } from '@/hooks/useAgora';
import { IconeBusca } from '@/components/admin/IconesCatalogo';
import type { FiltrosHistorico, PedidoHistorico } from '@/lib/pedidos/historico';
import { fimExclusivoIso, inicioDoDiaIso } from '@/lib/pedidos/historico';
import { nomeFormaPagamento } from '@/lib/pedidos/pagamento';
import { arquivarPedidosHistorico } from '@/lib/pedidos/acoes';
import { criarClientNavegador } from '@/lib/supabase/client';
import styles from './historico.module.css';
import { numeroPedido, numeroPedidoComData } from '@/lib/pedidos/numero';

function formatarData(valor: string) {
  return new Date(valor).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function hrefPagina(base: string, filtros: FiltrosHistorico, pagina: number) {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([chave, valor]) => {
    if (valor) params.set(chave, valor);
  });
  params.set('pagina', String(pagina));
  return `${base}?${params}`;
}

function origemDoPedido(pedido: PedidoHistorico) {
  if (pedido.tipo === 'balcao') return 'Balcão';
  return NOMES_ORIGEM[pedido.origem];
}

function campoCsv(valor: unknown) {
  let texto = String(valor ?? '').replace(/\r?\n/g, ' ').trim();
  if (/^[=+\-@]/.test(texto)) texto = `'${texto}`;
  return `"${texto.replace(/"/g, '""')}"`;
}

export function HistoricoClient({
  lojaId,
  lojaSlug,
  pedidos,
  filtros,
  pagina,
  totalPaginas,
  quantidade,
  valorTotal,
}: {
  lojaId: string;
  lojaSlug: string;
  pedidos: PedidoHistorico[];
  filtros: FiltrosHistorico;
  pagina: number;
  totalPaginas: number;
  quantidade: number;
  valorTotal: number;
}) {
  const router = useRouter();
  const agora = useAgora();
  const rotaHistorico = `/painel/${lojaSlug}/pedidos/historico`;
  const [pedidoAbertoId, setPedidoAbertoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [arquivando, setArquivando] = useState(false);
  const [carregandoTodos, setCarregandoTodos] = useState(false);
  const [todosFiltrados, setTodosFiltrados] = useState<PedidoHistorico[] | null>(null);
  const pedidoAberto = useMemo(
    () => pedidos.find((pedido) => pedido.id === pedidoAbertoId) ?? null,
    [pedidoAbertoId, pedidos]
  );
  const pedidosDisponiveis = todosFiltrados ?? pedidos;
  const pedidosSelecionados = selecionados.size > 0
    ? pedidosDisponiveis.filter((pedido) => selecionados.has(pedido.id))
    : pedidos;
  const todosDaPaginaSelecionados = pedidos.length > 0 && pedidos.every((pedido) => selecionados.has(pedido.id));

  function alternarSelecao(id: string) {
    setSelecionados((atuais) => {
      const proximos = new Set(atuais);
      if (proximos.has(id)) proximos.delete(id); else proximos.add(id);
      return proximos;
    });
  }

  function selecionarPagina() {
    setTodosFiltrados(null);
    setSelecionados(todosDaPaginaSelecionados ? new Set() : new Set(pedidos.map((pedido) => pedido.id)));
  }

  async function selecionarTodosFiltrados() {
    setCarregandoTodos(true);
    setErro(null);
    try {
      const sb = criarClientNavegador();
      const lista: PedidoHistorico[] = [];
      let inicio = 0;
      while (true) {
        let consulta = sb.from('pedidos').select('*').eq('loja_id', lojaId)
          .in('status', ['concluido', 'cancelado']).is('historico_oculto_em', null);
        if (filtros.status) consulta = consulta.eq('status', filtros.status);
        if (filtros.origem === 'balcao') consulta = consulta.eq('tipo', 'balcao');
        else if (filtros.origem) consulta = consulta.eq('origem', filtros.origem);
        if (filtros.tipo === 'encomenda') consulta = consulta.eq('tipo', 'encomenda');
        if (filtros.tipo === 'pronta_entrega') consulta = consulta.neq('tipo', 'encomenda');
        if (filtros.pagamento) consulta = consulta.ilike('forma_pagamento', `%${filtros.pagamento}%`);
        if (filtros.busca) {
          const termos = [`cliente_nome.ilike.%${filtros.busca}%`, `cliente_telefone.ilike.%${filtros.busca}%`];
          if (/^\d+$/.test(filtros.busca)) termos.push(`numero.eq.${Number(filtros.busca)}`);
          consulta = consulta.or(termos.join(','));
        }
        const de = inicioDoDiaIso(filtros.inicio);
        const ate = fimExclusivoIso(filtros.fim);
        if (de) consulta = consulta.gte('criado_em', de);
        if (ate) consulta = consulta.lt('criado_em', ate);
        const { data, error } = await consulta.order('criado_em', { ascending: false }).range(inicio, inicio + 999);
        if (error) throw error;
        const lote = (data as PedidoHistorico[]) ?? [];
        lista.push(...lote);
        if (lote.length < 1000) break;
        inicio += 1000;
      }
      setTodosFiltrados(lista);
      setSelecionados(new Set(lista.map((pedido) => pedido.id)));
    } catch {
      setErro('Não foi possível selecionar todos os resultados filtrados.');
    } finally {
      setCarregandoTodos(false);
    }
  }

  function exportarCsv() {
    const cabecalho = ['Número', 'Data', 'Cliente', 'Telefone', 'Status', 'Origem', 'Tipo', 'Pagamento', 'Total', 'Motivo do cancelamento'];
    const linhas = pedidosSelecionados.map((pedido) => [
      numeroPedido(pedido.numero), formatarData(pedido.criado_em), pedido.cliente_nome, pedido.cliente_telefone,
      pedido.status === 'cancelado' ? 'Cancelado' : 'Entregue/Retirado', origemDoPedido(pedido),
      NOMES_TIPO[pedido.tipo], nomeFormaPagamento(pedido.forma_pagamento), Number(pedido.total).toFixed(2).replace('.', ','),
      pedido.motivo_cancelamento ?? '',
    ]);
    const csv = '\uFEFF' + [cabecalho, ...linhas].map((linha) => linha.map(campoCsv).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `historico-pedidos-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function removerDoHistorico() {
    if (selecionados.size === 0) return;
    if (!confirm(`Remover ${selecionados.size} pedido(s) do histórico? Os registros serão preservados com segurança no banco.`)) return;
    setArquivando(true);
    setErro(null);
    try {
      const ids = [...selecionados];
      const sb = criarClientNavegador();
      for (let inicio = 0; inicio < ids.length; inicio += 100) {
        await arquivarPedidosHistorico(sb, ids.slice(inicio, inicio + 100));
      }
      setSelecionados(new Set());
      setTodosFiltrados(null);
      setPedidoAbertoId(null);
      router.refresh();
    } catch {
      setErro('Não foi possível remover os pedidos do histórico. Atualize a página e tente novamente.');
    } finally {
      setArquivando(false);
    }
  }

  return (
    <div className={`area ativo ${styles.historico}`}>
      {/* O histórico é um desvio da tela de operação, não um destino: sem uma
          volta explícita, quem entra aqui só sai pelo menu lateral. */}
      <Link href={`/painel/${lojaSlug}/pedidos`} className={styles.voltar}>
        <span aria-hidden="true">←</span> Voltar para a gestão de pedidos
      </Link>

      {erro && <div className="msg msg-erro" role="alert">{erro}</div>}

      <form className={styles.filtros} method="get" action={rotaHistorico}>
        <div className={styles.busca}>
          <label htmlFor="historicoBusca">Buscar pedido</label>
          <div className={styles.campoBusca}>
            <IconeBusca />
            <input
              id="historicoBusca"
              name="busca"
              type="search"
              defaultValue={filtros.busca}
              placeholder="Nome, telefone ou nº do pedido"
            />
          </div>
        </div>

        <div className={styles.periodo}>
          <div>
            <label htmlFor="historicoInicio">Data inicial</label>
            <input id="historicoInicio" name="inicio" type="date" defaultValue={filtros.inicio} />
          </div>
          <div>
            <label htmlFor="historicoFim">Data final</label>
            <input id="historicoFim" name="fim" type="date" defaultValue={filtros.fim} />
          </div>
          <div className={styles.atalhos} aria-label="Atalhos de período">
            <button type="submit" name="periodo" value="hoje">Hoje</button>
            <button type="submit" name="periodo" value="7dias">Últimos 7 dias</button>
            <button type="submit" name="periodo" value="mes">Este mês</button>
          </div>
        </div>

        <div className={styles.campos}>
          <div>
            <label htmlFor="historicoStatus">Status</label>
            <select id="historicoStatus" name="status" defaultValue={filtros.status}>
              <option value="">Todos</option>
              <option value="concluido">Entregue/Retirado</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>
          <div>
            <label htmlFor="historicoOrigem">Origem</label>
            <select id="historicoOrigem" name="origem" defaultValue={filtros.origem}>
              <option value="">Todas</option>
              <option value="site">Site</option>
              <option value="instagram">Instagram</option>
              <option value="telefone">Telefone</option>
              <option value="balcao">Balcão</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          <div>
            <label htmlFor="historicoTipo">Tipo</label>
            <select id="historicoTipo" name="tipo" defaultValue={filtros.tipo}>
              <option value="">Todos</option>
              <option value="pronta_entrega">Pronta entrega</option>
              <option value="encomenda">Encomenda</option>
            </select>
          </div>
          <div>
            <label htmlFor="historicoPagamento">Forma de pagamento</label>
            <input
              id="historicoPagamento"
              name="pagamento"
              type="text"
              defaultValue={filtros.pagamento}
              placeholder="Ex.: Pix ou dinheiro"
            />
          </div>
        </div>

        <div className={styles.acoesFiltro}>
          <button type="submit" className="btn-primary btn-small">Aplicar filtros</button>
          <Link href={rotaHistorico} className="btn-ghost btn-small">Limpar</Link>
        </div>
      </form>

      <section className={styles.resumo} aria-label="Resumo dos pedidos filtrados">
        <div>
          <span>Pedidos encontrados</span>
          <strong>{quantidade}</strong>
        </div>
        <div>
          <span>Valor total filtrado</span>
          <strong>{formatBRL(valorTotal)}</strong>
        </div>
      </section>

      <section className={styles.acoesMassa} aria-label="Ações do histórico">
        <label>
          <input type="checkbox" checked={todosDaPaginaSelecionados} onChange={selecionarPagina} />
          Selecionar os {pedidos.length} desta página
        </label>
        {quantidade > pedidos.length && (
          <button type="button" className="btn-ghost btn-small" disabled={carregandoTodos} onClick={selecionarTodosFiltrados}>
            {carregandoTodos ? 'Selecionando…' : `Selecionar todos os ${quantidade} resultados`}
          </button>
        )}
        <span>{selecionados.size > 0 ? `${selecionados.size} selecionado(s)` : 'Sem seleção: exporta a página atual'}</span>
        <div>
          <button type="button" className="btn-ghost btn-small" disabled={pedidos.length === 0} onClick={exportarCsv}>Exportar CSV</button>
          <button type="button" className="btn-ghost btn-small" disabled={pedidos.length === 0} onClick={() => window.print()}>PDF da página</button>
          <button type="button" className={styles.remover} disabled={selecionados.size === 0 || arquivando} onClick={removerDoHistorico}>
            {arquivando ? 'Removendo…' : 'Remover do histórico'}
          </button>
        </div>
      </section>

      <div className={'pedidos-split' + (pedidoAberto ? ' com-painel' : '')}>
        <section className={styles.lista} aria-labelledby="lista-historico-titulo">
          <div className={styles.listaTopo}>
            <div>
              <h2 id="lista-historico-titulo">Pedidos finalizados</h2>
              <p>Do mais recente para o mais antigo</p>
            </div>
            <span>Página {Math.min(pagina, totalPaginas)} de {totalPaginas}</span>
          </div>

          {pedidos.length === 0 ? (
            <div className={styles.vazio}>
              <strong>Nenhum pedido encontrado</strong>
              <p>Tente ampliar o período ou limpar algum filtro.</p>
            </div>
          ) : (
            <div className={styles.pedidos}>
              {pedidos.map((pedido) => (
                <div
                  key={pedido.id}
                  className={`${styles.pedido} ${pedidoAbertoId === pedido.id ? styles.selecionado : ''} ${selecionados.size > 0 && !selecionados.has(pedido.id) ? styles.naoSelecionadoPrint : ''}`}
                >
                  <label className={styles.seletor} title={`Selecionar pedido ${numeroPedido(pedido.numero)}`}>
                    <input type="checkbox" checked={selecionados.has(pedido.id)} onChange={() => alternarSelecao(pedido.id)} />
                  </label>
                  <button type="button" className={styles.pedidoAbrir} onClick={() => setPedidoAbertoId(pedido.id)} aria-label={`Abrir detalhes do pedido ${numeroPedido(pedido.numero)}, ${pedido.cliente_nome}`}>
                    <span className={styles.pedidoPrincipal}>
                    <span className={styles.numero}>{numeroPedidoComData(pedido.numero, pedido.criado_em)}</span>
                    <span className={styles.cliente}>
                      <strong>{pedido.cliente_nome}</strong>
                      <small>{pedido.cliente_telefone}</small>
                    </span>
                  </span>
                  <span className={styles.pedidoInfo}>
                    <span>{NOMES_TIPO[pedido.tipo]}</span>
                    <span>{origemDoPedido(pedido)}</span>
                    <span>{nomeFormaPagamento(pedido.forma_pagamento)}</span>
                  </span>
                  <span className={styles.pedidoFinal}>
                    <span className={pedido.status === 'cancelado' ? styles.cancelado : styles.concluido}>
                      {pedido.status === 'cancelado' ? 'Cancelado' : 'Entregue/Retirado'}
                    </span>
                    <strong>{formatBRL(pedido.total)}</strong>
                  </span>
                    {pedido.status === 'cancelado' && pedido.motivo_cancelamento && (
                      <span className={styles.motivo}>Motivo: {pedido.motivo_cancelamento}</span>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}

          {totalPaginas > 1 && (
            <nav className={styles.paginacao} aria-label="Paginação do histórico">
              {pagina > 1 ? <Link href={hrefPagina(rotaHistorico, filtros, pagina - 1)}>← Anterior</Link> : <span />}
              <span>{quantidade} pedido{quantidade === 1 ? '' : 's'}</span>
              {pagina < totalPaginas ? <Link href={hrefPagina(rotaHistorico, filtros, pagina + 1)}>Próxima →</Link> : <span />}
            </nav>
          )}
        </section>

        {pedidoAberto ? (
          <PainelDetalhePedido
            pedido={pedidoAberto}
            agora={agora}
            onFechar={() => setPedidoAbertoId(null)}
            onAtualizado={() => router.refresh()}
            onErro={setErro}
          />
        ) : (
          <aside className="pedido-painel pedido-painel-vazio">
            <p>Selecione um pedido para ver itens, observações, local e pagamento.</p>
          </aside>
        )}
      </div>
    </div>
  );
}
