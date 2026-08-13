import Image from 'next/image';

/**
 * Wordmark extraído diretamente da referência visual aprovada.
 * O arquivo é raster para preservar exatamente desenho, tipografia,
 * proporções e espaçamento, sem reconstrução aproximada em SVG.
 */
export function LogoFlouFood({ prioridade = false }: { prioridade?: boolean }) {
  return (
    <Image
      className="logo-floufood"
      src="/floufood-logo.png"
      width={676}
      height={132}
      alt="FlouFood"
      priority={prioridade}
      unoptimized
    />
  );
}
