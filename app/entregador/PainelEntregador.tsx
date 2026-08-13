'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { criarClientNavegador } from '@/lib/supabase/client';
import { numeroPedido } from '@/lib/pedidos/numero';
import {
  enderecoResumido,
  resumoPagamentoEntrega,
  statusVisualEntregador,
  urlGoogleMaps,
  urlTelefone,
  urlWhatsapp,
  type EntregaDelivery,
  type EntregadorDelivery,
} from '@/lib/delivery/tipos-operacao';

type Acao = 'disponibilidade' | 'iniciar' | 'concluir' | null;

export function PainelEntregador({
  entregador: entregadorInicial,
  entregaInicial,
  indisponivel,
}: {
  entregador: EntregadorDelivery;
  entregaInicial: EntregaDelivery | null;
  indisponivel: boolean;
}) {
  const router = useRouter();
  const [entregador, setEntregador] = useState(entregadorInicial);
  const [entrega, setEntrega] = useState(entregaInicial);
  const [acao, setAcao] = useState<Acao>(null);
  const [erro, setErro] = useState(indisponivel ? 'Não foi possível carregar a entrega atual.' : '');

  const possuiEntrega = !!entrega;
  const statusVisual = statusVisualEntregador(entregador, possuiEntrega);

  async function enviar(url: string, body: Record<string, unknown>, acaoAtual: Exclude<Acao, null>) {
    if (acao) return null;
    setAcao(acaoAtual);
    setErro('');
    try {
      const resposta = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const dados = (await resposta.json().catch(() => null)) as {
        erro?: string;
        status?: EntregaDelivery['status'];
        available?: boolean;
      } | null;
      if (!resposta.ok) {
        setErro(dados?.erro || 'Não foi possível concluir a ação.');
        return null;
      }
      return dados;
    } catch {
      setErro('Sem conexão. Tente novamente.');
      return null;
    } finally {
      setAcao(null);
    }
  }

  async function alternarDisponibilidade() {
    const novoValor = !entregador.available;
    const dados = await enviar('/api/entregador/disponibilidade', { available: novoValor }, 'disponibilidade');
    if (dados) setEntregador((atual) => ({ ...atual, available: dados.available ?? novoValor }));
  }

  async function iniciar() {
    if (!entrega) return;
    const dados = await enviar(`/api/entregador/entregas/${entrega.id}/iniciar`, {}, 'iniciar');
    if (dados?.status) setEntrega((atual) => atual ? { ...atual, status: dados.status! } : atual);
  }

  async function concluir() {
    if (!entrega) return;
    const dados = await enviar(`/api/entregador/entregas/${entrega.id}/concluir`, {}, 'concluir');
    if (dados?.status === 'DELIVERED') setEntrega(null);
  }

  async function sair() {
    await criarClientNavegador().auth.signOut();
    router.replace('/entregador/login');
    router.refresh();
  }

  return (
    <main className="driverApp">
      <header className="driverTopo">
        <div>
          <span>Olá,</span>
          <h1>{entregador.name}</h1>
        </div>
        <button type="button" className="driverSair" onClick={sair}>Sair</button>
      </header>

      <section className="driverStatus" aria-label="Disponibilidade">
        <div>
          <small>Status</small>
          <strong data-status={statusVisual}>{statusVisual === 'EM_ROTA' ? 'EM ROTA' : statusVisual === 'DISPONIVEL' ? 'DISPONÍVEL' : 'INDISPONÍVEL'}</strong>
        </div>
        <button
          type="button"
          role="switch"
          aria-label="Disponível para receber entregas"
          aria-checked={entregador.available}
          className={entregador.available ? 'driverSwitch ativo' : 'driverSwitch'}
          disabled={!!acao || possuiEntrega}
          onClick={alternarDisponibilidade}
        >
          <span />
        </button>
      </section>

      {erro && <div className="driverErro" role="alert">{erro}</div>}

      {entrega ? (
        <CartaoEntrega entrega={entrega} acao={acao} iniciar={iniciar} concluir={concluir} />
      ) : (
        <section className="driverVazio">
          <div className="driverPulso" aria-hidden="true" />
          <h2>{entregador.available ? 'Você está disponível.' : 'Você está indisponível.'}</h2>
          <p>{entregador.available ? 'Aguardando uma nova entrega…' : 'Ative seu status quando puder receber entregas.'}</p>
          <button type="button" className="driverAtualizar" onClick={() => router.refresh()}>
            Atualizar
          </button>
        </section>
      )}
    </main>
  );
}

function CartaoEntrega({
  entrega,
  acao,
  iniciar,
  concluir,
}: {
  entrega: EntregaDelivery;
  acao: Acao;
  iniciar: () => void;
  concluir: () => void;
}) {
  const { pedido } = entrega;
  const endereco = enderecoResumido(pedido);
  const maps = urlGoogleMaps(pedido.delivery_latitude, pedido.delivery_longitude);
  const telefone = urlTelefone(pedido.cliente_telefone);
  const whatsapp = urlWhatsapp(pedido.cliente_telefone);
  const pagamento = resumoPagamentoEntrega(pedido);

  return (
    <article className="driverEntrega" aria-labelledby="entrega-atual">
      <div className="driverEntregaCabecalho">
        <span>{entrega.status === 'OUT_FOR_DELIVERY' ? 'EM ROTA' : 'NOVA ENTREGA'}</span>
        <h2 id="entrega-atual">ENTREGA {numeroPedido(pedido.numero)}</h2>
      </div>

      <section className="driverDestino">
        <h3>{pedido.cliente_nome}</h3>
        <p>{endereco.linha1}</p>
        <p>{endereco.linha2}</p>
        {pedido.delivery_complement && (
          <small><b>Complemento:</b> {pedido.delivery_complement}</small>
        )}
      </section>

      <div className={`driverPagamento ${pagamento.tipo}`}>
        {pagamento.texto}
      </div>

      <div className="driverAcoesContato">
        {maps ? <a href={maps} target="_blank" rel="noreferrer">🗺 Abrir rota</a> : <span>Rota indisponível</span>}
        {telefone ? <a href={telefone}>☎ Ligar</a> : <span>Telefone indisponível</span>}
        {whatsapp ? <a href={whatsapp} target="_blank" rel="noreferrer">WhatsApp</a> : null}
      </div>

      {entrega.status === 'ASSIGNED' && (
        <button type="button" className="driverBotaoPrincipal" disabled={!!acao} onClick={iniciar}>
          {acao === 'iniciar' ? 'Iniciando…' : 'Iniciar entrega'}
        </button>
      )}
      {entrega.status === 'OUT_FOR_DELIVERY' && (
        <button type="button" className="driverBotaoConcluir" disabled={!!acao} onClick={concluir}>
          {acao === 'concluir' ? 'Finalizando…' : 'Marcar como entregue'}
        </button>
      )}
    </article>
  );
}
