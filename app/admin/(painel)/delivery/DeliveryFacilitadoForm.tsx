'use client';

import { useEffect, useState } from 'react';
import styles from './delivery.module.css';

type ConfigApi = {
  loja_id: string;
  setor: 'facilitado' | 'avancado';
  tipo_taxa: 'fixa' | 'por_km';
  cidade_atendida: string;
  taxa_fixa: number;
  valor_por_km: number;
  taxa_maxima: number;
  distancia_maxima_km: number;
  endereco_origem: string | null;
} | null;

type CidadeApi = { cidade: string; taxa: number };

type Mensagem = { tipo: 'sucesso' | 'erro'; texto: string } | null;

type Cidade = { cidade: string; taxa: string };

export function DeliveryFacilitadoForm({ lojaId }: { lojaId: string }) {
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<Mensagem>(null);

  const [setor, setSetor] = useState<'facilitado' | 'avancado'>('facilitado');
  const [tipoTaxa, setTipoTaxa] = useState<'fixa' | 'por_km'>('fixa');
  const [cidade, setCidade] = useState('');
  const [taxaFixa, setTaxaFixa] = useState('0');
  const [valorPorKm, setValorPorKm] = useState('2');
  const [taxaMaxima, setTaxaMaxima] = useState('40');
  const [distanciaMaximaKm, setDistanciaMaximaKm] = useState('30');
  const [enderecoOrigem, setEnderecoOrigem] = useState('');
  const [cidades, setCidades] = useState<Cidade[]>([]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const resposta = await fetch(`/api/admin/delivery/configuracao?lojaId=${lojaId}`, {
          cache: 'no-store',
        });
        const corpo = (await resposta.json()) as { config: ConfigApi; cidades: CidadeApi[] };
        if (cancelado) return;
        if (corpo.config) {
          const c = corpo.config;
          setSetor(c.setor);
          setTipoTaxa(c.tipo_taxa);
          setCidade(c.cidade_atendida);
          setTaxaFixa(String(c.taxa_fixa));
          setValorPorKm(String(c.valor_por_km));
          setTaxaMaxima(String(c.taxa_maxima));
          setDistanciaMaximaKm(String(c.distancia_maxima_km));
          setEnderecoOrigem(c.endereco_origem ?? '');
        }
        setCidades((corpo.cidades ?? []).map((item) => ({ cidade: item.cidade, taxa: String(item.taxa) })));
      } catch {
        if (!cancelado) setMensagem({ tipo: 'erro', texto: 'Não foi possível carregar a configuração atual.' });
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [lojaId]);

  function adicionarCidade() {
    setCidades((atual) => [...atual, { cidade: '', taxa: '' }]);
  }

  function removerCidade(indice: number) {
    setCidades((atual) => atual.filter((_, i) => i !== indice));
  }

  function alterarCidade(indice: number, campo: 'cidade' | 'taxa', valor: string) {
    setCidades((atual) => atual.map((item, i) => (i === indice ? { ...item, [campo]: valor } : item)));
  }

  async function salvar() {
    setSalvando(true);
    setMensagem(null);

    const resposta = await fetch('/api/admin/delivery/configuracao', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lojaId,
        setor,
        cidade,
        tipoTaxa,
        taxaFixa: Number(taxaFixa),
        valorPorKm: Number(valorPorKm),
        taxaMaxima: Number(taxaMaxima),
        distanciaMaximaKm: Number(distanciaMaximaKm),
        enderecoOrigem,
        cidades:
          setor === 'avancado'
            ? cidades.map((item) => ({ cidade: item.cidade.trim(), taxa: Number(item.taxa) }))
            : [],
      }),
    }).catch(() => null);

    if (!resposta || !resposta.ok) {
      const corpo = resposta ? ((await resposta.json().catch(() => null)) as { erro?: string } | null) : null;
      setMensagem({ tipo: 'erro', texto: corpo?.erro ?? 'Não foi possível salvar agora. Tente novamente.' });
      setSalvando(false);
      return;
    }

    setMensagem({ tipo: 'sucesso', texto: 'Configuração de entrega salva.' });
    setSalvando(false);
  }

  if (carregando) {
    return <main className={styles.pagina}>Carregando configuração de entrega…</main>;
  }

  return (
    <main className={styles.pagina}>
      <section className={styles.hero} aria-labelledby="delivery-titulo">
        <div>
          <span className={styles.sobretitulo}>Delivery facilitado</span>
          <h2 id="delivery-titulo">Área de entrega da sua loja</h2>
          <p>
            Defina a cidade principal e como a taxa é calculada. No modo avançado você acrescenta
            cidades vizinhas, cada uma com sua própria taxa fixa.
          </p>
        </div>
      </section>

      <div className={styles.aviso} role="status">
        A taxa fixa nunca consome créditos de rota. O cálculo por quilômetro só é usado na cidade
        principal, quando o cliente escolhe essa opção.
      </div>

      <section className={styles.bloco}>
        <h3>Setor de entrega</h3>
        <div className={styles.opcoesSetor}>
          <label className={styles.radio}>
            <input
              type="radio"
              name="setor"
              checked={setor === 'facilitado'}
              onChange={() => setSetor('facilitado')}
            />
            <span>
              <strong>Facilitado</strong>
              <small>Uma taxa para toda a cidade da loja.</small>
            </span>
          </label>
          <label className={styles.radio}>
            <input
              type="radio"
              name="setor"
              checked={setor === 'avancado'}
              onChange={() => setSetor('avancado')}
            />
            <span>
              <strong>Avançado</strong>
              <small>Cidade principal mais cidades vizinhas com taxa própria.</small>
            </span>
          </label>
        </div>
      </section>

      <section className={styles.bloco}>
        <h3>Cidade principal</h3>
        <div className={styles.campo}>
          <label htmlFor="delivery-cidade">Cidade atendida</label>
          <input
            id="delivery-cidade"
            type="text"
            value={cidade}
            onChange={(evento) => setCidade(evento.target.value)}
            placeholder="Ex.: Fortaleza"
            maxLength={100}
          />
        </div>

        <div className={styles.opcoesSetor}>
          <label className={styles.radio}>
            <input type="radio" name="tipoTaxa" checked={tipoTaxa === 'fixa'} onChange={() => setTipoTaxa('fixa')} />
            <span>
              <strong>Taxa fixa</strong>
              <small>Mesmo valor para qualquer endereço da cidade.</small>
            </span>
          </label>
          <label className={styles.radio}>
            <input
              type="radio"
              name="tipoTaxa"
              checked={tipoTaxa === 'por_km'}
              onChange={() => setTipoTaxa('por_km')}
            />
            <span>
              <strong>Por quilômetro</strong>
              <small>Calcula pela rota até o endereço do cliente.</small>
            </span>
          </label>
        </div>

        {tipoTaxa === 'fixa' ? (
          <div className={styles.campo}>
            <label htmlFor="delivery-taxa-fixa">Taxa fixa (R$)</label>
            <input
              id="delivery-taxa-fixa"
              type="number"
              min={0}
              max={200}
              step="0.01"
              value={taxaFixa}
              onChange={(evento) => setTaxaFixa(evento.target.value)}
            />
          </div>
        ) : (
          <>
            <div className={styles.campo}>
              <label htmlFor="delivery-endereco">Endereço do estabelecimento</label>
              <input
                id="delivery-endereco"
                type="text"
                value={enderecoOrigem}
                onChange={(evento) => setEnderecoOrigem(evento.target.value)}
                placeholder="Rua, número, bairro, CEP"
                maxLength={240}
              />
              <small>Usado só para calcular a distância da rota. Salvo uma vez, não muda a cada pedido.</small>
            </div>
            <div className={styles.campo}>
              <label htmlFor="delivery-valor-km">Valor por km (R$)</label>
              <input
                id="delivery-valor-km"
                type="number"
                min={0}
                max={50}
                step="0.01"
                value={valorPorKm}
                onChange={(evento) => setValorPorKm(evento.target.value)}
              />
            </div>
          </>
        )}
      </section>

      <section className={styles.bloco}>
        <h3>Limites de segurança</h3>
        <div className={styles.linha2}>
          <div className={styles.campo}>
            <label htmlFor="delivery-taxa-maxima">Taxa máxima (R$)</label>
            <input
              id="delivery-taxa-maxima"
              type="number"
              min={1}
              max={200}
              step="0.01"
              value={taxaMaxima}
              onChange={(evento) => setTaxaMaxima(evento.target.value)}
            />
            <small>Se o cálculo passar disso, o cliente é orientado a confirmar pelo WhatsApp.</small>
          </div>
          <div className={styles.campo}>
            <label htmlFor="delivery-distancia-maxima">Distância máxima (km)</label>
            <input
              id="delivery-distancia-maxima"
              type="number"
              min={1}
              max={100}
              step="0.1"
              value={distanciaMaximaKm}
              onChange={(evento) => setDistanciaMaximaKm(evento.target.value)}
            />
          </div>
        </div>
      </section>

      {setor === 'avancado' && (
        <section className={styles.bloco}>
          <h3>Cidades vizinhas</h3>
          <p className={styles.blocoDesc}>
            Cada cidade vizinha tem uma taxa fixa própria, escolhida pelo cliente no checkout.
          </p>

          {cidades.length === 0 && <p className={styles.vazio}>Nenhuma cidade vizinha cadastrada.</p>}

          <div className={styles.listaCidades}>
            {cidades.map((item, indice) => (
              <div className={styles.linhaCidade} key={indice}>
                <input
                  type="text"
                  value={item.cidade}
                  onChange={(evento) => alterarCidade(indice, 'cidade', evento.target.value)}
                  placeholder="Nome da cidade"
                  maxLength={100}
                />
                <input
                  type="number"
                  value={item.taxa}
                  onChange={(evento) => alterarCidade(indice, 'taxa', evento.target.value)}
                  placeholder="Taxa (R$)"
                  min={0}
                  max={Number(taxaMaxima) || 200}
                  step="0.01"
                />
                <button type="button" className={styles.remover} onClick={() => removerCidade(indice)}>
                  Remover
                </button>
              </div>
            ))}
          </div>

          <button type="button" className={styles.adicionar} onClick={adicionarCidade} disabled={cidades.length >= 60}>
            + Adicionar cidade vizinha
          </button>
        </section>
      )}

      <div className={styles.rodape}>
        <div className={styles.estado} aria-live="polite">
          {mensagem && (
            <span className={mensagem.tipo === 'sucesso' ? styles.sucesso : styles.erro}>{mensagem.texto}</span>
          )}
        </div>
        <button type="button" className={styles.salvar} disabled={salvando} onClick={salvar}>
          {salvando ? 'Salvando…' : 'Salvar configuração'}
        </button>
      </div>
    </main>
  );
}
