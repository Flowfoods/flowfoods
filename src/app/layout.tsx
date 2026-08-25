import type { Metadata } from 'next';
import { Playfair_Display, DM_Sans } from 'next/font/google';
import './globals.css';

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const SITE_URL = 'https://consultoriaflowfoods.com.br';
const DESCRICAO =
  'Consultoria gastronômica no Rio: delivery, financeiro, equipe e IA aplicados por quem opera o delivery de 16 lojas todo dia. Comece pelo diagnóstico gratuito de 30 min.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'FlowFoods — Consultoria para Restaurantes | Rio de Janeiro',
  description: DESCRICAO,
  keywords:
    'consultoria restaurante Rio, consultoria iFood, gestão restaurante RJ, CMV e DRE restaurante, treinamento equipe restaurante',
  authors: [{ name: 'Rodolfo Cavalcante' }],
  robots: 'index, follow',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'FlowFoods Consultoria',
    title: 'Gastronomia que flui. Negócio que cresce.',
    description: DESCRICAO,
    locale: 'pt_BR',
    images: [
      {
        url: '/images/galeria/foto-7.jpg',
        width: 860,
        height: 1280,
        alt: 'Rodolfo Cavalcante — FlowFoods Consultoria',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Gastronomia que flui. Negócio que cresce.',
    description: DESCRICAO,
    images: ['/images/galeria/foto-7.jpg'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${playfair.variable} ${dmSans.variable}`}
    >
      <body className="bg-surface text-ink antialiased font-sans overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}
