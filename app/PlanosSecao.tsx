'use client';

import Link from 'next/link';
import { useState } from 'react';

/**
 * Seção de planos. Era um script inline mexendo no DOM; virou estado do
 * React — mesmo comportamento, e sem <script> inline pra CSP liberar.
 */

const DESCONTO_ANUAL = 0.15;

const PLANOS = [
  {
    nome: 'Básico',
    desc: 'O essencial pra publicar o cardápio e receber pedidos.',
    mensal: 45,
    destaque: false,
    cta: 'btn-ghost',
    itens: [
      'Cardápio: categorias, produtos, complementos e opções',
      'Gestão de pedidos (delivery, retirada e balcão)',
      'Links do cardápio de delivery e balcão',
      'Minha empresa: horários e formas de pagamento',
      'Histórico de pedidos com filtros',
      'Avaliações dos clientes',
      'Dúvidas e suporte',
    ],
  },
  {
    nome: 'Pro',
    desc: 'Pra quem opera salão, cozinha, caixa e entrega própria.',
    mensal: 79,
    destaque: true,
    cta: 'btn-primary',
    itens: [
      'Tudo do plano Básico',
      'Mesas e comandas com taxa de serviço',
      'KDS — tela da cozinha',
      'Caixa com sangria, suprimento e conferência',
      'Delivery e cadastro de entregadores',
      'Desempenho e relatórios',
      'Financeiro e emissão de notas (fiscal)',
      'Configurações: impressão, agendamentos e integrações',
    ],
  },
];

function brl(valor: number) {
  return valor.toFixed(2).replace('.', ',');
}

function IconeCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export function PlanosSecao() {
  const [anual, setAnual] = useState(false);

  return (
    <section id="planos">
      <div className="section-head">
        <span className="eyebrow">Planos</span>
        <h2>Escolha o plano da sua loja</h2>
        <p>Cancele quando quiser, sem contrato de fidelidade.</p>
      </div>

      <div className="toggle-wrap">
        <span className={anual ? '' : 'active'}>Mensal</span>
        <label className="switch">
          <input
            type="checkbox"
            checked={anual}
            onChange={(e) => setAnual(e.target.checked)}
            aria-label="Cobrança anual com 15% de desconto"
          />
          <span className="switch-track"></span>
        </label>
        <span className={anual ? 'active' : ''}>Anual</span>
        <span className="save-badge">-15%</span>
      </div>

      <div className="planos-grid">
        {PLANOS.map((plano) => {
          const mensalidade = anual ? plano.mensal * (1 - DESCONTO_ANUAL) : plano.mensal;
          return (
            <div key={plano.nome} className={'plano-card' + (plano.destaque ? ' destaque' : '')}>
              {plano.destaque && <div className="plano-tag">Mais popular</div>}
              <div className="plano-nome">{plano.nome}</div>
              <div className="plano-desc">{plano.desc}</div>
              <div className="plano-preco">
                R$ <span className="valor">{brl(mensalidade)}</span>
                <small>/mês</small>
              </div>
              <div className="plano-anual-nota">
                {anual ? `Cobrado R$ ${brl(mensalidade * 12)}/ano` : ''}
              </div>
              <ul className="plano-lista">
                {plano.itens.map((item) => (
                  <li key={item}>
                    <IconeCheck />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/painel" className={'btn ' + plano.cta}>
                Começar agora
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
