import { CONTACT_INFO } from '@/lib/constants';

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center bg-surface overflow-hidden">

      {/* Círculo laranja sutil — canto superior direito */}
      <div
        className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: 'rgba(249,115,22,0.06)', transform: 'translate(30%, -30%)' }}
      />

      {/* Barra laranja esquerda */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary" />

      {/* Foto — mobile fundo */}
      <div className="lg:hidden absolute inset-0 pointer-events-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/galeria/foto-7.jpg"
          alt=""
          aria-hidden="true"
          className="w-full h-full object-cover object-top"
        />
        <div className="absolute inset-0 bg-surface/85" />
      </div>

      {/* Foto Rodolfo — desktop lado direito */}
      <div className="hidden lg:block absolute right-0 top-0 bottom-0 w-[42%] overflow-hidden pointer-events-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/galeria/foto-7.jpg"
          alt="Rodolfo Cavalcante"
          className="w-full h-full object-cover object-center scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/65 to-transparent" />
      </div>

      <div className="relative max-w-6xl mx-auto px-5 md:px-8 lg:px-12 pt-28 pb-16 w-full">
        <div className="w-full lg:max-w-[55%]">

          {/* Label */}
          <p className="text-primary text-xs font-semibold tracking-[0.4em] uppercase mb-6 md:mb-10">
            Consultoria Gastronômica · Rio de Janeiro
          </p>

          {/* Headline — copy de conversão do brief */}
          <h1 className="font-display font-bold leading-[0.92] mb-7 md:mb-10">
            <span className="block text-[clamp(2.4rem,8vw,5.5rem)] text-ink">
              CONSULTORIA
            </span>
            <span className="block text-[clamp(2.4rem,8vw,5.5rem)] text-ink">
              360° PARA
            </span>
            <span className="block text-[clamp(2.4rem,8vw,5.5rem)] text-primary">
              CRESCER.
            </span>
          </h1>

          {/* Subheadline */}
          <p className="font-sans text-ink-4 text-sm md:text-lg max-w-md leading-relaxed mb-3 md:mb-4">
            De operações caóticas para negócio escalável em 90 dias.
          </p>
          <p className="font-sans text-ink-5 text-sm max-w-md leading-relaxed mb-8 md:mb-12">
            iFood otimizado · Equipe treinada · SaaS com IA
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={CONTACT_INFO.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-semibold text-xs sm:text-sm px-7 py-4 uppercase tracking-widest transition-all duration-200 active:scale-[0.98] shadow-[0_4px_20px_rgba(249,115,22,0.35)]"
            >
              <span>💬</span>
              Iniciar Consultoria Gratuita
            </a>
            <a
              href="#servicos"
              className="inline-flex items-center justify-center gap-2 border border-surface-3 hover:border-primary text-ink-4 hover:text-primary font-semibold text-xs sm:text-sm px-7 py-4 uppercase tracking-widest transition-all duration-200 active:scale-[0.98]"
            >
              ↓ Conheça os 6 serviços
            </a>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-14 md:mt-20 pt-8 md:pt-10 border-t border-surface-3 grid grid-cols-3 gap-4 md:gap-6 max-w-xs sm:max-w-sm md:max-w-md">
          {[
            { num: '14', label: 'Anos de Operação Real' },
            { num: '50+', label: 'Projetos Entregues' },
            { num: '3',   label: 'Cases de Sucesso' },
          ].map(({ num, label }) => (
            <div key={label}>
              <p className="font-display font-bold text-2xl md:text-4xl text-primary">{num}</p>
              <p className="text-[9px] md:text-xs text-ink-5 uppercase tracking-wide mt-1 leading-tight">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Scroll cue */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-40">
        <span className="text-[9px] uppercase tracking-widest font-sans text-ink-4">Scroll</span>
        <div className="w-px h-8 bg-gradient-to-b from-ink-4 to-transparent" />
      </div>
    </section>
  );
}
