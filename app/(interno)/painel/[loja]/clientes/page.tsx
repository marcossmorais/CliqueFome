import Link from 'next/link';
import { obterLojaPorSlug } from '@/lib/loja';
import { criarClientServidor } from '@/lib/supabase/server';
import { formatarTelefoneBrasil, normalizarTelefoneBrasil } from '@/lib/clientes/telefone';
import { formatBRL, NOMES_STATUS, NOMES_TIPO, type StatusPedido, type TipoPedido } from '@/lib/pedidos/tipos';
import { numeroPedidoComData } from '@/lib/pedidos/numero';
import styles from './clientes.module.css';

const POR_PAGINA = 20;

type ClienteResumo = {
  telefone_normalizado: string;
  nome: string;
  ultimo_pedido_em: string;
  quantidade_pedidos: number;
  quantidade_concluidos: number;
  valor_total: number;
  total_clientes: number;
};

type PedidoClientePainel = {
  id: string;
  numero: number;
  criado_em: string;
  status: StatusPedido;
  tipo: TipoPedido;
  total: number;
  pedido_itens: { nome: string; quantidade: number }[];
};

function parametro(valor: string | string[] | undefined) {
  return Array.isArray(valor) ? valor[0] || '' : valor || '';
}

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

function hrefPagina(base: string, busca: string, pagina: number) {
  const params = new URLSearchParams();
  if (busca) params.set('busca', busca);
  params.set('pagina', String(pagina));
  return `${base}?${params}`;
}

function hrefCliente(base: string, busca: string, pagina: number, telefone: string) {
  const params = new URLSearchParams();
  if (busca) params.set('busca', busca);
  if (pagina > 1) params.set('pagina', String(pagina));
  params.set('cliente', telefone);
  return `${base}?${params}`;
}

export default async function ClientesPage({
  params,
  searchParams,
}: {
  params: Promise<{ loja: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { loja: slug } = await params;
  const { loja } = await obterLojaPorSlug(slug);
  if (!loja) return null;

  const filtros = await searchParams;
  const busca = parametro(filtros.busca).trim().slice(0, 80);
  const pagina = Math.max(1, Math.min(10_000, Number.parseInt(parametro(filtros.pagina), 10) || 1));
  const telefoneSelecionado = normalizarTelefoneBrasil(parametro(filtros.cliente));
  const sb = await criarClientServidor();

  const { data, error } = await sb.rpc('listar_clientes_loja_v1', {
    p_loja_id: loja.id,
    p_busca: busca || null,
    p_limite: POR_PAGINA,
    p_offset: (pagina - 1) * POR_PAGINA,
  });
  const clientes = (data as ClienteResumo[] | null) || [];
  const total = Number(clientes[0]?.total_clientes || 0);
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  let pedidosCliente: PedidoClientePainel[] = [];
  if (telefoneSelecionado) {
    const { data: pedidos } = await sb
      .from('pedidos')
      .select('id, numero, criado_em, status, tipo, total, pedido_itens(nome, quantidade)')
      .eq('loja_id', loja.id)
      .eq('cliente_telefone_normalizado', telefoneSelecionado)
      .order('criado_em', { ascending: false })
      .limit(20);
    pedidosCliente = (pedidos as PedidoClientePainel[] | null) || [];
  }

  const rota = `/painel/${loja.slug}/clientes`;
  const clienteAberto = clientes.find((cliente) => cliente.telefone_normalizado === telefoneSelecionado);

  return (
    <div className={`area ativo ${styles.clientes}`}>
      <form className={styles.busca} action={rota} method="get">
        <label htmlFor="buscaCliente">Buscar cliente</label>
        <div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
          <input id="buscaCliente" name="busca" type="search" defaultValue={busca} placeholder="Nome ou telefone" />
          <button type="submit">Buscar</button>
        </div>
      </form>

      {error ? (
        <div className={styles.erro} role="alert">
          A base de clientes precisa da migração de sessões para ser carregada.
        </div>
      ) : (
        <div className={`${styles.layout} ${telefoneSelecionado ? styles.comDetalhe : ''}`}>
          <section className={styles.lista} aria-labelledby="clientes-lista-titulo">
            <header>
              <div><h2 id="clientes-lista-titulo">Clientes da loja</h2><p>Contatos agrupados pelo telefone dos pedidos.</p></div>
              <strong>{total}</strong>
            </header>

            {clientes.length === 0 ? (
              <div className={styles.vazio}><strong>Nenhum cliente encontrado</strong><p>Os contatos aparecerão aqui conforme os pedidos forem registrados.</p></div>
            ) : (
              <div className={styles.cards}>
                {clientes.map((cliente) => (
                  <Link
                    key={cliente.telefone_normalizado}
                    href={hrefCliente(rota, busca, pagina, cliente.telefone_normalizado)}
                    className={cliente.telefone_normalizado === telefoneSelecionado ? styles.ativo : ''}
                  >
                    <span className={styles.avatar}>{cliente.nome.trim().charAt(0).toUpperCase() || '?'}</span>
                    <span className={styles.identidade}>
                      <strong>{cliente.nome}</strong>
                      <small>{formatarTelefoneBrasil(cliente.telefone_normalizado)}</small>
                    </span>
                    <span className={styles.metricas}>
                      <strong>{cliente.quantidade_pedidos} pedido{Number(cliente.quantidade_pedidos) === 1 ? '' : 's'}</strong>
                      <small>Último em {formatarData(cliente.ultimo_pedido_em)}</small>
                    </span>
                    <span className={styles.valor}>{formatBRL(Number(cliente.valor_total))}</span>
                    <span className={styles.seta} aria-hidden="true">›</span>
                  </Link>
                ))}
              </div>
            )}

            {totalPaginas > 1 && (
              <nav className={styles.paginacao} aria-label="Paginação de clientes">
                {pagina > 1 ? <Link href={hrefPagina(rota, busca, pagina - 1)}>← Anterior</Link> : <span />}
                <span>Página {Math.min(pagina, totalPaginas)} de {totalPaginas}</span>
                {pagina < totalPaginas ? <Link href={hrefPagina(rota, busca, pagina + 1)}>Próxima →</Link> : <span />}
              </nav>
            )}
          </section>

          {telefoneSelecionado && (
            <aside className={styles.detalhe} aria-label="Histórico do cliente">
              <header>
                <div>
                  <span>Histórico do cliente</span>
                  <h2>{clienteAberto?.nome || 'Cliente'}</h2>
                  <p>{formatarTelefoneBrasil(telefoneSelecionado)}</p>
                </div>
                <Link href={hrefPagina(rota, busca, pagina)} aria-label="Fechar histórico">×</Link>
              </header>
              {pedidosCliente.length === 0 ? (
                <p className={styles.semPedidos}>Nenhum pedido encontrado para este contato.</p>
              ) : (
                <div className={styles.pedidos}>
                  {pedidosCliente.map((pedido) => (
                    <article key={pedido.id}>
                      <div>
                        <strong>{numeroPedidoComData(pedido.numero, pedido.criado_em)}</strong>
                        <span className={pedido.status === 'cancelado' ? styles.cancelado : ''}>{NOMES_STATUS[pedido.status]}</span>
                      </div>
                      <small>{formatarData(pedido.criado_em)} · {NOMES_TIPO[pedido.tipo]}</small>
                      <p>{pedido.pedido_itens.slice(0, 3).map((item) => `${item.quantidade}× ${item.nome}`).join(' · ')}</p>
                      <b>{formatBRL(Number(pedido.total))}</b>
                    </article>
                  ))}
                </div>
              )}
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
