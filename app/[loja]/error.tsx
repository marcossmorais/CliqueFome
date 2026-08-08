'use client';

/**
 * Fronteira de erro do cardápio público.
 *
 * Existe porque `page.tsx` passou a LANÇAR quando o Supabase falha, em vez
 * de devolver 404. "Não encontramos esta loja" e "o sistema está fora do
 * ar" são coisas diferentes: a primeira faz o cliente desistir, a segunda
 * faz ele tentar de novo em um minuto.
 *
 * Estilo inline de propósito: o `cardapio.css` é importado pela página, e
 * quando ela nem chega a renderizar não dá pra contar com ele. Também não
 * usa a marca CliqueFome — aqui é o cardápio whitelabel da loja.
 */
export default function ErroCardapio({ reset }: { error: Error; reset: () => void }) {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        textAlign: 'center',
        background: '#1A1A1A',
        color: '#F5F5F5',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>O cardápio não carregou</h1>
      <p style={{ maxWidth: 420, lineHeight: 1.5, opacity: 0.75 }}>
        Foi uma falha nossa ao buscar os dados, não um problema com a loja. Tente de novo em
        instantes.
      </p>
      <button
        type="button"
        onClick={reset}
        style={{
          minHeight: 44,
          padding: '0 24px',
          borderRadius: 999,
          border: '1px solid rgba(245,245,245,0.35)',
          background: 'transparent',
          color: 'inherit',
          font: 'inherit',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Tentar de novo
      </button>
    </main>
  );
}
