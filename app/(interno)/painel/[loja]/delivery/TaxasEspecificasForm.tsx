'use client';

import { useEffect, useState } from 'react';
import styles from './delivery.module.css';

type Escopo = 'CITY' | 'NEIGHBORHOOD';

type Regra = {
  chave: string;
  scope: Escopo;
  cidade: string;
  bairro: string;
  uf: string;
  /** Em reais, como texto — é o que a pessoa digita. Vira centavos no salvar. */
  valor: string;
};

type RegraApi = {
  id: string;
  scope: Escopo;
  state: string | null;
  city_display: string;
  neighborhood_display: string | null;
  fee_cents: number;
};

type Mensagem = { tipo: 'sucesso' | 'erro'; texto: string } | null;

const novaChave = () => `r-${Math.random().toString(36).slice(2, 10)}`;

/** Centavos inteiros a partir do que foi digitado. Aceita "5", "5,50" e
 *  "5.50" — e devolve NaN pro que não é número, pra validação barrar. */
export function paraCentavos(valor: string): number {
  const limpo = valor.trim().replace(',', '.');
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(limpo)) return NaN;
  return Math.round(Number(limpo) * 100);
}

const paraReais = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

/**
 * Taxas específicas por cidade ou bairro.
 *
 * A regra específica SUBSTITUI a regra base — a tela repete isso porque é a
 * confusão mais provável: quem cadastra "Centro R$5" com uma base de R$2/km
 * costuma esperar R$5 mais a distância. É R$5 e ponto.
 */
export function TaxasEspecificasForm({ lojaId }: { lojaId: string }) {
  const [regras, setRegras] = useState<Regra[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<Mensagem>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const resposta = await fetch(`/api/admin/delivery/taxas?lojaId=${lojaId}`, { cache: 'no-store' });
        const corpo = (await resposta.json()) as { taxas?: RegraApi[]; erro?: string };
        if (cancelado) return;
        if (!resposta.ok) {
          setMensagem({ tipo: 'erro', texto: corpo.erro || 'Não foi possível carregar as taxas específicas.' });
          return;
        }
        setRegras((corpo.taxas ?? []).map((t) => ({
          chave: t.id,
          scope: t.scope,
          cidade: t.city_display,
          bairro: t.neighborhood_display ?? '',
          uf: t.state ?? '',
          valor: paraReais(t.fee_cents),
        })));
      } catch {
        if (!cancelado) setMensagem({ tipo: 'erro', texto: 'Não foi possível carregar as taxas específicas.' });
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [lojaId]);

  const alterar = (chave: string, campo: keyof Regra, valor: string) => {
    setRegras((atual) => atual.map((r) => (r.chave === chave ? { ...r, [campo]: valor } : r)));
    setMensagem(null);
  };

  const adicionar = (scope: Escopo) => {
    setRegras((atual) => [...atual, { chave: novaChave(), scope, cidade: '', bairro: '', uf: '', valor: '' }]);
    setMensagem(null);
  };

  const remover = (chave: string) => {
    setRegras((atual) => atual.filter((r) => r.chave !== chave));
    setMensagem(null);
  };

  async function salvar() {
    setMensagem(null);

    const payload = [];
    for (const regra of regras) {
      const feeCents = paraCentavos(regra.valor);
      if (!regra.cidade.trim()) {
        setMensagem({ tipo: 'erro', texto: 'Toda regra precisa de uma cidade.' });
        return;
      }
      if (regra.scope === 'NEIGHBORHOOD' && !regra.bairro.trim()) {
        setMensagem({ tipo: 'erro', texto: 'As regras por bairro precisam do nome do bairro.' });
        return;
      }
      if (!Number.isInteger(feeCents)) {
        setMensagem({ tipo: 'erro', texto: `Valor inválido em ${regra.bairro || regra.cidade}. Use algo como 7,50.` });
        return;
      }
      payload.push({
        scope: regra.scope,
        cidade: regra.cidade.trim(),
        bairro: regra.scope === 'NEIGHBORHOOD' ? regra.bairro.trim() : undefined,
        uf: regra.uf.trim().toUpperCase(),
        feeCents,
      });
    }

    setSalvando(true);
    try {
      const resposta = await fetch('/api/admin/delivery/taxas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lojaId, taxas: payload }),
      });
      const corpo = (await resposta.json()) as { erro?: string; total?: number };
      if (!resposta.ok) {
        setMensagem({ tipo: 'erro', texto: corpo.erro || 'Não foi possível salvar.' });
        return;
      }
      setMensagem({
        tipo: 'sucesso',
        texto: corpo.total === 0 ? 'Taxas específicas removidas.' : `${corpo.total} regra(s) salva(s).`,
      });
    } catch {
      setMensagem({ tipo: 'erro', texto: 'Falha de conexão ao salvar as taxas específicas.' });
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) return <p className={styles.blocoDesc}>Carregando taxas específicas…</p>;

  const bairros = regras.filter((r) => r.scope === 'NEIGHBORHOOD');
  const cidades = regras.filter((r) => r.scope === 'CITY');

  return (
    <section className={styles.bloco}>
      <h3>Taxas específicas</h3>
      <p className={styles.blocoDesc}>
        Valor fixo para uma cidade ou bairro. <strong>Substitui</strong> a regra padrão — não soma com ela.
        Se o bairro e a cidade tiverem regra, vale a do bairro.
      </p>

      {[
        { escopo: 'NEIGHBORHOOD' as Escopo, titulo: 'Por bairro', lista: bairros, rotulo: '+ Adicionar bairro' },
        { escopo: 'CITY' as Escopo, titulo: 'Por cidade', lista: cidades, rotulo: '+ Adicionar cidade' },
      ].map((grupo) => (
        <div key={grupo.escopo} style={{ marginTop: 14 }}>
          <strong style={{ fontSize: 12 }}>{grupo.titulo}</strong>
          {grupo.lista.length === 0 && (
            <p className={styles.blocoDesc} style={{ marginTop: 4 }}>Nenhuma regra por {grupo.escopo === 'CITY' ? 'cidade' : 'bairro'}.</p>
          )}
          {grupo.lista.map((regra) => (
            <div key={regra.chave} className={styles.enderecoGrid} style={{ marginTop: 8 }}>
              {regra.scope === 'NEIGHBORHOOD' && (
                <div className={styles.campo}>
                  <label htmlFor={`b-${regra.chave}`}>Bairro</label>
                  <input id={`b-${regra.chave}`} maxLength={80} value={regra.bairro}
                    onChange={(e) => alterar(regra.chave, 'bairro', e.target.value)} placeholder="Centro" />
                </div>
              )}
              <div className={styles.campo}>
                <label htmlFor={`c-${regra.chave}`}>Cidade</label>
                <input id={`c-${regra.chave}`} maxLength={100} value={regra.cidade}
                  onChange={(e) => alterar(regra.chave, 'cidade', e.target.value)} placeholder="Campina Grande" />
              </div>
              <div className={styles.campo}>
                <label htmlFor={`u-${regra.chave}`}>UF</label>
                <input id={`u-${regra.chave}`} maxLength={2} value={regra.uf}
                  onChange={(e) => alterar(regra.chave, 'uf', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} placeholder="PB" />
              </div>
              <div className={styles.campo}>
                <label htmlFor={`v-${regra.chave}`}>Taxa (R$)</label>
                <input id={`v-${regra.chave}`} inputMode="decimal" maxLength={7} value={regra.valor}
                  onChange={(e) => alterar(regra.chave, 'valor', e.target.value)} placeholder="7,50" />
              </div>
              <div className={styles.campo}>
                <label aria-hidden="true">&nbsp;</label>
                <button type="button" className={styles.adicionar} onClick={() => remover(regra.chave)}>
                  Remover
                </button>
              </div>
            </div>
          ))}
          <button type="button" className={styles.adicionar} style={{ marginTop: 8 }} onClick={() => adicionar(grupo.escopo)}>
            {grupo.rotulo}
          </button>
        </div>
      ))}

      <div className={styles.rodape}>
        <div className={styles.estado} aria-live="polite">
          {mensagem && (
            <span className={mensagem.tipo === 'sucesso' ? styles.sucesso : styles.erro}>{mensagem.texto}</span>
          )}
        </div>
        <button type="button" className={styles.salvar} disabled={salvando} onClick={salvar}>
          {salvando ? 'Salvando…' : 'Salvar taxas específicas'}
        </button>
      </div>
    </section>
  );
}
