'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { criarClientNavegador } from '@/lib/supabase/client';
import type { Loja } from '@/lib/loja';

const BUCKET = 'imagens-cardapio';
const NICHOS = ['Lanchonete', 'Hamburgueria', 'Pizzaria', 'Açaiteria', 'Doceria', 'Outro'];
const CORES_SUGERIDAS = ['#1E7A4E', '#F28C28', '#C62828', '#6A1B9A', '#1565C0', '#00897B', '#EF6C00', '#212121'];
const HEX_VALIDO = /^#[0-9a-fA-F]{6}$/;

async function subirImagem(sb: ReturnType<typeof criarClientNavegador>, lojaId: string, file: File, prefixo: string) {
  const caminho = `${lojaId}/${prefixo}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
  const { error } = await sb.storage.from(BUCKET).upload(caminho, file);
  if (error) throw error;
  return sb.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
}

export function MinhaLojaForm({ loja }: { loja: Loja }) {
  const router = useRouter();

  const [nome, setNome] = useState(loja.nome);
  const [nicho, setNicho] = useState(loja.nicho || 'Outro');
  const [whatsapp, setWhatsapp] = useState(loja.whatsapp_numero || '');
  const [cor, setCor] = useState(loja.cor_marca || '#1E7A4E');
  const [cidade, setCidade] = useState(loja.cidade || '');
  const [sobre, setSobre] = useState(loja.sobre || '');
  const [aberta, setAberta] = useState(loja.recebendo_encomendas);

  const [logoPreview, setLogoPreview] = useState<string | null>(loja.logo_url);
  const [capaPreview, setCapaPreview] = useState<string | null>(loja.banner_url);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const capaInputRef = useRef<HTMLInputElement>(null);

  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  function onEscolherLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoPreview(URL.createObjectURL(file));
  }
  function onEscolherCapa(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCapaPreview(URL.createObjectURL(file));
  }
  function removerLogo() {
    if (logoInputRef.current) logoInputRef.current.value = '';
    setLogoPreview(null);
  }
  function removerCapa() {
    if (capaInputRef.current) capaInputRef.current.value = '';
    setCapaPreview(null);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const hex = cor.trim();
    if (!HEX_VALIDO.test(hex)) {
      setMsg({ tipo: 'erro', texto: 'A cor precisa estar no formato #RRGGBB (ex: #F28C28).' });
      return;
    }

    setSalvando(true);
    setMsg(null);
    try {
      const sb = criarClientNavegador();

      let logoUrl = loja.logo_url;
      let capaUrl = loja.banner_url;
      const logoFile = logoInputRef.current?.files?.[0];
      const capaFile = capaInputRef.current?.files?.[0];
      if (logoFile) logoUrl = await subirImagem(sb, loja.id, logoFile, 'logo');
      else if (!logoPreview) logoUrl = null;
      if (capaFile) capaUrl = await subirImagem(sb, loja.id, capaFile, 'capa');
      else if (!capaPreview) capaUrl = null;

      const dados = {
        nome: nome.trim(),
        nicho,
        whatsapp_numero: whatsapp.trim(),
        logo_url: logoUrl,
        banner_url: capaUrl,
        cor_marca: hex,
        cidade: cidade.trim() || null,
        sobre: sobre.trim() || null,
        recebendo_encomendas: aberta,
      };
      const { error } = await sb.from('lojas').update(dados).eq('id', loja.id);
      if (error) throw error;

      setMsg({ tipo: 'ok', texto: 'Dados da loja salvos.' });
      router.refresh();
    } catch (err) {
      setMsg({ tipo: 'erro', texto: 'Erro ao salvar: ' + (err as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="card">
      <h2>Minha loja</h2>
      <p className="sub">
        Identidade e dados gerais do estabelecimento — é o que o cliente vê ao abrir seu cardápio.
      </p>

      {msg && <div className={'msg msg-' + msg.tipo}>{msg.texto}</div>}

      <div className="hero-preview" id="heroPreview">
        <div className="hero-faixa" style={{ background: HEX_VALIDO.test(cor) ? cor : undefined }} />
        <div
          className={'hero-capa' + (capaPreview ? ' tem-img' : '')}
          style={capaPreview ? { backgroundImage: `url(${capaPreview})` } : undefined}
        >
          <span>Sem capa</span>
        </div>
        <div className="hero-base">
          <div
            className={'hero-logo' + (logoPreview ? ' tem-img' : '')}
            style={logoPreview ? { backgroundImage: `url(${logoPreview})` } : undefined}
          >
            <span>Logo</span>
          </div>
          <div className="hero-txt">
            <div className="hero-nome">{nome || 'Sua loja'}</div>
            <div className="hero-meta">
              <span>{cidade || 'Cidade - UF'}</span>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={salvar}>
        <label htmlFor="lojaLink">Link do cardápio</label>
        <p className="dica">
          <a href={`/${loja.slug}`} target="_blank" rel="noopener noreferrer">/{loja.slug}</a>
          {' '}— pra trocar o endereço, fale com o suporte.
        </p>

        <label htmlFor="lojaNome">Nome</label>
        <input type="text" id="lojaNome" required value={nome} onChange={(e) => setNome(e.target.value)} />

        <div className="row2">
          <div>
            <label htmlFor="lojaNicho">Tipo de estabelecimento</label>
            <select id="lojaNicho" value={nicho} onChange={(e) => setNicho(e.target.value)}>
              {NICHOS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="lojaWhatsapp">WhatsApp</label>
            <input
              type="text" id="lojaWhatsapp" required
              value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)}
            />
          </div>
        </div>

        <label htmlFor="lojaCidade">Cidade - UF</label>
        <input
          type="text" id="lojaCidade" placeholder="ex: Itabaiana - PB"
          value={cidade} onChange={(e) => setCidade(e.target.value)}
        />

        <div className="form-linha" style={{ marginTop: 4 }}>
          <div>
            <label>Foto de perfil (logo)</label>
            <p className="dica">Quadrada, fica sobre a capa. PNG com fundo transparente funciona bem.</p>
            <input type="file" accept="image/*" ref={logoInputRef} onChange={onEscolherLogo} />
            {logoPreview && (
              <button type="button" className="btn-ghost btn-small" onClick={removerLogo}>
                Remover logo
              </button>
            )}
          </div>
          <div>
            <label>Capa</label>
            <p className="dica">Imagem larga (recomendado 1600×420). É o banner do topo.</p>
            <input type="file" accept="image/*" ref={capaInputRef} onChange={onEscolherCapa} />
            {capaPreview && (
              <button type="button" className="btn-ghost btn-small" onClick={removerCapa}>
                Remover capa
              </button>
            )}
          </div>
        </div>

        <label htmlFor="lojaCor">Cor da marca</label>
        <p className="dica">Pinta a faixa do topo, os botões e os preços do seu cardápio.</p>
        <div className="cor-linha">
          <input
            type="color" id="lojaCor"
            value={HEX_VALIDO.test(cor) ? cor : '#1E7A4E'}
            onChange={(e) => setCor(e.target.value)}
          />
          <input type="text" maxLength={7} placeholder="#1E7A4E" value={cor} onChange={(e) => setCor(e.target.value)} />
          <div className="cor-sugestoes">
            {CORES_SUGERIDAS.map((c) => (
              <button
                key={c} type="button" className="cor-chip"
                style={{ background: c }} title={c} onClick={() => setCor(c)}
              />
            ))}
          </div>
        </div>

        <label htmlFor="lojaSobre">Descrição</label>
        <p className="dica">
          Endereço completo, formas de pagamento, avisos — abre quando o cliente clica em &quot;Mais
          informações&quot;.
        </p>
        <textarea id="lojaSobre" value={sobre} onChange={(e) => setSobre(e.target.value)} />

        <div className="switch-row" style={{ marginTop: 8 }}>
          <label className="switch">
            <input type="checkbox" checked={aberta} onChange={(e) => setAberta(e.target.checked)} />
            <span className="switch-track"></span>
          </label>
          <div>
            <strong>Loja aberta</strong>
            <p className="dica" style={{ margin: 0 }}>
              Desligue pra pausar o recebimento de pedidos sem precisar mexer no cardápio.
            </p>
          </div>
        </div>

        <button type="submit" className="btn-primary btn-small" disabled={salvando}>
          {salvando && <span className="btn-spinner" aria-hidden="true" />}
          {salvando ? 'Salvando...' : 'Salvar dados da loja'}
        </button>
      </form>
    </div>
  );
}
