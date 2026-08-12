import 'server-only';

import { criarClientPrivilegiado } from '@/lib/pedidos/servidor';
import { logger } from '@/lib/observabilidade/logger';
import { ErroApiDelivery } from './operacao-api';
import { recusaDeAcessoDoEntregador } from './erros-entregador';
import type { EntregadorDelivery } from './tipos-operacao';

export function validarEmail(valor: unknown) {
  if (typeof valor !== 'string') throw new ErroApiDelivery('Email inválido.');
  const email = valor.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ErroApiDelivery('Email inválido.');
  }
  return email;
}

export function validarSenhaInicial(valor: unknown) {
  if (typeof valor !== 'string' || valor.length < 8 || valor.length > 72) {
    throw new ErroApiDelivery('A senha precisa ter entre 8 e 72 caracteres.');
  }
  return valor;
}

export async function criarEntregadorComAuth({
  storeId,
  name,
  phone,
  email,
  password,
}: {
  storeId: string;
  name: string;
  phone: string;
  email: string;
  password: string;
}) {
  const sb = criarClientPrivilegiado();
  const { data: authData, error: erroAuth } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { papel: 'delivery_driver' },
  });

  if (erroAuth || !authData.user) {
    // Sem este log o motivo se perdia dos dois lados: mensagem genérica na
    // tela e nada no servidor. O email fica de fora do log de propósito.
    logger.error(
      { codigo: erroAuth?.code, status: erroAuth?.status, storeId },
      'Supabase Auth recusou a criação do acesso do entregador'
    );

    const recusa = recusaDeAcessoDoEntregador(erroAuth);
    throw new ErroApiDelivery(recusa.mensagem, recusa.status);
  }

  const authUserId = authData.user.id;
  const { data: entregador, error: erroEntregador } = await sb
    .from('delivery_drivers')
    .insert({
      store_id: storeId,
      auth_user_id: authUserId,
      name,
      phone,
      active: true,
      available: false,
    })
    .select('id, store_id, name, phone, active, available, created_at, updated_at')
    .single();

  if (erroEntregador || !entregador) {
    // Compensação: não deixa um usuário Auth órfão se a gravação da relação
    // com a loja falhar. A senha nunca passa pelo banco da aplicação.
    const { error: erroLimpeza } = await sb.auth.admin.deleteUser(authUserId);
    if (erroLimpeza) {
      logger.error(
        { codigo: erroLimpeza.code },
        'Falha ao remover usuário Auth órfão após erro no cadastro de entregador'
      );
    }
    throw new ErroApiDelivery('Não foi possível cadastrar o entregador.', 500);
  }

  return entregador as EntregadorDelivery;
}

export async function resetarSenhaEntregador(authUserId: string, password: string) {
  const sb = criarClientPrivilegiado();
  const { error } = await sb.auth.admin.updateUserById(authUserId, { password });
  if (error) throw new ErroApiDelivery('Não foi possível resetar o acesso.', 500);
}
