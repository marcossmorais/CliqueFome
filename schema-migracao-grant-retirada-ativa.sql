-- FIX URGENTE — cardápio público em produção retornando 500
-- "permission denied for table lojas".
--
-- Causa: retirada_ativa (nova coluna) é selecionada por app/[loja]/page.tsx
-- mas nunca foi incluída no grant de coluna a coluna que
-- schema-migracao-seguranca.sql criou pro papel anon (ela é anterior à
-- coluna existir). Sem o grant, qualquer select que peça essa coluna
-- falha por inteiro — não só o campo, a request toda.
--
-- Rodar imediatamente no SQL Editor do Supabase.

grant select (retirada_ativa) on lojas to anon;
