'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';

import { criarClientNavegador } from '@/lib/supabase/client';
import { aplicarRespostaViaCep, formatarCep, type RespostaViaCep } from '@/lib/delivery/endereco';
import { CATEGORIAS_LOJA, formatarWhatsapp, SENHA_MINIMA } from '@/lib/onboarding/dados';
import type { Coordenada } from '@/lib/onboarding/mapa';
import estilos from './cadastro.module.css';

/**
 * As quatro telas do cadastro. Cada uma guarda os próprios campos e avisa a
 * casca quando terminou — nenhuma delas decide qual vem depois, porque essa
 * ordem é do servidor (ver app/cadastro/page.tsx).
 */

/* O mapa só entra no pacote de quem chega na etapa de endereço E consegue
   geocodificar. Não é `ssr: false` por capricho: ele mede o próprio elemento
   pra posicionar o pin, o que não existe no servidor. */
const MapaLocalizacao = dynamic(
  () => import('./MapaLocalizacao').then((m) => m.MapaLocalizacao),
  { ssr: false }
);

export type EnderecoLoja = {
  cep: string;
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  complemento: string;
};

export const ENDERECO_VAZIO: EnderecoLoja = {
  cep: '',
  rua: '',
  numero: '',
  bairro: '',
  cidade: '',
  uf: '',
  complemento: '',
};

function IconeCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function Girando() {
  return <span className={estilos.girando} aria-hidden="true" />;
}

/** Mensagem de erro da API, sem deixar um corpo estranho virar texto de tela. */
async function erroDaResposta(resposta: Response, padrao: string) {
  try {
    const corpo = (await resposta.json()) as { erro?: unknown };
    return typeof corpo.erro === 'string' && corpo.erro ? corpo.erro : padrao;
  } catch {
    return padrao;
  }
}

/* ==========================================================================
   1. Conta
   ========================================================================== */

/**
 * Traduz a recusa do Supabase Auth.
 *
 * `signup_disabled` merece frase própria: é a chave "Allow new users to sign
 * up" desligada no projeto, e nada que a pessoa digite muda o resultado.
 * Mandar "confira os dados" nesse caso faz o dono tentar de novo várias vezes
 * até desistir, achando que errou algo.
 */
function mensagemDeErroDeConta(error: { code?: string; message: string }) {
  const texto = error.message.toLowerCase();
  if (error.code === 'signup_disabled' || texto.includes('signups not allowed')) {
    return 'A criação de contas está temporariamente fechada. Fale com a equipe da FlouFood para liberar a sua.';
  }
  if (texto.includes('already')) return 'Já existe uma conta com esse e-mail.';
  if (texto.includes('password')) return 'Escolha uma senha mais forte.';
  return 'Não foi possível criar a conta. Confira os dados e tente novamente.';
}

export function PassoConta({ onPronto }: { onPronto: () => void }) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function criarConta(evento: React.FormEvent) {
    evento.preventDefault();
    setErro('');
    setAviso('');
    setEnviando(true);
    try {
      const sb = criarClientNavegador();
      const { data, error } = await sb.auth.signUp({
        email: email.trim().toLowerCase(),
        password: senha,
        options: { data: { nome: nome.trim() } },
      });

      if (error) {
        setErro(mensagemDeErroDeConta(error));
        return;
      }

      // O Supabase devolve um usuário sem identidades quando o e-mail já
      // existe — é proposital, pra não revelar quem tem conta. Aqui a pessoa
      // está cadastrando a própria loja, então o caminho útil é mandá-la pro
      // login em vez de fingir que deu certo.
      if (data.user && data.user.identities?.length === 0) {
        setErro('Já existe uma conta com esse e-mail.');
        return;
      }

      // Sem sessão = o projeto exige confirmação por e-mail. O cadastro não
      // tem como seguir sem sessão (toda gravação depende dela), então para
      // aqui em vez de travar num passo que não salva.
      if (!data.session) {
        setAviso(
          'Conta criada. Enviamos um link de confirmação para o seu e-mail — confirme e volte aqui para continuar.'
        );
        return;
      }

      onPronto();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={criarConta} noValidate>
      <h1 className={estilos.titulo}>Crie sua conta</h1>
      <p className={estilos.legenda}>É rápido. Só o necessário para abrir o painel da sua loja.</p>

      {erro && <p className={estilos.erro}>{erro}</p>}
      {aviso && <p className={estilos.aviso}>{aviso}</p>}

      <div className={estilos.campos}>
        <div className={estilos.campo}>
          <label htmlFor="contaNome">Nome</label>
          <input
            id="contaNome"
            type="text"
            required
            autoComplete="name"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>

        <div className={estilos.campo}>
          <label htmlFor="contaEmail">E-mail</label>
          <input
            id="contaEmail"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className={estilos.campo}>
          <label htmlFor="contaSenha">Senha</label>
          <input
            id="contaSenha"
            type="password"
            required
            minLength={SENHA_MINIMA}
            autoComplete="new-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
          <p className={estilos.ajuda}>Pelo menos {SENHA_MINIMA} caracteres.</p>
        </div>
      </div>

      <div className={estilos.acoes}>
        <button type="submit" className={estilos.primario} disabled={enviando}>
          {enviando && <Girando />}
          {enviando ? 'Criando conta...' : 'Continuar'}
        </button>
        {/* Sem `?proximo=/cadastro`: destinoAposLogin() só devolve rotas de
            /painel, e /painel já manda de volta pra cá quem ainda não tem
            loja — ou pro painel de quem tem. */}
        <Link href="/entrar" className={estilos.secundario}>
          Já tenho conta
        </Link>
      </div>
    </form>
  );
}

/* ==========================================================================
   2. Loja
   ========================================================================== */

export function PassoLoja({
  inicial,
  onPronto,
}: {
  inicial: { nome: string; categoria: string; whatsapp: string };
  onPronto: (loja: { slug: string; nome: string }) => void;
}) {
  const [nome, setNome] = useState(inicial.nome);
  const [categoria, setCategoria] = useState(inicial.categoria);
  const [whatsapp, setWhatsapp] = useState(inicial.whatsapp);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const completo = nome.trim().length >= 2 && !!categoria && whatsapp.replace(/\D/g, '').length >= 10;

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      const resposta = await fetch('/api/onboarding/loja', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nome.trim(), categoria, whatsapp }),
      });
      if (!resposta.ok) {
        setErro(await erroDaResposta(resposta, 'Não foi possível salvar os dados da loja.'));
        return;
      }
      const corpo = (await resposta.json()) as { loja: { slug: string; nome: string } };
      onPronto(corpo.loja);
    } catch {
      setErro('Sem conexão com o servidor. Verifique a internet e tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={salvar} noValidate>
      <h1 className={estilos.titulo}>Conte-nos sobre sua loja</h1>
      <p className={estilos.legenda}>
        Três informações e sua loja já existe. O resto — logo, cores, cardápio — fica pro painel.
      </p>

      {erro && <p className={estilos.erro}>{erro}</p>}

      <div className={estilos.campos}>
        <div className={estilos.campo}>
          <label htmlFor="lojaNome">Nome da loja</label>
          <input
            id="lojaNome"
            type="text"
            required
            maxLength={60}
            autoComplete="organization"
            placeholder="Ex: Burger do Zé"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>

        <div className={estilos.dupla}>
          <div className={estilos.campo}>
            <label htmlFor="lojaCategoria">Categoria</label>
            <select
              id="lojaCategoria"
              required
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
            >
              <option value="" disabled>
                Selecione
              </option>
              {CATEGORIAS_LOJA.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className={estilos.campo}>
            <label htmlFor="lojaWhatsapp">WhatsApp</label>
            <input
              id="lojaWhatsapp"
              type="tel"
              required
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="(11) 99999-9999"
              value={whatsapp}
              onChange={(e) => setWhatsapp(formatarWhatsapp(e.target.value))}
            />
            <p className={estilos.ajuda}>É por onde seus pedidos vão chegar.</p>
          </div>
        </div>
      </div>

      <div className={estilos.acoes}>
        <button type="submit" className={estilos.primario} disabled={enviando || !completo}>
          {enviando && <Girando />}
          {enviando ? 'Salvando...' : 'Continuar'}
        </button>
      </div>
    </form>
  );
}

/* ==========================================================================
   3. Endereço
   ========================================================================== */

const TEMPO_LIMITE_CEP_MS = 6_000;

export function PassoEndereco({
  inicial,
  coordenadaInicial,
  onPronto,
}: {
  inicial: EnderecoLoja;
  coordenadaInicial?: Coordenada;
  onPronto: () => void;
}) {
  const [endereco, setEndereco] = useState<EnderecoLoja>(inicial);
  const [centro, setCentro] = useState<Coordenada | null>(coordenadaInicial ?? null);
  const [pin, setPin] = useState<Coordenada | null>(coordenadaInicial ?? null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [localizando, setLocalizando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  /* Guarda o último CEP consultado. Sem isso, apagar e redigitar o mesmo
     número — ou qualquer re-render — dispararia o ViaCEP de novo. A regra é
     uma consulta por CEP completo, não por tecla. */
  const cepConsultado = useRef(inicial.cep.replace(/\D/g, ''));
  const blocoMapa = useRef<HTMLDivElement>(null);

  const digitosCep = endereco.cep.replace(/\D/g, '');

  useEffect(() => {
    if (digitosCep.length !== 8 || digitosCep === cepConsultado.current) {
      // Apagar um dígito com a consulta em voo cancela a anterior (o cleanup
      // abaixo). Sem zerar aqui, o "Buscando endereço..." ficava na tela pra
      // sempre, porque o `finally` daquela consulta pertence a um efeito que
      // não roda mais.
      setBuscandoCep(false);
      return;
    }
    cepConsultado.current = digitosCep;

    const controlador = new AbortController();
    // Duas coisas abortam esta consulta: o tempo limite e a pessoa corrigir o
    // CEP antes da resposta. A primeira precisa avisar; a segunda, não. O
    // `signal.aborted` sozinho não separa as duas — daí a marca.
    let expirou = false;
    const temporizador = setTimeout(() => {
      expirou = true;
      controlador.abort();
    }, TEMPO_LIMITE_CEP_MS);
    setBuscandoCep(true);
    setAviso('');

    fetch(`https://viacep.com.br/ws/${digitosCep}/json/`, { signal: controlador.signal })
      .then((resposta) => (resposta.ok ? (resposta.json() as Promise<RespostaViaCep>) : null))
      .then((dados) => {
        // O ViaCEP responde 200 com {"erro":"true"} pra CEP inexistente.
        if (!dados || dados.erro) {
          setAviso('Não encontramos esse CEP. Preencha o endereço manualmente.');
          return;
        }
        // Só preenche o que veio: CEP de logradouro único não traz rua, e
        // sobrescrever com vazio apagaria o que a pessoa já tinha digitado.
        // A regra de "manter o atual quando o campo vier vazio" é a mesma do
        // checkout — daí reaproveitar `aplicarRespostaViaCep` em vez de
        // reescrevê-la aqui. Só os quatro campos que o ViaCEP conhece são
        // copiados de volta; número e complemento são da pessoa.
        setEndereco((atual) => {
          const preenchido = aplicarRespostaViaCep({ ...atual, complemento: null }, dados);
          return {
            ...atual,
            rua: preenchido.rua,
            bairro: preenchido.bairro,
            cidade: preenchido.cidade,
            uf: preenchido.uf,
          };
        });
      })
      .catch(() => {
        // Cancelamento por edição não é falha: acontece toda vez que a pessoa
        // corrige um dígito antes da resposta chegar. Avisar aqui seria
        // acusar erro de uma consulta que nós mesmos interrompemos.
        if (controlador.signal.aborted && !expirou) return;
        // Rede fora, tempo esgotado, ViaCEP caído: o cadastro NÃO trava.
        setAviso('Não conseguimos consultar o CEP agora. Preencha o endereço manualmente.');
      })
      .finally(() => {
        clearTimeout(temporizador);
        setBuscandoCep(false);
      });

    return () => {
      clearTimeout(temporizador);
      controlador.abort();
    };
  }, [digitosCep]);

  /**
   * No celular o mapa nasce abaixo da dobra: sem rolar até ele, a pessoa
   * clica em "Localizar", a tela não muda visivelmente, e tanto a
   * confirmação quanto o botão de confirmar ficam fora de vista. Rolar
   * também é o que dispara o `loading="lazy"` da imagem.
   *
   * Precisa ser efeito, e não uma chamada logo depois do `setCentro`: o
   * bloco do mapa só passa a existir no DOM quando `centro` deixa de ser
   * nulo, então antes do commit do React o ref ainda está vazio.
   */
  useEffect(() => {
    if (!centro) return;
    blocoMapa.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [centro]);

  /**
   * Qualquer edição invalida a localização já obtida: o pin no mapa passaria
   * a apontar pra um endereço que não é mais o que está escrito na tela.
   */
  function alterar(campo: keyof EnderecoLoja, valor: string) {
    setEndereco((atual) => ({ ...atual, [campo]: valor }));
    setCentro(null);
    setPin(null);
    setErro('');
  }

  const completo =
    digitosCep.length === 8 &&
    endereco.rua.trim().length >= 3 &&
    endereco.numero.trim().length >= 1 &&
    endereco.bairro.trim().length >= 2 &&
    endereco.cidade.trim().length >= 2 &&
    /^[A-Za-z]{2}$/.test(endereco.uf.trim());

  async function localizar() {
    setErro('');
    setLocalizando(true);
    try {
      const resposta = await fetch('/api/onboarding/endereco', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endereco: { ...endereco, uf: endereco.uf.toUpperCase() } }),
      });
      if (!resposta.ok) {
        setErro(
          await erroDaResposta(
            resposta,
            'Não conseguimos localizar esse endereço agora. Confira os dados e tente novamente.'
          )
        );
        return;
      }
      const corpo = (await resposta.json()) as { coordenadas: Coordenada };
      setCentro(corpo.coordenadas);
      setPin(corpo.coordenadas);
      setAviso('');
    } catch {
      setErro('Sem conexão com o servidor. Verifique a internet e tente de novo.');
    } finally {
      setLocalizando(false);
    }
  }

  async function confirmar() {
    if (!pin) return;
    setErro('');
    setConfirmando(true);
    try {
      const resposta = await fetch('/api/onboarding/concluir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: pin.latitude, longitude: pin.longitude }),
      });
      if (!resposta.ok) {
        setErro(await erroDaResposta(resposta, 'Não foi possível confirmar a localização.'));
        return;
      }
      onPronto();
    } catch {
      setErro('Sem conexão com o servidor. Verifique a internet e tente de novo.');
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <div>
      <h1 className={estilos.titulo}>Onde sua loja está localizada?</h1>
      <p className={estilos.legenda}>
        O endereço define de onde saem as entregas e onde seus clientes retiram os pedidos.
      </p>

      {erro && <p className={estilos.erro}>{erro}</p>}
      {aviso && !erro && <p className={estilos.aviso}>{aviso}</p>}

      <div className={estilos.campos}>
        <div className={estilos.dupla}>
          <div className={estilos.campo}>
            <label htmlFor="endCep">CEP</label>
            <input
              id="endCep"
              type="text"
              required
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="00000-000"
              value={endereco.cep}
              onChange={(e) => alterar('cep', formatarCep(e.target.value))}
            />
            <p className={estilos.ajuda}>
              {buscandoCep ? 'Buscando endereço...' : 'Preenchemos o resto pra você.'}
            </p>
          </div>

          <div className={estilos.campo}>
            <label htmlFor="endNumero">Número</label>
            <input
              id="endNumero"
              type="text"
              required
              maxLength={20}
              value={endereco.numero}
              onChange={(e) => alterar('numero', e.target.value)}
            />
          </div>
        </div>

        <div className={estilos.campo}>
          <label htmlFor="endRua">Rua</label>
          <input
            id="endRua"
            type="text"
            required
            maxLength={120}
            autoComplete="address-line1"
            value={endereco.rua}
            onChange={(e) => alterar('rua', e.target.value)}
          />
        </div>

        <div className={estilos.campo}>
          <label htmlFor="endBairro">Bairro</label>
          <input
            id="endBairro"
            type="text"
            required
            maxLength={80}
            value={endereco.bairro}
            onChange={(e) => alterar('bairro', e.target.value)}
          />
        </div>

        <div className={estilos.dupla}>
          <div className={estilos.campo}>
            <label htmlFor="endCidade">Cidade</label>
            <input
              id="endCidade"
              type="text"
              required
              maxLength={80}
              value={endereco.cidade}
              onChange={(e) => alterar('cidade', e.target.value)}
            />
          </div>

          <div className={estilos.campo}>
            <label htmlFor="endUf">UF</label>
            <input
              id="endUf"
              type="text"
              required
              maxLength={2}
              placeholder="SP"
              value={endereco.uf}
              onChange={(e) => alterar('uf', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            />
          </div>
        </div>

        <div className={estilos.campo}>
          <label htmlFor="endComplemento">
            Complemento <span className={estilos.opcional}>(opcional)</span>
          </label>
          <input
            id="endComplemento"
            type="text"
            maxLength={120}
            placeholder="Sala, galpão, ponto de referência"
            value={endereco.complemento}
            onChange={(e) => alterar('complemento', e.target.value)}
          />
        </div>
      </div>

      {centro && pin && (
        <div className={estilos.mapaBloco} ref={blocoMapa}>
          <p className={estilos.sucesso}>Endereço encontrado com sucesso.</p>
          <MapaLocalizacao centro={centro} pin={pin} onMoverPin={setPin} />
          <p className={estilos.ajuda} style={{ marginTop: 8 }}>
            Não ficou exato? Toque no mapa para ajustar o ponto.
          </p>
        </div>
      )}

      <div className={estilos.acoes}>
        {centro ? (
          <button
            type="button"
            className={estilos.primario}
            onClick={confirmar}
            disabled={confirmando}
          >
            {confirmando && <Girando />}
            {confirmando ? 'Confirmando...' : 'Confirmar localização'}
          </button>
        ) : (
          <button
            type="button"
            className={estilos.primario}
            onClick={localizar}
            disabled={localizando || !completo}
          >
            {localizando && <Girando />}
            {localizando ? 'Localizando...' : 'Localizar endereço'}
          </button>
        )}
      </div>
    </div>
  );
}

/* ==========================================================================
   4. Finalizar
   ========================================================================== */

const CONFIGURAR_DEPOIS = [
  'Formas de pagamento',
  'Entrega e taxas',
  'Logo e cores',
  'Descrição da loja',
  'Redes sociais',
  'Cardápio',
];

export function PassoFinal({ slug, nomeLoja }: { slug: string; nomeLoja: string }) {
  return (
    <div>
      <h1 className={estilos.titulo}>Sua loja está quase pronta</h1>
      <p className={estilos.legenda}>
        {nomeLoja ? `${nomeLoja} já existe na FlouFood.` : 'Sua loja já existe na FlouFood.'} Do
        painel você publica o cardápio e começa a receber pedidos.
      </p>

      <ul className={estilos.checklist}>
        {['Conta criada', 'Loja configurada', 'Endereço salvo'].map((item) => (
          <li key={item}>
            <span className={estilos.checkIcone}>
              <IconeCheck />
            </span>
            {item}
          </li>
        ))}
      </ul>

      <div className={estilos.depois}>
        <p className={estilos.depoisTitulo}>Você poderá configurar depois:</p>
        <ul className={estilos.depoisLista}>
          {CONFIGURAR_DEPOIS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <div className={estilos.acoes}>
        <Link href={`/painel/${slug}/inicio`} className={estilos.primario}>
          Ir para o painel
        </Link>
      </div>
    </div>
  );
}
