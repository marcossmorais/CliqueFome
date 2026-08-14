'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { criarClientNavegador } from '@/lib/supabase/client';
import { destinoAposLogin } from '@/lib/auth/destino';
import { LogoFlouFood } from '@/components/LogoFlouFood';

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

    // O destino veio do proxy quando ele barrou a rota. A função separa os
    // papéis antes de navegar: superadmin sempre começa na plataforma e o
    // lojista só pode voltar a uma rota /painel, ainda revalidada no servidor.
    const { data: ehAdmin } = await sb.rpc('is_admin');
    const destino = destinoAposLogin(ehAdmin === true, params.get('proximo'));

    router.replace(destino);
    // Força o servidor a reler a sessão do cookie antes de renderizar.
    router.refresh();
  }

  return (
    <div id="authView">
      <div className="wrap">
        <div className="brand-logo">
          <LogoFlouFood />
        </div>

        <div id="loginCard" className="card">
          <h2 style={{ marginBottom: 4 }}>Entrar</h2>
          <p className="sub">Acesse seu painel.</p>

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
