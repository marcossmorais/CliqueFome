/**
 * Regras do cadastro da loja — puras, sem Supabase e sem `server-only`.
 *
 * Ficam separadas de propósito: a validação do navegador (que decide quando
 * o botão libera) e a do servidor (que é a que vale) precisam concordar
 * exatamente, e é essa parte que os testes travam. Quem chama do servidor é
 * `lib/onboarding/servidor.ts`; quem chama do navegador são os passos de
 * `app/cadastro/`.
 */

/**
 * Zero imports de propósito. `tests/cadastro-loja.test.mjs` roda no node:test
 * puro, que apaga tipos mas não resolve alias do tsconfig nem extensão
 * omitida — qualquer import de VALOR aqui derrubaria a suíte. Como estas
 * regras são justamente a parte que os testes travam, o módulo se mantém
 * autossuficiente.
 */

export class ErroCadastro extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErroCadastro';
  }
}

/**
 * Segmentos do primeiro nível da URL que já pertencem à aplicação.
 *
 * `app/[loja]/` é um catch-all na raiz: uma loja com slug "entrar" ficaria
 * eternamente inacessível (a rota estática vence) e, pior, o dono levaria um
 * link quebrado achando que o cardápio existe. Reservar é mais barato do que
 * descobrir depois.
 */
const SLUGS_RESERVADOS = new Set([
  'api',
  'cadastro',
  'cookies',
  'cardapio',
  'criar-loja',
  'demo',
  'entrar',
  'entregador',
  'favicon',
  'icon',
  'painel',
  'pedido',
  'privacidade',
  'public',
  'robots',
  'sitemap',
  'superadmin',
  'termos',
]);

const LIMITE_NOME = 60;
const LIMITE_SLUG = 40;

function limpar(valor: unknown) {
  return String(valor ?? '').trim().replace(/\s+/g, ' ');
}

/** Remove acentos sem depender de `unaccent`/locale. */
function semAcento(valor: string) {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function validarNomeLoja(valor: unknown) {
  const nome = limpar(valor);
  if (nome.length < 2 || nome.length > LIMITE_NOME) {
    throw new ErroCadastro('O nome da loja precisa ter entre 2 e 60 caracteres.');
  }
  return nome;
}

/**
 * Categorias oferecidas no cadastro E em Configurações → Minha loja.
 *
 * Lista única: enquanto cada tela tinha a sua, uma loja cadastrada como
 * "Marmitaria" abria a configuração num `<select>` que não continha esse
 * valor — e o navegador seleciona a primeira opção quando o valor não existe,
 * então salvar sem tocar no campo trocava a categoria sem avisar.
 *
 * Grava em `lojas.nicho`, que é texto livre. `gruposParaNicho()` (presets do
 * catálogo) casa por palavra normalizada, então acrescentar item aqui não
 * quebra os presets.
 */
export const CATEGORIAS_LOJA = [
  'Hamburgueria',
  'Pizzaria',
  'Açaiteria',
  'Restaurante',
  'Marmitaria',
  'Doceria',
  'Lanchonete',
  'Outro',
] as const;

export type CategoriaLoja = (typeof CATEGORIAS_LOJA)[number];

export function validarCategoria(valor: unknown): CategoriaLoja {
  if (typeof valor !== 'string' || !(CATEGORIAS_LOJA as readonly string[]).includes(valor)) {
    throw new ErroCadastro('Escolha a categoria da loja.');
  }
  return valor as CategoriaLoja;
}

/**
 * WhatsApp no formato que `wa.me` aceita: 55 + DDD + número, só dígitos.
 *
 * O cardápio público monta `https://wa.me/${whatsapp_numero.replace(/\D/g,'')}`
 * direto — sem o 55 o link abre uma conversa vazia. Normalizar na entrada
 * evita que a loja descubra isso pelo primeiro cliente que não conseguiu
 * falar com ela.
 */
export function normalizarWhatsapp(valor: unknown) {
  let digitos = String(valor ?? '').replace(/\D/g, '');
  if (digitos.startsWith('55') && digitos.length > 11) digitos = digitos.slice(2);
  if (digitos.length !== 10 && digitos.length !== 11) {
    throw new ErroCadastro('Informe o WhatsApp com DDD.');
  }
  const ddd = Number(digitos.slice(0, 2));
  if (ddd < 11 || ddd > 99) throw new ErroCadastro('DDD inválido.');
  // Celular no Brasil tem 9 na frente; fixo de 8 dígitos nunca começa com 9.
  if (digitos.length === 11 && digitos[2] !== '9') {
    throw new ErroCadastro('Informe um número de celular válido.');
  }
  return `55${digitos}`;
}

/** Máscara de exibição: (11) 99999-9999. Aceita o número já com 55. */
export function formatarWhatsapp(valor: string) {
  let digitos = valor.replace(/\D/g, '');
  if (digitos.startsWith('55') && digitos.length > 11) digitos = digitos.slice(2);
  digitos = digitos.slice(0, 11);
  if (digitos.length <= 2) return digitos;
  const corte = digitos.length > 10 ? 7 : 6;
  if (digitos.length <= corte) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, corte)}-${digitos.slice(corte)}`;
}

/**
 * Slug base a partir do nome. A unicidade NÃO é resolvida aqui — depende do
 * banco, e quem sufixa é `reservarSlug()` no servidor.
 */
export function slugDoNome(nome: string) {
  const base = semAcento(nome)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, LIMITE_SLUG)
    .replace(/-+$/g, '');
  // Nome só de emoji/pontuação zera a base; 'loja' mantém o slug válido e o
  // sufixo numérico do servidor cuida do resto.
  return base || 'loja';
}

export function slugReservado(slug: string) {
  return SLUGS_RESERVADOS.has(slug);
}

export type EtapaCadastro = 'ACCOUNT' | 'STORE' | 'ADDRESS' | 'DONE';

export const ETAPAS: { chave: EtapaCadastro; titulo: string }[] = [
  { chave: 'ACCOUNT', titulo: 'Conta' },
  { chave: 'STORE', titulo: 'Loja' },
  { chave: 'ADDRESS', titulo: 'Endereço' },
  { chave: 'DONE', titulo: 'Finalizar' },
];

export function indiceEtapa(etapa: EtapaCadastro) {
  return ETAPAS.findIndex((item) => item.chave === etapa);
}

/** Etapa vinda do banco (`lojas.onboarding_etapa`), com fallback seguro. */
export function etapaDaLoja(valor: unknown): EtapaCadastro {
  return valor === 'ADDRESS' || valor === 'STORE' ? valor : 'DONE';
}

/**
 * Em que passo o cadastro retoma.
 *
 * É a regra inteira do fluxo, e mora aqui — pura — porque ela precisa valer
 * igual em três lugares: a página do cadastro, a rota `/painel` (que decide
 * entre mandar pro painel ou de volta pro cadastro) e o layout do painel (que
 * barra quem ainda não terminou). Espalhada em `if` por esses três arquivos,
 * bastava um ficar pra trás pra existir um jeito de entrar no painel sem
 * endereço.
 *
 * `loja` é null quando a conta ainda não tem loja nenhuma.
 */
export function resolverEtapa(entrada: {
  temSessao: boolean;
  loja: { onboarding_etapa?: unknown } | null;
}): EtapaCadastro {
  if (!entrada.temSessao) return 'ACCOUNT';
  if (!entrada.loja) return 'STORE';
  return etapaDaLoja(entrada.loja.onboarding_etapa);
}

export const SENHA_MINIMA = 8;

export function validarSenha(valor: unknown) {
  const senha = String(valor ?? '');
  if (senha.length < SENHA_MINIMA) {
    throw new ErroCadastro(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
  }
  return senha;
}

export function validarEmail(valor: unknown) {
  const email = String(valor ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 160) {
    throw new ErroCadastro('Informe um e-mail válido.');
  }
  return email;
}

export function validarNomePessoa(valor: unknown) {
  const nome = limpar(valor);
  if (nome.length < 2 || nome.length > 80) {
    throw new ErroCadastro('Informe seu nome.');
  }
  return nome;
}
