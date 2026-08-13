const LARANJA_FLOUFOOD = '#FF5A00';

/**
 * Marca vetorial da FlouFood.
 *
 * O preto do arquivo de referência usa `currentColor` para manter contraste
 * nas superfícies claras e escuras do painel. O laranja permanece fixo como
 * a cor principal da marca. O cardápio público não importa este componente:
 * ele continua usando exclusivamente a identidade cadastrada pela loja.
 */
export function LogoFlouFood() {
  return (
    <svg
      className="logo-floufood"
      viewBox="0 0 1000 170"
      fill="none"
      role="img"
      aria-label="FlouFood"
      preserveAspectRatio="xMinYMid meet"
    >
      <g fill={LARANJA_FLOUFOOD}>
        <rect x="42" y="48" width="56" height="12" rx="6" />
        <rect x="0" y="76" width="98" height="12" rx="6" />
        <rect x="34" y="104" width="64" height="12" rx="6" />
      </g>

      <text
        x="126"
        y="139"
        fill="currentColor"
        fontFamily="Poppins, Arial, sans-serif"
        fontSize="145"
        fontWeight="500"
        letterSpacing="-6"
      >
        Flou
      </text>
      <text
        x="484"
        y="139"
        fill={LARANJA_FLOUFOOD}
        fontFamily="Poppins, Arial, sans-serif"
        fontSize="145"
        fontWeight="500"
      >
        F
      </text>

      <path
        d="M576 100C599 58 637 58 671 100C705 142 743 142 766 100C743 58 705 58 671 100C637 142 599 142 576 100Z"
        stroke={LARANJA_FLOUFOOD}
        strokeWidth="20"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text
        x="786"
        y="139"
        fill={LARANJA_FLOUFOOD}
        fontFamily="Poppins, Arial, sans-serif"
        fontSize="145"
        fontWeight="500"
      >
        d
      </text>
    </svg>
  );
}
