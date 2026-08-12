import type { Metadata } from 'next';
import './entregador.css';

export const metadata: Metadata = {
  title: 'Área do entregador',
  robots: { index: false, follow: false },
};

export default function LayoutEntregador({ children }: { children: React.ReactNode }) {
  return children;
}
