'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LoginEntregador() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    setErro('');
    setEnviando(true);
    try {
      const resposta = await fetch('/api/entregador/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), senha }),
      });
      const dados = (await resposta.json().catch(() => null)) as { erro?: string } | null;
      if (!resposta.ok) {
        setErro(dados?.erro || 'Não foi possível entrar agora.');
        return;
      }
      router.replace('/entregador');
      router.refresh();
    } catch {
      setErro('Não foi possível entrar agora. Confira sua conexão.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="driverLogin">
      <section className="driverLoginCard" aria-labelledby="driver-login-titulo">
        <div className="driverMarca" aria-hidden="true">CF</div>
        <h1 id="driver-login-titulo">Área do entregador</h1>
        <p>Entre com o acesso fornecido pela loja.</p>

        {erro && <div className="driverErro" role="alert">{erro}</div>}

        <form onSubmit={entrar}>
          <label htmlFor="driver-email">Usuário / e-mail</label>
          <input
            id="driver-email"
            type="email"
            required
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
          />

          <label htmlFor="driver-senha">Senha</label>
          <input
            id="driver-senha"
            type="password"
            required
            minLength={8}
            maxLength={72}
            autoComplete="current-password"
            value={senha}
            onChange={(evento) => setSenha(evento.target.value)}
          />

          <button type="submit" className="driverBotaoPrincipal" disabled={enviando}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}
