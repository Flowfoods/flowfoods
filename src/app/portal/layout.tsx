import type { Metadata, Viewport } from 'next';

/** A barra do navegador (Android) acompanha o tema do sistema (decisão 471). */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F5F0EB' },
    { media: '(prefers-color-scheme: dark)', color: '#0E0D0C' },
  ],
};

export const metadata: Metadata = {
  // O link é pessoal do cliente: fora de buscador e sem vazar no Referer.
  robots: 'noindex, nofollow, noarchive',
  referrer: 'no-referrer',
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    // ff-site: claro ou escuro conforme o sistema (decisão 471).
    <div className="ff-site min-h-screen bg-creme font-franklin text-footer">
      {/* Filete vermelho no topo: a assinatura editorial da FlowFoods. */}
      <div className="h-1 w-full bg-marca" aria-hidden />
      {children}
    </div>
  );
}
