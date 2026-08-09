'use client';

import { useEffect, useState } from 'react';
import { ENDERECO_VAZIO, enderecoEstruturadoValido, formatarCep, type EnderecoEstruturado } from '@/lib/delivery/tipos';
import { useBuscaCep } from '@/lib/endereco/useBuscaCep';
import { useBuscaEndereco } from '@/lib/endereco/useBuscaEndereco';
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
} | null;

type EnderecoApi = Omit<EnderecoEstruturado, 'referencia'> & { endereco_formatado: string };

type CidadeApi = { cidade: string; taxa: number };

type Mensagem = { tipo: 'sucesso' | 'erro'; texto: string } | null;

type Cidade = { cidade: string; taxa: string };

export function DeliveryFacilitadoForm({ lojaId }: { lojaId: string }) {
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<Mensagem>(null);

  const [setor, setSetor] = useState<'facilitado' | 'avancado'>('facilitado');
  const [tipoTaxa, setTipoTaxa] = useState<'fixa' | 'por_km'>('fixa');
  const [taxaFixa, setTaxaFixa] = useState('0');
  const [valorPorKm, setValorPorKm] = useState('2');
  const [taxaMaxima, setTaxaMaxima] = useState('40');
  const [distanciaMaximaKm, setDistanciaMaximaKm] = useState('30');
  const [endereco, setEndereco] = useState<EnderecoEstruturado>({ ...ENDERECO_VAZIO });
  const [enderecoFormatado, setEnderecoFormatado] = useState('');
  const [editandoEndereco, setEditandoEndereco] = useState(true);
  const [cidades, setCidades] = useState<Cidade[]>([]);
  const buscaCep = useBuscaCep();
  const buscaEndereco = useBuscaEndereco();
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false);

  function selecionarSugestao(sugestao: {
    logradouro: string; numero: string; bairro: string; cidade: string; uf: string; cep: string;
  }) {
    setEndereco((atual) => ({
      ...atual,
      logradouro: sugestao.logradouro,
      numero: sugestao.numero || atual.numero,
      bairro: sugestao.bairro || atual.bairro,
      cidade: sugestao.cidade || atual.cidade,
      uf: sugestao.uf || atual.uf,
      cep: sugestao.cep ? formatarCep(sugestao.cep) : atual.cep,
    }));
    setSugestoesAbertas(false);
    buscaEndereco.limpar();
  }

  function alterarCep(valor: string) {
    const cep = formatarCep(valor);
    setEndereco((atual) => ({ ...atual, cep }));
    void buscaCep.consultar(cep, (localizado) => {
      setEndereco((atual) => ({
        ...atual,
        cep: formatarCep(localizado.cep),
        logradouro: localizado.logradouro || atual.logradouro,
        bairro: localizado.bairro || atual.bairro,
        cidade: localizado.cidade,
        uf: localizado.uf,
      }));
    });
  }

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const resposta = await fetch(`/api/admin/delivery/configuracao?lojaId=${lojaId}`, {
          cache: 'no-store',
        });
        const corpo = (await resposta.json()) as { config: ConfigApi; cidades: CidadeApi[]; endereco: EnderecoApi | null };
        if (cancelado) return;
        if (corpo.config) {
          const c = corpo.config;
          setSetor(c.setor);
          setTipoTaxa(c.tipo_taxa);
          setTaxaFixa(String(c.taxa_fixa));
          setValorPorKm(String(c.valor_por_km));
          setTaxaMaxima(String(c.taxa_maxima));
          setDistanciaMaximaKm(String(c.distancia_maxima_km));
        }
        if (corpo.endereco) {
          const e = corpo.endereco;
          setEndereco({
            cep: formatarCep(e.cep), logradouro: e.logradouro, numero: e.numero,
            bairro: e.bairro, cidade: e.cidade, uf: e.uf,
            complemento: e.complemento ?? '', referencia: '',
          });
          setEnderecoFormatado(e.endereco_formatado);
          setEditandoEndereco(false);
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
    if (!enderecoEstruturadoValido(endereco)) {
      setMensagem({
        tipo: 'erro',
        texto: 'Confira CEP, logradouro, número, bairro, cidade e UF antes de salvar.',
      });
      return;
    }
    setSalvando(true);
    setMensagem(null);

    const resposta = await fetch('/api/admin/delivery/configuracao', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lojaId,
        setor,
        cidade: endereco.cidade,
        tipoTaxa,
        taxaFixa: Number(taxaFixa),
        valorPorKm: Number(valorPorKm),
        taxaMaxima: Number(taxaMaxima),
        distanciaMaximaKm: Number(distanciaMaximaKm),
        endereco,
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

    const corpoSucesso = (await resposta.json()) as { enderecoFormatado?: string };
    if (corpoSucesso.enderecoFormatado) setEnderecoFormatado(corpoSucesso.enderecoFormatado);
    setEditandoEndereco(false);
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
        <div className={styles.blocoTituloLinha}>
          <div>
            <h3>Endereço do estabelecimento</h3>
            <p className={styles.blocoDesc}>Origem oficial das rotas e endereço exibido para retirada.</p>
          </div>
          {!editandoEndereco && (
            <button type="button" className={styles.adicionar} onClick={() => setEditandoEndereco(true)}>
              Alterar endereço do estabelecimento
            </button>
          )}
        </div>

        {!editandoEndereco && enderecoFormatado ? (
          <div className={styles.enderecoResumo}>
            <strong>{endereco.logradouro}, {endereco.numero}</strong>
            <span>{endereco.bairro} · {endereco.cidade}/{endereco.uf} · CEP {formatarCep(endereco.cep)}</span>
            {endereco.complemento && <span>{endereco.complemento}</span>}
          </div>
        ) : (
          <div className={styles.enderecoGrid}>
            <div className={styles.campo}>
              <label htmlFor="est-cep">CEP</label>
              <input id="est-cep" inputMode="numeric" autoComplete="postal-code" value={endereco.cep}
                onChange={(e) => alterarCep(e.target.value)} placeholder="00000-000" />
              {buscaCep.mensagem && (
                <small className={buscaCep.status === 'erro' ? styles.erro : undefined} aria-live="polite">
                  {buscaCep.mensagem}
                </small>
              )}
            </div>
            <div className={`${styles.campo} ${styles.campoLargo} ${styles.campoComBusca}`}>
              <label htmlFor="est-logradouro">Logradouro</label>
              <input
                id="est-logradouro"
                autoComplete="off"
                maxLength={120}
                value={endereco.logradouro}
                onChange={(e) => {
                  const valor = e.target.value;
                  setEndereco((a) => ({ ...a, logradouro: valor }));
                  setSugestoesAbertas(true);
                  buscaEndereco.buscar(`${valor}, ${endereco.cidade || ''} ${endereco.uf || ''}`.trim());
                }}
                onFocus={() => setSugestoesAbertas(true)}
                onBlur={() => setTimeout(() => setSugestoesAbertas(false), 150)}
                placeholder="Comece a digitar a rua…"
                role="combobox"
                aria-expanded={sugestoesAbertas}
                aria-autocomplete="list"
                aria-controls="est-logradouro-sugestoes"
              />
              <small className={styles.buscaDica}>
                Digite e escolha o endereço na lista — evita erro de &quot;endereço não encontrado&quot; ao salvar.
              </small>
              {sugestoesAbertas && buscaEndereco.estado.status === 'buscando' && (
                <div className={styles.sugestoesLista}><div className={styles.sugestaoVazia}>Buscando…</div></div>
              )}
              {sugestoesAbertas && buscaEndereco.estado.status === 'resultados' && (
                <ul id="est-logradouro-sugestoes" className={styles.sugestoesLista} role="listbox">
                  {buscaEndereco.estado.sugestoes.map((sugestao, indice) => (
                    <li key={indice} role="option" aria-selected={false}>
                      <button type="button" onMouseDown={(e) => { e.preventDefault(); selecionarSugestao(sugestao); }}>
                        {sugestao.formatado}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {sugestoesAbertas && buscaEndereco.estado.status === 'vazio' && (
                <div className={styles.sugestoesLista}>
                  <div className={styles.sugestaoVazia}>Nenhum endereço encontrado — continue digitando ou preencha manualmente.</div>
                </div>
              )}
              {sugestoesAbertas && buscaEndereco.estado.status === 'erro' && (
                <div className={styles.sugestoesLista}>
                  <div className={styles.sugestaoVazia}>{buscaEndereco.estado.mensagem}</div>
                </div>
              )}
            </div>
            <div className={styles.campo}>
              <label htmlFor="est-numero">Número</label>
              <input id="est-numero" maxLength={20} value={endereco.numero}
                onChange={(e) => setEndereco((a) => ({ ...a, numero: e.target.value }))} placeholder="123" />
            </div>
            <div className={styles.campo}>
              <label htmlFor="est-bairro">Bairro</label>
              <input id="est-bairro" maxLength={80} value={endereco.bairro}
                onChange={(e) => setEndereco((a) => ({ ...a, bairro: e.target.value }))} />
            </div>
            <div className={styles.campo}>
              <label htmlFor="est-cidade">Cidade</label>
              <input id="est-cidade" autoComplete="address-level2" maxLength={100} value={endereco.cidade}
                onChange={(e) => setEndereco((a) => ({ ...a, cidade: e.target.value }))} />
            </div>
            <div className={styles.campo}>
              <label htmlFor="est-uf">UF</label>
              <input id="est-uf" autoComplete="address-level1" maxLength={2} value={endereco.uf}
                onChange={(e) => setEndereco((a) => ({ ...a, uf: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') }))} placeholder="SP" />
            </div>
            <div className={`${styles.campo} ${styles.campoLargo}`}>
              <label htmlFor="est-complemento">Complemento (opcional)</label>
              <input id="est-complemento" autoComplete="address-line2" maxLength={100} value={endereco.complemento}
                onChange={(e) => setEndereco((a) => ({ ...a, complemento: e.target.value }))} placeholder="Loja, sala, bloco…" />
            </div>
          </div>
        )}
      </section>

      <section className={styles.bloco}>
        <h3>Regra da cidade principal</h3>

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
        <button type="button" className={styles.salvar} disabled={salvando || buscaCep.status === 'carregando'} onClick={salvar}>
          {salvando ? 'Salvando…' : buscaCep.status === 'carregando' ? 'Buscando CEP…' : 'Salvar configuração'}
        </button>
      </div>
    </main>
  );
}
