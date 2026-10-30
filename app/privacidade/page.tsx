import type { Metadata } from 'next';
import Link from 'next/link';
import { MolduraLegal } from '@/components/legal/MolduraLegal';
import { avaliarDadosLegais, exibirOuPendente, obterDadosLegais } from '@/lib/legal/config';
import styles from '@/components/legal/legal.module.css';

export function generateMetadata(): Metadata {
  const estado = avaliarDadosLegais(obterDadosLegais());
  return {
    title: 'Política de Privacidade (LGPD) — FlouFood',
    description: 'Como a FlouFood trata dados pessoais, com base na LGPD: papéis, finalidades, direitos do titular e contato.',
    robots: estado.publicavel ? { index: true, follow: true } : { index: false, follow: false },
  };
}

const LGPD = 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm';
const MARCO_CIVIL = 'https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm';
const DIREITOS_ANPD = 'https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares';

const SUMARIO = [
  { href: '#papeis', texto: 'Papéis na LGPD' },
  { href: '#dados-finalidades', texto: 'Dados e finalidades' },
  { href: '#origem', texto: 'Origem dos dados' },
  { href: '#cookies', texto: 'Cookies' },
  { href: '#compartilhamento', texto: 'Compartilhamento' },
  { href: '#internacional', texto: 'Transferência internacional' },
  { href: '#retencao', texto: 'Retenção' },
  { href: '#seguranca', texto: 'Segurança' },
  { href: '#direitos', texto: 'Seus direitos (LGPD)' },
  { href: '#criancas', texto: 'Crianças' },
  { href: '#contato', texto: 'Encarregado e contato' },
];

export default function PrivacidadePage() {
  const dados = obterDadosLegais();
  const empresa = exibirOuPendente(dados.razaoSocial);
  const cnpj = exibirOuPendente(dados.cnpj);
  const endereco = exibirOuPendente(dados.endereco);
  const emailPrivacidade = exibirOuPendente(dados.emailPrivacidade);

  return (
    <MolduraLegal
      rotulo="LGPD · Lei nº 13.709/2018"
      titulo="Política de Privacidade"
      descricao="Como os dados pessoais são tratados na relação entre a FlouFood, os estabelecimentos e os clientes deles — e como exercer seus direitos."
      sumario={SUMARIO}
    >
      <section className={styles.aberturaDocumento}>
        <span className={styles.numeroSecao}>Política de Privacidade</span>
        <h2>Em resumo</h2>
        <ul>
          <li>Coletamos só o necessário para o serviço funcionar: conta, loja, pedidos e registros de segurança.</li>
          <li>Não vendemos dados pessoais e não fazemos publicidade comportamental.</li>
          <li>Os dados dos clientes de cada loja pertencem à relação entre a loja e o cliente; a FlouFood os processa por conta dela.</li>
          <li>Você pode pedir acesso, correção ou eliminação dos seus dados pelo contato no fim desta página.</li>
        </ul>
        <p>Esta Política deve ser lida junto aos <Link href="/termos">Termos de Uso</Link>.</p>
      </section>

      <section id="papeis">
        <h3>1. Quem trata os dados e quais são os papéis</h3>
        <p>
          <strong>A FlouFood como controladora:</strong> decide sobre o tratamento necessário para administrar
          contas, contratos, cobrança, segurança, suporte, prevenção a fraude e cumprimento de obrigações próprias.
        </p>
        <p>
          <strong>O estabelecimento como controlador:</strong> em regra, decide por que e como usa dados dos seus
          clientes para receber, preparar, entregar e manter o histórico dos pedidos. Nesses tratamentos, a
          FlouFood atua como operadora, conforme as instruções do estabelecimento e o contrato.
        </p>
      </section>

      <section id="dados-finalidades">
        <h3>2. Dados, finalidades e bases legais</h3>
        <div className={styles.tabelaWrap} tabIndex={0} role="region" aria-label="Tabela de dados, finalidades e bases legais">
          <table>
            <thead>
              <tr><th>Dados</th><th>Principais finalidades</th><th>Bases que podem se aplicar</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Conta e estabelecimento (nome, e-mail, WhatsApp, endereço da loja)</td>
                <td>Criar a conta, autenticar, prestar o serviço, cobrar e comunicar questões operacionais.</td>
                <td>Execução de contrato; obrigação legal ou regulatória.</td>
              </tr>
              <tr>
                <td>Cliente e pedido (nome, telefone, endereço de entrega, itens)</td>
                <td>Montar, registrar, encaminhar, preparar e acompanhar pedidos; atender solicitações.</td>
                <td>Execução de contrato ou procedimentos preliminares; obrigação legal; exercício regular de direitos.</td>
              </tr>
              <tr>
                <td>Segurança e uso (IP, registros de acesso, dispositivo)</td>
                <td>Manter sessão, prevenir abuso, investigar incidentes e proteger contas.</td>
                <td>Legítimo interesse; obrigação legal (Marco Civil da Internet); exercício regular de direitos.</td>
              </tr>
              <tr>
                <td>Suporte</td>
                <td>Responder dúvidas, diagnosticar problemas e manter o histórico do atendimento.</td>
                <td>Execução de contrato; legítimo interesse.</td>
              </tr>
              <tr>
                <td>Medição de uso do site (opcional)</td>
                <td>Entender como o site é usado para melhorá-lo. Hoje nenhuma ferramenta desse tipo está ativa.</td>
                <td>Consentimento, dado e revogado no aviso de cookies.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className={styles.nota}>
          A base legal depende da finalidade concreta. Consentimento não é usado quando o tratamento for
          obrigatório para executar o serviço; quando usado, é livre, informado, destacado e revogável.
        </p>
      </section>

      <section id="origem">
        <h3>3. Origem e dados obrigatórios</h3>
        <p>
          Os dados podem ser fornecidos pelo titular, pelo estabelecimento ao registrar um pedido, gerados pelo
          uso do sistema ou recebidos de uma integração escolhida. Campos obrigatórios são identificados no
          fluxo; sem eles, determinada funcionalidade pode não ser executada.
        </p>
      </section>

      <section id="cookies">
        <h3>4. Cookies, sessão e armazenamento local</h3>
        <p>
          Usamos cookies e armazenamento local essenciais para login, segurança, preferências de tela e para
          guardar o carrinho do cardápio. Cookies opcionais só entram com consentimento. Os detalhes estão na{' '}
          <Link href="/cookies">Política de Cookies</Link>, onde também é possível mudar sua escolha.
        </p>
      </section>

      <section id="compartilhamento">
        <h3>5. Compartilhamento e operadores</h3>
        <p>Dados podem ser compartilhados, no limite necessário, com:</p>
        <ul>
          <li>fornecedores de hospedagem, banco de dados, autenticação, armazenamento, mapas, comunicação e suporte;</li>
          <li>o estabelecimento responsável pelo pedido e pessoas autorizadas por ele;</li>
          <li>serviços escolhidos pelo usuário, como o WhatsApp, quando o pedido for encaminhado por esse canal;</li>
          <li>autoridades, órgãos públicos e terceiros quando houver obrigação legal, ordem válida ou necessidade de exercer direitos.</li>
        </ul>
        <p>A FlouFood não vende dados pessoais.</p>
      </section>

      <section id="internacional">
        <h3>6. Transferência internacional</h3>
        <p>
          Alguns fornecedores podem processar ou armazenar dados fora do Brasil. Transferências internacionais
          somente ocorrem conforme as hipóteses e garantias previstas na LGPD e na regulamentação da ANPD.
        </p>
      </section>

      <section id="retencao">
        <h3>7. Retenção e eliminação</h3>
        <p>
          Os dados são mantidos pelo tempo necessário para cumprir as finalidades informadas, executar o
          contrato, atender obrigações legais e regulatórias, prevenir fraude e exercer direitos. Registros de
          acesso são guardados pelo prazo mínimo exigido pelo{' '}
          <a href={MARCO_CIVIL} target="_blank" rel="noopener noreferrer">Marco Civil da Internet</a>. Encerrada a
          necessidade, os dados são eliminados ou anonimizados.
        </p>
      </section>

      <section id="seguranca">
        <h3>8. Segurança e incidentes</h3>
        <p>
          Adotamos medidas técnicas e administrativas proporcionais aos riscos — como controle de acesso por
          loja no banco de dados e conexões criptografadas — para proteger os dados contra
          acessos não autorizados, perda, destruição, alteração ou divulgação indevida. Nenhum sistema é infalível.
          Incidentes relevantes são avaliados e comunicados aos titulares e à ANPD quando a legislação exigir.
        </p>
      </section>

      <section id="direitos">
        <h3>9. Seus direitos como titular (art. 18 da LGPD)</h3>
        <p>Você pode solicitar, a qualquer momento:</p>
        <ul>
          <li>confirmação da existência de tratamento e acesso aos dados;</li>
          <li>correção de dados incompletos, inexatos ou desatualizados;</li>
          <li>anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade;</li>
          <li>portabilidade dos dados a outro fornecedor;</li>
          <li>informação sobre com quem os dados foram compartilhados e sobre a possibilidade de não consentir;</li>
          <li>revogação do consentimento e eliminação dos dados tratados com essa base, respeitadas as exceções legais;</li>
          <li>oposição a tratamento irregular e revisão de decisões tomadas unicamente de forma automatizada.</li>
        </ul>
        <p>
          A identidade pode ser confirmada para evitar fraude. Quando o pedido disser respeito a dados de um pedido
          feito numa loja, a FlouFood encaminha ou apoia o estabelecimento na resposta.{' '}
          <a href={DIREITOS_ANPD} target="_blank" rel="noopener noreferrer">Saiba mais sobre seus direitos na ANPD</a>.
        </p>
      </section>

      <section id="criancas">
        <h3>10. Crianças e adolescentes</h3>
        <p>
          Contas administrativas não são destinadas a crianças. Caso o estabelecimento trate dados de
          crianças ou adolescentes em pedidos, deve observar o melhor interesse e a base legal adequada.
        </p>
      </section>

      <section id="contato">
        <h3>11. Encarregado (DPO) e contato de privacidade</h3>
        <div className={styles.contato}>
          <p><strong>Controladora:</strong> {empresa}</p>
          <p><strong>CNPJ:</strong> {cnpj}</p>
          <p><strong>Endereço:</strong> {endereco}</p>
          <p><strong>E-mail do encarregado e de privacidade:</strong> {emailPrivacidade}</p>
        </div>
        <p>
          Se não ficar satisfeito com a resposta, você também pode apresentar petição à Autoridade Nacional de
          Proteção de Dados (ANPD).
        </p>
      </section>

      <section className={styles.fontes} aria-labelledby="fontes-titulo">
        <h3 id="fontes-titulo">Referências oficiais</h3>
        <ul>
          <li><a href={LGPD} target="_blank" rel="noopener noreferrer">Lei Geral de Proteção de Dados — Lei nº 13.709/2018</a></li>
          <li><a href={MARCO_CIVIL} target="_blank" rel="noopener noreferrer">Marco Civil da Internet — Lei nº 12.965/2014</a></li>
          <li><a href={DIREITOS_ANPD} target="_blank" rel="noopener noreferrer">Direitos dos titulares — ANPD</a></li>
        </ul>
      </section>

      <aside className={styles.notaJuridica}>
        <strong>Nota de implementação</strong>
        <p>
          Este texto é uma base técnica, não um parecer jurídico. Antes da vigência, confirme fornecedores,
          locais de armazenamento, prazos de retenção e o encarregado indicado.
        </p>
      </aside>
    </MolduraLegal>
  );
}
