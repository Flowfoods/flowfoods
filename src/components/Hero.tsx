import ModalTriggerButton from '@/components/ModalTriggerButton';

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center bg-[#111111] overflow-hidden">

      {/* Barra vermelha esquerda */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary" />

      {/* Foto Rodolfo — desktop lado direito */}
      <div className="hidden lg:block absolute right-0 top-0 bottom-0 w-[42%] overflow-hidden pointer-events-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/galeria/foto-7.jpg"
          alt="Rodolfo Cavalcante"
          className="w-full h-full object-cover object-center scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#111111] via-[#111111]/60 to-transparent" />
      </div>

      {/* Foto — mobile fundo */}
      <div className="lg:hidden absolute inset-0 pointer-events-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/galeria/foto-7.jpg"
          alt=""
          aria-hidden="true"
          className="w-full h-full object-cover object-top"
        />
        <div className="absolute inset-0 bg-[#111111]/88" />
      </div>

      <div className="relative max-w-6xl mx-auto px-5 md:px-8 lg:px-12 pt-28 pb-16 w-full">
        <div className="w-full lg:max-w-[55%]">

          {/* Logo mark */}
          <div className="flex items-center gap-3 mb-6 md:mb-10">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="font-display font-bold text-white text-base leading-none">FF</span>
            </div>
            <p className="text-white/50 text-xs font-semibold tracking-[0.4em] uppercase">
              Consultoria Gastronômica · Rio de Janeiro
            </p>
          </div>

          {/* Headline */}
          <h1 className="font-display font-bold leading-[0.92] mb-7 md:mb-10">
            <span className="block text-[clamp(2.4rem,8vw,5.5rem)] text-white uppercase">
              CONSULTORIA
            </span>
            <span className="block text-[clamp(2.4rem,8vw,5.5rem)] text-white uppercase">
              360° PARA
            </span>
            <span className="block text-[clamp(2.4rem,8vw,5.5rem)] text-primary uppercase">
              CRESCER.
            </span>
          </h1>

          {/* Subheadline */}
          <p className="font-sans text-white/65 text-sm md:text-lg max-w-md leading-relaxed mb-3 md:mb-4">
            Estrutura, rentabilidade e crescimento — do diagnóstico à execução.
          </p>
          <p className="font-sans text-white/40 text-sm max-w-md leading-relaxed mb-8 md:mb-12">
            Operação · Financeiro · Delivery · Equipe
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3">
            <ModalTriggerButton className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-semibold text-xs sm:text-sm px-7 py-4 uppercase tracking-widest transition-all duration-200 active:scale-[0.98] shadow-[0_4px_20px_rgba(185,28,28,0.4)]">
              Conte sobre seu restaurante
            </ModalTriggerButton>
            <a
              href="#servicos"
              className="inline-flex items-center justify-center gap-2 border border-white/20 hover:border-white/50 text-white/60 hover:text-white font-semibold text-xs sm:text-sm px-7 py-4 uppercase tracking-widest transition-all duration-200 active:scale-[0.98]"
            >
              ↓ Conheça a consultoria
            </a>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-14 md:mt-20 pt-8 md:pt-10 border-t border-white/10 flex flex-wrap gap-8 md:gap-12">
          {[
            { num: '14+', label: 'Anos no\nFood Service' },
            { num: '100+', label: 'Profissionais\nTreinados' },
            { num: '50+', label: 'Projetos\nEstruturados' },
          ].map(({ num, label }, i) => (
            <div key={label} className="flex items-center gap-8 md:gap-12">
              <div>
                <p className="font-display font-bold text-3xl md:text-5xl text-primary leading-none">{num}</p>
                <p className="text-[9px] md:text-[11px] text-white/30 uppercase tracking-widest mt-2 leading-snug whitespace-pre-line">{label}</p>
              </div>
              {i < 2 && <div className="w-px h-10 bg-white/10 hidden sm:block" />}
            </div>
          ))}
        </div>
      </div>

      {/* Scroll cue */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-30">
        <span className="text-[9px] uppercase tracking-widest font-sans text-white">Scroll</span>
        <div className="w-px h-8 bg-gradient-to-b from-white to-transparent" />
      </div>
    </section>
  );
}
