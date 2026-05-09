import Header from '@/components/Header';
import Hero from '@/components/Hero';
import Sobre from '@/components/Sobre';
import Galeria from '@/components/Galeria';
import Servicos from '@/components/Servicos';
import Citacao from '@/components/Citacao';
import Cases from '@/components/Cases';
import Processo from '@/components/Processo';
import Diferenciais from '@/components/Diferenciais';
import CTA from '@/components/CTA';
import Footer from '@/components/Footer';
import ContactModal from '@/components/ContactModal';
import ProgressBar from '@/components/ProgressBar';
import ScrollReveal from '@/components/ScrollReveal';
import Investimento from '@/components/Investimento';
import { getSEOSchema } from '@/lib/seo-schema';
import { CONTACT_INFO } from '@/lib/constants';

export default function Home() {
  return (
    <>
      <ProgressBar />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(getSEOSchema()) }}
      />
      <Header />
      <main className="overflow-x-hidden">
        <Hero />
        <Sobre />
        <Galeria />
        <Servicos />
        <Citacao />
        <Cases />
        <Processo />
        <Diferenciais />
        <Investimento />
        <CTA />
      </main>
      <Footer />

      <ScrollReveal />
      <ContactModal />

      {/* Floating WhatsApp — mobile only */}
      <a
        href={CONTACT_INFO.whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="md:hidden fixed bottom-5 right-5 z-50 bg-primary hover:bg-bright text-white text-xl p-4 shadow-xl shadow-black/30 transition-all duration-200"
        aria-label="Falar no WhatsApp"
      >
        💬
      </a>
    </>
  );
}
