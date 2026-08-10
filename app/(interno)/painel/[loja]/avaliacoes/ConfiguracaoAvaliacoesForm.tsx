'use client';

import { useState } from 'react';
import { criarClientNavegador } from '@/lib/supabase/client';
import {
  NOMES_PLANOS,
  podeConfigurarAvaliacoes,
  type ConfiguracaoAvaliacoes,
  type PlanoLoja,
} from '@/lib/avaliacoes/tipos';
import styles from './avaliacoes.module.css';

type Props = {
  lojaId: string;
  plano: PlanoLoja;
  configuracaoInicial: ConfiguracaoAvaliacoes;
  configuracaoDisponivel: boolean;
};

type Mensagem = { tipo: 'sucesso' | 'erro'; texto: string } | null;

export function ConfiguracaoAvaliacoesForm({
  lojaId,
  plano,
  configuracaoInicial,
  configuracaoDisponivel,
}: Props) {
  const planoPermiteAlterar = podeConfigurarAvaliacoes(plano);
  const podeAlterar = planoPermiteAlterar && configuracaoDisponivel;
  const [produtosAtivos, setProdutosAtivos] = useState(configuracaoInicial.produtosAtivos);
  const [marcaAtiva, setMarcaAtiva] = useState(configuracaoInicial.marcaAtiva);
  const [configuracaoSalva, setConfiguracaoSalva] = useState(configuracaoInicial);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<Mensagem>(null);

  const alterou =
    produtosAtivos !== configuracaoSalva.produtosAtivos || marcaAtiva !== configuracaoSalva.marcaAtiva;

  async function salvar() {
    if (!podeAlterar || !alterou) return;

    setSalvando(true);
    setMensagem(null);
    const sb = criarClientNavegador();
    const { data, error } = await sb.rpc('configurar_avaliacoes', {
      p_loja_id: lojaId,
      p_produtos: produtosAtivos,
      p_marca: marcaAtiva,
    });

    const retorno = data as { ok?: boolean } | null;
    if (error || retorno?.ok !== true) {
      setMensagem({
        tipo: 'erro',
        texto: 'Não foi possível salvar agora. Tente novamente em instantes.',
      });
      setSalvando(false);
      return;
    }

    setConfiguracaoSalva({ produtosAtivos, marcaAtiva });
    setMensagem({ tipo: 'sucesso', texto: 'Preferências de avaliações salvas.' });
    setSalvando(false);
  }

  return (
    <main className={styles.pagina}>
      <section className={styles.hero} aria-labelledby="avaliacoes-titulo">
        <div>
          <span className={styles.sobretitulo}>Configuração antecipada</span>
          <h2 id="avaliacoes-titulo">Avaliações da sua loja</h2>
          <p>
            Escolha quais tipos de avaliação farão parte da experiência. A coleta de notas e
            comentários dos clientes ainda não está disponível.
          </p>
        </div>
        <span className={styles.plano}>{NOMES_PLANOS[plano]}</span>
      </section>

      {!configuracaoDisponivel && (
        <div className={styles.aviso} role="status">
          A configuração está preparada, mas ainda precisa ser sincronizada com o plano da loja.
          Enquanto isso, as avaliações permanecem incluídas e ativas.
        </div>
      )}

      <section className={styles.configuracoes} aria-label="Tipos de avaliação">
        <OpcaoAvaliacao
          id="avaliacoes-produtos"
          titulo="Avaliações dos produtos"
          descricao="Permitirá que o cliente avalie separadamente os produtos do pedido."
          ativo={produtosAtivos}
          bloqueado={!podeAlterar}
          motivoBloqueio={
            !configuracaoDisponivel
              ? 'Aguardando sincronização do plano'
              : 'Incluído permanentemente no Plano Básico'
          }
          aoAlterar={setProdutosAtivos}
        />
        <OpcaoAvaliacao
          id="avaliacoes-marca"
          titulo="Avaliação da marca"
          descricao="Permitirá que o cliente avalie a experiência geral com a loja."
          ativo={marcaAtiva}
          bloqueado={!podeAlterar}
          motivoBloqueio={
            !configuracaoDisponivel
              ? 'Aguardando sincronização do plano'
              : 'Incluído permanentemente no Plano Básico'
          }
          aoAlterar={setMarcaAtiva}
        />
      </section>

      <div className={styles.rodape}>
        <div className={styles.estado} aria-live="polite">
          {mensagem && (
            <span className={mensagem.tipo === 'sucesso' ? styles.sucesso : styles.erro}>
              {mensagem.texto}
            </span>
          )}
        </div>
        {planoPermiteAlterar && (
          <button
            type="button"
            className={styles.salvar}
            disabled={!podeAlterar || !alterou || salvando}
            onClick={salvar}
          >
            {salvando ? 'Salvando…' : 'Salvar configurações'}
          </button>
        )}
      </div>

      <section className={styles.proximaEtapa}>
        <span aria-hidden="true">☆</span>
        <div>
          <strong>Área pré-configurada</strong>
          <p>
            Nenhuma avaliação é solicitada ou publicada por enquanto. O fluxo do cliente,
            moderação, notas e comentários serão definidos em uma próxima etapa.
          </p>
        </div>
      </section>
    </main>
  );
}

function OpcaoAvaliacao({
  id,
  titulo,
  descricao,
  ativo,
  bloqueado,
  motivoBloqueio,
  aoAlterar,
}: {
  id: string;
  titulo: string;
  descricao: string;
  ativo: boolean;
  bloqueado: boolean;
  motivoBloqueio: string;
  aoAlterar: (ativo: boolean) => void;
}) {
  const descricaoId = `${id}-descricao`;

  return (
    <article className={`${styles.opcao} ${bloqueado ? styles.bloqueada : ''}`}>
      <div className={styles.opcaoTexto}>
        <div className={styles.tituloLinha}>
          <h3>{titulo}</h3>
          <span className={ativo ? styles.ativo : styles.inativo}>
            {ativo ? 'Ativa' : 'Desativada'}
          </span>
        </div>
        <p id={descricaoId}>{descricao}</p>
        {bloqueado && <small>🔒 {motivoBloqueio}</small>}
      </div>
      <label className={styles.switch} htmlFor={id}>
        <span className={styles.srOnly}>{ativo ? `Desativar ${titulo}` : `Ativar ${titulo}`}</span>
        <input
          id={id}
          type="checkbox"
          checked={ativo}
          disabled={bloqueado}
          aria-describedby={descricaoId}
          onChange={(evento) => aoAlterar(evento.target.checked)}
        />
        <span className={styles.trilho} aria-hidden="true" />
      </label>
    </article>
  );
}
