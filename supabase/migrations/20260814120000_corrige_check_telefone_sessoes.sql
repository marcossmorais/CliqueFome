-- A migration inicial usou `\\+` dentro de uma string SQL comum. Com
-- standard_conforming_strings ativo, o regex passou a procurar uma barra
-- literal em vez do sinal de mais e rejeitou todo telefone E.164 válido.

begin;

alter table public.sessoes_clientes
  drop constraint if exists sessoes_clientes_telefone_normalizado_check;

alter table public.sessoes_clientes
  add constraint sessoes_clientes_telefone_normalizado_check
  check (telefone_normalizado ~ '^[+]55[0-9]{10,11}$');

commit;
