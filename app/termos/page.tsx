import type { Metadata } from 'next';
import Link from 'next/link';
import { MolduraLegal } from '@/components/legal/MolduraLegal';
import { avaliarDadosLegais, exibirOuPendente, obterDadosLegais } from '@/lib/legal/config';
import { DIAS_TESTE, PRECO_MENSAL } from '@/lib/legal/oferta';
import styles from '@/components/legal/legal.module.css';

export function generateMetadata(): Metadata {
  const estado = avaliarDadosLegais(obterDadosLegais());
  return {
    title: 'Termos de Uso — FlouFood',
    description: 'Termos de Uso da plataforma FlouFood: conta, uso permitido, plano, teste grátis e cancelamento.',
    robots: estado.publicavel ? { index: true, follow: true } : { index: false, follow: false },
  };
}

const CDC = 'https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm';
const MARCO_CIVIL = 'https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm';

const SUMARIO = [
  { href: '#escopo', texto: 'Escopo e aceitação' },
  { href: '#conta', texto: 'Conta e segurança' },
  { href: '#uso', texto: 'Uso permitido' },
  { href: '#responsabilidades', texto: 'Responsabilidades' },
  { href: '#plano', texto: 'Plano, teste e cancelamento' },
  { href: '#disponibilidade', texto: 'Disponibilidade' },
  { href: '#propriedade', texto: 'Propriedade intelectual' },
  { href: '#encerramento', texto: 'Suspensão e encerramento' },
  { href: '#garantias', texto: 'Responsabilidade' },
  { href: '#alteracoes', texto: 'Alterações e foro' },
];

export default function TermosPage() {
  const dados = obterDadosLegais();
  const empresa = exibirOuPendente(dados.razaoSocial);
  const cnpj = exibirOuPendente(dados.cnpj);
  const endereco = exibirOuPendente(dados.endereco);
  const preco = PRECO_MENSAL.toFixed(2).replace('.', ',');

  return (
    <MolduraLegal
      rotulo="Documento legal"
      titulo="Termos de Uso"
      descricao="As regras de uso da FlouFood: o que a plataforma oferece, o que cabe a cada parte e como funcionam o teste grátis, a cobrança e o cancelamento."
      sumario={SUMARIO}
    >
      <section className={styles.aberturaDocumento}>
        <span className={styles.numeroSecao}>Termos de Uso</span>
        <h2>Quem somos</h2>
        <p>
          Estes Termos regulam o acesso à plataforma FlouFood, oferecida por <strong>{empresa}</strong>,
          inscrita no CNPJ sob nº <strong>{cnpj}</strong>, com endereço em <strong>{endereco}</strong>,
          doravante denominada “FlouFood”. O tratamento de dados pessoais está descrito na{' '}
          <Link href="/privacidade">Política de Privacidade</Link> e o uso de cookies na{' '}
          <Link href="/cookies">Política de Cookies</Link>.
        </p>
      </section>

      <section id="escopo">
        <h3>1. Escopo e aceitação</h3>
        <p>
          Ao criar uma conta, iniciar o teste grátis, contratar o plano ou usar o painel, o estabelecimento
          declara ter capacidade para contratar e concorda com estes Termos. A pessoa que cria ou administra a
          conta declara ter poderes para representar o estabelecimento.
        </p>
        <p>
          A FlouFood fornece ferramentas para criação de cardápio digital, organização de catálogo,
          recebimento ou registro de pedidos e gestão operacional. Funcionalidades podem evoluir conforme a
          fase do produto e as integrações habilitadas.
        </p>
      </section>

      <section id="conta">
        <h3>2. Conta, acesso e segurança</h3>
        <ul>
          <li>As informações de cadastro devem ser verdadeiras, completas e mantidas atualizadas.</li>
          <li>Credenciais são pessoais e não devem ser compartilhadas. O estabelecimento responde pelos acessos que autorizar.</li>
          <li>Suspeitas de uso indevido devem ser comunicadas pelo canal oficial assim que percebidas.</li>
          <li>A FlouFood pode solicitar confirmação de identidade ou representação para proteger a conta e cumprir obrigações legais.</li>
        </ul>
      </section>

      <section id="uso">
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

      <section id="plano">
        <h3>5. Plano, teste grátis, cobrança e cancelamento</h3>
        <ul>
          <li>
            <strong>Teste grátis:</strong> toda loja nova tem {DIAS_TESTE} dias para usar a plataforma sem custo,
            contados a partir da criação da conta.
          </li>
          <li>
            <strong>Plano:</strong> encerrado o teste, o uso continua mediante assinatura do plano mensal de{' '}
            <strong>R$ {preco}</strong>. Não há taxa por pedido nem fidelidade.
          </li>
          <li>
            <strong>Antes de cobrar:</strong> nenhuma cobrança é feita sem que o valor, a periodicidade e a forma
            de pagamento sejam apresentados de forma clara e aceitos pelo estabelecimento.
          </li>
          <li>
            <strong>Cancelamento:</strong> pode ser pedido a qualquer momento, pelo painel ou pelo suporte, e
            impede as cobranças seguintes.
          </li>
        </ul>
        <p>
          Direitos previstos no <a href={CDC} target="_blank" rel="noopener noreferrer">Código de Defesa do
          Consumidor</a>, quando aplicável, permanecem preservados.
        </p>
      </section>

      <section id="disponibilidade">
        <h3>6. Disponibilidade, mudanças e integrações</h3>
        <p>
          A plataforma pode passar por manutenção, atualização e indisponibilidade. A FlouFood buscará
          comunicar alterações relevantes com antecedência razoável quando possível. Integrações de terceiros,
          como serviços de hospedagem, autenticação, armazenamento, mapas e WhatsApp, também estão sujeitas às
          regras e à disponibilidade dos respectivos fornecedores.
        </p>
      </section>

      <section id="propriedade">
        <h3>7. Propriedade intelectual</h3>
        <p>
          O software, a marca, a identidade visual e os materiais próprios da FlouFood são protegidos pela
          legislação aplicável. O estabelecimento mantém os direitos sobre seu nome, marca, imagens e conteúdo,
          e concede a licença limitada necessária para exibi-los e processá-los durante a prestação do serviço.
        </p>
      </section>

      <section id="encerramento">
        <h3>8. Suspensão e encerramento</h3>
        <p>
          O acesso pode ser suspenso para conter risco de segurança, fraude, uso ilícito, inadimplência ou
          violação relevante destes Termos. Sempre que juridicamente e tecnicamente possível, haverá
          comunicação e oportunidade de regularização. O encerramento não elimina obrigações vencidas nem
          retenções exigidas por lei.
        </p>
      </section>

      <section id="garantias">
        <h3>9. Responsabilidade e garantias legais</h3>
        <p>
          Cada parte responde pelos danos que causar nos limites da lei. A FlouFood não assume a execução do
          preparo, pagamento, entrega, qualidade ou relação de consumo do estabelecimento. Nenhuma cláusula
          exclui responsabilidade que não possa ser afastada, direitos do consumidor ou deveres obrigatórios
          previstos na legislação brasileira, inclusive o{' '}
          <a href={MARCO_CIVIL} target="_blank" rel="noopener noreferrer">Marco Civil da Internet</a>.
        </p>
      </section>

      <section id="alteracoes">
        <h3>10. Alterações, lei e solução de conflitos</h3>
        <p>
          Mudanças relevantes nestes Termos serão identificadas por nova versão e data. A relação é regida pela
          legislação brasileira. O foro aplicável observará as regras obrigatórias de competência, inclusive o
          direito do consumidor de recorrer ao foro legalmente assegurado quando cabível.
        </p>
      </section>

      <aside className={styles.notaJuridica}>
        <strong>Nota de implementação</strong>
        <p>
          Este texto é uma base técnica, não um parecer jurídico. Antes da vigência, confirme se as práticas reais,
          contratos, cobrança, canais de atendimento e fluxos do produto correspondem ao documento.
        </p>
      </aside>
    </MolduraLegal>
  );
}
