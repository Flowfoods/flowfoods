import Header from '@/components/Header';
import Hero from '@/components/Hero';
import Sinais from '@/components/Sinais';
import Frentes from '@/components/Frentes';
import ComoFunciona from '@/components/ComoFunciona';
import Entregas from '@/components/Entregas';
import Sobre from '@/components/Sobre';
import CTA from '@/components/CTA';
import Footer from '@/components/Footer';
import { getSEOSchema } from '@/lib/seo-schema';
import type { Viewport } from 'next';

/** A barra do navegador (Android) acompanha o tema do sistema (decisão 471). */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F5F0EB' },
    { media: '(prefers-color-scheme: dark)', color: '#0E0D0C' },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(getSEOSchema()) }}
      />
      {/* ff-site: claro ou escuro conforme o sistema (decisão 471). */}
      <div className="ff-site">
      <Header />
      <main className="overflow-x-hidden">
        <Hero />
        <Sinais />
        <Frentes />
        <ComoFunciona />
        <Entregas />
        <Sobre />
        <CTA />
      </main>
      <Footer />
      </div>
    </>
  );
}
