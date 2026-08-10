import Link from 'next/link';
import { ShellPainel } from '@/components/admin/ShellPainel';
import { obterLojaPorSlug } from '@/lib/loja';
import styles from './pdv.module.css';

const MODULOS = [
  { nome: 'Caixa', descricao: 'Abertura, fechamento, sangria, suprimento e conferência do movimento.', href: 'caixa', icone: '▣' },
  { nome: 'Estoque', descricao: 'Entradas, saídas, insumos e alertas de estoque baixo.', href: 'estoque', icone: '◇' },
  { nome: 'Nota fiscal', descricao: 'Emissão e acompanhamento das notas dos pedidos.', href: 'fiscal', icone: '▤' },
];

export default async function PdvPage({
  params,
}: {
  params: Promise<{ loja: string }>;
}) {
  const { loja: slug } = await params;
  const { loja, souAdmin } = await obterLojaPorSlug(slug);
  if (!loja) return null;

  return (
    <ShellPainel lojaNome={loja.nome} lojaSlug={loja.slug} souAdmin={souAdmin} titulo="PDV">
      <div className={`area ativo ${styles.pagina}`}>
        <header>
          <span>Operação no balcão</span>
          <h2>PDV</h2>
          <p>Caixa, estoque e nota fiscal organizados em um único ponto de acesso.</p>
        </header>
        <div className={styles.grade}>
          {MODULOS.map((modulo) => (
            <Link key={modulo.nome} href={`/painel/${slug}/${modulo.href}`} className={styles.card}>
              <i aria-hidden="true">{modulo.icone}</i>
              <div><strong>{modulo.nome}</strong><p>{modulo.descricao}</p></div>
              <span>Em breve</span>
            </Link>
          ))}
        </div>
      </div>
    </ShellPainel>
  );
}
