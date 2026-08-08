import type { Metadata } from 'next';
import { Poppins, Inter } from 'next/font/google';

// next/font faz self-host: as fontes deixam de vir do Google Fonts, o que
// tira um host externo da CSP e remove o flash de fonte na primeira carga.
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--fonte-titulo',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--fonte-corpo',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CliqueFome — Cardápio digital pro seu negócio',
  description:
    'CliqueFome — cardápio digital, pedidos pelo WhatsApp e painel de gestão pra lanchonetes, hamburguerias, pizzarias e açaiterias.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${poppins.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
