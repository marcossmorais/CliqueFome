import Link from 'next/link';
import './landing.css';
import { LogoFlouFood } from '@/components/LogoFlouFood';
import { PlanosSecao } from './PlanosSecao';

/**
 * Landing institucional. Server Component: não toca no Supabase e não tem
 * estado — só a seção de planos é client, por causa do toggle mensal/anual.
 */

type Func = { titulo: string; texto: string; icone: React.ReactNode };

const svg = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);

const GRUPOS: { titulo: string; funcs: Func[] }[] = [
  {
    titulo: 'Operação do dia a dia',
    funcs: [
      { titulo: 'Gestão de pedidos', texto: 'Pedidos de retirada, balcão, mesa e encomendas numa tela só, avançando por status até a conclusão.', icone: svg(<><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>) },
      { titulo: 'Mesas e comandas', texto: 'Abra a mesa, lance os itens durante o consumo e feche a conta com taxa de serviço.', icone: svg(<><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 6V4M17 6V4M3 11h18" /></>) },
      { titulo: 'KDS — tela da cozinha', texto: 'A cozinha vê o que preparar e marca item por item como pronto.', icone: svg(<><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4M8 9l2 2 4-4" /></>) },
      { titulo: 'Caixa', texto: 'Abertura e fechamento com conferência, sangria, suprimento e resumo do movimento do dia.', icone: svg(<><rect x="3" y="7" width="18" height="12" rx="2" /><path d="M3 11h18M7 15h3" /><path d="M7 7V5h10v2" /></>) },
    ],
  },
  {
    titulo: 'Cardápio e vendas',
    funcs: [
      { titulo: 'Cardápio', texto: 'Categorias, produtos, listas de complementos e opções — com foto, preço e disponibilidade.', icone: svg(<><path d="M5 4h14v16H5z" /><path d="M9 8h6M9 12h6M9 16h3" /></>) },
      { titulo: 'Links do cardápio', texto: 'Link próprio do cardápio e do balcão pra divulgar onde quiser.', icone: svg(<><path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1" /><path d="M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1" /></>) },
      { titulo: 'Retirada no local', texto: 'O cliente monta o carrinho, escolhe o pagamento e retira o pedido no estabelecimento.', icone: svg(<><path d="M4 8h16l-1 12H5L4 8z" /><path d="M8 8V6a4 4 0 018 0v2" /></>) },
      { titulo: 'Pedidos agendados', texto: 'Registre encomendas com data e horário combinados sem perder o controle da operação.', icone: svg(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18M8 14h3" /></>) },
    ],
  },
  {
    titulo: 'Gestão e controle',
    funcs: [
      { titulo: 'Desempenho e relatórios', texto: 'Faturamento, ticket médio, clientes e produtos mais vendidos por período.', icone: svg(<><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>) },
      { titulo: 'Histórico de pedidos', texto: 'Todos os pedidos já feitos, com busca por cliente ou número e filtros avançados.', icone: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>) },
      { titulo: 'Financeiro', texto: 'Contas a pagar e a receber, fluxo de caixa e categorias financeiras.', icone: svg(<><circle cx="12" cy="12" r="9" /><path d="M15 9.5c-.6-1-1.7-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 2 3 2 3 .9 3 2-1.3 2-3 2c-1.3 0-2.4-.5-3-1.5M12 6v12" /></>) },
      { titulo: 'Fiscal', texto: 'Emissão de notas dos pedidos direto pelo sistema.', icone: svg(<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>) },
    ],
  },
  {
    titulo: 'Configuração e suporte',
    funcs: [
      { titulo: 'Minha empresa', texto: 'Logo, endereço, horários de funcionamento e as formas de pagamento que você aceita.', icone: svg(<><path d="M3 21V9l9-6 9 6v12z" /><path d="M9 21v-7h6v7" /></>) },
      { titulo: 'Configurações', texto: 'Impressão, agendamentos e integrações do sistema.', icone: svg(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1V21a2 2 0 11-4 0v-.1A1.6 1.6 0 007 19.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.6 1.6 0 003 15H3a2 2 0 110-4h.1A1.6 1.6 0 004.6 7l-.1-.1a2 2 0 112.8-2.8l.1.1A1.6 1.6 0 0010 3V3a2 2 0 114 0v.1A1.6 1.6 0 0017 4.6l.1-.1a2 2 0 112.8 2.8l-.1.1A1.6 1.6 0 0021 10h0a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z" /></>) },
      { titulo: 'Avaliações', texto: 'Veja o que os clientes acharam dos pedidos.', icone: svg(<path d="M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6.1-5.3-3-5.3 3 1.1-6.1L3.4 9.4l6-.8z" />) },
      { titulo: 'Dúvidas e suporte', texto: 'Central de ajuda e canal de suporte direto no painel.', icone: svg(<><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 113.2 2.4c-.5.2-.7.6-.7 1.1v.5" /><path d="M12 17h.01" /></>) },
    ],
  },
];

const PASSOS = [
  { titulo: 'Crie sua loja', texto: 'Cadastre nome, nicho e WhatsApp — seu painel fica pronto na hora.' },
  { titulo: 'Monte seu cardápio', texto: 'Adicione categorias, produtos, fotos e complementos como tamanho e adicionais.' },
  { titulo: 'Receba pedidos', texto: 'O cliente monta o pedido no cardápio e finaliza direto no seu WhatsApp.' },
];

const MOCKUP = [
  { nome: 'X-Burguer artesanal', desc: 'Pão brioche, cheddar, bacon', preco: 'R$ 28,90' },
  { nome: 'Açaí 500ml', desc: 'Escolha até 3 adicionais', preco: 'R$ 19,90' },
  { nome: 'Pizza grande', desc: 'Escolha o sabor e a borda', preco: 'R$ 54,90' },
];

export default function Home() {
  return (
    <div className="wrap">
      <nav>
        <Link href="/" className="brand-logo">
          <LogoFlouFood prioridade />
        </Link>
        <div className="nav-links">
          <a href="#funcionalidades">Funcionalidades</a>
          <a href="#planos">Planos</a>
        </div>
        <Link href="/painel" className="btn btn-primary btn-small">
          Acessar conta
        </Link>
      </nav>

      <section className="hero">
        <span className="badge">Cardápio digital sem complicação</span>
        <h1>
          Seu cardápio online e os pedidos organizados em um <span className="fome">clique</span>
        </h1>
        <p>
          Cardápio digital, gestão de pedidos, mesas, cozinha e caixa num painel só — pra
          lanchonetes, hamburguerias, pizzarias e açaiterias.
        </p>
        <div className="ctas">
          <Link href="/painel" className="btn btn-primary">
            Acessar conta
          </Link>
          <a href="#planos" className="btn btn-ghost">
            Ver planos
          </a>
        </div>

        <div className="mockup" aria-hidden="true">
          <div className="mockup-bar">
            <span></span>
            <span></span>
            <span></span>
          </div>
          {MOCKUP.map((item) => (
            <div className="mockup-row" key={item.nome}>
              <div className="mockup-thumb"></div>
              <div className="mockup-info">
                <strong>{item.nome}</strong>
                <span>{item.desc}</span>
              </div>
              <div className="mockup-price">{item.preco}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="funcionalidades">
        <div className="section-head">
          <span className="eyebrow">Funcionalidades</span>
          <h2>Tudo o que sua operação precisa, num painel só</h2>
          <p>
            Do cardápio ao fechamento do caixa — pedidos, salão, cozinha e gestão sem pular
            de sistema.
          </p>
        </div>

        <div className="grupos-grid">
          {GRUPOS.map((grupo) => (
            <div className="grupo-card" key={grupo.titulo}>
              <h3>{grupo.titulo}</h3>
              {grupo.funcs.map((f) => (
                <div className="func" key={f.titulo}>
                  <div className="ico">{f.icone}</div>
                  <div>
                    <strong>{f.titulo}</strong>
                    <p>{f.texto}</p>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="section-head">
          <span className="eyebrow">Como funciona</span>
          <h2>Do cadastro ao primeiro pedido</h2>
        </div>
        <div className="steps">
          {PASSOS.map((p) => (
            <div className="step" key={p.titulo}>
              <div className="num"></div>
              <h3>{p.titulo}</h3>
              <p>{p.texto}</p>
            </div>
          ))}
        </div>
      </section>

      <PlanosSecao />

      <footer>
        <div className="foot-row">
          <Link href="/" className="brand-logo">
            <LogoFlouFood />
          </Link>
          <p>© 2026 FlouFood. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
