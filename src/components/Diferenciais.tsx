import { DIFERENCIAIS } from '@/lib/constants';

export default function Diferenciais() {
  return (
    <section className="bg-white py-20 md:py-28 px-5 md:px-8 lg:px-12">
      <div className="max-w-6xl mx-auto">

        <div className="mb-16 md:mb-20" data-reveal>
          <p className="text-primary text-xs font-semibold tracking-[0.4em] uppercase mb-4">Diferenciais</p>
          <h2 className="font-display leading-none">
            <span className="block text-[clamp(2.5rem,8vw,5rem)] text-ink uppercase">POR QUE</span>
            <span className="block text-[clamp(2.5rem,8vw,5rem)] text-ink-5 uppercase">FLOWFOODS</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {DIFERENCIAIS.map((d) => (
            <div
              key={d.titulo}
              className="group flex gap-4 md:gap-6 p-5 md:p-8 border border-surface-3 hover:border-primary/30 transition-all duration-200 bg-surface hover:bg-white"
            >
              {/* Icon */}
              <div className="flex-shrink-0 w-14 h-14 border border-surface-3 group-hover:border-primary/40 bg-white flex items-center justify-center transition-colors duration-200">
                <span className="font-display text-2xl text-primary select-none">{d.icone}</span>
              </div>

              <div className="min-w-0">
                <div className="w-6 h-0.5 bg-primary mb-3" />
                <h3 className="font-display text-xl md:text-2xl text-ink uppercase leading-tight mb-3">{d.titulo}</h3>
                <p className="text-ink-4 text-sm leading-relaxed">{d.descricao}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
