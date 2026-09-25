import type { Metadata } from 'next';
import { Gelasio, Libre_Franklin } from 'next/font/google';

const gelasio = Gelasio({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-gelasio',
  display: 'swap',
});

const franklin = Libre_Franklin({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-franklin',
  display: 'swap',
});

export const metadata: Metadata = {
  // O link é pessoal do cliente: fora de buscador e sem vazar no Referer.
  robots: 'noindex, nofollow, noarchive',
  referrer: 'no-referrer',
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${gelasio.variable} ${franklin.variable} min-h-screen bg-creme font-franklin text-footer`}>
      {/* Filete vermelho no topo: a assinatura editorial da FlowFoods. */}
      <div className="h-1 w-full bg-marca" aria-hidden />
      {children}
    </div>
  );
}
