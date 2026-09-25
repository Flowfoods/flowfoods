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

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(getSEOSchema()) }}
      />
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
    </>
  );
}
