// Espelha exatamente o jsonb devolvido por pedido_por_token() em
// schema-pedidos.sql / schema-migracao-pedidos.sql. Não expõe telefone nem
// dono_id — a função já não devolve esses campos.
export type PedidoTracking = {
  numero: number;
  status: string;
  pagamento_status: string;
  tipo: string;
  cliente_nome: string;
  endereco: string | null;
  observacao: string | null;
  forma_pagamento: string | null;
  subtotal: number;
  total: number;
  delivery_fee_cents?: number;
  data_hora_agendada: string | null;
  origem: string;
  criado_em: string;
  confirmado_em: string | null;
  loja_nome: string;
  loja_slug: string;
  loja_cor: string | null;
  loja_whatsapp: string | null;
  itens: {
    nome: string;
    quantidade: number;
    preco_unitario: number;
    subtotal: number;
    observacao: string | null;
    opcoes: { grupo: string; nome: string; preco: number; quantidade: number }[];
  }[];
};

export const NOMES_STATUS: Record<string, string> = {
  pendente: 'Pendente — aguardando confirmação da loja',
  confirmado: 'Confirmado',
  em_preparo: 'Em preparo',
  pronto: 'Pronto',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

export const NOMES_PAGAMENTO: Record<string, string> = {
  pendente: 'Pagamento a receber pela loja',
  confirmado: 'Pagamento confirmado manualmente',
  estornado: 'Pagamento estornado',
};
