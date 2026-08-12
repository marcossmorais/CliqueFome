'use client';

import { useMemo, useState } from 'react';
import {
  enderecoResumido,
  formatarTotalPedido,
  resumoPagamentoEntrega,
  statusVisualEntregador,
  type ConfiguracaoDelivery,
  type EntregaDeliveryAdmin,
  type EntregadorDelivery,
  type ModoTaxaDelivery,
} from '@/lib/delivery/tipos-operacao';
import styles from './delivery.module.css';

type Secao = 'entregas' | 'entregadores' | 'configuracoes';
type Mensagem = { tipo: 'erro' | 'sucesso'; texto: string } | null;

function hojeEmSaoPaulo(data: string | null, dataHoje: string) {
  if (!data) return false;
  const formatador = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatador.format(new Date(data)) === dataHoje;
}

async function requisicaoJson<T>(url: string, init: RequestInit): Promise<T> {
  const resposta = await fetch(url, init);
  const dados = (await resposta.json().catch(() => null)) as (T & { erro?: string }) | null;
  if (!resposta.ok) throw new Error(dados?.erro || 'Não foi possível concluir a ação.');
  if (!dados) throw new Error('Resposta inválida do servidor.');
  return dados;
}

export function DeliveryClient({
  lojaSlug,
  dataHoje,
  configuracaoInicial,
  entregadoresIniciais,
  entregasIniciais,
  indisponivel,
}: {
  lojaSlug: string;
  dataHoje: string;
  configuracaoInicial: ConfiguracaoDelivery | null;
  entregadoresIniciais: EntregadorDelivery[];
  entregasIniciais: EntregaDeliveryAdmin[];
  indisponivel: boolean;
}) {
  const [secao, setSecao] = useState<Secao>('entregas');
  const [entregadores, setEntregadores] = useState(entregadoresIniciais);
  const [entregas, setEntregas] = useState(entregasIniciais);
  const [configuracao, setConfiguracao] = useState(configuracaoInicial);
  const [mensagem, setMensagem] = useState<Mensagem>(
    indisponivel ? { tipo: 'erro', texto: 'Parte dos dados de Delivery não pôde ser carregada.' } : null
  );

  return (
    <div className="area ativo">
      <main className={styles.pagina}>
        <nav className={styles.abas} aria-label="Seções de Delivery">
          {([
            ['entregas', 'Entregas'],
            ['entregadores', 'Entregadores'],
            ['configuracoes', 'Configurações'],
          ] as const).map(([id, nome]) => (
            <button
              key={id}
              type="button"
              className={secao === id ? styles.abaAtiva : ''}
              aria-current={secao === id ? 'page' : undefined}
              onClick={() => { setSecao(id); setMensagem(null); }}
            >
              {nome}
            </button>
          ))}
        </nav>

        {mensagem && (
          <div className={mensagem.tipo === 'erro' ? styles.erro : styles.sucesso} role="status">
            {mensagem.texto}
          </div>
        )}

        {secao === 'entregas' && (
          <SecaoEntregas
            lojaSlug={lojaSlug}
            dataHoje={dataHoje}
            entregas={entregas}
            setEntregas={setEntregas}
            entregadores={entregadores}
            setMensagem={setMensagem}
          />
        )}
        {secao === 'entregadores' && (
          <SecaoEntregadores
            lojaSlug={lojaSlug}
            entregadores={entregadores}
            setEntregadores={setEntregadores}
            entregas={entregas}
            setMensagem={setMensagem}
          />
        )}
        {secao === 'configuracoes' && (
          <SecaoConfiguracoes
            lojaSlug={lojaSlug}
            configuracao={configuracao}
            setConfiguracao={setConfiguracao}
            setMensagem={setMensagem}
          />
        )}
      </main>
    </div>
  );
}

function SecaoEntregas({
  lojaSlug,
  dataHoje,
  entregas,
  setEntregas,
  entregadores,
  setMensagem,
}: {
  lojaSlug: string;
  dataHoje: string;
  entregas: EntregaDeliveryAdmin[];
  setEntregas: React.Dispatch<React.SetStateAction<EntregaDeliveryAdmin[]>>;
  entregadores: EntregadorDelivery[];
  setMensagem: (mensagem: Mensagem) => void;
}) {
  const aguardando = entregas.filter((entrega) => entrega.status === 'WAITING_DRIVER');
  const emRota = entregas.filter((entrega) =>
    entrega.status === 'ASSIGNED' || entrega.status === 'OUT_FOR_DELIVERY'
  );
  const entregues = entregas.filter((entrega) =>
    entrega.status === 'DELIVERED' && hojeEmSaoPaulo(entrega.delivered_at, dataHoje)
  );
  const ocupados = new Set(
    emRota.map((entrega) => entrega.driver_id).filter((id): id is string => !!id)
  );
  const disponiveis = entregadores.filter(
    (entregador) => entregador.active && entregador.available && !ocupados.has(entregador.id)
  );

  return (
    <div className={styles.colunasEntrega}>
      <GrupoEntregas titulo="Aguardando entregador" quantidade={aguardando.length}>
        {aguardando.length === 0 ? <EstadoVazio texto="Nenhum pedido aguardando." /> : aguardando.map((entrega) => (
          <CartaoEntrega
            key={entrega.id}
            entrega={entrega}
            lojaSlug={lojaSlug}
            entregadores={disponiveis}
            aoAtribuir={(driverId) => {
              const driver = entregadores.find((item) => item.id === driverId) || null;
              setEntregas((atuais) => atuais.map((item) => item.id === entrega.id
                ? { ...item, status: 'ASSIGNED', driver_id: driverId, entregador: driver ? { id: driver.id, name: driver.name } : null }
                : item));
            }}
            setMensagem={setMensagem}
          />
        ))}
      </GrupoEntregas>

      <GrupoEntregas titulo="Em rota" quantidade={emRota.length}>
        {emRota.length === 0 ? <EstadoVazio texto="Nenhuma entrega em rota." /> : emRota.map((entrega) => (
          <CartaoEntrega key={entrega.id} entrega={entrega} setMensagem={setMensagem} />
        ))}
      </GrupoEntregas>

      <GrupoEntregas titulo="Entregues hoje" quantidade={entregues.length}>
        {entregues.length === 0 ? <EstadoVazio texto="Nenhuma entrega concluída hoje." /> : entregues.map((entrega) => (
          <CartaoEntrega key={entrega.id} entrega={entrega} setMensagem={setMensagem} />
        ))}
      </GrupoEntregas>
    </div>
  );
}

function GrupoEntregas({ titulo, quantidade, children }: { titulo: string; quantidade: number; children: React.ReactNode }) {
  return (
    <section className={styles.grupo}>
      <header><h2>{titulo}</h2><span>{quantidade}</span></header>
      <div className={styles.lista}>{children}</div>
    </section>
  );
}

function EstadoVazio({ texto }: { texto: string }) {
  return <p className={styles.vazio}>{texto}</p>;
}

function CartaoEntrega({
  entrega,
  lojaSlug,
  entregadores = [],
  aoAtribuir,
  setMensagem,
}: {
  entrega: EntregaDeliveryAdmin;
  lojaSlug?: string;
  entregadores?: EntregadorDelivery[];
  aoAtribuir?: (driverId: string) => void;
  setMensagem: (mensagem: Mensagem) => void;
}) {
  const [driverId, setDriverId] = useState('');
  const [salvando, setSalvando] = useState(false);
  const endereco = enderecoResumido(entrega.pedido);
  const pagamento = resumoPagamentoEntrega(entrega.pedido);

  async function atribuir() {
    if (!lojaSlug || !driverId || !aoAtribuir) return;
    setSalvando(true);
    setMensagem(null);
    try {
      await requisicaoJson(`/api/admin/delivery/${lojaSlug}/entregas/${entrega.id}/atribuir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId }),
      });
      aoAtribuir(driverId);
      setMensagem({ tipo: 'sucesso', texto: 'Entregador atribuído.' });
    } catch (erro) {
      setMensagem({ tipo: 'erro', texto: erro instanceof Error ? erro.message : 'Não foi possível atribuir.' });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <article className={styles.entregaCard}>
      <div className={styles.entregaTopo}>
        <strong>Pedido #{entrega.pedido.numero}</strong>
        <span data-status={entrega.status}>
          {entrega.status === 'ASSIGNED' ? 'Atribuída' : entrega.status === 'OUT_FOR_DELIVERY' ? 'Em rota' : entrega.status === 'DELIVERED' ? 'Entregue' : 'Aguardando'}
        </span>
      </div>
      <h3>{entrega.pedido.cliente_nome}</h3>
      <p>{endereco.linha1}</p>
      <small>{endereco.linha2}</small>
      <div className={styles.entregaResumo}>
        <b>{formatarTotalPedido(entrega.pedido.total)}</b>
        <span>{pagamento.texto}</span>
      </div>
      {entrega.entregador && <p className={styles.driverAtribuido}>Entregador: <b>{entrega.entregador.name}</b></p>}
      {entrega.status === 'WAITING_DRIVER' && (
        <div className={styles.atribuir}>
          <select aria-label={`Entregador do pedido ${entrega.pedido.numero}`} value={driverId} onChange={(e) => setDriverId(e.target.value)}>
            <option value="">Selecione o entregador</option>
            {entregadores.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
          </select>
          <button type="button" disabled={!driverId || salvando} onClick={atribuir}>
            {salvando ? 'Atribuindo…' : 'Atribuir entregador'}
          </button>
          {entregadores.length === 0 && <small>Nenhum entregador disponível.</small>}
        </div>
      )}
    </article>
  );
}

function SecaoEntregadores({
  lojaSlug,
  entregadores,
  setEntregadores,
  entregas,
  setMensagem,
}: {
  lojaSlug: string;
  entregadores: EntregadorDelivery[];
  setEntregadores: React.Dispatch<React.SetStateAction<EntregadorDelivery[]>>;
  entregas: EntregaDeliveryAdmin[];
  setMensagem: (mensagem: Mensagem) => void;
}) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resetando, setResetando] = useState<string | null>(null);
  const [senhaReset, setSenhaReset] = useState('');
  const ativos = new Set(entregas.filter((e) => e.status === 'ASSIGNED' || e.status === 'OUT_FOR_DELIVERY').map((e) => e.driver_id));

  async function adicionar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = new FormData(evento.currentTarget);
    setEnviando(true);
    setMensagem(null);
    try {
      const dados = await requisicaoJson<{ entregador: EntregadorDelivery }>(`/api/admin/delivery/${lojaSlug}/entregadores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'), phone: form.get('phone'), email: form.get('email'), password: form.get('password'),
        }),
      });
      setEntregadores((atuais) => [...atuais, dados.entregador].sort((a, b) => a.name.localeCompare(b.name)));
      setMostrarForm(false);
      setMensagem({ tipo: 'sucesso', texto: 'Entregador cadastrado. A senha não foi armazenada.' });
    } catch (erro) {
      setMensagem({ tipo: 'erro', texto: erro instanceof Error ? erro.message : 'Não foi possível cadastrar.' });
    } finally { setEnviando(false); }
  }

  async function alterarAtivo(driver: EntregadorDelivery) {
    setMensagem(null);
    try {
      const dados = await requisicaoJson<{ entregador: EntregadorDelivery }>(`/api/admin/delivery/${lojaSlug}/entregadores/${driver.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !driver.active }),
      });
      setEntregadores((atuais) => atuais.map((item) => item.id === driver.id ? dados.entregador : item));
      setMensagem({ tipo: 'sucesso', texto: driver.active ? 'Entregador desativado.' : 'Entregador reativado.' });
    } catch (erro) {
      setMensagem({ tipo: 'erro', texto: erro instanceof Error ? erro.message : 'Não foi possível alterar.' });
    }
  }

  async function resetar(driver: EntregadorDelivery) {
    setMensagem(null);
    try {
      await requisicaoJson(`/api/admin/delivery/${lojaSlug}/entregadores/${driver.id}/resetar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: senhaReset }),
      });
      setResetando(null); setSenhaReset('');
      setMensagem({ tipo: 'sucesso', texto: 'Nova senha definida no Supabase Auth.' });
    } catch (erro) {
      setMensagem({ tipo: 'erro', texto: erro instanceof Error ? erro.message : 'Não foi possível resetar.' });
    }
  }

  return (
    <section className={styles.secaoSimples}>
      <div className={styles.secaoCabecalho}><div><h2>Entregadores</h2><p>Acesso individual pela área mobile.</p></div><button type="button" onClick={() => setMostrarForm((v) => !v)}>Adicionar entregador</button></div>
      {mostrarForm && (
        <form className={styles.formCard} onSubmit={adicionar}>
          <div className={styles.grade2}><Campo name="name" label="Nome" minLength={2} maxLength={100} /><Campo name="phone" label="Telefone" type="tel" minLength={10} maxLength={25} /></div>
          <Campo name="email" label="E-mail" type="email" maxLength={254} />
          <Campo name="password" label="Senha inicial" type="password" minLength={8} maxLength={72} autoComplete="new-password" />
          <small>A senha vai somente para o Supabase Auth e não será salva na aplicação.</small>
          <button type="submit" disabled={enviando}>{enviando ? 'Cadastrando…' : 'Criar acesso'}</button>
        </form>
      )}
      <div className={styles.listaDrivers}>
        {entregadores.length === 0 ? <EstadoVazio texto="Nenhum entregador cadastrado." /> : entregadores.map((driver) => {
          const status = statusVisualEntregador(driver, ativos.has(driver.id));
          return <article key={driver.id} className={styles.driverCard}>
            <div><h3>{driver.name}</h3><p>{driver.phone}</p><span data-status={status}>{status === 'EM_ROTA' ? '● Em rota' : status === 'DISPONIVEL' ? '● Disponível' : '○ Indisponível'}</span></div>
            <div className={styles.driverBotoes}><button type="button" disabled={status === 'EM_ROTA'} onClick={() => alterarAtivo(driver)}>{driver.active ? 'Desativar' : 'Reativar'}</button><button type="button" onClick={() => { setResetando(driver.id); setSenhaReset(''); }}>Resetar acesso</button></div>
            {resetando === driver.id && <div className={styles.resetSenha}><label>Nova senha<input type="password" minLength={8} maxLength={72} autoComplete="new-password" value={senhaReset} onChange={(e) => setSenhaReset(e.target.value)} /></label><button type="button" disabled={senhaReset.length < 8} onClick={() => resetar(driver)}>Salvar nova senha</button><button type="button" onClick={() => setResetando(null)}>Cancelar</button></div>}
          </article>;
        })}
      </div>
    </section>
  );
}

function Campo({ label, name, type = 'text', ...props }: { label: string; name: string; type?: React.HTMLInputTypeAttribute } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <label>{label}<input name={name} type={type} required {...props} /></label>;
}

function SecaoConfiguracoes({
  lojaSlug,
  configuracao,
  setConfiguracao,
  setMensagem,
}: {
  lojaSlug: string;
  configuracao: ConfiguracaoDelivery | null;
  setConfiguracao: (configuracao: ConfiguracaoDelivery) => void;
  setMensagem: (mensagem: Mensagem) => void;
}) {
  const [enabled, setEnabled] = useState(configuracao?.enabled ?? false);
  const [feeMode, setFeeMode] = useState<ModoTaxaDelivery>(configuracao?.fee_mode ?? 'FIXED');
  const [fixed, setFixed] = useState(configuracao?.fixed_fee_cents == null ? '' : String(configuracao.fixed_fee_cents / 100));
  const [perKm, setPerKm] = useState(configuracao?.price_per_km_cents == null ? '' : String(configuracao.price_per_km_cents / 100));
  const [gratisAtiva, setGratisAtiva] = useState(configuracao?.free_delivery_threshold_cents != null);
  const [gratis, setGratis] = useState(configuracao?.free_delivery_threshold_cents == null ? '' : String(configuracao.free_delivery_threshold_cents / 100));
  const [salvando, setSalvando] = useState(false);
  const origemInicial = useMemo(() => ({
    cep: configuracao?.origin_postal_code ?? '', rua: configuracao?.origin_street ?? '', numero: configuracao?.origin_number ?? '',
    bairro: configuracao?.origin_neighborhood ?? '', cidade: configuracao?.origin_city ?? '', uf: configuracao?.origin_state ?? '',
  }), [configuracao]);

  function centavos(valor: string) {
    const numero = Number(valor.replace(',', '.'));
    return Number.isFinite(numero) && numero >= 0 ? Math.round(numero * 100) : null;
  }

  async function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = new FormData(evento.currentTarget);
    const valorTaxa = centavos(feeMode === 'FIXED' ? fixed : perKm);
    const valorGratis = gratisAtiva ? centavos(gratis) : null;
    if (valorTaxa === null || (gratisAtiva && valorGratis === null)) { setMensagem({ tipo: 'erro', texto: 'Confira os valores informados.' }); return; }
    setSalvando(true); setMensagem(null);
    try {
      const dados = await requisicaoJson<{ configuracao: ConfiguracaoDelivery }>(`/api/admin/delivery/${lojaSlug}/configuracao`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, feeMode, fixedFeeCents: feeMode === 'FIXED' ? valorTaxa : null, pricePerKmCents: feeMode === 'PER_KM' ? valorTaxa : null, freeDeliveryThresholdCents: valorGratis,
          origem: { cep: form.get('cep'), rua: form.get('rua'), numero: form.get('numero'), bairro: form.get('bairro'), cidade: form.get('cidade'), uf: form.get('uf'), complemento: null },
        }),
      });
      setConfiguracao(dados.configuracao); setMensagem({ tipo: 'sucesso', texto: 'Origem localizada e configurações salvas.' });
    } catch (erro) { setMensagem({ tipo: 'erro', texto: erro instanceof Error ? erro.message : 'Não foi possível salvar.' }); }
    finally { setSalvando(false); }
  }

  return (
    <form className={styles.configForm} onSubmit={salvar}>
      <section className={styles.formCard}><div className={styles.linhaToggle}><div><h2>Entregas</h2><p>Disponibilizar Delivery no cardápio.</p></div><label className={styles.toggle}><input type="checkbox" aria-label="Ativar entregas" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /><span /></label></div></section>
      <section className={styles.formCard}><h2>Endereço de origem</h2><p>Este é o ponto de saída do entregador.</p><div className={styles.grade2}><Campo name="cep" label="CEP" defaultValue={origemInicial.cep} minLength={8} maxLength={9} /><Campo name="rua" label="Rua" defaultValue={origemInicial.rua} maxLength={120} /><Campo name="numero" label="Número" defaultValue={origemInicial.numero} maxLength={20} /><Campo name="bairro" label="Bairro" defaultValue={origemInicial.bairro} maxLength={80} /><Campo name="cidade" label="Cidade" defaultValue={origemInicial.cidade} maxLength={80} /><Campo name="uf" label="UF" defaultValue={origemInicial.uf} minLength={2} maxLength={2} /></div></section>
      <section className={styles.formCard}><h2>Tipo de taxa</h2><div className={styles.radios}><label><input type="radio" checked={feeMode === 'FIXED'} onChange={() => setFeeMode('FIXED')} /> Taxa fixa</label><label><input type="radio" checked={feeMode === 'PER_KM'} onChange={() => setFeeMode('PER_KM')} /> Taxa por KM</label></div>{feeMode === 'FIXED' ? <label>Taxa fixa (R$)<input type="number" min="0" step="0.01" required value={fixed} onChange={(e) => setFixed(e.target.value)} /></label> : <label>Valor por KM (R$)<input type="number" min="0" step="0.01" required value={perKm} onChange={(e) => setPerKm(e.target.value)} /></label>}<label className={styles.check}><input type="checkbox" checked={gratisAtiva} onChange={(e) => setGratisAtiva(e.target.checked)} /> Entrega grátis a partir de</label>{gratisAtiva && <label>Subtotal mínimo (R$)<input type="number" min="0" step="0.01" required value={gratis} onChange={(e) => setGratis(e.target.value)} /></label>}</section>
      <button type="submit" className={styles.salvarConfig} disabled={salvando}>{salvando ? 'Localizando…' : 'Localizar e salvar'}</button>
    </form>
  );
}
