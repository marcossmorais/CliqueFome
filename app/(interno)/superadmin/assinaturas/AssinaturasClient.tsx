'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NOMES_PLANOS, type PlanoLoja } from '@/lib/avaliacoes/tipos';
import {
  NOMES_CICLO,
  NOMES_STATUS_ASSINATURA,
  PRECOS,
  temAcessoLiberado,
  type Assinatura,
  type CicloCobranca,
} from '@/lib/assinaturas/tipos';
import { alterarPlano, cancelarRenovacao, liberarAcesso } from '@/lib/assinaturas/acoes';
import styles from '../superadmin.module.css';

const DINHEIRO = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export type LinhaAssinatura = {
  assinatura: Assinatura;
  lojaNome: string;
  lojaSlug: string;
};

type Filtros = { status: string; plano: string; ciclo: string };
type Acao = 'plano' | 'cancelar' | 'liberar';

function formatarData(valor: string | null) {
  if (!valor) return '—';
  return new Date(valor).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function classeStatus(status: Assinatura['status']) {
  return status === 'ativa' ? 'tag tag-ativo' : status === 'cancelada' ? 'tag tag-inativo' : 'tag tag-etiqueta';
}

export function AssinaturasClient({ linhas, filtros }: { linhas: LinhaAssinatura[]; filtros: Filtros }) {
  const router = useRouter();
  const [aberta, setAberta] = useState<LinhaAssinatura | null>(null);
  const [acao, setAcao] = useState<Acao | null>(null);
  const [plano, setPlano] = useState<PlanoLoja>('basico');
  const [ciclo, setCiclo] = useState<CicloCobranca>('mensal');
  const [valor, setValor] = useState('0');
  const [ate, setAte] = useState('');
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function abrir(linha: LinhaAssinatura, qual: Acao) {
    setAberta(linha);
    setAcao(qual);
    setPlano(linha.assinatura.plano);
    setCiclo(linha.assinatura.ciclo);
    setValor(String(Number(linha.assinatura.valor)));
    setAte('');
    setMotivo('');
    setErro(null);
  }

  function fechar() {
    setAberta(null);
    setAcao(null);
    setErro(null);
  }

  // Sugere o preço de tabela ao trocar plano/ciclo, mas deixa editável: o
  // valor combinado com cada cliente é o que vale, e é ele que fica
  // gravado como snapshot na assinatura.
  function trocarPlano(novo: PlanoLoja) {
    setPlano(novo);
    setValor(String(PRECOS[novo][ciclo]));
  }
  function trocarCiclo(novo: CicloCobranca) {
    setCiclo(novo);
    setValor(String(PRECOS[plano][novo]));
  }

  async function confirmar() {
    if (!aberta || !acao) return;
    setSalvando(true);
    setErro(null);
    try {
      const lojaId = aberta.assinatura.loja_id;
      if (acao === 'plano') {
        const numero = Number(valor.replace(',', '.'));
        if (!Number.isFinite(numero) || numero < 0) throw new Error('Informe um valor válido.');
        await alterarPlano(lojaId, plano, ciclo, numero, motivo);
      } else if (acao === 'cancelar') {
        await cancelarRenovacao(lojaId, motivo);
      } else {
        await liberarAcesso(lojaId, new Date(`${ate}T12:00:00-03:00`).toISOString(), motivo);
      }
      fechar();
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível concluir a ação.');
    } finally {
      setSalvando(false);
    }
  }

  const motivoObrigatorio = acao === 'cancelar' || acao === 'liberar';
  const podeConfirmar =
    !salvando &&
    (!motivoObrigatorio || motivo.trim().length >= 3) &&
    (acao !== 'liberar' || !!ate);

  return (
    <>
      <form className={styles.filtros} method="get">
        <label>
          Situação
          <select name="status" defaultValue={filtros.status}>
            <option value="">Todas</option>
            {(['ativa', 'pendente', 'atrasada', 'cancelada'] as const).map((s) => (
              <option key={s} value={s}>{NOMES_STATUS_ASSINATURA[s]}</option>
            ))}
          </select>
        </label>
        <label>
          Plano
          <select name="plano" defaultValue={filtros.plano}>
            <option value="">Todos</option>
            {(['basico', 'pro', 'pro_plus'] as const).map((p) => (
              <option key={p} value={p}>{NOMES_PLANOS[p]}</option>
            ))}
          </select>
        </label>
        <label>
          Ciclo
          <select name="ciclo" defaultValue={filtros.ciclo}>
            <option value="">Todos</option>
            {(['mensal', 'semestral', 'anual'] as const).map((c) => (
              <option key={c} value={c}>{NOMES_CICLO[c]}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-primary btn-small">Aplicar</button>
        <Link href="/superadmin/assinaturas" className="btn-ghost btn-small">Limpar</Link>
      </form>

      {linhas.length === 0 ? (
        <div className={styles.vazio}>
          <strong>Nenhuma assinatura encontrada</strong>
          <p>Ajuste os filtros ou cadastre o plano de uma loja em Clientes.</p>
        </div>
      ) : (
        <div className={styles.lista}>
          {linhas.map((linha) => (
            <div key={linha.assinatura.id} className={styles.linha}>
              <div>
                <strong>{linha.lojaNome}</strong>
                <small>
                  /{linha.lojaSlug} · próxima cobrança {formatarData(linha.assinatura.proxima_cobranca_em)}
                  {temAcessoLiberado(linha.assinatura)
                    ? ` · cortesia até ${formatarData(linha.assinatura.liberado_ate)}`
                    : ''}
                </small>
              </div>
              <span className="tag tag-etiqueta">{NOMES_PLANOS[linha.assinatura.plano]}</span>
              <span className={classeStatus(linha.assinatura.status)}>
                {NOMES_STATUS_ASSINATURA[linha.assinatura.status]}
              </span>
              <span className={styles.valor}>
                {DINHEIRO.format(Number(linha.assinatura.valor))}
                <small style={{ fontWeight: 500 }}>{NOMES_CICLO[linha.assinatura.ciclo]}</small>
              </span>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" className="btn-ghost btn-small" onClick={() => abrir(linha, 'plano')}>
                  Alterar plano
                </button>
                <button type="button" className="btn-ghost btn-small" onClick={() => abrir(linha, 'liberar')}>
                  Liberar acesso
                </button>
                {linha.assinatura.status !== 'cancelada' && (
                  <button type="button" className="btn-ghost btn-small" onClick={() => abrir(linha, 'cancelar')}>
                    Cancelar renovação
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {aberta && acao && (
        // `.modal` nasce display:none no admin.css — quem mostra é `.aberto`.
        <div className="modal aberto" role="dialog" aria-modal="true" aria-label="Ação administrativa">
          <div className="modal-backdrop" onClick={salvando ? undefined : fechar} />
          <section className="modal-sheet">
            <header className="modal-topo">
              <div className="modal-titulo">
                {acao === 'plano' ? 'Alterar plano' : acao === 'cancelar' ? 'Cancelar renovação' : 'Liberar acesso'}
                <small style={{ display: 'block', fontWeight: 500 }}>{aberta.lojaNome}</small>
              </div>
              <button type="button" className="btn-ghost btn-small" onClick={fechar} disabled={salvando}>
                Fechar
              </button>
            </header>

            <div className="modal-corpo" style={{ display: 'grid', gap: 12 }}>
              {acao === 'plano' && (
                <>
                  <label className="checkout-campo" style={{ display: 'grid', gap: 4 }}>
                    Plano
                    <select value={plano} onChange={(e) => trocarPlano(e.target.value as PlanoLoja)}>
                      {(['basico', 'pro', 'pro_plus'] as const).map((p) => (
                        <option key={p} value={p}>{NOMES_PLANOS[p]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="checkout-campo" style={{ display: 'grid', gap: 4 }}>
                    Ciclo de cobrança
                    <select value={ciclo} onChange={(e) => trocarCiclo(e.target.value as CicloCobranca)}>
                      {(['mensal', 'semestral', 'anual'] as const).map((c) => (
                        <option key={c} value={c}>{NOMES_CICLO[c]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="checkout-campo" style={{ display: 'grid', gap: 4 }}>
                    Valor combinado (R$)
                    <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
                    <small style={{ color: 'var(--texto-suave)' }}>
                      Sugerido pela tabela; edite se este cliente tem preço negociado.
                    </small>
                  </label>
                </>
              )}

              {acao === 'liberar' && (
                <>
                  <label className="checkout-campo" style={{ display: 'grid', gap: 4 }}>
                    Liberar até
                    <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
                  </label>
                  <p className="dica">
                    Libera o acesso sem registrar pagamento nenhum — cortesia e dinheiro recebido são
                    coisas diferentes e ficam separadas de propósito.
                  </p>
                </>
              )}

              {acao === 'cancelar' && (
                <p className="dica">
                  A assinatura passa a <strong>cancelada</strong> e a próxima cobrança é removida. Não
                  estorna nada — estorno é operação do gateway.
                </p>
              )}

              <label className="checkout-campo" style={{ display: 'grid', gap: 4 }}>
                Motivo {motivoObrigatorio ? '' : '(opcional)'}
                <input
                  maxLength={300}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder={acao === 'liberar' ? 'Ex: cortesia de 30 dias' : 'Ex: pedido do cliente'}
                />
                <small style={{ color: 'var(--texto-suave)' }}>Fica gravado na auditoria com seu usuário.</small>
              </label>

              {erro && <p className="msg msg-erro" role="alert">{erro}</p>}
            </div>

            <footer className="modal-rodape">
              <button type="button" className="btn-ghost btn-small" onClick={fechar} disabled={salvando}>
                Voltar
              </button>
              <button type="button" className="btn-primary btn-small" onClick={confirmar} disabled={!podeConfirmar}>
                {salvando && <span className="btn-spinner" aria-hidden="true" />}
                {salvando ? 'Salvando…' : 'Confirmar'}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
