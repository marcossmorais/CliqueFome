import type { Metadata } from 'next';
import Link from 'next/link';
import { MolduraLegal } from '@/components/legal/MolduraLegal';
import { BotaoPreferenciasCookies } from '@/components/legal/AvisoCookies';
import { avaliarDadosLegais, obterDadosLegais } from '@/lib/legal/config';
import styles from '@/components/legal/legal.module.css';

export function generateMetadata(): Metadata {
  const estado = avaliarDadosLegais(obterDadosLegais());
  return {
    title: 'Política de Cookies — FlouFood',
    description: 'Quais cookies e dados de navegador a FlouFood usa, para quê, por quanto tempo e como mudar sua escolha.',
    robots: estado.publicavel ? { index: true, follow: true } : { index: false, follow: false },
  };
}

const SUMARIO = [
  { href: '#o-que-sao', texto: 'O que são cookies' },
  { href: '#categorias', texto: 'Categorias' },
  { href: '#lista', texto: 'O que usamos' },
  { href: '#escolha', texto: 'Mudar sua escolha' },
  { href: '#navegador', texto: 'Pelo navegador' },
];

/**
 * A tabela precisa espelhar o código. Ao criar cookie ou chave de
 * localStorage nova, acrescente aqui — e, se for opcional, faça ela
 * respeitar `consentiuMedicao()` de components/legal/AvisoCookies.tsx.
 */
const ITENS = [
  { nome: 'sb-*-auth-token', tipo: 'Cookie', onde: 'Painel e cadastro', finalidade: 'Manter o login do dono da loja (Supabase Auth).', duracao: 'Sessão renovada enquanto houver uso' },
  { nome: 'cf_cliente_<loja>', tipo: 'Cookie (httpOnly)', onde: 'Cardápio da loja', finalidade: 'Reconhecer o cliente pelo telefone para mostrar os pedidos dele.', duracao: '12 meses' },
  { nome: 'cf_carrinho_<loja>', tipo: 'Armazenamento local', onde: 'Cardápio da loja', finalidade: 'Guardar o carrinho ao recarregar a página.', duracao: 'Até ser limpo' },
  { nome: 'cf_nome_cliente, cf_telefone_cliente', tipo: 'Armazenamento local', onde: 'Cardápio da loja', finalidade: 'Preencher nome e telefone no próximo pedido.', duracao: 'Até ser limpo' },
  { nome: 'cf_admin_theme', tipo: 'Armazenamento local', onde: 'Painel', finalidade: 'Lembrar o tema claro ou escuro.', duracao: 'Até ser limpo' },
  { nome: 'ff_consentimento_cookies', tipo: 'Armazenamento local', onde: 'Site institucional', finalidade: 'Lembrar a sua escolha neste aviso.', duracao: 'Até ser limpo ou a política mudar' },
];

export default function CookiesPage() {
  return (
    <MolduraLegal
      rotulo="Transparência"
      titulo="Política de Cookies"
      descricao="Quais cookies e dados de navegador usamos, para quê e como você controla isso. Spoiler: só o essencial para o site funcionar."
      sumario={SUMARIO}
    >
      <section id="o-que-sao" className={styles.aberturaDocumento}>
        <span className={styles.numeroSecao}>Política de Cookies</span>
        <h2>O que são cookies</h2>
        <p>
          Cookies são pequenos arquivos que o site guarda no seu navegador. O armazenamento local
          (<em>localStorage</em>) funciona parecido, mas não é enviado ao servidor. Tratamos os dois aqui, porque
          a regra de transparência vale para ambos. Esta Política complementa a{' '}
          <Link href="/privacidade">Política de Privacidade</Link>.
        </p>
      </section>

      <section id="categorias">
        <h3>1. Categorias</h3>
        <ul>
          <li>
            <strong>Essenciais (sempre ativos):</strong> login, segurança, carrinho e preferências de tela. Sem eles
            o serviço não funciona, por isso não dependem de consentimento — a base é a execução do serviço que você
            pediu e o legítimo interesse em mantê-lo seguro.
          </li>
          <li>
            <strong>Medição e desempenho (opcional):</strong> estatísticas de uso para melhorar o site. Só podem ser
            usados com o seu consentimento. <strong>Hoje nenhuma ferramenta desse tipo está ativa</strong>; a sua
            escolha fica registrada para valer se uma for adotada.
          </li>
          <li>
            <strong>Publicidade:</strong> não usamos.
          </li>
        </ul>
      </section>

      <section id="lista">
        <h3>2. O que usamos hoje</h3>
        <div className={styles.tabelaWrap} tabIndex={0} role="region" aria-label="Cookies e armazenamento usados">
          <table>
            <thead>
              <tr><th>Nome</th><th>Tipo</th><th>Onde</th><th>Para quê</th><th>Duração</th></tr>
            </thead>
            <tbody>
              {ITENS.map((item) => (
                <tr key={item.nome}>
                  <td><code>{item.nome}</code></td>
                  <td>{item.tipo}</td>
                  <td>{item.onde}</td>
                  <td>{item.finalidade}</td>
                  <td>{item.duracao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.nota}>Todos são essenciais e próprios da FlouFood. Nenhum é de terceiros para publicidade.</p>
      </section>

      <section id="escolha">
        <h3>3. Mudar sua escolha</h3>
        <p>Você pode rever o consentimento a qualquer momento, com a mesma facilidade com que o deu:</p>
        <p><BotaoPreferenciasCookies className={styles.botaoDestaque} /></p>
      </section>

      <section id="navegador">
        <h3>4. Pelo navegador</h3>
        <p>
          Também é possível apagar ou bloquear cookies e armazenamento local nas configurações do navegador.
          Bloquear os essenciais desconecta sua conta e esvazia o carrinho.
        </p>
      </section>
    </MolduraLegal>
  );
}
