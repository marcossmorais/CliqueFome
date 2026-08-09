-- Configurações: separa "Permitir retirada" de "Permitir Delivery".
-- Sem isso, retirada não tinha um botão liga/desliga próprio na loja —
-- só existia via tipos_pedido por produto no catálogo.
alter table lojas add column retirada_ativa boolean not null default true;
