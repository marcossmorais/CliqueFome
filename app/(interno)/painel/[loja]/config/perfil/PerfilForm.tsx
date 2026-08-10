'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { criarClientNavegador } from '@/lib/supabase/client';

const BUCKET = 'imagens-cardapio';

export function PerfilForm({
  lojaId,
  email,
  nome: nomeInicial,
  telefone: telefoneInicial,
  avatarUrl: avatarInicial,
}: {
  lojaId: string;
  email: string;
  nome: string;
  telefone: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();

  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(nomeInicial);
  const [novoEmail, setNovoEmail] = useState(email);
  const [telefone, setTelefone] = useState(telefoneInicial);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(avatarInicial);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [salvandoPerfil, setSalvandoPerfil] = useState(false);
  const [msgPerfil, setMsgPerfil] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [msgSenha, setMsgSenha] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  function onEscolherAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function salvarPerfil(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoPerfil(true);
    setMsgPerfil(null);
    try {
      const sb = criarClientNavegador();

      let avatarUrl = avatarInicial;
      const avatarFile = avatarInputRef.current?.files?.[0];
      if (avatarFile) {
        const caminho = `${lojaId}/perfil-${Date.now()}-${avatarFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
        const { error: erroUpload } = await sb.storage.from(BUCKET).upload(caminho, avatarFile);
        if (erroUpload) throw erroUpload;
        avatarUrl = sb.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
      } else if (!avatarPreview) {
        avatarUrl = null;
      }

      const emailMudou = novoEmail.trim() && novoEmail.trim() !== email;
      const { error } = await sb.auth.updateUser({
        ...(emailMudou ? { email: novoEmail.trim() } : {}),
        data: { nome: nome.trim(), telefone: telefone.trim(), avatar_url: avatarUrl },
      });
      if (error) throw error;

      setMsgPerfil({
        tipo: 'ok',
        texto: emailMudou
          ? 'Perfil salvo. Confira sua caixa de entrada pra confirmar o novo e-mail.'
          : 'Perfil salvo.',
      });
      setEditando(false);
      router.refresh();
    } catch (err) {
      setMsgPerfil({ tipo: 'erro', texto: 'Erro ao salvar perfil: ' + (err as Error).message });
    } finally {
      setSalvandoPerfil(false);
    }
  }

  async function salvarSenha(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 6) {
      setMsgSenha({ tipo: 'erro', texto: 'A senha precisa ter pelo menos 6 caracteres.' });
      return;
    }
    if (senha !== confirmarSenha) {
      setMsgSenha({ tipo: 'erro', texto: 'As senhas não coincidem.' });
      return;
    }
    setSalvandoSenha(true);
    setMsgSenha(null);
    const sb = criarClientNavegador();
    const { error } = await sb.auth.updateUser({ password: senha });
    if (error) {
      setMsgSenha({ tipo: 'erro', texto: 'Erro ao trocar senha: ' + error.message });
      setSalvandoSenha(false);
      return;
    }
    setMsgSenha({ tipo: 'ok', texto: 'Senha alterada.' });
    setSenha('');
    setConfirmarSenha('');
    setSalvandoSenha(false);
    setTrocandoSenha(false);
  }

  async function sair() {
    const sb = criarClientNavegador();
    await sb.auth.signOut();
    router.replace('/entrar');
    router.refresh();
  }

  if (!editando) {
    return (
      <div className="card">
        <h2>Meu perfil</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16, marginBottom: 20 }}>
          <div
            style={{
              width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
              background: avatarPreview ? `center/cover url(${avatarPreview})` : 'var(--verde-tint)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--verde)', fontWeight: 700, fontSize: 20,
            }}
          >
            {!avatarPreview && (nome || email).charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{nome || 'Sem nome cadastrado'}</div>
            <div className="sub" style={{ margin: 0 }}>{email}</div>
          </div>
        </div>

        {msgPerfil && <div className={'msg msg-' + msgPerfil.tipo}>{msgPerfil.texto}</div>}
        {msgSenha && <div className={'msg msg-' + msgSenha.tipo}>{msgSenha.texto}</div>}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn-primary btn-small" onClick={() => setEditando(true)}>
            Editar perfil
          </button>
          <button type="button" className="btn-ghost btn-small" onClick={() => setTrocandoSenha((v) => !v)}>
            Alterar senha
          </button>
          <button type="button" className="btn-ghost btn-small" onClick={sair}>
            Sair da conta
          </button>
        </div>

        {trocandoSenha && (
          <form onSubmit={salvarSenha} style={{ marginTop: 20 }}>
            <label htmlFor="novaSenha">Nova senha</label>
            <input
              type="password" id="novaSenha" autoComplete="new-password"
              value={senha} onChange={(e) => setSenha(e.target.value)}
            />
            <label htmlFor="confirmarSenha">Confirmar nova senha</label>
            <input
              type="password" id="confirmarSenha" autoComplete="new-password"
              value={confirmarSenha} onChange={(e) => setConfirmarSenha(e.target.value)}
            />
            <button type="submit" className="btn-primary btn-small" disabled={salvandoSenha}>
              {salvandoSenha && <span className="btn-spinner" aria-hidden="true" />}
              {salvandoSenha ? 'Salvando...' : 'Salvar nova senha'}
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Editar perfil</h2>
      {msgPerfil && <div className={'msg msg-' + msgPerfil.tipo}>{msgPerfil.texto}</div>}
      <form onSubmit={salvarPerfil}>
        <label htmlFor="perfilNome">Nome</label>
        <input type="text" id="perfilNome" value={nome} onChange={(e) => setNome(e.target.value)} />

        <label htmlFor="perfilEmail">E-mail</label>
        <input type="email" id="perfilEmail" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} />

        <label htmlFor="perfilTelefone">Telefone</label>
        <input type="text" id="perfilTelefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} />

        <label>Foto de perfil</label>
        <input type="file" accept="image/*" ref={avatarInputRef} onChange={onEscolherAvatar} />
        {avatarPreview && (
          <button
            type="button" className="btn-ghost btn-small" style={{ marginBottom: 16 }}
            onClick={() => { if (avatarInputRef.current) avatarInputRef.current.value = ''; setAvatarPreview(null); }}
          >
            Remover foto
          </button>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="submit" className="btn-primary btn-small" disabled={salvandoPerfil}>
            {salvandoPerfil && <span className="btn-spinner" aria-hidden="true" />}
            {salvandoPerfil ? 'Salvando...' : 'Salvar perfil'}
          </button>
          <button type="button" className="btn-ghost btn-small" onClick={() => setEditando(false)}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
