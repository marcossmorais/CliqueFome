import Link from 'next/link';
import styles from './config.module.css';

const ICONES_CONFIG: Record<string, string> = {
  perfil: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 20c1.6-3.6 4.8-6 8-6s6.4 2.4 8 6',
  loja: 'M3 21V9l9-6 9 6v12zM9 21v-7h6v7',
  funcionamento: 'M12 21a9 9 0 110-18 9 9 0 010 18zM12 7v5l3 3',
  assinatura: 'M3 7h18v12H3zM3 11h18M7 15h3M7 7V5h10v2',
};

function Icone({ chave }: { chave: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONES_CONFIG[chave]} />
    </svg>
  );
}

function Chevron() {
  return (
    <svg className={styles.chevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function Linha({ href, icone, nome }: { href: string; icone: string; nome: string }) {
  return (
    <Link href={href} className={styles.linha}>
      <span className={styles.icone}>
        <Icone chave={icone} />
      </span>
      <span className={styles.rotulo}>{nome}</span>
      <Chevron />
    </Link>
  );
}

/**
 * Configurações é um menu, não um formulário gigante — cada linha leva pra
 * uma tela própria. Dividido pelos mesmos 3 grupos que já servem no resto
 * do painel pra separar o que é da PESSOA (conta) do que é DA LOJA
 * (estabelecimento), mais a assinatura.
 */
export function ConfigHub({ lojaSlug }: { lojaSlug: string }) {
  const base = `/painel/${lojaSlug}`;
  return (
    <div className={styles.pagina}>
      <div className={styles.grupo}>
        <h2 className={styles.grupoTitulo}>Conta</h2>
        <div className={styles.lista}>
          <Linha href={`${base}/config/perfil`} icone="perfil" nome="Meu perfil" />
        </div>
      </div>

      <div className={styles.grupo}>
        <h2 className={styles.grupoTitulo}>Estabelecimento</h2>
        <div className={styles.lista}>
          <Linha href={`${base}/config/loja`} icone="loja" nome="Minha loja" />
          <Linha href={`${base}/config/funcionamento`} icone="funcionamento" nome="Funcionamento" />
        </div>
      </div>

      <div className={styles.grupo}>
        <h2 className={styles.grupoTitulo}>Assinatura</h2>
        <div className={styles.lista}>
          <Linha href={`${base}/config/assinatura`} icone="assinatura" nome="Plano e assinatura" />
        </div>
      </div>
    </div>
  );
}
