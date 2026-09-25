import type { Metadata } from 'next';
import { Gelasio, Libre_Franklin } from 'next/font/google';
import './globals.css';

// Identidade FlowFoods: títulos em Gelasio, texto em Libre Franklin. As duas
// variáveis servem o site, o Portal do cliente e o Espaço do Rodolfo.
const gelasio = Gelasio({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-gelasio',
  display: 'swap',
});

const franklin = Libre_Franklin({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-franklin',
  display: 'swap',
});

const SITE_URL = 'https://consultoriaflowfoods.com.br';
const DESCRICAO =
  'Consultoria para restaurantes no Rio de Janeiro: estrutura, rentabilidade e crescimento, do diagnóstico à execução. Seis frentes, um ciclo contínuo de trabalho, com presença na casa e reunião mensal.';

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
      className={`${gelasio.variable} ${franklin.variable}`}
    >
      <body className="bg-surface text-ink antialiased font-sans overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}
