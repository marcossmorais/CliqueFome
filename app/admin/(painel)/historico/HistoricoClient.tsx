'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { PainelDetalhePedido } from '../pedidos/PainelDetalhePedido';
import { formatBRL, NOMES_ORIGEM, NOMES_TIPO } from '@/lib/pedidos/tipos';
import { useAgora } from '@/hooks/useAgora';
import { IconeBusca } from '@/components/admin/IconesCatalogo';
import type { FiltrosHistorico, PedidoHistorico } from '@/lib/pedidos/historico';
import styles from './historico.module.css';

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

function hrefPagina(filtros: FiltrosHistorico, pagina: number) {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([chave, valor]) => {
    if (valor) params.set(chave, valor);
  });
  params.set('pagina', String(pagina));
  return `/admin/historico?${params}`;
}

function origemDoPedido(pedido: PedidoHistorico) {
  if (pedido.tipo === 'balcao') return 'Balcão';
  return NOMES_ORIGEM[pedido.origem];
}

export function HistoricoClient({
  pedidos,
  filtros,
  pagina,
  totalPaginas,
  quantidade,
  valorTotal,
}: {
  pedidos: PedidoHistorico[];
  filtros: FiltrosHistorico;
  pagina: number;
  totalPaginas: number;
  quantidade: number;
  valorTotal: number;
}) {
  const router = useRouter();
  const agora = useAgora();
  const [pedidoAbertoId, setPedidoAbertoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const pedidoAberto = useMemo(
    () => pedidos.find((pedido) => pedido.id === pedidoAbertoId) ?? null,
    [pedidoAbertoId, pedidos]
  );

  return (
    <div className={`area ativo ${styles.historico}`}>
      {erro && <div className="msg msg-erro" role="alert">{erro}</div>}

      <form className={styles.filtros} method="get" action="/admin/historico">
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
          <Link href="/admin/historico" className="btn-ghost btn-small">Limpar</Link>
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
                <button
                  key={pedido.id}
                  type="button"
                  className={`${styles.pedido} ${pedidoAbertoId === pedido.id ? styles.selecionado : ''}`}
                  onClick={() => setPedidoAbertoId(pedido.id)}
                  aria-label={`Abrir detalhes do pedido ${pedido.numero}, ${pedido.cliente_nome}`}
                >
                  <span className={styles.pedidoPrincipal}>
                    <span className={styles.numero}>#{pedido.numero}</span>
                    <span className={styles.cliente}>
                      <strong>{pedido.cliente_nome}</strong>
                      <small>{pedido.cliente_telefone}</small>
                    </span>
                  </span>
                  <span className={styles.pedidoInfo}>
                    <span>{NOMES_TIPO[pedido.tipo]}</span>
                    <span>{origemDoPedido(pedido)}</span>
                    <span>{pedido.forma_pagamento || 'Pagamento não informado'}</span>
                  </span>
                  <span className={styles.pedidoFinal}>
                    <span className={pedido.status === 'cancelado' ? styles.cancelado : styles.concluido}>
                      {pedido.status === 'cancelado' ? 'Cancelado' : 'Entregue/Retirado'}
                    </span>
                    <strong>{formatBRL(pedido.total)}</strong>
                    <small>{formatarData(pedido.criado_em)}</small>
                  </span>
                  {pedido.status === 'cancelado' && pedido.motivo_cancelamento && (
                    <span className={styles.motivo}>Motivo: {pedido.motivo_cancelamento}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {totalPaginas > 1 && (
            <nav className={styles.paginacao} aria-label="Paginação do histórico">
              {pagina > 1 ? <Link href={hrefPagina(filtros, pagina - 1)}>← Anterior</Link> : <span />}
              <span>{quantidade} pedido{quantidade === 1 ? '' : 's'}</span>
              {pagina < totalPaginas ? <Link href={hrefPagina(filtros, pagina + 1)}>Próxima →</Link> : <span />}
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
