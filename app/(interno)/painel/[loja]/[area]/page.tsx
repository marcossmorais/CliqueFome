import { notFound } from 'next/navigation';
import { obterLojaPorSlug } from '@/lib/loja';
import { ShellPainel } from '@/components/admin/ShellPainel';
import { TODAS_AREAS, ICONES } from '@/lib/menu';

/**
 * Áreas do menu que ainda não têm tela própria. Sem esta rota, clicar em
 * "Gestão de pedidos" caía num 404 cru — o admin.html antigo mostrava um
 * "em breve", e é esse comportamento que fica aqui.
 *
 * Rota estática (ex: /painel/<loja>/cardapio) sempre ganha desta, então as telas
 * já migradas não passam por aqui.
 */
export default async function AreaEmBrevePage({
  params,
}: {
  params: Promise<{ loja: string; area: string }>;
}) {
  const { loja: slug, area: id } = await params;
  const area = TODAS_AREAS.find((a) => a.id === id);

  // Slug que não existe no menu continua sendo 404 de verdade.
  if (!area) notFound();

  const { loja, souAdmin } = await obterLojaPorSlug(slug);
  if (!loja) return null;

  return (
    <ShellPainel
      lojaNome={loja.nome}
      lojaSlug={loja.slug}
      souAdmin={souAdmin}
      titulo={area.nome}
    >
      <div className="area ativo">
        <div className="card em-breve">
          <div className="ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={ICONES[area.icone]} />
            </svg>
          </div>
          <h2>{area.nome}</h2>
          {/* Áreas marcadas como prontas no menu mas ainda sem tela (caso
              da Minha empresa durante a migração) não têm desc — cai neste
              texto em vez de um parágrafo vazio. */}
          <p>{area.desc ?? 'Esta tela está na fila de migração.'}</p>
          <span className="badge-admin">Em breve</span>
        </div>
      </div>
    </ShellPainel>
  );
}
