/**
 * Marca do CliqueFome: ícone (aro + garfo + cursor + ponto laranja) + nome.
 * Só aparece na landing e no painel — o cardápio de cada loja é whitelabel.
 */
export function LogoCliqueFome() {
  return (
    <>
      <svg viewBox="0 0 100 100" fill="none" aria-hidden="true">
        <circle cx="50" cy="52" r="38" stroke="currentColor" strokeWidth="5" strokeDasharray="215 30" strokeLinecap="round" transform="rotate(-95 50 52)" />
        <circle cx="50" cy="52" r="27" stroke="currentColor" strokeWidth="4" strokeDasharray="150 25" strokeLinecap="round" transform="rotate(-100 50 52)" />
        <line x1="38" y1="34" x2="38" y2="50" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <line x1="45" y1="34" x2="45" y2="50" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <line x1="52" y1="34" x2="52" y2="50" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <path d="M38 50 Q38 58 45 58 Q52 58 52 50" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <line x1="45" y1="58" x2="45" y2="78" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <path d="M55 52 L82 68 L70 70 L78 85 L72 88 L64 74 L58 80 Z" fill="currentColor" />
        <circle cx="82" cy="18" r="6" fill="#F28C28" />
      </svg>
      <span className="wordmark">
        Clique<span className="fome">Fome</span>
      </span>
    </>
  );
}
