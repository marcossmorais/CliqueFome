'use client';

import { useEffect, useRef } from 'react';
import { formatBRL, subtotalLinha, type LinhaCarrinho } from '@/lib/cardapio/tipos';
import { formatarCep, type ConfigDeliveryPublica, type EnderecoEstruturado } from '@/lib/delivery/tipos';
import { formatarTelefone, type CotacaoEstado, type ModoEntrega, type PedidoRegistrado } from './Carrinho';

export function CheckoutModal({
  aberto, linhas, nome, telefone, endereco, modo, erro, enviando, pedidoRegistrado,
  deliveryConfig, taxaEstatica, cidadeEscolhida, cotacao, onFechar, onNome, onTelefone, onEndereco,
  onCidade, onCalcularFrete, onModo, onFinalizar, onNovoPedido,
}: {
  aberto: boolean; linhas: LinhaCarrinho[]; nome: string; telefone: string;
  endereco: EnderecoEstruturado; modo: ModoEntrega; erro: string | null; enviando: boolean;
  pedidoRegistrado: PedidoRegistrado | null; deliveryConfig: ConfigDeliveryPublica | null;
  taxaEstatica: number;
  cidadeEscolhida: string; cotacao: CotacaoEstado; onFechar: () => void;
  onNome: (v: string) => void; onTelefone: (v: string) => void;
  onEndereco: (v: EnderecoEstruturado) => void; onCidade: (v: string) => void;
  onCalcularFrete: () => void; onModo: (m: ModoEntrega) => void;
  onFinalizar: () => void; onNovoPedido: () => void;
}) {
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const subtotal = linhas.reduce((s, linha) => s + subtotalLinha(linha), 0);
  const usaCotacaoDinamica = !!deliveryConfig?.configurada;
  const taxa = modo === 'entrega'
    ? usaCotacaoDinamica
      ? cotacao.status === 'ok' ? cotacao.taxa : 0
      : taxaEstatica
    : 0;
  const total = subtotal + taxa;

  useEffect(() => {
    if (!aberto) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    tituloRef.current?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !enviando) onFechar();
      if (e.key !== 'Tab') return;
      const focaveis = sheetRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled)');
      if (!focaveis?.length) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    };
    document.addEventListener('keydown', tecla);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', tecla); };
  }, [aberto, enviando, onFechar]);

  if (!aberto) return null;
  const atualizar = (campo: keyof EnderecoEstruturado, valor: string) => onEndereco({ ...endereco, [campo]: valor });

  return (
    <div className="checkout-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-titulo">
      <button type="button" className="checkout-backdrop" aria-label="Fechar checkout" onClick={enviando ? undefined : onFechar} />
      <section className="checkout-sheet" ref={sheetRef}>
        <header className="checkout-header">
          <div>
            <span className="checkout-marca">CliqueFome</span>
            <h2 id="checkout-titulo" ref={tituloRef} tabIndex={-1}>{pedidoRegistrado ? 'Pedido recebido' : 'Finalizar pedido'}</h2>
          </div>
          <button type="button" className="checkout-fechar" aria-label="Fechar checkout" disabled={enviando} onClick={onFechar}>×</button>
        </header>

        {!pedidoRegistrado && (
          <div className="checkout-etapas" aria-label="Etapas do checkout">
            <span className="ativa"><b>1</b> Entrega</span><i /><span><b>2</b> Confirmação</span>
          </div>
        )}

        {pedidoRegistrado ? (
          <div className="checkout-sucesso">
            <div className="checkout-sucesso-icone">✓</div>
            <h3>Pedido #{pedidoRegistrado.pedido.numero} registrado</h3>
            <p>Ele já entrou como pendente na gestão da loja.</p>
            <div className="checkout-pendente"><strong>Pagamento pendente</strong><span>Continue no WhatsApp para combinar o pagamento e confirmar o atendimento.</span></div>
            <div className="checkout-total"><span>Total</span><strong>{formatBRL(pedidoRegistrado.pedido.total)}</strong></div>
            <a className="btn-primary checkout-acao" href={pedidoRegistrado.proximaAcao.url} target="_blank" rel="noopener noreferrer">Continuar no WhatsApp</a>
            <a className="btn-continue" href={pedidoRegistrado.pedido.tracking_url}>Acompanhar meu pedido</a>
            <button type="button" className="btn-continue" onClick={onNovoPedido}>Fechar e fazer novo pedido</button>
          </div>
        ) : (
          <div className="checkout-conteudo">
            <section className="checkout-bloco">
              <h3>Como você quer receber?</h3>
              <div className="checkout-opcoes">
                <button type="button" className={modo === 'entrega' ? 'selecionada' : ''} onClick={() => onModo('entrega')}>
                  <span>🛵</span><div><strong>Receber no meu endereço</strong><small>Calculamos a taxa antes de confirmar</small></div><b aria-hidden="true" />
                </button>
                <button type="button" className={modo === 'retirada' ? 'selecionada' : ''} onClick={() => onModo('retirada')}>
                  <span>🚶</span><div><strong>Retirar no estabelecimento</strong><small>{deliveryConfig?.enderecoRetirada || 'Confirme o endereço com a loja'}</small></div><b aria-hidden="true" />
                </button>
              </div>
            </section>

            {modo === 'entrega' && (
              <section className="checkout-bloco">
                <h3>Endereço de entrega</h3>
                {deliveryConfig?.setor === 'avancado' && (
                  <label className="checkout-campo checkout-largo">Cidade atendida<select value={cidadeEscolhida} onChange={(e) => onCidade(e.target.value)}><option value="">Selecione</option>{deliveryConfig.cidade && <option>{deliveryConfig.cidade}</option>}{deliveryConfig.cidades.map((c) => <option key={c.cidade}>{c.cidade}</option>)}</select></label>
                )}
                <div className="checkout-endereco-grid">
                  <label className="checkout-campo">CEP<input inputMode="numeric" autoComplete="postal-code" value={formatarCep(endereco.cep)} onChange={(e) => atualizar('cep', formatarCep(e.target.value))} placeholder="00000-000" /></label>
                  <label className="checkout-campo checkout-largo">Logradouro<input autoComplete="address-line1" maxLength={120} value={endereco.logradouro} onChange={(e) => atualizar('logradouro', e.target.value)} placeholder="Rua ou avenida" /></label>
                  <label className="checkout-campo">Número<input maxLength={20} value={endereco.numero} onChange={(e) => atualizar('numero', e.target.value)} /></label>
                  <label className="checkout-campo">Bairro<input maxLength={80} value={endereco.bairro} onChange={(e) => atualizar('bairro', e.target.value)} /></label>
                  <label className="checkout-campo">Cidade<input autoComplete="address-level2" maxLength={100} value={endereco.cidade} readOnly={!!deliveryConfig?.cidade} onChange={(e) => atualizar('cidade', e.target.value)} /></label>
                  <label className="checkout-campo checkout-uf">UF<input autoComplete="address-level1" maxLength={2} value={endereco.uf} onChange={(e) => atualizar('uf', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} placeholder="SP" /></label>
                  <label className="checkout-campo checkout-largo">Complemento (opcional)<input autoComplete="address-line2" maxLength={100} value={endereco.complemento || ''} onChange={(e) => atualizar('complemento', e.target.value)} placeholder="Apto, bloco, casa…" /></label>
                  <label className="checkout-campo checkout-largo">Ponto de referência (opcional)<input maxLength={120} value={endereco.referencia || ''} onChange={(e) => atualizar('referencia', e.target.value)} /></label>
                </div>
                {usaCotacaoDinamica ? (
                  <>
                    <button type="button" className="checkout-calcular" disabled={cotacao.status === 'calculando'} onClick={onCalcularFrete}>{cotacao.status === 'calculando' ? 'Calculando rota…' : 'Calcular taxa de entrega'}</button>
                    {cotacao.status === 'ok' && <div className="checkout-cotacao"><span>Taxa calculada</span><strong>{formatBRL(cotacao.taxa)}{cotacao.distanciaKm != null ? ` · ${cotacao.distanciaKm} km` : ''}</strong></div>}
                    {cotacao.status === 'erro' && <p className="delivery-erro" role="alert">{cotacao.erro}</p>}
                    <small className="checkout-atribuicao">Rotas por <a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer">Geoapify</a> · © OpenStreetMap contributors</small>
                  </>
                ) : (
                  <div className="checkout-cotacao"><span>Taxa fixa da loja</span><strong>{formatBRL(taxaEstatica)}</strong></div>
                )}
              </section>
            )}

            <section className="checkout-bloco">
              <h3>Seus dados</h3>
              <div className="checkout-dados-grid">
                <label className="checkout-campo">Nome<input autoComplete="name" maxLength={80} value={nome} onChange={(e) => onNome(e.target.value)} /></label>
                <label className="checkout-campo">Telefone com DDD<input type="tel" autoComplete="tel" maxLength={16} value={telefone} onChange={(e) => onTelefone(formatarTelefone(e.target.value))} placeholder="(11) 91234-5678" /></label>
              </div>
            </section>

            {erro && <p className="checkout-erro" role="alert">{erro}</p>}
            <div className="checkout-resumo"><div><span>Subtotal</span><span>{formatBRL(subtotal)}</span></div>{modo === 'entrega' && <div><span>Taxa de entrega</span><span>{cotacao.status === 'ok' ? formatBRL(taxa) : 'A calcular'}</span></div>}<div className="checkout-total"><span>Total</span><strong>{formatBRL(total)}</strong></div></div>
            <p className="checkout-pagamento"><strong>Pagamento pendente:</strong> após registrar, você continuará no WhatsApp da loja.</p>
            <button type="button" className="btn-primary checkout-acao" disabled={enviando || linhas.length === 0} onClick={onFinalizar}>{enviando ? 'Registrando pedido…' : 'Confirmar e registrar pedido'}</button>
          </div>
        )}
      </section>
    </div>
  );
}
