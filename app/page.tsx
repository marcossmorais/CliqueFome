import type { StaticImageData } from 'next/image';
import Image from 'next/image';
import Link from 'next/link';
import './landing.css';
import { LogoFlouFood } from '@/components/LogoFlouFood';
import { AvisoCookies, BotaoPreferenciasCookies } from '@/components/legal/AvisoCookies';
import { DIAS_TESTE, PRECO_MENSAL } from '@/lib/legal/oferta';
import { Palco3D } from './_landing/Palco3D';
import telaPedidos from './_landing/telas/painel-pedidos.webp';
import telaCozinha from './_landing/telas/painel-cozinha.webp';
import telaCardapio from './_landing/telas/cardapio-mobile.webp';

/**
 * Landing institucional. Server Component sem Supabase — o único trecho
 * client é o palco 3D do hero (inclinação pelo ponteiro) e o aviso de
 * cookies.
 *
 * As telas em `_landing/telas/` são capturas do sistema de verdade (painel,
 * cozinha e cardápio público) com pedidos de exemplo. Mudou a interface?
 * Capture de novo — print desatualizado é promessa que o produto não cumpre.
 */

const preco = PRECO_MENSAL.toFixed(2).replace('.', ',');

const svg = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

const NICHOS = ['Hamburgueria', 'Pizzaria', 'Açaiteria', 'Restaurante', 'Marmitaria', 'Doceria', 'Lanchonete'];

type ItemVitrine = {
  id: string;
  rotulo: string;
  titulo: string;
  texto: string;
  pontos: string[];
  tela: StaticImageData;
  alt: string;
  formato: 'celular' | 'navegador' | 'navegador-escuro';
  url?: string;
};

const VITRINE: ItemVitrine[] = [
  {
    id: 'cardapio',
    rotulo: 'Cardápio digital',
    titulo: 'Um cardápio com a cara da sua loja',
    texto: 'Logo, capa e cores suas. O cliente abre pelo link, escolhe, monta o pedido com adicionais e finaliza sem baixar nada.',
    pontos: ['Link próprio pra bio, WhatsApp e QR Code', 'Fotos, complementos, tamanhos e promoções', 'Delivery com taxa por distância e retirada no local'],
    tela: telaCardapio,
    alt: 'Cardápio público de uma hamburgueria aberto no celular',
    formato: 'celular',
  },
  {
    id: 'pedidos',
    rotulo: 'Gestão de pedidos',
    titulo: 'Todos os pedidos numa tela só',
    texto: 'Site, Instagram, balcão e mesa caem no mesmo painel. Você vê o que é novo, o que está atrasado e quanto falta receber.',
    pontos: ['Status do pedido de ponta a ponta', 'Pago ou a receber, à vista em cada pedido', 'Pedido manual em segundos pelo balcão'],
    tela: telaPedidos,
    alt: 'Painel de gestão de pedidos com a lista de pedidos do dia',
    formato: 'navegador',
    url: 'Painel · Gestão de pedidos',
  },
  {
    id: 'cozinha',
    rotulo: 'Tela da cozinha',
    titulo: 'A cozinha sabe exatamente o que preparar',
    texto: 'Cada pedido chega com itens, adicionais e observações em destaque. Um toque avança o pedido e avisa quem entrega.',
    pontos: ['Fila em três etapas: receber, preparar, pronto', 'Observação do cliente sempre em destaque', 'Modo escuro pra tela da cozinha'],
    tela: telaCozinha,
    alt: 'Tela da cozinha em modo escuro com pedidos em preparo',
    formato: 'navegador-escuro',
    url: 'Painel · Cozinha',
  },
];

const RECURSOS = [
  { titulo: 'PDV e caixa', texto: 'Venda no balcão, abra e feche o caixa com sangria e conferência.', icone: svg(<><rect x="3" y="7" width="18" height="12" rx="2" /><path d="M3 11h18M7 15h3" /><path d="M7 7V5h10v2" /></>) },
  { titulo: 'Mesas e comandas', texto: 'Lance itens durante o consumo e feche a conta com taxa de serviço.', icone: svg(<><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 6V4M17 6V4M3 11h18" /></>) },
  { titulo: 'Delivery', texto: 'Área de entrega, taxa por distância e endereço conferido no mapa.', icone: svg(<><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /></>) },
  { titulo: 'Pedidos agendados', texto: 'Encomendas com data e horário combinados, sem perder o controle.', icone: svg(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18M8 14h3" /></>) },
  { titulo: 'Desempenho', texto: 'Faturamento, ticket médio e produtos mais vendidos por período.', icone: svg(<><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>) },
  { titulo: 'Clientes', texto: 'Quem compra, quanto e com que frequência — pra chamar de volta.', icone: svg(<><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0112 0M16 4a3 3 0 010 6M21 20a6 6 0 00-4-5.6" /></>) },
  { titulo: 'Financeiro', texto: 'Recebimentos e movimento do dia organizados num lugar só.', icone: svg(<><circle cx="12" cy="12" r="9" /><path d="M15 9.5c-.6-1-1.7-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 2 3 2 3 .9 3 2-1.3 2-3 2c-1.3 0-2.4-.5-3-1.5M12 6v12" /></>) },
  { titulo: 'Histórico', texto: 'Todos os pedidos já feitos, com busca e filtros avançados.', icone: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>) },
];

const INCLUSO = [
  'Cardápio digital com link próprio',
  'Delivery, retirada, balcão e mesa',
  'Gestão de pedidos em tempo real',
  'Tela da cozinha (KDS)',
  'PDV, caixa, mesas e comandas',
  'Clientes, histórico e desempenho',
  'Financeiro',
  'Suporte pelo painel',
];

const PASSOS = [
  { titulo: 'Crie sua conta', texto: 'Nome da loja, categoria, WhatsApp e endereço. Leva poucos minutos.' },
  { titulo: 'Monte o cardápio', texto: 'Categorias, produtos, fotos e adicionais — com modelos prontos pra começar.' },
  { titulo: 'Divulgue o link', texto: 'Mande pros clientes e receba os pedidos organizados no painel.' },
];

const DUVIDAS = [
  { p: `Como funcionam os ${DIAS_TESTE} dias grátis?`, r: `Você cria a conta e usa tudo por ${DIAS_TESTE} dias, sem pagar nada. Depois, se quiser continuar, assina o plano de R$ ${preco} por mês.` },
  { p: 'Tem taxa por pedido?', r: 'Não. O valor é fixo por mês, venda você 10 ou 1.000 pedidos.' },
  { p: 'Tem fidelidade ou multa pra cancelar?', r: 'Não. Você cancela quando quiser, pelo painel ou pelo suporte, e as cobranças param.' },
  { p: 'Preciso instalar alguma coisa?', r: 'Não. O painel roda no navegador do computador, tablet ou celular, e o cliente pede pelo link do cardápio.' },
  { p: 'O cardápio fica com a minha marca?', r: 'Sim. O cliente vê o logo, a capa e as cores da sua loja — não a marca FlouFood.' },
  { p: 'E os dados dos meus clientes?', r: 'Ficam protegidos e separados por loja, tratados conforme a LGPD. Os detalhes estão na Política de Privacidade.' },
];

function IconeCheck() {
  return svg(<path d="M20 6L9 17l-5-5" />);
}

function Tela({ item, prioridade, decorativa }: { item: ItemVitrine; prioridade?: boolean; decorativa?: boolean }) {
  const alt = decorativa ? '' : item.alt;
  if (item.formato === 'celular') {
    return (
      <div className="celular">
        <span className="celular-ilha" />
        <Image src={item.tela} alt={alt} sizes="(max-width: 760px) 50vw, 300px" priority={prioridade} placeholder="blur" />
      </div>
    );
  }
  return (
    <div className={'navegador' + (item.formato === 'navegador-escuro' ? ' escuro' : '')}>
      <div className="navegador-barra">
        <span /><span /><span />
        <em>{item.url}</em>
      </div>
      <Image src={item.tela} alt={alt} sizes="(max-width: 760px) 92vw, 900px" priority={prioridade} placeholder="blur" />
    </div>
  );
}

export default function Home() {
  const [cardapio, pedidos, cozinha] = VITRINE;

  return (
    // `.landing` é o escopo de todo o landing.css — ver o topo daquele arquivo.
    <div className="landing">
      <header className="topo">
        <div className="wrap topo-linha">
          <Link href="/" className="brand-logo" aria-label="FlouFood — página inicial">
            <LogoFlouFood />
          </Link>
          <nav className="topo-links" aria-label="Seções">
            <a href="#recursos">Recursos</a>
            <a href="#como-funciona">Como funciona</a>
            <a href="#preco">Preço</a>
            <a href="#duvidas">Dúvidas</a>
          </nav>
          <div className="topo-acoes">
            <Link href="/painel" className="topo-entrar">Entrar</Link>
            <Link href="/cadastro" className="btn btn-primary btn-small">Testar grátis</Link>
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="hero-brilho" aria-hidden="true" />
        <div className="wrap hero-texto">
          <span className="selo">
            <span className="selo-ponto" /> {DIAS_TESTE} dias grátis · sem taxa por pedido
          </span>
          <h1>
            Do cardápio à cozinha, seus pedidos em <span className="destaque">um fluxo só</span>.
          </h1>
          <p>
            Cardápio digital com a sua marca, gestão de pedidos em tempo real, tela da cozinha, PDV e caixa.
            Feito pra hamburguerias, pizzarias, açaiterias e restaurantes.
          </p>
          <div className="ctas">
            <Link href="/cadastro" className="btn btn-primary btn-grande">
              Começar meus {DIAS_TESTE} dias grátis
            </Link>
            <a href="#cardapio" className="btn btn-vidro btn-grande">Ver o sistema por dentro</a>
          </div>
          <ul className="provas">
            <li><IconeCheck /> Sem fidelidade</li>
            <li><IconeCheck /> Sem taxa por pedido</li>
            <li><IconeCheck /> Loja no ar em minutos</li>
          </ul>
        </div>

        <Palco3D>
          <div className="peca peca-fundo"><Tela item={cozinha} decorativa /></div>
          <div className="peca peca-principal"><Tela item={pedidos} prioridade decorativa /></div>
          <div className="peca peca-celular"><Tela item={cardapio} prioridade decorativa /></div>
          <div className="peca ficha ficha-pedido">
            <span className="ficha-icone">🔔</span>
            <span><strong>Novo pedido #1042</strong><small>Delivery · R$ 67,80 · Pix pago</small></span>
          </div>
          <div className="peca ficha ficha-cozinha">
            <span className="ficha-icone verde">✓</span>
            <span><strong>Pedido #1038 pronto</strong><small>Aguardando retirada</small></span>
          </div>
        </Palco3D>
      </section>

      <section className="nichos" aria-label="Pra quem é">
        <div className="wrap">
          <p>Feito pra quem vive de pedido</p>
          <ul>
            {NICHOS.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </div>
      </section>

      {VITRINE.map((item, i) => (
        <section key={item.id} id={item.id} className={'vitrine' + (i % 2 ? ' invertida' : '')}>
          <div className="wrap vitrine-grade">
            <div className="vitrine-texto">
              <span className="eyebrow">{item.rotulo}</span>
              <h2>{item.titulo}</h2>
              <p>{item.texto}</p>
              <ul>
                {item.pontos.map((ponto) => <li key={ponto}><IconeCheck /> {ponto}</li>)}
              </ul>
            </div>
            <div className={'vitrine-palco formato-' + item.formato}>
              <div className="tela-3d"><Tela item={item} /></div>
            </div>
          </div>
        </section>
      ))}

      <section id="recursos" className="recursos">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">E tem mais</span>
            <h2>A operação inteira, sem pular de sistema</h2>
            <p>Tudo incluso no mesmo plano. Sem módulo extra, sem surpresa na fatura.</p>
          </div>
          <div className="recursos-grade">
            {RECURSOS.map((r) => (
              <article className="recurso" key={r.titulo}>
                <div className="ico">{r.icone}</div>
                <h3>{r.titulo}</h3>
                <p>{r.texto}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="como-funciona" className="passos-secao">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">Como funciona</span>
            <h2>Do cadastro ao primeiro pedido</h2>
          </div>
          <ol className="passos">
            {PASSOS.map((p, i) => (
              <li className="passo" key={p.titulo}>
                <span className="passo-num">{i + 1}</span>
                <h3>{p.titulo}</h3>
                <p>{p.texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="preco" className="preco-secao">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">Preço</span>
            <h2>Um plano. Tudo incluso.</h2>
            <p>Teste por {DIAS_TESTE} dias sem pagar nada. Gostou? Continue por um valor fixo.</p>
          </div>

          <div className="plano">
            <div className="plano-lado">
              <span className="plano-tag">{DIAS_TESTE} dias grátis</span>
              <h3>Plano FlouFood</h3>
              <div className="plano-preco">
                <span className="moeda">R$</span>
                <span className="valor">{PRECO_MENSAL}</span>
                <span className="periodo">/mês</span>
              </div>
              <p className="plano-nota">Depois do teste. Sem taxa por pedido, sem fidelidade.</p>
              <Link href="/cadastro" className="btn btn-primary btn-grande plano-cta">
                Começar teste grátis
              </Link>
              <p className="plano-letras">
                Cancele quando quiser. Condições nos <Link href="/termos#plano">Termos de Uso</Link>.
              </p>
            </div>
            <ul className="plano-lista">
              {INCLUSO.map((item) => <li key={item}><IconeCheck /> {item}</li>)}
            </ul>
          </div>
        </div>
      </section>

      <section id="duvidas" className="duvidas-secao">
        <div className="wrap duvidas-grade">
          <div className="section-head esquerda">
            <span className="eyebrow">Dúvidas</span>
            <h2>Perguntas frequentes</h2>
            <p>Não achou o que procurava? Fale com a gente pelo suporte depois de criar a conta.</p>
          </div>
          <div className="duvidas">
            {DUVIDAS.map((d) => (
              <details key={d.p}>
                <summary>{d.p}</summary>
                <p>{d.r}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="cta-final">
        <div className="wrap">
          <div className="cta-caixa">
            <h2>Sua loja no ar ainda hoje.</h2>
            <p>{DIAS_TESTE} dias grátis pra testar tudo. Depois, R$ {preco} por mês.</p>
            <Link href="/cadastro" className="btn btn-branco btn-grande">Criar minha loja</Link>
          </div>
        </div>
      </section>

      <footer className="rodape">
        <div className="wrap rodape-grade">
          <div className="rodape-marca">
            <LogoFlouFood />
            <p>Cardápio digital e gestão de pedidos pra quem vive de delivery e balcão.</p>
          </div>
          <nav aria-label="Produto">
            <strong>Produto</strong>
            <a href="#recursos">Recursos</a>
            <a href="#preco">Preço</a>
            <a href="#duvidas">Dúvidas</a>
          </nav>
          <nav aria-label="Conta">
            <strong>Conta</strong>
            <Link href="/cadastro">Criar loja</Link>
            <Link href="/painel">Entrar</Link>
          </nav>
          <nav aria-label="Legal">
            <strong>Legal</strong>
            <Link href="/termos">Termos de Uso</Link>
            <Link href="/privacidade">Política de Privacidade</Link>
            <Link href="/cookies">Política de Cookies</Link>
            <Link href="/privacidade#direitos">Seus direitos (LGPD)</Link>
            <BotaoPreferenciasCookies className="rodape-botao" />
          </nav>
        </div>
        <div className="wrap rodape-base">
          <p>© 2026 FlouFood. Todos os direitos reservados.</p>
        </div>
      </footer>

      <AvisoCookies />
    </div>
  );
}
