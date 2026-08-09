import Link from 'next/link';

export function VoltarConfig() {
  return (
    <Link href="/admin/config" className="config-voltar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
        <path d="M15 6l-6 6 6 6" />
      </svg>
      Configurações
    </Link>
  );
}
