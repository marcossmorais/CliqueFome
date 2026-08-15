'use client';

import Link from 'next/link';
import { useState } from 'react';

import { LogoFlouFood } from '@/components/LogoFlouFood';
import { ETAPAS, indiceEtapa, type EtapaCadastro } from '@/lib/onboarding/dados';
import type { Coordenada } from '@/lib/onboarding/mapa';
import {
  ENDERECO_VAZIO,
  PassoConta,
  PassoEndereco,
  PassoFinal,
  PassoLoja,
  type EnderecoLoja,
} from './passos';
import estilos from './cadastro.module.css';

export type DadosIniciais = {
  email?: string | null;
  slug?: string;
  nomeLoja?: string;
  categoria?: string | null;
  whatsapp?: string;
  endereco?: EnderecoLoja;
  coordenadas?: Coordenada;
};

/**
 * Casca do cadastro: stepper, painel lateral e a etapa da vez.
 *
 * A etapa nasce do servidor (`etapaInicial`) e só avança quando a gravação
 * daquele passo já voltou OK — nunca no clique. Assim o que a tela mostra e o
 * que o banco tem nunca divergem, e recarregar cai exatamente no mesmo lugar.
 *
 * Não existe caminho pra VOLTAR uma etapa concluída. Não é rigidez: cada passo
 * já gravou, e o que dá pra mudar depois (nome, categoria, WhatsApp, endereço)
 * tem tela própria em Configurações — um "voltar" aqui seria um segundo
 * formulário de edição, mantido em paralelo, pra corrigir algo que a pessoa
 * digitou trinta segundos atrás.
 */
export function CadastroClient({
  etapaInicial,
  dados,
}: {
  etapaInicial: EtapaCadastro;
  dados: DadosIniciais;
}) {
  const [etapa, setEtapa] = useState<EtapaCadastro>(etapaInicial);
  const [loja, setLoja] = useState({ slug: dados.slug ?? '', nome: dados.nomeLoja ?? '' });

  const atual = indiceEtapa(etapa);

  return (
    <div className={estilos.pagina}>
      <div className={estilos.circulos} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <header className={estilos.topo}>
        <Link href="/" aria-label="FlouFood — página inicial">
          <LogoFlouFood />
        </Link>
        <Link href="/entrar">Entrar</Link>
      </header>

      <main className={estilos.conteudo}>
        <div>
          <ol className={estilos.stepper}>
            {ETAPAS.map((item, indice) => {
              const concluida = indice < atual;
              const classe = [
                estilos.passo,
                concluida ? estilos.passoConcluido : '',
                indice === atual ? estilos.passoAtual : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <li
                  key={item.chave}
                  className={classe}
                  aria-current={indice === atual ? 'step' : undefined}
                >
                  <span className={estilos.marcador}>
                    {concluida ? (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    ) : (
                      indice + 1
                    )}
                  </span>
                  <span className={estilos.rotulo}>{item.titulo}</span>
                </li>
              );
            })}
          </ol>

          <section className={estilos.cartao}>
            {etapa === 'ACCOUNT' && <PassoConta onPronto={() => setEtapa('STORE')} />}

            {etapa === 'STORE' && (
              <PassoLoja
                inicial={{
                  nome: dados.nomeLoja ?? '',
                  categoria: dados.categoria ?? '',
                  whatsapp: dados.whatsapp ?? '',
                }}
                onPronto={(nova) => {
                  setLoja(nova);
                  setEtapa('ADDRESS');
                }}
              />
            )}

            {etapa === 'ADDRESS' && (
              <PassoEndereco
                inicial={dados.endereco ?? ENDERECO_VAZIO}
                coordenadaInicial={dados.coordenadas}
                onPronto={() => setEtapa('DONE')}
              />
            )}

            {etapa === 'DONE' && <PassoFinal slug={loja.slug} nomeLoja={loja.nome} />}
          </section>
        </div>

        <aside className={estilos.lateral}>
          <p className={estilos.lateralTitulo}>Em quatro passos sua loja está no ar.</p>
          <ul className={estilos.lateralLista}>
            <li>
              <strong>Só o essencial agora</strong>
              <span>
                Logo, cores, cardápio e formas de pagamento ficam pro painel, quando der.
              </span>
            </li>
            <li>
              <strong>Seu link exclusivo</strong>
              <span>Cada loja ganha um endereço próprio pra mandar pros clientes.</span>
            </li>
            <li>
              <strong>Cancele quando quiser</strong>
              <span>Sem contrato de fidelidade e sem taxa por pedido.</span>
            </li>
          </ul>
        </aside>
      </main>
    </div>
  );
}
