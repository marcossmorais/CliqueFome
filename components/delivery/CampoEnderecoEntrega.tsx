'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  buscarSugestoes,
  criarControladorBusca,
  type EstadoAutocomplete,
} from '@/lib/delivery/autocomplete';
import {
  camposFaltantes,
  resumoEndereco,
  type DeliveryAddress,
  type SugestaoEnderecoPublica,
} from '@/lib/delivery/endereco';
import { formatarCep } from '@/lib/delivery/tipos';
import { useBuscaCep } from '@/lib/endereco/useBuscaCep';
import estilos from './campoEndereco.module.css';

/**
 * Campo único de endereço de entrega.
 *
 * O fluxo antigo era CEP -> oito campos estruturados -> botão "calcular", e o
 * autocomplete nem chegava ao cliente (o endpoint exigia login). Aqui a
 * pessoa digita "Rua João Pessoa 120" e escolhe numa lista; os campos
 * estruturados só aparecem pro que a sugestão não trouxe.
 *
 * O mesmo componente serve o checkout público e a configuração do painel —
 * é o que garante que o endereço da loja (PONTO A) e o do cliente (PONTO B)
 * sejam coletados e normalizados exatamente do mesmo jeito.
 */
export function CampoEnderecoEntrega({
  lojaSlug,
  valor,
  onChange,
  complemento,
  onComplemento,
  referencia,
  onReferencia,
  rotulo = 'Endereço de entrega',
  /** `false` quando a seção em volta já tem um título com o mesmo texto: o
   *  label continua existindo pro leitor de tela, só não é pintado duas
   *  vezes na tela. */
  rotuloVisivel = true,
  autoFoco = false,
}: {
  lojaSlug: string;
  valor: DeliveryAddress;
  onChange: (endereco: DeliveryAddress) => void;
  complemento: string;
  onComplemento: (valor: string) => void;
  referencia?: string;
  onReferencia?: (valor: string) => void;
  rotulo?: string;
  rotuloVisivel?: boolean;
  autoFoco?: boolean;
}) {
  const [consulta, setConsulta] = useState('');
  const [estado, setEstado] = useState<EstadoAutocomplete>({ status: 'idle' });
  const [selecionado, setSelecionado] = useState(false);
  /**
   * Quais campos complementares aparecem, decidido UMA vez — na escolha da
   * sugestão ou na resolução do CEP.
   *
   * Não pode ser derivado do valor atual a cada render: `camposFaltantes`
   * devolve 'numero' enquanto o número está vazio, então o primeiro caractere
   * digitado tirava o campo da lista e DESMONTAVA o input no meio da
   * digitação. O mesmo acontecia com o bairro no segundo caractere. Um campo
   * que apareceu precisa continuar na tela enquanto está sendo preenchido.
   */
  const [camposExtras, setCamposExtras] = useState<Array<'numero' | 'bairro' | 'cep'>>([]);
  const [modoCep, setModoCep] = useState(false);
  const [cep, setCep] = useState('');
  const [destacado, setDestacado] = useState(-1);

  const idBase = useId();
  const idLista = `${idBase}-sugestoes`;
  const buscaCep = useBuscaCep();

  // O controlador guarda timer, AbortController e número de sequência, e
  // precisa sobreviver a re-render sem ser recriado — recriar perderia o
  // timer pendente e o debounce nunca fecharia.
  //
  // Montado num efeito (e não durante o render) porque ler `slugRef.current`
  // no corpo do componente é justamente o que a regra react-hooks/refs
  // proíbe. Trocar de loja recria o controlador de propósito: é outro
  // cardápio, e o resultado da busca anterior não vale mais.
  const controladorRef = useRef<ReturnType<typeof criarControladorBusca> | null>(null);

  useEffect(() => {
    const controlador = criarControladorBusca({
      buscar: (texto, signal) => buscarSugestoes(texto, lojaSlug, signal),
      aoMudarEstado: setEstado,
    });
    controladorRef.current = controlador;
    return () => {
      controlador.destruir();
      controladorRef.current = null;
    };
  }, [lojaSlug]);

  const digitar = useCallback((texto: string) => {
    setConsulta(texto);
    setSelecionado(false);
    setDestacado(-1);
    controladorRef.current?.digitar(texto);
  }, []);

  const escolher = useCallback((sugestao: SugestaoEnderecoPublica) => {
    controladorRef.current?.limpar();
    setSelecionado(true);
    setDestacado(-1);
    setConsulta(sugestao.formattedAddress);
    const escolhido: DeliveryAddress = {
      formattedAddress: sugestao.formattedAddress,
      street: sugestao.street,
      number: sugestao.number,
      neighborhood: sugestao.neighborhood,
      city: sugestao.city,
      state: sugestao.state,
      postalCode: sugestao.postalCode,
      // Coordenada não vem pro navegador: quem geocodifica o endereço final
      // é o servidor, na cotação. O cliente nunca é autoridade sobre lat/lng.
      latitude: null,
      longitude: null,
    };
    setCamposExtras(camposFaltantes(escolhido));
    onChange(escolhido);
  }, [onChange]);

  const sugestoes = estado.status === 'resultados' ? estado.sugestoes : [];

  const teclado = (evento: React.KeyboardEvent<HTMLInputElement>) => {
    if (sugestoes.length === 0) return;
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      setDestacado((atual) => (atual + 1) % sugestoes.length);
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setDestacado((atual) => (atual <= 0 ? sugestoes.length - 1 : atual - 1));
    } else if (evento.key === 'Enter' && destacado >= 0) {
      evento.preventDefault();
      escolher(sugestoes[destacado]);
    } else if (evento.key === 'Escape') {
      controladorRef.current?.limpar();
      setDestacado(-1);
    }
  };

  const atualizar = (campo: keyof DeliveryAddress, novo: string) => onChange({ ...valor, [campo]: novo });

  // Fallback por CEP: preenche os campos estruturados que o ViaCEP conhece.
  // O ViaCEP não devolve número nem coordenada — o número continua sendo
  // pedido abaixo, e a coordenada sai da geocodificação server-side.
  const consultarCep = (bruto: string) => {
    const formatado = formatarCep(bruto);
    setCep(formatado);
    void buscaCep.consultar(formatado, (localizado) => {
      setSelecionado(true);
      const resolvido: DeliveryAddress = {
        ...valor,
        formattedAddress: '',
        street: localizado.logradouro || valor.street,
        neighborhood: localizado.bairro || valor.neighborhood,
        city: localizado.cidade,
        state: localizado.uf,
        postalCode: localizado.cep,
        latitude: null,
        longitude: null,
      };
      // O ViaCEP nunca devolve número, então 'numero' entra aqui sempre —
      // e continua na tela enquanto a pessoa digita.
      setCamposExtras(camposFaltantes(resolvido));
      onChange(resolvido);
    });
  };

  return (
    <div className={estilos.campo}>
      {!modoCep && (
        <>
          <label className={rotuloVisivel ? estilos.rotulo : estilos.rotuloOculto} htmlFor={`${idBase}-busca`}>{rotulo}</label>
          {/* ARIA 1.2: `combobox` vai no próprio input, não num wrapper — é
              o input que recebe foco e anuncia a lista. */}
          <div className={estilos.combo}>
            <input
              id={`${idBase}-busca`}
              type="text"
              role="combobox"
              autoComplete="off"
              autoFocus={autoFoco}
              inputMode="text"
              maxLength={120}
              className={estilos.entrada}
              placeholder="Digite sua rua e número"
              value={consulta}
              onChange={(e) => digitar(e.target.value)}
              onKeyDown={teclado}
              aria-expanded={sugestoes.length > 0}
              aria-controls={idLista}
              aria-autocomplete="list"
              aria-activedescendant={destacado >= 0 ? `${idBase}-op-${destacado}` : undefined}
            />
            {estado.status === 'buscando' && <span className={estilos.girando} aria-hidden="true" />}
          </div>

          <ul className={estilos.lista} id={idLista} role="listbox" aria-label="Sugestões de endereço" hidden={sugestoes.length === 0}>
            {sugestoes.map((sugestao, indice) => (
              <li key={sugestao.id} role="presentation">
                <button
                  type="button"
                  id={`${idBase}-op-${indice}`}
                  role="option"
                  aria-selected={indice === destacado}
                  className={indice === destacado ? estilos.opcaoAtiva : estilos.opcao}
                  onMouseEnter={() => setDestacado(indice)}
                  onClick={() => escolher(sugestao)}
                >
                  <strong>{[sugestao.street, sugestao.number].filter(Boolean).join(', ')}</strong>
                  <small>{[sugestao.neighborhood, [sugestao.city, sugestao.state].filter(Boolean).join(' - ')].filter(Boolean).join(' · ')}</small>
                </button>
              </li>
            ))}
          </ul>

          {estado.status === 'vazio' && (
            <p className={estilos.aviso} role="status">Nenhum endereço encontrado. Tente incluir o bairro ou busque pelo CEP.</p>
          )}
          {estado.status === 'erro' && (
            <p className={estilos.aviso} role="status">{estado.mensagem}</p>
          )}
        </>
      )}

      {modoCep && (
        <>
          <label className={estilos.rotulo} htmlFor={`${idBase}-cep`}>Buscar pelo CEP</label>
          <input
            id={`${idBase}-cep`}
            className={estilos.entrada}
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={9}
            placeholder="00000-000"
            value={cep}
            onChange={(e) => consultarCep(e.target.value)}
          />
          {buscaCep.mensagem && (
            <p className={buscaCep.status === 'erro' ? estilos.avisoErro : estilos.aviso} role="status">{buscaCep.mensagem}</p>
          )}
        </>
      )}

      <button
        type="button"
        className={estilos.alternar}
        onClick={() => { setModoCep((atual) => !atual); controladorRef.current?.limpar(); }}
      >
        {modoCep ? '‹ Voltar a buscar pelo endereço' : 'Não encontrou seu endereço? Buscar pelo CEP'}
      </button>

      {selecionado && (
        <div className={estilos.confirmacao}>
          <p className={estilos.resumo}>{resumoEndereco(valor) || 'Complete os campos abaixo'}</p>

          {/* Só o que a sugestão não trouxe vira campo. Endereço completo não
              mostra formulário nenhum — é o ponto do fluxo novo. */}
          <div className={estilos.complementares}>
            {camposExtras.includes('numero') && (
              <label className={estilos.subCampo}>
                Número
                <input maxLength={20} value={valor.number} onChange={(e) => atualizar('number', e.target.value)} placeholder="120" />
              </label>
            )}
            {camposExtras.includes('bairro') && (
              <label className={estilos.subCampo}>
                Bairro
                <input maxLength={80} value={valor.neighborhood} onChange={(e) => atualizar('neighborhood', e.target.value)} />
              </label>
            )}
            {camposExtras.includes('cep') && (
              <label className={estilos.subCampo}>
                CEP
                <input inputMode="numeric" maxLength={9} value={formatarCep(valor.postalCode)} onChange={(e) => atualizar('postalCode', e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="00000-000" />
              </label>
            )}

            {/* Complemento é digitação livre e NÃO dispara busca nenhuma. */}
            <label className={estilos.subCampo}>
              Complemento (opcional)
              <input maxLength={100} value={complemento} onChange={(e) => onComplemento(e.target.value)} placeholder="Apto 202, bloco B, casa dos fundos…" />
            </label>

            {onReferencia && (
              <label className={estilos.subCampo}>
                Ponto de referência (opcional)
                <input maxLength={120} value={referencia ?? ''} onChange={(e) => onReferencia(e.target.value)} placeholder="Perto da praça" />
              </label>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
