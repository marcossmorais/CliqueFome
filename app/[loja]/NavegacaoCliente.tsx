'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

function IconeInicio() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9.5 20v-6h5v6" />
    </svg>
  );
}

function IconePedidos() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M6 3h12v18H6zM9 3.5V2m6 1.5V2M9 8h6M9 12h6M9 16h4" />
    </svg>
  );
}

export function NavegacaoCliente({ lojaSlug }: { lojaSlug: string }) {
  const pathname = usePathname();
  const inicio = `/${lojaSlug}`;
  const pedidos = `/${lojaSlug}/meus-pedidos`;
  const emPedidos = pathname === pedidos || pathname.startsWith(`${pedidos}/`);

  return (
    <nav className="cliente-nav-inferior" aria-label="Navegação do cardápio">
      <Link href={inicio} className={!emPedidos ? 'ativo' : ''} aria-current={!emPedidos ? 'page' : undefined}>
        <IconeInicio />
        <span>Início</span>
      </Link>
      <Link href={pedidos} className={emPedidos ? 'ativo' : ''} aria-current={emPedidos ? 'page' : undefined}>
        <IconePedidos />
        <span>Meus pedidos</span>
      </Link>
    </nav>
  );
}
