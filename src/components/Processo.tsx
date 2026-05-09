import { PROCESSO } from '@/lib/constants';

export default function Processo() {
  return (
    <section id="processo" className="bg-surface py-20 md:py-28 px-5 md:px-8 lg:px-12">
      <div className="max-w-6xl mx-auto">

        <div className="mb-16 md:mb-20" data-reveal>
          <p className="text-primary text-xs font-semibold tracking-[0.4em] uppercase mb-4">Processo</p>
          <h2 className="font-display leading-none">
            <span className="block text-[clamp(2.5rem,8vw,5rem)] text-ink uppercase">COMO</span>
            <span className="block text-[clamp(2.5rem,8vw,5rem)] text-ink-5 uppercase">TRABALHAMOS</span>
          </h2>
        </div>

        <div className="relative">
          {/* Timeline — desktop */}
          <div className="hidden lg:block absolute top-8 left-0 right-0 h-px bg-surface-3" />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-0">
            {PROCESSO.map((etapa, i) => (
              <div key={etapa.numero} className="relative lg:px-4 first:lg:pl-0 last:lg:pr-0">
                {/* Step circle */}
                <div className="relative z-10 mb-6">
                  <div className="w-16 h-16 border-2 border-surface-3 hover:border-primary bg-white flex items-center justify-center transition-colors duration-200">
                    <span className="font-display text-2xl text-primary font-bold">{etapa.numero}</span>
                  </div>
                </div>

                <div>
                  <h3 className="font-display text-xl md:text-2xl text-ink uppercase mb-2">{etapa.titulo}</h3>
                  <p className="text-ink-4 text-sm leading-relaxed">{etapa.descricao}</p>
                </div>

                {i < PROCESSO.length - 1 && (
                  <div className="lg:hidden mt-6 w-px h-8 bg-surface-3 ml-8" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
