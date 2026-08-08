'use client';

import {
  extraDaLinha,
  formatBRL,
  subtotalLinha,
  type LinhaCarrinho,
  type LojaPublica,
} from '@/lib/cardapio/tipos';
import type { ConfigDeliveryPublica } from '@/lib/delivery/tipos';

export type ModoEntrega = 'retirada' | 'entrega';

export type CotacaoEstado =
  | { status: 'idle' }
  | { status: 'calculando' }
  | { status: 'erro'; erro: string }
  | { status: 'ok'; taxa: number; distanciaKm: number | null; enderecoFormatado: string };

/**
 * Estrutura e nomes de classe iguais aos do cardapio.html original — o CSS
 * veio de lá sem alteração, então divergir aqui quebra o layout.
 */
export function Carrinho({
  loja,
  linhas,
  aberto,
  nome,
  endereco,
  modo,
  erro,
  deliveryConfig,
  cidadeEscolhida,
  cotacao,
  onFechar,
  onMudarQtd,
  onRemover,
  onNome,
  onEndereco,
  onCidade,
  onCalcularFrete,
  onModo,
  onFinalizar,
}: {
  loja: LojaPublica;
  linhas: LinhaCarrinho[];
  aberto: boolean;
  nome: string;
  endereco: string;
  modo: ModoEntrega;
  erro: string | null;
  deliveryConfig: ConfigDeliveryPublica | null;
  cidadeEscolhida: string;
  cotacao: CotacaoEstado;
  onFechar: () => void;
  onMudarQtd: (lineId: string, delta: number) => void;
  onRemover: (lineId: string) => void;
  onNome: (v: string) => void;
  onEndereco: (v: string) => void;
  onCidade: (v: string) => void;
  onCalcularFrete: () => void;
  onModo: (m: ModoEntrega) => void;
  onFinalizar: () => void;
}) {
  const usaCotacaoDinamica = !!deliveryConfig?.configurada;
  const subtotal = linhas.reduce((s, l) => s + subtotalLinha(l), 0);
  const taxa = usaCotacaoDinamica ? (cotacao.status === 'ok' ? cotacao.taxa : 0) : Number(loja.taxa_entrega) || 0;
  const total = subtotal + (modo === 'entrega' && linhas.length > 0 ? taxa : 0);
  const minimo = Number(loja.pedido_minimo) || 0;
  const abaixoDoMinimo = modo === 'entrega' && minimo > 0 && subtotal > 0 && subtotal < minimo;

  return (
    <section id="carrinho" className={'cart-section' + (aberto ? ' open' : '')}>
      <div className="cart-section-header">
        <h2>Seu carrinho</h2>
        <button type="button" className="cart-close" aria-label="Fechar carrinho" onClick={onFechar}>
          ✕
        </button>
      </div>

      <div className="cart-items">
        {linhas.length === 0 ? (
          <>
            <p className="cart-empty">Seu carrinho está vazio.</p>
            <button type="button" className="btn-primary cart-empty-cta" onClick={onFechar}>
              Ver cardápio
            </button>
          </>
        ) : (
          linhas.map((linha) => {
            // Mesma função do modal e do WhatsApp. Somar os complementos
            // aqui na mão ignorava o modo de preço da lista.
            const precoUnit = linha.precoUnit + extraDaLinha(linha);
            return (
              <div key={linha.lineId} className="cart-item">
                <div className="cart-item-info">
                  <span className="cart-item-name">{linha.nome}</span>
                  {linha.complementos.length > 0 && (
                    <span className="cart-item-custom">
                      {linha.complementos
                        .map((c) => (c.quantidade > 1 ? `${c.quantidade}x ${c.nome}` : c.nome))
                        .join(', ')}
                    </span>
                  )}
                  {linha.observacao && <span className="cart-item-obs">Obs: {linha.observacao}</span>}
                  <span className="cart-item-price">{formatBRL(precoUnit)} un.</span>
                </div>
                <div className="cart-item-qty">
                  <button
                    type="button"
                    className="qty-btn"
                    aria-label="Diminuir quantidade"
                    onClick={() => onMudarQtd(linha.lineId, -1)}
                  >
                    −
                  </button>
                  <span>{linha.qty}</span>
                  <button
                    type="button"
                    className="qty-btn"
                    aria-label="Aumentar quantidade"
                    onClick={() => onMudarQtd(linha.lineId, 1)}
                  >
                    +
                  </button>
                </div>
                <span className="cart-item-subtotal">{formatBRL(subtotalLinha(linha))}</span>
                <button type="button" className="cart-item-remove" onClick={() => onRemover(linha.lineId)}>
                  Remover
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="cart-footer">
        <div className="delivery-address">
          <label htmlFor="nomeClienteInput">Seu nome</label>
          <input
            type="text"
            id="nomeClienteInput"
            placeholder="Como podemos te chamar?"
            value={nome}
            onChange={(e) => onNome(e.target.value)}
          />
        </div>

        <div className="delivery-toggle">
          <button
            type="button"
            className={'delivery-btn' + (modo === 'retirada' ? ' active' : '')}
            onClick={() => onModo('retirada')}
          >
            Retirar no local
          </button>
          <button
            type="button"
            className={'delivery-btn' + (modo === 'entrega' ? ' active' : '')}
            onClick={() => onModo('entrega')}
          >
            {!usaCotacaoDinamica && taxa > 0
              ? `Entrega (+ ${formatBRL(taxa)})`
              : usaCotacaoDinamica && cotacao.status === 'ok'
                ? `Entrega (+ ${formatBRL(cotacao.taxa)})`
                : 'Entrega'}
          </button>
        </div>

        {modo === 'entrega' && usaCotacaoDinamica && deliveryConfig?.setor === 'avancado' && (
          <div className="delivery-address">
            <label htmlFor="cidadeInput">Cidade da entrega</label>
            <select id="cidadeInput" value={cidadeEscolhida} onChange={(e) => onCidade(e.target.value)}>
              <option value="" disabled>
                Selecione a cidade
              </option>
              {deliveryConfig.cidade && <option value={deliveryConfig.cidade}>{deliveryConfig.cidade}</option>}
              {deliveryConfig.cidades.map((c) => (
                <option key={c.cidade} value={c.cidade}>
                  {c.cidade}
                </option>
              ))}
            </select>
          </div>
        )}

        {modo === 'entrega' && (
          <div className="delivery-address">
            <label htmlFor="enderecoInput">Endereço (rua, bairro e número)</label>
            <input
              type="text"
              id="enderecoInput"
              placeholder="Ex: Rua das Flores, Centro, 123"
              value={endereco}
              onChange={(e) => onEndereco(e.target.value)}
            />
          </div>
        )}

        {modo === 'entrega' && usaCotacaoDinamica && (
          <div className="delivery-address">
            <button type="button" className="btn-continue" onClick={onCalcularFrete} disabled={cotacao.status === 'calculando'}>
              {cotacao.status === 'calculando' ? 'Calculando frete…' : 'Calcular frete'}
            </button>
            {cotacao.status === 'ok' && (
              <p className="cart-item-price">
                Frete: {formatBRL(cotacao.taxa)}
                {cotacao.distanciaKm != null ? ` · ${cotacao.distanciaKm} km` : ''}
              </p>
            )}
            {cotacao.status === 'erro' && <p className="delivery-erro">{cotacao.erro}</p>}
          </div>
        )}

        {abaixoDoMinimo && (
          <p className="delivery-erro">Pedido mínimo pra entrega é {formatBRL(minimo)}.</p>
        )}
        {erro && <p className="delivery-erro">{erro}</p>}

        <div className="cart-total-row">
          <span>Total</span>
          <span>{formatBRL(total)}</span>
        </div>

        <button
          type="button"
          className="btn-primary btn-checkout"
          disabled={linhas.length === 0}
          onClick={onFinalizar}
        >
          Finalizar pedido no WhatsApp
        </button>
        <button type="button" className="btn-continue" onClick={onFechar}>
          Continuar comprando
        </button>
      </div>
    </section>
  );
}
