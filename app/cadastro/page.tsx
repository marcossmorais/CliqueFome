import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { obterUsuario } from '@/lib/loja';
import { criarClientServidor } from '@/lib/supabase/server';
import { formatarWhatsapp, resolverEtapa } from '@/lib/onboarding/dados';
import { CadastroClient, type DadosIniciais } from './CadastroClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Criar sua loja — FlouFood',
  description: 'Cadastro da sua loja na FlouFood em quatro passos.',
  robots: { index: false },
};

/**
 * Entrada do cadastro, logo depois do checkout.
 *
 * A etapa NÃO vem do navegador: é resolvida aqui a cada carga, a partir da
 * sessão e do que já existe no banco. É isso que faz o fluxo sobreviver a um
 * F5, a fechar a aba ou a trocar de aparelho no meio — e é isso que impede
 * alguém de pular direto pro "Finalizar" mexendo no estado do React.
 *
 *   sem sessão            -> ACCOUNT
 *   sessão sem loja       -> STORE
 *   loja com etapa aberta -> ADDRESS
 *   loja concluída        -> o cadastro acabou, vai pro painel
 */
export default async function CadastroPage() {
  const user = await obterUsuario();

  if (!user) {
    return <CadastroClient etapaInicial="ACCOUNT" dados={{}} />;
  }

  const sb = await criarClientServidor();
  const { data: loja } = await sb
    .from('lojas')
    .select('id, slug, nome, nicho, whatsapp_numero, onboarding_etapa')
    .eq('dono_id', user.id)
    .order('created_at')
    .limit(1)
    .maybeSingle();

  const etapa = resolverEtapa({ temSessao: true, loja });
  if (etapa === 'STORE' || !loja) {
    return <CadastroClient etapaInicial="STORE" dados={{ email: user.email ?? null }} />;
  }
  if (etapa === 'DONE') redirect(`/painel/${loja.slug}/inicio`);

  // Endereço já digitado numa visita anterior: a RLS de
  // store_delivery_settings libera select pro dono, então o client de sessão
  // basta — não é preciso privilégio pra ler os próprios dados.
  const { data: origem } = await sb
    .from('store_delivery_settings')
    .select(
      'origin_postal_code, origin_street, origin_number, origin_neighborhood, origin_city, origin_state, origin_complement, origin_latitude, origin_longitude'
    )
    .eq('store_id', loja.id)
    .maybeSingle();

  const dados: DadosIniciais = {
    email: user.email ?? null,
    slug: loja.slug,
    nomeLoja: loja.nome,
    categoria: loja.nicho,
    whatsapp: loja.whatsapp_numero ? formatarWhatsapp(loja.whatsapp_numero) : '',
    endereco: origem
      ? {
          cep: origem.origin_postal_code ?? '',
          rua: origem.origin_street ?? '',
          numero: origem.origin_number ?? '',
          bairro: origem.origin_neighborhood ?? '',
          cidade: origem.origin_city ?? '',
          uf: origem.origin_state ?? '',
          complemento: origem.origin_complement ?? '',
        }
      : undefined,
    coordenadas:
      origem?.origin_latitude != null && origem?.origin_longitude != null
        ? { latitude: Number(origem.origin_latitude), longitude: Number(origem.origin_longitude) }
        : undefined,
  };

  return <CadastroClient etapaInicial="ADDRESS" dados={dados} />;
}
