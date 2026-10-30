import Link from 'next/link';
import { LogoFlouFood } from '@/components/LogoFlouFood';
import { avaliarDadosLegais, exibirOuPendente, obterDadosLegais } from '@/lib/legal/config';
import { AvisoCookies, BotaoPreferenciasCookies } from './AvisoCookies';
import styles from './legal.module.css';

/**
 * Casca comum de Termos, Privacidade e Cookies: cabeçalho, introdução, aviso
 * de rascunho, sumário e rodapé. Cada página só escreve o próprio texto.
 */
export function MolduraLegal({
  rotulo,
  titulo,
  descricao,
  sumario,
  children,
}: {
  rotulo: string;
  titulo: string;
  descricao: string;
  sumario: { href: string; texto: string }[];
  children: React.ReactNode;
}) {
  const estado = avaliarDadosLegais(obterDadosLegais());
  const vigencia = exibirOuPendente(obterDadosLegais().dataVigencia);

  return (
    <div className={styles.pagina}>
      <a className={styles.pular} href="#conteudo-legal">Pular para o conteúdo</a>

      <header className={styles.cabecalho}>
        <Link href="/" className={styles.logo} aria-label="FlouFood — página inicial">
          <LogoFlouFood />
        </Link>
        <nav aria-label="Documentos legais">
          <Link href="/termos">Termos de Uso</Link>
          <Link href="/privacidade">Privacidade</Link>
          <Link href="/cookies">Cookies</Link>
        </nav>
      </header>

      <main id="conteudo-legal" className={styles.conteudo}>
        <section className={styles.introducao}>
          <span className={styles.rotulo}>{rotulo}</span>
          <h1>{titulo}</h1>
          <p>{descricao}</p>
          <div className={styles.meta}>
            <span><strong>Versão:</strong> {estado.publicavel ? '1.0' : '1.0 — rascunho'}</span>
            <span><strong>Vigência:</strong> {vigencia}</span>
          </div>
        </section>

        {!estado.publicavel && (
          <aside className={styles.alertaRascunho} role="alert" aria-labelledby="rascunho-titulo">
            <div className={styles.alertaIcone} aria-hidden="true">!</div>
            <div>
              <strong id="rascunho-titulo">Rascunho jurídico — não publicar como documento definitivo</strong>
              <p>
                Faltam {estado.faltantes.join(', ')}. Preencha as variáveis de ambiente indicadas no projeto,
                valide as práticas descritas e obtenha revisão jurídica antes de remover este aviso.
              </p>
            </div>
          </aside>
        )}

        <div className={styles.layout}>
          <aside className={styles.sumario} aria-label="Sumário">
            <strong>Nesta página</strong>
            <ol>
              {sumario.map((item) => (
                <li key={item.href}><a href={item.href}>{item.texto}</a></li>
              ))}
            </ol>
          </aside>
          <article className={styles.documento}>{children}</article>
        </div>
      </main>

      <footer className={styles.rodape}>
        <div>
          <LogoFlouFood />
          <p>Termos, privacidade e cookies com linguagem clara.</p>
        </div>
        <div>
          <Link href="/">Página inicial</Link>
          <Link href="/termos">Termos de Uso</Link>
          <Link href="/privacidade">Privacidade</Link>
          <Link href="/cookies">Cookies</Link>
          <BotaoPreferenciasCookies className={styles.linkBotao} />
        </div>
      </footer>

      <AvisoCookies />
    </div>
  );
}
