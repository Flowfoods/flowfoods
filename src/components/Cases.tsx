import { CASES } from '@/lib/constants';

const BORDER_COLORS: Record<string, string> = {
  'bibi-sucos':     'border-primary',
  'balada-mix':     'border-secondary',
  'casa-severina':  'border-[#8B4513]',
};

const LABEL_COLORS: Record<string, string> = {
  'bibi-sucos':    'text-primary',
  'balada-mix':    'text-secondary',
  'casa-severina': 'text-[#8B4513]',
};

export default function Cases() {
  return (
    <section id="cases" className="bg-white py-20 md:py-28 px-5 md:px-8 lg:px-12">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-16 md:mb-20" data-reveal>
          <p className="text-primary text-xs font-semibold tracking-[0.4em] uppercase mb-4">Cases</p>
          <h2 className="font-display leading-none">
            <span className="block text-[clamp(2.5rem,8vw,5rem)] text-ink uppercase">RESULTADOS</span>
            <span className="block text-[clamp(2.5rem,8vw,5rem)] text-ink-5 uppercase">REAIS</span>
          </h2>
        </div>

        {/* Cases */}
        <div className="space-y-8">
          {CASES.map((c, i) => (
            <div
              key={c.id}
              className={`grid grid-cols-1 lg:grid-cols-2 border border-surface-3 hover:border-surface-3 transition-colors duration-300 group border-t-4 ${BORDER_COLORS[c.id] || 'border-t-primary'}`}
            >
              {/* Visual */}
              <div
                className={`relative bg-surface overflow-hidden min-h-[240px] lg:min-h-[380px] flex items-center justify-center ${
                  i % 2 !== 0 ? 'lg:order-last' : ''
                }`}
              >
                <div className="text-center p-10 select-none">
                  <p className={`font-display text-[4.5rem] leading-none uppercase tracking-widest opacity-[0.07] text-ink`}>
                    {c.nome.split(' ')[0]}
                  </p>
                  <p className={`font-display text-[2.5rem] leading-none uppercase mt-2 opacity-20 ${LABEL_COLORS[c.id] || 'text-primary'}`}>
                    {c.nome.split(' ').slice(1).join(' ')}
                  </p>
                </div>
                <div className="absolute top-0 left-0 w-10 h-10 border-t border-l border-surface-3 group-hover:border-primary/30 transition-colors duration-300" />
                <div className="absolute bottom-0 right-0 w-10 h-10 border-b border-r border-surface-3 group-hover:border-primary/30 transition-colors duration-300" />
                <span className="absolute top-4 right-4 font-display text-xs text-ink-5 tracking-widest uppercase">
                  Case {String(i + 1).padStart(2, '0')}
                </span>
              </div>

              {/* Content */}
              <div className="p-8 md:p-10 lg:p-12 flex flex-col justify-between">
                <div>
                  <h3 className={`font-display text-[2.2rem] md:text-[2.8rem] uppercase leading-none mb-2 ${LABEL_COLORS[c.id] || 'text-primary'}`}>
                    {c.nome}
                  </h3>
                  <p className="text-ink-5 text-sm leading-relaxed mb-6">{c.descricao}</p>

                  <div className="mb-6">
                    <p className="text-xs font-semibold uppercase tracking-widest text-ink-5 mb-2">Desafios</p>
                    <p className="text-ink-4 text-sm leading-relaxed">{c.desafios}</p>
                  </div>

                  <div className="mb-6">
                    <p className="text-xs font-semibold uppercase tracking-widest text-ink-5 mb-3">Resultados</p>
                    <ul className="space-y-2">
                      {c.resultados.slice(0, 4).map((r) => (
                        <li key={r} className="flex items-start gap-2 text-sm text-ink-4">
                          <span className={`flex-shrink-0 mt-0.5 font-semibold ${LABEL_COLORS[c.id] || 'text-primary'}`}>✓</span>
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="border-t border-surface-3 pt-5">
                  <p className={`text-xs font-semibold uppercase tracking-widest mb-2 ${LABEL_COLORS[c.id] || 'text-primary'}`}>Impacto</p>
                  <p className="text-ink font-semibold text-sm leading-relaxed">{c.impacto}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
