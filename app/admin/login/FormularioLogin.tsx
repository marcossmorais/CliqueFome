'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { criarClientNavegador } from '@/lib/supabase/client';
import { LogoCliqueFome } from '@/components/LogoCliqueFome';
import { TemaAdmin } from '@/components/admin/TemaAdmin';

export function FormularioLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setEnviando(true);

    const sb = criarClientNavegador();
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });

    if (error) {
      // Mensagem genérica de propósito: distinguir "email não existe" de
      // "senha errada" entrega quais emails estão cadastrados.
      setErro('Email ou senha incorretos.');
      setEnviando(false);
      return;
    }

    // O destino veio do proxy quando ele barrou a rota; sem ele, vai pro
    // catálogo. Só aceita caminho interno — senão daria pra montar
    // /admin/login?proximo=https://site-falso e usar o login de trampolim.
    const proximo = params.get('proximo');
    const destino =
      proximo && proximo.startsWith('/') && !proximo.startsWith('//')
        ? proximo
        : '/admin/inicio';

    router.replace(destino);
    // Força o servidor a reler a sessão do cookie antes de renderizar.
    router.refresh();
  }

  return (
    <div id="authView">
      <TemaAdmin flutuante />
      <div className="wrap">
        <div className="brand-logo">
          <LogoCliqueFome />
        </div>

        <div id="loginCard" className="card">
          <h2 style={{ marginBottom: 4 }}>Entrar</h2>
          <p className="sub">Acesse o painel da sua loja.</p>

          {erro && <div className="msg msg-erro">{erro}</div>}

          <form onSubmit={entrar}>
            <label htmlFor="loginEmail">Email</label>
            <input
              type="email"
              id="loginEmail"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <label htmlFor="loginSenha">Senha</label>
            <input
              type="password"
              id="loginSenha"
              required
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />

            <button type="submit" className="btn-primary" disabled={enviando}>
              {enviando ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
