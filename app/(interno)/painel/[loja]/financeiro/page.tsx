import Link from 'next/link';
import { obterLojaPorSlug } from '@/lib/loja';
import styles from './financeiro.module.css';

function IconeConexao() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 12h8M12 8v8M5 3h4v4H5zM15 3h4v4h-4zM5 17h4v4H5zM15 17h4v4h-4z" />
    </svg>
  );
}

export default async function FinanceiroPage({
  params,
}: {
  params: Promise<{ loja: string }>;
}) {
  const { loja: slug } = await params;
  const { loja } = await obterLojaPorSlug(slug);
  if (!loja) return null;

  return (
    <div className={styles.pagina}>
      <header className={styles.cabecalho}>
        <span>Recebimentos da loja</span>
        <h2>Financeiro</h2>
        <p>
          Acompanhe como a loja recebe e centralize a conexão com o provedor de pagamentos.
          O histórico operacional dos pedidos continua em Gestão de pedidos.
        </p>
      </header>

      <section className={styles.grade}>
        <article className={styles.integracao} id="integracao-pagamentos">
          <div className={styles.integracaoTopo}>
            <div className={styles.icone}><IconeConexao /></div>
            <span className={styles.status}>Não conectada</span>
          </div>
          <div className={styles.integracaoTexto}>
            <span>Conexão financeira</span>
            <h3>Integração de Pagamentos</h3>
            <p>
              Este é o espaço para conectar a conta que processará pagamentos online e fará a
              conciliação automática dos recebimentos da loja.
            </p>
          </div>
          <button type="button" className="btn-primary" disabled title="Disponível em breve">
            Configurar integração
          </button>
          <small>A configuração será liberada quando o primeiro provedor estiver disponível.</small>
        </article>

        <aside className={styles.operacao}>
          <div>
            <span>Operação atual</span>
            <h3>Confirmação manual</h3>
            <p>
              Pix combinado com a loja, dinheiro e cartões presenciais continuam sendo confirmados
              diretamente em cada pedido.
            </p>
          </div>
          <div className={styles.separador} />
          <div className={styles.fluxo}>
            <span><i>1</i> Cliente escolhe a forma de pagamento</span>
            <span><i>2</i> A loja confere o recebimento</span>
            <span><i>3</i> O pedido é marcado como pago</span>
          </div>
          <Link href={`/painel/${loja.slug}/pedidos`} className={styles.linkPedidos}>
            Ir para Gestão de pedidos <span aria-hidden="true">→</span>
          </Link>
        </aside>
      </section>

      <section className={styles.aviso} aria-label="Separação entre financeiro e pedidos">
        <strong>Financeiro não é histórico de pedidos.</strong>
        <p>
          Pedidos concluídos, buscas e filtros ficam dentro de Gestão de pedidos. Aqui permanecem
          apenas recebimentos, conciliação e a Integração de Pagamentos.
        </p>
        <Link href={`/painel/${loja.slug}/pedidos/historico`}>Abrir histórico de pedidos</Link>
      </section>
    </div>
  );
}
