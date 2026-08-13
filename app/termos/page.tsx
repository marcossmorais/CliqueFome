import type { Metadata } from 'next';
import Link from 'next/link';
import { LogoFlouFood } from '@/components/LogoFlouFood';
import { avaliarDadosLegais, exibirOuPendente, obterDadosLegais } from '@/lib/legal/config';
import styles from './termos.module.css';

export function generateMetadata(): Metadata {
  const estado = avaliarDadosLegais(obterDadosLegais());
  return {
    title: 'Termos de Uso e Privacidade — FlouFood',
    description: 'Termos de Uso e Aviso de Privacidade da plataforma FlouFood.',
    robots: estado.publicavel ? { index: true, follow: true } : { index: false, follow: false },
  };
}

const LGPD = 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm';
const MARCO_CIVIL = 'https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm';
const CDC = 'https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm';
const DIREITOS_ANPD = 'https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares';

export default function TermosPage() {
  const dados = obterDadosLegais();
  const estado = avaliarDadosLegais(dados);

  const empresa = exibirOuPendente(dados.razaoSocial);
  const cnpj = exibirOuPendente(dados.cnpj);
  const endereco = exibirOuPendente(dados.endereco);
  const emailPrivacidade = exibirOuPendente(dados.emailPrivacidade);
  const vigencia = exibirOuPendente(dados.dataVigencia);

  return (
    <div className={styles.pagina}>
      <a className={styles.pular} href="#conteudo-legal">Pular para o conteúdo</a>

      <header className={styles.cabecalho}>
        <Link href="/" className={styles.logo} aria-label="FlouFood — página inicial">
          <LogoFlouFood />
        </Link>
        <nav aria-label="Navegação dos documentos">
          <a href="#termos">Termos de Uso</a>
          <a href="#privacidade">Privacidade</a>
          <Link href="/painel">Central de Ajuda</Link>
        </nav>
      </header>

      <main id="conteudo-legal" className={styles.conteudo}>
        <section className={styles.introducao}>
          <span className={styles.rotulo}>Documentos legais</span>
          <h1>Termos de Uso e Aviso de Privacidade</h1>
          <p>
            Estes documentos explicam as regras de uso da FlouFood e como os dados pessoais são tratados
            na relação entre a plataforma, os estabelecimentos e seus clientes.
          </p>
          <div className={styles.meta}>
            <span><strong>Versão:</strong> {estado.publicavel ? '1.0' : '1.0 — rascunho'}</span>
            <span><strong>Vigência:</strong> {vigencia}</span>
          </div>
        </section>

        {!estado.publicavel && (
          <aside className={styles.alertaRascunho} role="alert" aria-labelledby="rascunho-titulo">
            <div className={styles.alertaIcone} aria-hidden="true">!</div>
            <div>
              <strong id="rascunho-titulo">Rascunho jurídico — não publicar como documento definitivo</strong>
              <p>
                Faltam {estado.faltantes.join(', ')}. Preencha as variáveis de ambiente indicadas no projeto,
                valide as práticas descritas e obtenha revisão jurídica antes de remover este aviso.
              </p>
            </div>
          </aside>
        )}

        <div className={styles.layout}>
          <aside className={styles.sumario} aria-label="Sumário">
            <strong>Nesta página</strong>
            <ol>
              <li><a href="#termos">Termos de Uso</a></li>
              <li><a href="#escopo">Escopo e aceitação</a></li>
              <li><a href="#conta">Conta e segurança</a></li>
              <li><a href="#responsabilidades">Responsabilidades</a></li>
              <li><a href="#privacidade">Aviso de Privacidade</a></li>
              <li><a href="#papeis">Papéis na LGPD</a></li>
              <li><a href="#dados-finalidades">Dados e finalidades</a></li>
              <li><a href="#direitos">Direitos do titular</a></li>
              <li><a href="#contato">Contato</a></li>
            </ol>
          </aside>

          <article className={styles.documento}>
            <section id="termos" className={styles.aberturaDocumento}>
              <span className={styles.numeroSecao}>Documento 01</span>
              <h2>Termos de Uso</h2>
              <p>
                Estes Termos regulam o acesso à plataforma FlouFood, oferecida por <strong>{empresa}</strong>,
                inscrita no CNPJ sob nº <strong>{cnpj}</strong>, com endereço em <strong>{endereco}</strong>,
                doravante denominada “FlouFood”.
              </p>
            </section>

            <section id="escopo">
              <h3>1. Escopo e aceitação</h3>
              <p>
                Ao criar uma conta, contratar um plano ou usar o painel, o estabelecimento declara ter capacidade
                para contratar e concorda com estes Termos. A pessoa que cria ou administra a conta declara ter
                poderes para representar o estabelecimento.
              </p>
              <p>
                A FlouFood fornece ferramentas para criação de cardápio digital, organização de catálogo,
                recebimento ou registro de pedidos e gestão operacional. Funcionalidades podem variar conforme o
                plano contratado, a fase do produto e as integrações habilitadas.
              </p>
            </section>

            <section id="conta">
              <h3>2. Conta, acesso e segurança</h3>
              <ul>
                <li>As informações de cadastro devem ser verdadeiras, completas e mantidas atualizadas.</li>
                <li>Credenciais são pessoais e não devem ser compartilhadas. O estabelecimento responde pelos acessos que autorizar.</li>
                <li>Suspeitas de uso indevido devem ser comunicadas pelo canal oficial assim que ele estiver disponível.</li>
                <li>A FlouFood pode solicitar confirmação de identidade ou representação para proteger a conta e cumprir obrigações legais.</li>
              </ul>
            </section>

            <section>
              <h3>3. Uso permitido</h3>
              <p>É proibido usar a plataforma para:</p>
              <ul>
                <li>violar leis, direitos de terceiros, direitos autorais, marcas ou regras sanitárias e consumeristas;</li>
                <li>publicar conteúdo ilícito, enganoso, discriminatório ou que induza o consumidor a erro;</li>
                <li>tentar acessar contas, dados, sistemas ou áreas sem autorização;</li>
                <li>introduzir código malicioso, automatizar abuso, contornar limites ou comprometer a disponibilidade do serviço;</li>
                <li>tratar dados pessoais sem base legal, finalidade legítima ou transparência adequada.</li>
              </ul>
            </section>

            <section id="responsabilidades">
              <h3>4. Responsabilidades do estabelecimento</h3>
              <p>O estabelecimento é responsável por sua atividade comercial e, entre outros pontos, deve:</p>
              <ul>
                <li>manter corretos preços, ingredientes, disponibilidade, fotos, prazos, taxas e condições de venda;</li>
                <li>cumprir a oferta, atender o consumidor e observar regras fiscais, sanitárias e de defesa do consumidor;</li>
                <li>conferir pedidos, endereços, pagamentos e escolhas antes de preparar ou entregar;</li>
                <li>usar os dados de clientes apenas para finalidades legítimas e compatíveis com a relação comercial;</li>
                <li>controlar quem acessa o painel e remover acessos que não sejam mais necessários.</li>
              </ul>
            </section>

            <section>
              <h3>5. Planos, cobrança e cancelamento</h3>
              <p>
                Preços, recursos, período de cobrança, reajuste e condições de cancelamento seguem a oferta ou
                proposta comercial aceita na contratação. Antes de qualquer cobrança, essas informações devem ser
                apresentadas de forma clara. Direitos obrigatórios previstos na legislação aplicável permanecem preservados.
              </p>
            </section>

            <section>
              <h3>6. Disponibilidade, mudanças e integrações</h3>
              <p>
                A plataforma pode passar por manutenção, atualização e indisponibilidade. A FlouFood buscará
                comunicar alterações relevantes com antecedência razoável quando possível. Integrações de terceiros,
                como serviços de hospedagem, autenticação, armazenamento e WhatsApp, também estão sujeitas às regras
                e à disponibilidade dos respectivos fornecedores.
              </p>
            </section>

            <section>
              <h3>7. Propriedade intelectual</h3>
              <p>
                O software, a marca, a identidade visual e os materiais próprios da FlouFood são protegidos pela
                legislação aplicável. O estabelecimento mantém os direitos sobre seu nome, marca, imagens e conteúdo,
                e concede a licença limitada necessária para exibi-los e processá-los durante a prestação do serviço.
              </p>
            </section>

            <section>
              <h3>8. Suspensão e encerramento</h3>
              <p>
                O acesso pode ser suspenso para conter risco de segurança, fraude, uso ilícito, inadimplência conforme
                a contratação ou violação relevante destes Termos. Sempre que juridicamente e tecnicamente possível,
                haverá comunicação e oportunidade de regularização. O encerramento não elimina obrigações vencidas
                nem retenções exigidas por lei.
              </p>
            </section>

            <section>
              <h3>9. Responsabilidade e garantias legais</h3>
              <p>
                Cada parte responde pelos danos que causar nos limites da lei. A FlouFood não assume a execução do
                preparo, pagamento, entrega, qualidade ou relação de consumo do estabelecimento. Nenhuma cláusula
                exclui responsabilidade que não possa ser afastada, direitos do consumidor ou deveres obrigatórios
                previstos na legislação brasileira.
              </p>
            </section>

            <section>
              <h3>10. Alterações, lei e solução de conflitos</h3>
              <p>
                Mudanças relevantes nestes Termos serão identificadas por nova versão e data. A relação é regida pela
                legislação brasileira. O foro aplicável observará as regras obrigatórias de competência, inclusive o
                direito do consumidor de recorrer ao foro legalmente assegurado quando cabível.
              </p>
            </section>

            <hr />

            <section id="privacidade" className={styles.aberturaDocumento}>
              <span className={styles.numeroSecao}>Documento 02</span>
              <h2>Aviso de Privacidade</h2>
              <p>
                Este Aviso descreve o tratamento de dados pessoais relacionado à plataforma e deve ser lido junto
                aos Termos de Uso e aos avisos específicos apresentados no momento da coleta.
              </p>
            </section>

            <section id="papeis">
              <h3>1. Quem trata os dados e quais são os papéis</h3>
              <p>
                <strong>A FlouFood como controladora:</strong> decide sobre o tratamento necessário para administrar
                contas, contratos, segurança, suporte, prevenção a fraude e cumprimento de obrigações próprias.
              </p>
              <p>
                <strong>O estabelecimento como controlador:</strong> em regra, decide por que e como usa dados dos seus
                clientes para receber, preparar, entregar e manter o histórico dos pedidos. Nesses tratamentos, o
                a FlouFood pode atuar como operadora, conforme as instruções do estabelecimento e o contrato.
              </p>
              <p>
                Alguns contextos podem exigir qualificação diferente. Os contratos, fluxos reais e responsabilidades
                devem ser revisados antes da publicação definitiva deste Aviso.
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
                      <td>Conta e estabelecimento</td>
                      <td>Criar a conta, autenticar, prestar o serviço, cobrar e comunicar questões operacionais.</td>
                      <td>Execução de contrato; obrigação legal ou regulatória.</td>
                    </tr>
                    <tr>
                      <td>Cliente e pedido</td>
                      <td>Montar, registrar, encaminhar, preparar e acompanhar pedidos; atender solicitações.</td>
                      <td>Execução de contrato ou procedimentos preliminares; obrigação legal; exercício regular de direitos.</td>
                    </tr>
                    <tr>
                      <td>Segurança e uso</td>
                      <td>Manter sessão, prevenir abuso, investigar incidentes, gerar registros técnicos e proteger contas.</td>
                      <td>Legítimo interesse após avaliação; obrigação legal; exercício regular de direitos.</td>
                    </tr>
                    <tr>
                      <td>Suporte</td>
                      <td>Responder dúvidas, diagnosticar problemas e manter o histórico do atendimento.</td>
                      <td>Execução de contrato; legítimo interesse; consentimento quando realmente necessário e facultativo.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className={styles.nota}>
                A base legal depende da finalidade concreta. Consentimento não deve ser usado quando o tratamento for
                obrigatório para executar o serviço; quando usado, deverá ser livre, informado, destacado e revogável.
              </p>
            </section>

            <section>
              <h3>3. Origem e dados obrigatórios</h3>
              <p>
                Os dados podem ser fornecidos pelo titular, pelo estabelecimento ao registrar um pedido, gerados pelo
                uso do sistema ou recebidos de uma integração escolhida. Campos obrigatórios são identificados no
                fluxo; sem eles, determinada funcionalidade pode não ser executada.
              </p>
            </section>

            <section>
              <h3>4. Cookies, sessão e armazenamento local</h3>
              <p>
                A FlouFood usa mecanismos essenciais para autenticação, seleção da loja, segurança e continuidade
                das funções. O cardápio pode guardar o carrinho no armazenamento local do navegador para que a seleção
                não seja perdida ao recarregar a página. Esses recursos não devem ser usados para publicidade
                comportamental sem aviso e mecanismo apropriados.
              </p>
            </section>

            <section>
              <h3>5. Compartilhamento e operadores</h3>
              <p>Dados podem ser compartilhados, no limite necessário, com:</p>
              <ul>
                <li>fornecedores de hospedagem, banco de dados, autenticação, armazenamento, comunicação e suporte;</li>
                <li>o estabelecimento responsável pelo pedido e pessoas autorizadas por ele;</li>
                <li>serviços escolhidos pelo usuário, como o WhatsApp, quando o pedido for encaminhado por esse canal;</li>
                <li>autoridades, órgãos públicos e terceiros quando houver obrigação legal, ordem válida ou necessidade de exercer direitos.</li>
              </ul>
              <p>Uma relação atualizada dos principais operadores deve ser mantida internamente e disponibilizada quando aplicável.</p>
            </section>

            <section>
              <h3>6. Transferência internacional</h3>
              <p>
                Alguns fornecedores podem processar ou armazenar dados fora do Brasil. Antes da publicação definitiva,
                os locais, fornecedores e mecanismos aplicáveis devem ser inventariados. Transferências internacionais
                somente ocorrerão conforme as hipóteses e garantias previstas na LGPD e na regulamentação da ANPD.
              </p>
            </section>

            <section>
              <h3>7. Retenção e eliminação</h3>
              <p>
                Os dados serão mantidos pelo tempo necessário para cumprir as finalidades informadas, executar o
                contrato, atender obrigações legais e regulatórias, prevenir fraude e exercer direitos. Encerrada a
                necessidade, serão eliminados ou anonimizados, salvo quando a conservação for permitida ou exigida.
                Prazos concretos devem constar do inventário de dados e da política interna de retenção.
              </p>
            </section>

            <section>
              <h3>8. Segurança e incidentes</h3>
              <p>
                São adotadas medidas técnicas e administrativas proporcionais aos riscos para proteger os dados contra
                acessos não autorizados, perda, destruição, alteração ou divulgação indevida. Nenhum sistema é infalível.
                Incidentes relevantes serão avaliados e comunicados aos titulares e à ANPD quando a legislação exigir.
              </p>
            </section>

            <section id="direitos">
              <h3>9. Direitos dos titulares</h3>
              <p>Nos limites da LGPD, o titular pode solicitar, entre outros direitos:</p>
              <ul>
                <li>confirmação da existência e acesso aos dados;</li>
                <li>correção de dados incompletos, inexatos ou desatualizados;</li>
                <li>anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade;</li>
                <li>portabilidade, informação sobre compartilhamentos e consequências de não fornecer consentimento;</li>
                <li>revogação do consentimento e eliminação dos dados tratados com essa base, respeitadas as exceções legais;</li>
                <li>oposição a tratamento irregular e revisão de decisões tomadas unicamente de forma automatizada, quando aplicável.</li>
              </ul>
              <p>
                A identidade poderá ser confirmada para evitar fraude. Quando o pedido disser respeito ao tratamento
                feito pelo estabelecimento, a FlouFood poderá orientar o titular ou apoiar o estabelecimento na resposta.
              </p>
            </section>

            <section>
              <h3>10. Crianças e adolescentes</h3>
              <p>
                Contas administrativas não são destinadas a crianças. Caso o estabelecimento trate dados de crianças
                ou adolescentes em pedidos, deverá observar o melhor interesse, aplicar a base legal adequada e fornecer
                as informações exigidas. A FlouFood não deve incentivar coleta desnecessária desses dados.
              </p>
            </section>

            <section id="contato">
              <h3>11. Contato de privacidade</h3>
              <div className={styles.contato}>
                <p><strong>Responsável:</strong> {empresa}</p>
                <p><strong>CNPJ:</strong> {cnpj}</p>
                <p><strong>Endereço:</strong> {endereco}</p>
                <p><strong>E-mail para privacidade e direitos:</strong> {emailPrivacidade}</p>
              </div>
              <p>
                O titular também pode apresentar petição à Autoridade Nacional de Proteção de Dados, observados os
                procedimentos divulgados pela ANPD.
              </p>
            </section>

            <section className={styles.fontes} aria-labelledby="fontes-titulo">
              <h3 id="fontes-titulo">Referências oficiais</h3>
              <p>Texto elaborado com base nas normas e orientações oficiais vigentes na data da revisão:</p>
              <ul>
                <li><a href={LGPD} target="_blank" rel="noopener noreferrer">Lei Geral de Proteção de Dados — Lei nº 13.709/2018</a></li>
                <li><a href={MARCO_CIVIL} target="_blank" rel="noopener noreferrer">Marco Civil da Internet — Lei nº 12.965/2014</a></li>
                <li><a href={CDC} target="_blank" rel="noopener noreferrer">Código de Defesa do Consumidor — Lei nº 8.078/1990</a></li>
                <li><a href={DIREITOS_ANPD} target="_blank" rel="noopener noreferrer">Direitos dos titulares — ANPD</a></li>
              </ul>
            </section>

            <aside className={styles.notaJuridica}>
              <strong>Nota de implementação</strong>
              <p>
                Este texto é uma base técnica, não um parecer jurídico. Antes da vigência, confirme se as práticas reais,
                contratos, fornecedores, retenção, canais de atendimento e fluxos do produto correspondem ao documento.
              </p>
            </aside>
          </article>
        </div>
      </main>

      <footer className={styles.rodape}>
        <div>
          <LogoFlouFood />
          <p>Termos e privacidade com linguagem clara.</p>
        </div>
        <div>
          <Link href="/">Página inicial</Link>
          <Link href="/painel">Central de Ajuda</Link>
          <a href="#conteudo-legal">Voltar ao topo</a>
        </div>
      </footer>
    </div>
  );
}
