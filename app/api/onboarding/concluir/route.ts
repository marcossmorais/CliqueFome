import { logger } from '@/lib/observabilidade/logger';
import { criarClientPrivilegiado } from '@/lib/pedidos/servidor';
import {
  AJUSTE_MAXIMO_METROS,
  arredondar,
  coordenadaValida,
  distanciaMetros,
} from '@/lib/onboarding/mapa';
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

const ROTA = '/api/onboarding/concluir';

/**
 * Etapa 4: confirma a localização e libera o painel.
 *
 * Aceita um par de coordenadas opcional — é o pin que o dono pode ter movido
 * no mapa. Não há chamada nova ao Geoapify aqui: o ponto de referência é o
 * que já foi gravado na etapa do endereço, e o ajuste só vale se cair perto
 * dele. Sem endereço geocodificado antes, não há o que concluir.
 */
export async function POST(request: Request) {
  try {
    const userId = await autorizarCadastro();
    await limitarCadastro(userId, 'concluir', 20);

    const loja = await lojaDoUsuario(userId);
    if (!loja) throw new ErroCadastroApi('Cadastre os dados da loja antes de concluir.', 409);
    if (loja.onboarding_etapa === 'DONE') {
      // Duplo clique no botão, ou voltar no navegador: já está pronto.
      return respostaJson({ loja: { slug: loja.slug }, etapa: 'DONE' });
    }

    const sb = criarClientPrivilegiado();
    const { data: origem, error: erroOrigem } = await sb
      .from('store_delivery_settings')
      .select('origin_latitude, origin_longitude')
      .eq('store_id', loja.id)
      .maybeSingle();
    if (erroOrigem) throw erroOrigem;

    const geocodificada =
      origem?.origin_latitude == null || origem?.origin_longitude == null
        ? null
        : { latitude: Number(origem.origin_latitude), longitude: Number(origem.origin_longitude) };
    if (!geocodificada) {
      throw new ErroCadastroApi('Localize o endereço da loja antes de concluir.', 409);
    }

    const corpo = await lerCorpo(request);
    const ajustada = ajustePedido(corpo, geocodificada);

    if (ajustada) {
      const { error } = await sb
        .from('store_delivery_settings')
        .update({ origin_latitude: ajustada.latitude, origin_longitude: ajustada.longitude })
        .eq('store_id', loja.id);
      if (error) throw error;
    }

    const { error: erroEtapa } = await sb
      .from('lojas')
      .update({ onboarding_etapa: 'DONE' })
      .eq('id', loja.id)
      .eq('dono_id', userId);
    if (erroEtapa) throw erroEtapa;

    logger.info(
      { rota: ROTA, lojaId: loja.id, userId, pinAjustado: !!ajustada },
      'Cadastro da loja concluído'
    );
    return respostaJson({ loja: { slug: loja.slug }, etapa: 'DONE' });
  } catch (erro) {
    return respostaDeErro(erro, 'Não foi possível concluir o cadastro.', ROTA);
  }
}

/**
 * Coordenada ajustada pelo dono, ou `null` se ele não mexeu no pin. Recusar
 * é mais seguro do que corrigir em silêncio: a loja precisa saber que o ponto
 * não foi aceito.
 */
function ajustePedido(
  corpo: Record<string, unknown>,
  referencia: { latitude: number; longitude: number }
) {
  if (corpo.latitude === undefined && corpo.longitude === undefined) return null;

  // Number(null) e Number('') dão 0: só número de verdade passa.
  if (typeof corpo.latitude !== 'number' || typeof corpo.longitude !== 'number') {
    throw new ErroCadastroApi('Localização inválida.');
  }
  const candidata = arredondar({ latitude: corpo.latitude, longitude: corpo.longitude });
  if (!coordenadaValida(candidata)) throw new ErroCadastroApi('Localização inválida.');
  if (distanciaMetros(referencia, candidata) > AJUSTE_MAXIMO_METROS) {
    throw new ErroCadastroApi('O ponto escolhido está longe demais do endereço informado.');
  }
  return candidata;
}
