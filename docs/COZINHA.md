# Cozinha — pedido detalhado

## Escopo

A rota **/admin/kds** mostra a fila operacional da cozinha em três estados:

- **A receber:** pedidos já confirmados pela Gestão;
- **Em preparo:** pedidos recebidos pela cozinha;
- **Prontos para encaminhamento:** pedidos prontos e a instrução do próximo
  destino.

O detalhe do ticket contém cliente, horário, canal, tipo, agendamento, itens,
complementos e observações. Preço, pagamento e cancelamento permanecem fora da
área da cozinha.

## Fluxo

    confirmado -- Receber pedido --> em_preparo
    em_preparo -- Pedido pronto --> pronto

Marcar como pronto não grava **saiu_entrega** nem **concluido**. A expedição ou
o atendimento ainda precisa confirmar que o pedido efetivamente saiu, foi
retirado ou foi servido.

## Destino operacional

**origem** é apenas o canal de venda (site, Instagram, telefone, outro).
O destino é derivado de **tipo** e, para encomendas, do endereço:

- delivery: entrega;
- retirada: retirada local;
- balcão: balcão;
- mesa: salão/mesa;
- encomenda com endereço: entrega;
- encomenda sem endereço: retirada local.

## Dependência de integração

A feature não usa o UPDATE direto atual da tabela pedidos. Ela chama:

    transicionar_pedido(
      p_pedido_id,
      p_status_esperado,
      p_novo_status
    )

Essa RPC deve vir da remediação de segurança e precisa validar owner/admin,
tenant, status esperado e aresta da máquina de estados sob lock/CAS. Se a
assinatura final for diferente, somente **lib/cozinha/acoes.ts** deve ser
adaptado.

O retorno versionado esperado é:

    { "ok": true, "status": "em_preparo" }

ou:

    { "ok": true, "status": "pronto" }

Retorno nulo, booleano, array ou status diferente é tratado como falha.

Nenhuma migration existente foi alterada por esta branch.

No modelo atual, a rota continua restrita ao dono da loja e ao superadmin.
Ainda não existe papel de funcionário/cozinheiro; não compartilhar a conta do
dono para contornar essa ausência.

## Ordem de ativação

Não habilitar o item do menu antes de confirmar em staging:

1. migrations de pedidos aplicadas, incluindo origem e agendamento;
2. RPC transicionar_pedido instalada com o contrato acima;
3. smoke autenticado como owner e superadmin;
4. somente então marcar **kds** como pronta no menu.

A leitura pagina a fila e os itens até o fim. Acima de 1.000 pedidos
operacionais ou 5.000 itens em um lote, a tela falha explicitamente em vez de
mostrar uma fila parcial.

Antes do merge final, a remediação deve centralizar a regra
**pedidoEhEntrega(tipo, endereco)** entre Cozinha, Gestão e banco. A loja
também precisa fornecer seu timezone para exibir encomendas, e a migration
deve registrar **pronto_em** para ordenar a fila pronta pelo momento real da
transição.

## Validação executada

    node --test tests/cozinha/fluxo.test.mjs
    npx tsc --noEmit --incremental false
    npx eslint "app/admin/(painel)/kds/**/*.{ts,tsx}" "lib/cozinha/**/*.ts" "tests/cozinha/**/*.mjs" "lib/menu.ts"
    node node_modules/next/dist/bin/next build --webpack

O lint completo do baseline ainda falha em **app/page.tsx** e
**app/PlanosSecao.tsx**; os arquivos desta feature passam sem erros.
