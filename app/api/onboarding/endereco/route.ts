import { logger } from '@/lib/observabilidade/logger';
import { criarClientPrivilegiado } from '@/lib/pedidos/servidor';
import {
  ErroEnderecoDelivery,
  montarEnderecoCompleto,
  validarEnderecoDelivery,
} from '@/lib/delivery/endereco';
import { ErroGeoapify, geocodificarEndereco } from '@/lib/delivery/geoapify';
import {
  autorizarCadastro,
  ErroCadastroApi,
  lerCorpo,
  limitarCadastro,
  lojaDoUsuario,
  respostaDeErro,
  respostaJson,
} from '@/lib/onboarding/servidor';

export const runtime = 'nodejs';

const ROTA = '/api/onboarding/endereco';

/**
 * Etapa 3 do cadastro: endereço da loja e a ÚNICA chamada ao Geoapify.
 *
 * O botão "Localizar endereço" bate aqui. Não existe geocodificação enquanto
 * a pessoa digita — seria uma chamada paga por tecla, e o resultado de um
 * endereço pela metade não serve pra nada. O CEP é resolvido no navegador
 * pelo ViaCEP, que é gratuito e não expõe chave nenhuma.
 *
 * As coordenadas voltam pro navegador só pra desenhar o mapa de conferência.
 * Quem as grava é o servidor, aqui, a partir do endereço que ele mesmo
 * validou — o cliente nunca manda latitude na etapa de localizar.
 */
export async function POST(request: Request) {
  try {
    const userId = await autorizarCadastro();
    // Cada tentativa consome uma requisição paga no Geoapify.
    await limitarCadastro(userId, 'endereco', 12);

    const loja = await lojaDoUsuario(userId);
    if (!loja) throw new ErroCadastroApi('Cadastre os dados da loja antes do endereço.', 409);
    if (loja.onboarding_etapa === 'DONE') {
      throw new ErroCadastroApi('Esta loja já concluiu o cadastro.', 409);
    }

    const corpo = await lerCorpo(request);
    const endereco = validarEnderecoDelivery(corpo.endereco);
    const enderecoFormatado = montarEnderecoCompleto(endereco);
    const coordenadas = await geocodificarEndereco(endereco);

    const campos = {
      origin_postal_code: endereco.cep,
      origin_street: endereco.rua,
      origin_number: endereco.numero,
      origin_neighborhood: endereco.bairro,
      origin_city: endereco.cidade,
      origin_state: endereco.uf,
      origin_complement: endereco.complemento,
      origin_latitude: coordenadas.latitude,
      origin_longitude: coordenadas.longitude,
    };

    // UPDATE quando a linha existe, INSERT quando não — nunca `upsert`. O
    // PostgREST traduz upsert pra `on conflict do update` e o Postgres avalia
    // as check constraints na tupla PROPOSTA, não na final; a linha nasceria
    // sem taxa e bateria em store_delivery_settings_single_fee_check.
    //
    // `enabled` fica de fora: entregas continuam desligadas até a loja
    // configurar taxa na área de Delivery. O cadastro só deixa a origem
    // pronta pra quando esse dia chegar.
    const sb = criarClientPrivilegiado();
    const existente = await sb
      .from('store_delivery_settings')
      .select('store_id')
      .eq('store_id', loja.id)
      .maybeSingle();
    if (existente.error) throw existente.error;

    let { error } = existente.data
      ? await sb.from('store_delivery_settings').update(campos).eq('store_id', loja.id)
      : await sb.from('store_delivery_settings').insert({ store_id: loja.id, ...campos });
    // 23505 = outra chamada criou a linha entre o select e o insert.
    if (error?.code === '23505') {
      ({ error } = await sb.from('store_delivery_settings').update(campos).eq('store_id', loja.id));
    }
    if (error) throw error;

    // A cidade aparece no cabeçalho do cardápio público e é o único lugar
    // onde o cliente vê onde a loja fica antes de pedir.
    const { error: erroLoja } = await sb
      .from('lojas')
      .update({ cidade: `${endereco.cidade} - ${endereco.uf}` })
      .eq('id', loja.id)
      .eq('dono_id', userId);
    if (erroLoja) throw erroLoja;

    logger.info({ rota: ROTA, lojaId: loja.id, userId }, 'Endereço da loja localizado e salvo');
    return respostaJson({
      coordenadas,
      enderecoFormatado,
    });
  } catch (erro) {
    if (erro instanceof ErroEnderecoDelivery) {
      return respostaJson({ erro: 'Confira os campos do endereço.' }, 422);
    }
    if (erro instanceof ErroGeoapify) {
      logger.warn({ rota: ROTA, codigo: erro.codigo }, 'Falha segura ao localizar endereço da loja');
      return respostaJson(
        {
          erro:
            erro.codigo === 'NAO_CONFIGURADO'
              ? 'O serviço de localização está indisponível agora. Tente em alguns minutos.'
              : 'Não conseguimos localizar esse endereço agora. Confira os dados e tente novamente.',
        },
        erro.codigo === 'NAO_CONFIGURADO' ? 503 : 422
      );
    }
    return respostaDeErro(erro, 'Não foi possível salvar o endereço.', ROTA);
  }
}
