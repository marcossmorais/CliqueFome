export type LojaPublica = {
  id: string;
  slug: string;
  nome: string;
  logo_url: string | null;
  banner_url: string | null;
  cor_marca: string;
  cidade: string | null;
  sobre: string | null;
  whatsapp_numero: string | null;
  tempo_preparo_min: number | null;
  tempo_preparo_max: number | null;
  pedido_minimo: number;
  recebendo_encomendas: boolean;
  retirada_ativa: boolean;
  nicho: string | null;
};

export type CategoriaPublica = { id: string; nome: string; emoji: string | null; icone: string | null; ordem: number };

export type ComplementoPublico = {
  id: string;
  nome: string;
  preco: number;
  /** Quantas vezes esta opção pode repetir numa lista 'varias_repetir'.
   * null = sem teto próprio. */
  qtd_max: number | null;
  imagem_url: string | null;
  ativo: boolean;
  sugestao_carrinho: boolean;
  ordem: number;
};

export type GrupoPublico = {
  id: string;
  nome: string;
  qtd_min: number;
  qtd_max: number;
  tipo_selecao: 'uma' | 'varias' | 'varias_repetir';
  modo_preco: 'soma' | 'media' | 'maior' | 'menor';
  /** Em quais tipos de pedido a lista aparece. Vazio = todos. */
  tipos_pedido: string[];
  ordem: number;
  complementos: ComplementoPublico[];
};

export type ProdutoPublico = {
  id: string;
  categoria_id: string | null;
  nome: string;
  descricao: string | null;
  preco: number;
  preco_promocional: number | null;
  imagem_url: string | null;
  etiqueta: string | null;
  destaque: boolean;
  esconder_observacao: boolean;
  esconder_quantidade: boolean;
  ativo: boolean;
  sugestao_carrinho: 'bebida' | 'acompanhamento' | null;
  /** Em quais tipos de pedido o produto aparece. Vazio = todos. */
  tipos_pedido: string[];
  ordem: number;
  /** Já achatado e ordenado no servidor — o HTML antigo fazia isso no
   * cliente a cada render. */
  grupos: GrupoPublico[];
};

export type ModoPreco = GrupoPublico['modo_preco'];

/** Uma opção escolhida dentro de um grupo, já com o nome pra exibição.
 *
 * `modoPreco` viaja junto com a escolha de propósito: o carrinho é
 * persistido em localStorage e recalculado sem o catálogo à mão, então sem
 * este campo ele não teria como saber que aquela lista era "média" e
 * acabaria somando. Era exatamente esse o bug: modal mostrava R$ 45 e o
 * carrinho cobrava R$ 90. */
export type EscolhaComplemento = {
  complementoId: string;
  grupoId: string;
  grupoNome: string;
  nome: string;
  preco: number;
  /** Quantas vezes a opção foi escolhida. Só passa de 1 em lista
   * 'varias_repetir' (ex: 2x bacon). */
  quantidade: number;
  modoPreco: ModoPreco;
};

export type LinhaCarrinho = {
  /** Identidade da linha: produto + complementos + observação. Duas
   * escolhas diferentes do mesmo produto viram linhas separadas. */
  lineId: string;
  produtoId: string;
  nome: string;
  precoUnit: number;
  complementos: EscolhaComplemento[];
  observacao: string;
  qty: number;
};

export function formatBRL(v: number) {
  return 'R$ ' + Number(v).toFixed(2).replace('.', ',');
}

export function formatarTelefone(valor: string) {
  const digitos = valor.replace(/\D/g, '').slice(0, 11);
  if (digitos.length <= 2) return digitos;
  if (digitos.length <= 7) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
}

/**
 * O produto/lista aparece neste tipo de pedido? Array vazio = sem
 * restrição, que é o padrão do banco. O cardápio respeita a restrição ao
 * canal de retirada.
 */
export function apareceNoTipo(tipos: string[] | null | undefined, tipoPedido: string) {
  return !tipos || tipos.length === 0 || tipos.includes(tipoPedido);
}

/**
 * Encomenda precisa ser habilitada deliberadamente no produto. Para os
 * demais canais, o array vazio continua significando "todos", preservando
 * os catálogos existentes.
 */
export function produtoApareceNoTipo(tipos: string[] | null | undefined, tipoPedido: string) {
  if (tipoPedido === 'encomenda') return !!tipos?.includes('encomenda');
  return apareceNoTipo(tipos, tipoPedido);
}

/** Preço que vale na venda — promocional tem precedência. */
export function precoBase(p: ProdutoPublico) {
  return p.preco_promocional != null ? Number(p.preco_promocional) : Number(p.preco);
}

/**
 * Menor preço possível do produto: base + o mínimo obrigatório de cada
 * grupo. É o que vira "A partir de R$ X" no card.
 */
export function precoMinimo(p: ProdutoPublico) {
  let extra = 0;
  p.grupos.forEach((g) => {
    if (g.qtd_min > 0 && g.complementos.length > 0) {
      const maisBarato = Math.min(...g.complementos.map((c) => Number(c.preco)));
      extra += maisBarato * g.qtd_min;
    }
  });
  return precoBase(p) + extra;
}

/**
 * Aplica o modo de preço de uma lista sobre os preços escolhidos nela.
 *
 * Esta é a ÚNICA implementação da regra no front — modal, carrinho e
 * mensagem do WhatsApp passam por aqui. Espelha a conta que criar_pedido()
 * faz no banco; o valor daqui é só pra exibição, quem cobra é o servidor.
 * Quando as duas divergiam, o cliente via R$ 45 no modal e R$ 90 no
 * carrinho.
 */
export function combinarPrecos(modo: ModoPreco, precos: number[]) {
  if (precos.length === 0) return 0;
  switch (modo) {
    case 'media':
      return precos.reduce((s, x) => s + x, 0) / precos.length;
    case 'maior':
      return Math.max(...precos);
    case 'menor':
      return Math.min(...precos);
    default:
      return precos.reduce((s, x) => s + x, 0);
  }
}

/**
 * Cada opção entra na conta como `preço × quantidade` — um elemento por
 * opção distinta, não um por repetição. É exatamente o que
 * `array_agg(c.preco * quantidade)` faz em criar_pedido(); manter a mesma
 * forma é o que garante que os dois lados cheguem ao mesmo centavo.
 */
export function extraDoGrupo(g: GrupoPublico, escolhidos: { preco: number; quantidade: number }[]) {
  return combinarPrecos(
    g.modo_preco,
    escolhidos.map((c) => Number(c.preco) * c.quantidade)
  );
}

/**
 * Extra de uma linha do carrinho: agrupa as escolhas por lista e aplica o
 * modo de cada uma. Sem o agrupamento, uma lista "média" seria somada.
 */
export function extraDaLinha(linha: LinhaCarrinho) {
  const porGrupo = new Map<string, { modo: ModoPreco; precos: number[] }>();
  linha.complementos.forEach((c) => {
    const preco = Number(c.preco) * (c.quantidade || 1);
    const atual = porGrupo.get(c.grupoId);
    // Escolha gravada antes destes campos existirem cai em 'soma' e
    // quantidade 1, que era o comportamento antigo — carrinho já salvo no
    // navegador de alguém continua somando certo.
    if (atual) atual.precos.push(preco);
    else porGrupo.set(c.grupoId, { modo: c.modoPreco || 'soma', precos: [preco] });
  });

  let extra = 0;
  porGrupo.forEach(({ modo, precos }) => {
    extra += combinarPrecos(modo, precos);
  });
  return extra;
}

export function subtotalLinha(linha: LinhaCarrinho) {
  return (linha.precoUnit + extraDaLinha(linha)) * linha.qty;
}

/** Por que uma linha salva não sobreviveu à conferência com o catálogo. */
export type AvisoCarrinho = {
  nome: string;
  motivo: 'removido' | 'pausado' | 'opcao-indisponivel' | 'reprecificado';
};

/**
 * O carrinho vem do localStorage, que é editável pelo usuário e sobrevive
 * a deploys. `JSON.parse` aceita `{}` de bom grado, e aí o primeiro
 * `.reduce` derruba a página inteira. Esta checagem é a fronteira entre
 * "dado salvo" e "dado confiável".
 */
export function ehCarrinhoValido(v: unknown): v is LinhaCarrinho[] {
  if (!Array.isArray(v)) return false;
  return v.every((l) => {
    if (!l || typeof l !== 'object') return false;
    const x = l as Record<string, unknown>;
    return (
      typeof x.lineId === 'string' &&
      typeof x.produtoId === 'string' &&
      typeof x.nome === 'string' &&
      typeof x.precoUnit === 'number' &&
      Number.isFinite(x.precoUnit) &&
      typeof x.qty === 'number' &&
      Number.isFinite(x.qty) &&
      x.qty > 0 &&
      typeof x.observacao === 'string' &&
      Array.isArray(x.complementos) &&
      x.complementos.every((c) => {
        if (!c || typeof c !== 'object') return false;
        const y = c as Record<string, unknown>;
        return (
          typeof y.complementoId === 'string' &&
          typeof y.grupoId === 'string' &&
          typeof y.preco === 'number' &&
          Number.isFinite(y.preco)
        );
      })
    );
  });
}

/**
 * Confere o carrinho salvo contra o catálogo que acabou de chegar do banco.
 *
 * O carrinho guarda um retrato do produto no momento em que foi adicionado.
 * Entre aquele instante e o checkout a loja pode ter apagado o item,
 * pausado, mudado o preço ou desativado uma opção — e sem esta conferência
 * o cliente fecha o pedido em cima de dado velho. Linha que não dá mais
 * pra pedir sai do carrinho e vira aviso; preço que mudou é atualizado
 * (com aviso, pra pessoa não ser surpreendida no total).
 */
export function reconciliarCarrinho(
  linhas: LinhaCarrinho[],
  produtos: ProdutoPublico[]
): { linhas: LinhaCarrinho[]; avisos: AvisoCarrinho[] } {
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const avisos: AvisoCarrinho[] = [];
  const validas: LinhaCarrinho[] = [];

  linhas.forEach((l) => {
    const p = porId.get(l.produtoId);
    if (!p) {
      avisos.push({ nome: l.nome, motivo: 'removido' });
      return;
    }
    if (!p.ativo) {
      avisos.push({ nome: p.nome, motivo: 'pausado' });
      return;
    }

    // `grupos` já chega filtrado do servidor (só lista e opção ativas), então
    // "não está neste mapa" cobre tanto opção apagada quanto pausada.
    // A quantidade não vem do catálogo: ela é escolha do cliente, e é
    // reaproveitada da linha salva logo abaixo.
    const atuais = new Map<string, Omit<EscolhaComplemento, 'quantidade'>>();
    p.grupos.forEach((g) =>
      g.complementos.forEach((c) =>
        atuais.set(c.id, {
          complementoId: c.id,
          grupoId: g.id,
          grupoNome: g.nome,
          nome: c.nome,
          preco: Number(c.preco),
          modoPreco: g.modo_preco,
        })
      )
    );

    if (l.complementos.some((c) => !atuais.has(c.complementoId))) {
      avisos.push({ nome: p.nome, motivo: 'opcao-indisponivel' });
      return;
    }

    // Preserva a quantidade escolhida; o resto (nome, preço, modo) vem do
    // catálogo atual.
    const complementos = l.complementos.map((c) => ({
      ...atuais.get(c.complementoId)!,
      quantidade: c.quantidade || 1,
    }));
    const precoUnit = precoBase(p);
    const mudou =
      precoUnit !== l.precoUnit || complementos.some((c, i) => c.preco !== l.complementos[i].preco);
    if (mudou) avisos.push({ nome: p.nome, motivo: 'reprecificado' });

    validas.push({ ...l, nome: p.nome, precoUnit, complementos });
  });

  return { linhas: validas, avisos };
}

export function regraTextoGrupo(g: GrupoPublico) {
  if (g.qtd_min > 0 && g.qtd_max === g.qtd_min) return `Obrigatório · escolha ${g.qtd_min}`;
  if (g.qtd_min > 0) return `Obrigatório · escolha até ${g.qtd_max}`;
  return `Opcional · escolha até ${g.qtd_max}`;
}

/**
 * O item aparece hoje? Respeita dias da semana e o "ativo" (que vira
 * "Esgotado" na vitrine, e não sumiço).
 */
export function disponivelHoje(diasSemana: number[] | null, agora: Date) {
  if (!diasSemana || diasSemana.length === 0) return true;
  return diasSemana.includes(agora.getDay());
}
