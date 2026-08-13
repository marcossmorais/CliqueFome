import Link from 'next/link';
import { obterLojaPorSlug, obterUsuario } from '@/lib/loja';
import { criarClientServidor } from '@/lib/supabase/server';
import {
  inicioDiaIso,
  intervaloDashboard,
  montarResumoDashboard,
  type ItemDashboard,
  type PedidoDashboard,
  type ResumoDashboard,
} from '@/lib/dashboard/metricas';
import styles from './inicio.module.css';

const FORMATO_DINHEIRO = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const TAMANHO_PAGINA = 1000;

type SupabaseServidor = Awaited<ReturnType<typeof criarClientServidor>>;

async function buscarPedidos(sb: SupabaseServidor, lojaId: string, inicio: string, fim: string) {
  const resultado: PedidoDashboard[] = [];
  for (let pagina = 0; pagina < 20; pagina += 1) {
    const de = pagina * TAMANHO_PAGINA;
    const { data, error } = await sb
      .from('pedidos')
      .select('id, status, pagamento_status, total, criado_em')
      .eq('loja_id', lojaId)
      .gte('criado_em', inicio)
      .lt('criado_em', fim)
      .order('criado_em', { ascending: true })
      .range(de, de + TAMANHO_PAGINA - 1);
    if (error) throw error;
    const lote = (data as PedidoDashboard[]) || [];
    resultado.push(...lote);
    if (lote.length < TAMANHO_PAGINA) return resultado;
  }
  throw new Error('A consulta da dashboard excedeu o limite operacional.');
}

async function buscarItens(sb: SupabaseServidor, pedidoIds: string[]) {
  const resultado: ItemDashboard[] = [];
  for (let inicio = 0; inicio < pedidoIds.length; inicio += 100) {
    const ids = pedidoIds.slice(inicio, inicio + 100);
    for (let pagina = 0; pagina < 20; pagina += 1) {
      const de = pagina * TAMANHO_PAGINA;
      const { data, error } = await sb
        .from('pedido_itens')
        .select('nome, quantidade')
        .in('pedido_id', ids)
        .range(de, de + TAMANHO_PAGINA - 1);
      if (error) throw error;
      const lote = (data as ItemDashboard[]) || [];
      resultado.push(...lote);
      if (lote.length < TAMANHO_PAGINA) break;
      if (pagina === 19) throw new Error('A consulta de itens excedeu o limite operacional.');
    }
  }
  return resultado;
}

function saudacao(hora: number) {
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

function Variacao({ valor, texto = 'comparado a ontem' }: { valor: number | null; texto?: string }) {
  if (valor === null) return <span className={styles.neutra}>Sem base anterior</span>;
  const positiva = valor >= 0;
  return (
    <span className={positiva ? styles.positiva : styles.negativa}>
      {positiva ? '↑' : '↓'} {Math.abs(valor).toFixed(1).replace('.', ',')}% {texto}
    </span>
  );
}

function GraficoVendas({ resumo }: { resumo: ResumoDashboard }) {
  const largura = 700;
  const altura = 210;
  const margem = 24;
  const maximo = Math.max(...resumo.serieVendas.map((p) => p.valor), 1);
  const pontos = resumo.serieVendas.map((ponto, indice) => ({
    ...ponto,
    x: margem + indice * ((largura - margem * 2) / 6),
    y: altura - margem - (ponto.valor / maximo) * (altura - margem * 2),
  }));
  const linha = pontos.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
  const area = `${linha} L ${pontos.at(-1)?.x || margem} ${altura - margem} L ${margem} ${altura - margem} Z`;

  return (
    <div className={styles.graficoVendas}>
      <svg viewBox={`0 0 ${largura} ${altura}`} role="img" aria-label="Vendas dos últimos sete dias">
        <defs>
          <linearGradient id="dashboardArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ff5a00" stopOpacity=".28" />
            <stop offset="1" stopColor="#ff5a00" stopOpacity=".02" />
          </linearGradient>
        </defs>
        <line x1={margem} x2={largura - margem} y1={altura - margem} y2={altura - margem} className={styles.eixo} />
        <path d={area} fill="url(#dashboardArea)" />
        <path d={linha} className={styles.linhaGrafico} />
        {pontos.map((ponto) => (
          <circle key={ponto.data} cx={ponto.x} cy={ponto.y} r="5" className={styles.pontoGrafico}>
            <title>{ponto.rotulo}: {FORMATO_DINHEIRO.format(ponto.valor)}</title>
          </circle>
        ))}
      </svg>
      <div className={styles.rotulosGrafico}>
        {pontos.map((ponto) => <span key={ponto.data}>{ponto.rotulo}</span>)}
      </div>
    </div>
  );
}

function EstadoVazio({ children }: { children: React.ReactNode }) {
  return <div className={styles.vazio}>{children}</div>;
}

export default async function InicioPage({
  params,
}: {
  params: Promise<{ loja: string }>;
}) {
  const { loja: slug } = await params;
  const [{ loja }, usuario] = await Promise.all([
    obterLojaPorSlug(slug),
    obterUsuario(),
  ]);
  if (!loja || !usuario) return null;

  const agora = new Date();
  const periodo = intervaloDashboard(agora);
  const hora = Number(new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23',
  }).format(agora));
  const metadata = usuario.user_metadata as Record<string, unknown>;
  const nomeMetadata = typeof metadata.nome === 'string' ? metadata.nome : typeof metadata.full_name === 'string' ? metadata.full_name : '';
  const primeiroNome = (nomeMetadata.trim() || usuario.email?.split('@')[0] || 'por aí').split(/\s+/)[0];
  const atualizado = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
  }).format(agora);

  let resumo: ResumoDashboard | null = null;
  let falhou = false;
  try {
    const sb = await criarClientServidor();
    const pedidos = await buscarPedidos(
      sb,
      loja.id,
      inicioDiaIso(periodo.inicio7DiasAnteriores),
      inicioDiaIso(periodo.amanha)
    );
    const idsHojeValidos = pedidos
      .filter((pedido) => pedido.status !== 'cancelado' && pedido.criado_em >= inicioDiaIso(periodo.hoje))
      .map((pedido) => pedido.id);
    const itens = idsHojeValidos.length ? await buscarItens(sb, idsHojeValidos) : [];
    resumo = montarResumoDashboard(pedidos, itens, agora);
  } catch (erro) {
    console.error('Falha ao carregar dashboard:', erro);
    falhou = true;
  }

  return (
    <div className={styles.dashboard}>
        <section className={styles.boasVindas}>
          <div>
            <span className={styles.dataHoje}>Central do dia · {new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'long' }).format(agora)}</span>
            <h2>{saudacao(hora)}, {primeiroNome} <span aria-hidden="true">👋</span></h2>
            <p>Aqui está o resumo da sua loja hoje.</p>
          </div>
          <Link href={`/${loja.slug}`} target="_blank" className={styles.verCardapio}>Ver cardápio ↗</Link>
        </section>

        {falhou || !resumo ? (
          <section className={styles.erroCarga} role="alert">
            <strong>Não foi possível carregar os números agora.</strong>
            <p>Os controles da loja continuam disponíveis. Atualize a página para tentar novamente.</p>
          </section>
        ) : (
          <>
            <section className={styles.kpis} aria-label="Indicadores de hoje">
              <article className={styles.kpi}>
                <span>Vendas hoje</span><strong>{FORMATO_DINHEIRO.format(resumo.vendasHoje)}</strong>
                <Variacao valor={resumo.variacaoVendasHoje} />
              </article>
              <article className={styles.kpi}>
                <span>Pedidos hoje</span><strong>{resumo.pedidosHoje}</strong>
                <Variacao valor={resumo.variacaoPedidosHoje} />
              </article>
              <article className={styles.kpi}>
                <span>Ticket médio</span><strong>{FORMATO_DINHEIRO.format(resumo.ticketMedio)}</strong>
                <small>Pedidos não cancelados</small>
              </article>
              <article className={styles.kpi}>
                <span>Em andamento</span><strong>{resumo.emAndamento}</strong>
                <small>Confirmados até a conclusão</small>
              </article>
            </section>

            <section className={styles.gradePrincipal}>
              <article className={`${styles.bloco} ${styles.vendas}`}>
                <div className={styles.blocoTopo}>
                  <div><span>Últimos 7 dias</span><h3>Vendas da semana</h3></div>
                  <div className={styles.totalSemana}>
                    <strong>{FORMATO_DINHEIRO.format(resumo.vendas7Dias)}</strong>
                    <Variacao valor={resumo.variacao7Dias} texto="vs. 7 dias anteriores" />
                  </div>
                </div>
                <GraficoVendas resumo={resumo} />
              </article>

              <article className={`${styles.bloco} ${styles.horarios}`}>
                <div className={styles.blocoTopo}><div><span>Movimento de hoje</span><h3>Horários com mais pedidos</h3></div></div>
                {resumo.horarios.length ? (
                  <div className={styles.barrasHorario}>
                    {resumo.horarios.map((faixa) => {
                      const maximo = Math.max(...resumo.horarios.map((h) => h.pedidos), 1);
                      return (
                        <div key={faixa.hora} className={styles.barraLinha}>
                          <span>{faixa.rotulo}</span>
                          <i><b style={{ width: `${(faixa.pedidos / maximo) * 100}%` }} /></i>
                          <strong>{faixa.pedidos}</strong>
                        </div>
                      );
                    })}
                    {resumo.horarioPico && <p className={styles.insight}>Maior movimento por volta das <strong>{resumo.horarioPico.rotulo}</strong>.</p>}
                  </div>
                ) : <EstadoVazio>O movimento por horário aparece após o primeiro pedido do dia.</EstadoVazio>}
              </article>
            </section>

            <section className={styles.gradeResumo}>
              <article className={styles.bloco}>
                <div className={styles.blocoTopo}><div><span>Operação</span><h3>Pedidos de hoje</h3></div><strong className={styles.numeroDestaque}>{resumo.pedidosHoje}</strong></div>
                <div className={styles.statusPedidos}>
                  <span><i className={styles.andamento} />Em andamento <b>{resumo.emAndamento}</b></span>
                  <span><i className={styles.aguardando} />Aguardando <b>{resumo.aguardando}</b></span>
                  <span><i className={styles.concluido} />Concluídos <b>{resumo.concluidos}</b></span>
                  <span><i className={styles.cancelado} />Cancelados <b>{resumo.cancelados}</b></span>
                </div>
                <Link href={`/painel/${slug}/pedidos`} className={styles.linkAcao}>Ver gestão de pedidos →</Link>
              </article>

              <article className={styles.bloco}>
                <div className={styles.blocoTopo}><div><span>Cardápio</span><h3>Mais vendidos hoje</h3></div></div>
                {resumo.maisVendidos.length ? (
                  <ol className={styles.ranking}>
                    {resumo.maisVendidos.map((produto, indice) => (
                      <li key={produto.nome}><span>{indice + 1}</span><strong>{produto.nome}</strong><b>{produto.quantidade}</b></li>
                    ))}
                  </ol>
                ) : <EstadoVazio>Os produtos mais vendidos aparecem após o primeiro pedido do dia.</EstadoVazio>}
                <Link href={`/painel/${slug}/cardapio`} className={styles.linkAcao}>Ver cardápio →</Link>
              </article>

              <article className={`${styles.bloco} ${resumo.pagamentosPendentes ? styles.pagamentoAlerta : styles.pagamentoOk}`}>
                <div className={styles.pagamentoIcone} aria-hidden="true">{resumo.pagamentosPendentes ? '!' : '✓'}</div>
                <div className={styles.pagamentoTexto}>
                  <span>Pagamentos manuais</span>
                  <h3>{resumo.pagamentosPendentes ? `${resumo.pagamentosPendentes} aguardando confirmação` : 'Nenhum pagamento pendente'}</h3>
                  {resumo.pagamentosPendentes > 0 && <strong>{FORMATO_DINHEIRO.format(resumo.valorPendente)}</strong>}
                </div>
                <Link href={`/painel/${slug}/pedidos`} className={styles.linkAcao}>Ver pedidos →</Link>
              </article>
            </section>

            <p className={styles.fonte}>Dados dos pedidos desta loja · atualizados às {atualizado}</p>
          </>
        )}
    </div>
  );
}
