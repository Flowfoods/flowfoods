import { CONTACT_INFO } from '@/lib/constants';
import ModalTriggerButton from '@/components/ModalTriggerButton';

export default function CTA() {
  return (
    <section
      id="contato"
      className="relative py-24 md:py-32 px-5 md:px-8 lg:px-12 overflow-hidden"
    >
      {/* Foto de fundo */}
      <div className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/galeria/foto-5.jpg"
          alt=""
          aria-hidden="true"
          className="w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-primary/88" />
      </div>

      {/* Dot pattern */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative max-w-6xl mx-auto">
        <div className="max-w-3xl">

          <p className="text-white/70 text-xs font-semibold tracking-[0.4em] uppercase mb-6">
            Próximo Passo
          </p>

          <h2 className="font-display font-bold leading-[0.9] mb-6">
            <span className="block text-[clamp(2.5rem,10vw,6rem)] text-white uppercase">PRONTO PARA</span>
            <span className="block text-[clamp(2.5rem,10vw,6rem)] text-white uppercase">CRESCER?</span>
            <span className="block text-[clamp(2.5rem,10vw,6rem)] text-white/30 uppercase">VAMOS CONVERSAR.</span>
          </h2>

          <p className="text-white/85 text-lg leading-relaxed mb-3 max-w-xl font-sans">
            Seu restaurante merece mais que &ldquo;ficar de pé&rdquo;. Merece crescer.
          </p>

          {/* Urgência — copy do brief */}
          <p className="font-display italic text-white/60 text-base mb-10">
            ⏰ Rodolfo tem calendário cheio este mês. Vagas limitadas.
          </p>

          {/* Contatos diretos */}
          <div className="flex flex-col gap-3 mb-8">
            <a
              href={CONTACT_INFO.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/90 hover:text-white text-base font-semibold transition-colors"
            >
              📱 {CONTACT_INFO.whatsappDisplay} — resposta em até 2h
            </a>
            <a
              href={`mailto:${CONTACT_INFO.email}`}
              className="text-white/90 hover:text-white text-base font-semibold transition-colors"
            >
              📧 {CONTACT_INFO.email} — proposta em 24h
            </a>
            <a
              href={CONTACT_INFO.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/90 hover:text-white text-base font-semibold transition-colors"
            >
              📸 @{CONTACT_INFO.instagram} — cases, stories, conteúdo
            </a>
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4">
            <ModalTriggerButton className="inline-flex items-center justify-center gap-2 bg-ink hover:bg-ink-2 text-white font-semibold text-xs sm:text-sm px-7 py-4 uppercase tracking-widest transition-all duration-200 active:scale-[0.98]">
              <span>📋</span>
              Agendar Consultoria
            </ModalTriggerButton>
            <a
              href={CONTACT_INFO.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 border-2 border-white/40 hover:border-white text-white font-semibold text-xs sm:text-sm px-7 py-4 uppercase tracking-widest transition-all duration-200 active:scale-[0.98]"
            >
              <span>💬</span>
              WhatsApp Direto
            </a>
          </div>

        </div>
      </div>
    </section>
  );
}
