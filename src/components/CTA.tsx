import { CONTACT_INFO, whatsappUrl } from '@/lib/constants';
import ModalTriggerButton from '@/components/ModalTriggerButton';

export default function CTA() {
  return (
    <section id="contato" className="bg-[#111111] overflow-hidden">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2">

        {/* Texto — fundo escuro sólido */}
        <div className="px-5 md:px-8 lg:px-16 py-20 md:py-28 flex flex-col justify-center order-2 lg:order-1">

          <div className="flex items-center gap-3 mb-8">
            <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="font-display font-bold text-white text-sm leading-none">FF</span>
            </div>
            <p className="text-primary text-xs font-semibold tracking-[0.4em] uppercase">
              Próximo Passo
            </p>
          </div>

          <h2 className="font-display font-bold leading-[0.92] mb-8">
            <span className="block text-[clamp(2.2rem,7vw,4.5rem)] text-white uppercase">PRONTO PARA</span>
            <span className="block text-[clamp(2.2rem,7vw,4.5rem)] text-white uppercase">CRESCER?</span>
            <span className="block text-[clamp(2.2rem,7vw,4.5rem)] text-white/25 uppercase">VAMOS CONVERSAR.</span>
          </h2>

          <p className="text-white/70 text-base leading-relaxed mb-8 max-w-md font-sans">
            Seu restaurante merece mais que &ldquo;ficar de pé&rdquo;. Merece crescer.
          </p>

          {/* Contatos diretos */}
          <div className="flex flex-col gap-3 mb-10 border-l-2 border-primary/30 pl-5">
            <a
              href={whatsappUrl('diagnostico')}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/80 hover:text-white text-sm font-semibold transition-colors"
            >
              {CONTACT_INFO.whatsappDisplay} — WhatsApp
            </a>
            {CONTACT_INFO.email && (
              <a
                href={`mailto:${CONTACT_INFO.email}`}
                className="text-white/80 hover:text-white text-sm font-semibold transition-colors"
              >
                {CONTACT_INFO.email}
              </a>
            )}
            <a
              href={CONTACT_INFO.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/80 hover:text-white text-sm font-semibold transition-colors"
            >
              @{CONTACT_INFO.instagram}
            </a>
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4">
            <ModalTriggerButton
              origem="diagnostico"
              className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-semibold text-xs sm:text-sm px-7 py-4 uppercase tracking-widest transition-all duration-200 active:scale-[0.98]"
            >
              Diagnóstico gratuito
            </ModalTriggerButton>
            <a
              href={whatsappUrl('diagnostico')}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 border border-white/20 hover:border-white/50 text-white/70 hover:text-white font-semibold text-xs sm:text-sm px-7 py-4 uppercase tracking-widest transition-all duration-200 active:scale-[0.98]"
            >
              WhatsApp Direto
            </a>
          </div>
        </div>

        {/* Foto — lado direito */}
        <div className="relative h-64 lg:h-auto min-h-[300px] overflow-hidden order-1 lg:order-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/galeria/foto-5.jpg"
            alt="Rodolfo Cavalcante"
            className="w-full h-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#111111] via-[#111111]/20 to-transparent lg:block hidden" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#111111]/80 via-transparent to-transparent lg:hidden" />
        </div>

      </div>
    </section>
  );
}
