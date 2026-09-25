import type { Metadata } from 'next';

export const metadata: Metadata = {
  // O link é pessoal do cliente: fora de buscador e sem vazar no Referer.
  robots: 'noindex, nofollow, noarchive',
  referrer: 'no-referrer',
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-creme font-franklin text-footer">
      {/* Filete vermelho no topo: a assinatura editorial da FlowFoods. */}
      <div className="h-1 w-full bg-marca" aria-hidden />
      {children}
    </div>
  );
}
