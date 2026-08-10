'use client';

import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import type { CategoriaFaq, PerguntaFrequente, Tutorial } from '@/lib/suporte/conteudo';
import { correspondeABusca } from '@/lib/suporte/filtro';
import styles from './suporte.module.css';

type Categoria = { id: 'todos' | CategoriaFaq; nome: string };

function IconeBusca() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

function textoPergunta(item: PerguntaFrequente) {
  return [
    item.pergunta,
    item.resposta,
    item.observacao,
    ...(item.passos ?? []),
    ...item.palavrasChave,
  ].filter(Boolean).join(' ');
}

function textoTutorial(item: Tutorial) {
  return [
    item.titulo,
    item.resumo,
    item.nivel,
    ...item.passos.flatMap((passo) => [passo.titulo, passo.descricao]),
    ...item.palavrasChave,
  ].join(' ');
}

export function CentralAjuda({
  lojaSlug,
  categorias,
  perguntas,
  tutoriais,
}: {
  lojaSlug: string;
  categorias: Categoria[];
  perguntas: PerguntaFrequente[];
  tutoriais: Tutorial[];
}) {
  const buscaId = useId();
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState<Categoria['id']>('todos');

  const perguntasVisiveis = useMemo(
    () => perguntas.filter((item) =>
      (categoria === 'todos' || item.categoria === categoria) &&
      correspondeABusca(textoPergunta(item), busca)
    ),
    [busca, categoria, perguntas]
  );

  const tutoriaisVisiveis = useMemo(
    () => tutoriais.filter((item) => correspondeABusca(textoTutorial(item), busca)),
    [busca, tutoriais]
  );

  const totalResultados = perguntasVisiveis.length + tutoriaisVisiveis.length;

  return (
    <div className={`area ativo ${styles.central}`}>
      <section className={styles.hero} aria-labelledby="ajuda-titulo">
        <div>
          <span className={styles.sobretitulo}>Central de Ajuda</span>
          <h2 id="ajuda-titulo">Como podemos ajudar?</h2>
          <p>Pesquise uma dúvida ou siga um tutorial passo a passo para operar o CliqueFome.</p>
        </div>

        <div className={styles.buscaWrap}>
          <label htmlFor={buscaId}>Pesquisar na Central de Ajuda</label>
          <div className={styles.busca}>
            <IconeBusca />
            <input
              id={buscaId}
              type="search"
              placeholder="Ex.: cadastrar produto, pedido, WhatsApp..."
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
              autoComplete="off"
            />
            {busca && (
              <button type="button" onClick={() => setBusca('')} aria-label="Limpar pesquisa">
                Limpar
              </button>
            )}
          </div>
          <p className={styles.resultado} aria-live="polite">
            {busca ? `${totalResultados} resultado${totalResultados === 1 ? '' : 's'} para “${busca}”` : `${perguntas.length} respostas e ${tutoriais.length} tutoriais disponíveis`}
          </p>
        </div>
      </section>

      <nav className={styles.atalhos} aria-label="Atalhos da Central de Ajuda">
        <a href="#perguntas">
          <span className={styles.atalhoIcone} aria-hidden="true">?</span>
          <span><strong>Perguntas frequentes</strong><small>Respostas rápidas por assunto</small></span>
        </a>
        <a href="#tutoriais">
          <span className={styles.atalhoIcone} aria-hidden="true">✓</span>
          <span><strong>Tutoriais do sistema</strong><small>Passos para as tarefas principais</small></span>
        </a>
        <a href="#canais">
          <span className={styles.atalhoIcone} aria-hidden="true">…</span>
          <span><strong>Canais de suporte</strong><small>Chatbot e atendimento humano</small></span>
        </a>
      </nav>

      <section id="perguntas" className={styles.secao} aria-labelledby="perguntas-titulo">
        <div className={styles.secaoTopo}>
          <div>
            <span className={styles.sobretitulo}>Respostas rápidas</span>
            <h2 id="perguntas-titulo">Perguntas frequentes</h2>
          </div>
          <span className={styles.contagem}>{perguntasVisiveis.length} encontradas</span>
        </div>

        <div className={styles.filtros} aria-label="Filtrar perguntas por assunto">
          {categorias.map((item) => (
            <button
              key={item.id}
              type="button"
              className={categoria === item.id ? styles.filtroAtivo : ''}
              aria-pressed={categoria === item.id}
              onClick={() => setCategoria(item.id)}
            >
              {item.nome}
            </button>
          ))}
        </div>

        {perguntasVisiveis.length > 0 ? (
          <div className={styles.listaFaq}>
            {perguntasVisiveis.map((item) => (
              <details key={item.id} className={styles.faqItem}>
                <summary>
                  <span>{item.pergunta}</span>
                  <span className={styles.chevron} aria-hidden="true" />
                </summary>
                <div className={styles.faqResposta}>
                  <p>{item.resposta}</p>
                  {item.passos && (
                    <ol>
                      {item.passos.map((passo) => <li key={passo}>{passo}</li>)}
                    </ol>
                  )}
                  {item.observacao && <aside><strong>Atenção:</strong> {item.observacao}</aside>}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <div className={styles.vazio} role="status">
            <strong>Nenhuma resposta encontrada</strong>
            <p>Tente outra palavra ou selecione “Todas”.</p>
            <button type="button" onClick={() => { setBusca(''); setCategoria('todos'); }}>Limpar filtros</button>
          </div>
        )}
      </section>

      <section id="tutoriais" className={styles.secao} aria-labelledby="tutoriais-titulo">
        <div className={styles.secaoTopo}>
          <div>
            <span className={styles.sobretitulo}>Aprenda fazendo</span>
            <h2 id="tutoriais-titulo">Tutoriais das funcionalidades</h2>
          </div>
          <p>Abra um guia e acompanhe as etapas no painel.</p>
        </div>

        {tutoriaisVisiveis.length > 0 ? (
          <div className={styles.tutoriaisGrid}>
            {tutoriaisVisiveis.map((tutorial, indice) => (
              <details key={tutorial.id} className={styles.tutorialCard}>
                <summary>
                  <span className={styles.numero}>{String(indice + 1).padStart(2, '0')}</span>
                  <span className={styles.tutorialResumo}>
                    <span className={styles.tutorialMeta}>{tutorial.nivel} · {tutorial.duracao}</span>
                    <strong>{tutorial.titulo}</strong>
                    <small>{tutorial.resumo}</small>
                  </span>
                  <span className={styles.abrir}>Ver passos</span>
                </summary>
                <ol className={styles.passos}>
                  {tutorial.passos.map((passo, passoIndice) => (
                    <li key={passo.titulo}>
                      <span>{passoIndice + 1}</span>
                      <div>
                        <strong>{passo.titulo}</strong>
                        <p>{passo.descricao}</p>
                        {passo.rota && <Link href={`/painel/${lojaSlug}/${passo.rota}`}>Abrir esta área →</Link>}
                      </div>
                    </li>
                  ))}
                </ol>
              </details>
            ))}
          </div>
        ) : (
          <div className={styles.vazio} role="status">
            <strong>Nenhum tutorial encontrado</strong>
            <p>Limpe a pesquisa para ver todos os guias.</p>
          </div>
        )}
      </section>

      <section id="canais" className={styles.secao} aria-labelledby="canais-titulo">
        <div className={styles.secaoTopo}>
          <div>
            <span className={styles.sobretitulo}>Atendimento</span>
            <h2 id="canais-titulo">Canais de suporte</h2>
          </div>
          <p>Os canais diretos serão liberados em uma próxima etapa.</p>
        </div>

        <div className={styles.canaisGrid}>
          <article className={styles.canalCard} aria-labelledby="chatbot-titulo">
            <div className={styles.canalTopo}>
              <span className={styles.canalIcone} aria-hidden="true">✦</span>
              <span className={styles.breve}>Em breve</span>
            </div>
            <h3 id="chatbot-titulo">Chatbot de suporte</h3>
            <p>Respostas instantâneas usando o conteúdo da Central de Ajuda, com encaminhamento quando necessário.</p>
            <span className={styles.indisponivel}>Ainda não disponível</span>
          </article>

          <article className={styles.canalCard} aria-labelledby="humano-titulo">
            <div className={styles.canalTopo}>
              <span className={styles.canalIcone} aria-hidden="true">◎</span>
              <span className={styles.breve}>Em breve</span>
            </div>
            <h3 id="humano-titulo">Atendimento humano</h3>
            <p>Canal para dúvidas de conta e questões que precisam da análise da equipe CliqueFome.</p>
            <span className={styles.indisponivel}>Ainda não disponível</span>
          </article>

          <article className={`${styles.canalCard} ${styles.canalLegal}`} aria-labelledby="legal-titulo">
            <div className={styles.canalTopo}>
              <span className={styles.canalIcone} aria-hidden="true">§</span>
              <span className={styles.disponivel}>Disponível</span>
            </div>
            <h3 id="legal-titulo">Termos e privacidade</h3>
            <p>Consulte o rascunho dos Termos de Uso e do Aviso de Privacidade, com referências à LGPD.</p>
            <Link href="/termos">Ler documentos →</Link>
          </article>
        </div>
      </section>
    </div>
  );
}
