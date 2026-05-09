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

export const metadata: Metadata = {
  title: 'FlowFoods — Consultoria 360° para Restaurantes | Rio de Janeiro',
  description:
    'Consultoria gastronômica especializada: iFood, operações, SaaS com IA e treinamento de equipes. 14 anos de experiência no food service carioca.',
  keywords:
    'consultoria restaurante Rio, consultoria iFood, gestão restaurante RJ, SaaS gastronomia, treinamento equipe restaurante',
  authors: [{ name: 'Rodolfo Cavalcante' }],
  robots: 'index, follow',
  openGraph: {
    type: 'website',
    title: 'FlowFoods — Consultoria 360° para Restaurantes',
    description:
      'De operações caóticas para negócio escalável. iFood otimizado, equipe treinada, SaaS personalizado.',
    locale: 'pt_BR',
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
