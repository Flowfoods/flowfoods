import { CASES } from '@/lib/constants';

export default function Cases() {
  return (
    <section id="cases" className="bg-white py-20 md:py-28 px-5 md:px-8 lg:px-12">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-12 md:mb-16" data-reveal>
          <p className="text-primary text-xs font-semibold tracking-[0.4em] uppercase mb-4">Cases</p>
          <h2 className="font-display leading-none mb-6">
            <span className="block text-[clamp(2.5rem,8vw,5rem)] text-ink uppercase">RESULTADOS</span>
            <span className="block text-[clamp(2.5rem,8vw,5rem)] text-ink-5 uppercase">REAIS</span>
          </h2>
          <p className="text-ink-4 text-sm max-w-lg leading-relaxed">
            Projetos entregues, não promessas. Cada linha abaixo representa um restaurante transformado.
          </p>
        </div>

        {/* Cases — linhas discretas */}
        <div className="border-t border-surface-3" data-reveal data-delay="1">
          {CASES.map((c) => (
            <div
              key={c.id}
              className="group flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 py-5 border-b border-surface-3 hover:border-primary/20 transition-colors duration-200"
            >
              {/* Check + nome */}
              <div className="flex items-center gap-3 sm:w-48 flex-shrink-0">
                <span className="text-primary font-bold text-lg leading-none">✓</span>
                <span className="font-display text-base md:text-lg text-ink uppercase tracking-wide">{c.nome}</span>
              </div>

              {/* Divisor vertical — só desktop */}
              <div className="hidden sm:block w-px h-5 bg-surface-3 flex-shrink-0" />

              {/* Resultados resumidos em linha */}
              <p className="text-ink-4 text-sm leading-relaxed flex-1">
                {c.resultados.slice(0, 3).join(' · ')}
              </p>

              {/* Impacto — tag discreta */}
              <span className="hidden md:block flex-shrink-0 text-[10px] font-semibold uppercase tracking-widest text-primary/70 border border-primary/20 px-3 py-1 group-hover:border-primary/50 transition-colors duration-200">
                Concluído
              </span>
            </div>
          ))}
        </div>

        {/* Nota de credibilidade */}
        <div className="mt-8 flex items-start gap-3" data-reveal data-delay="2">
          <span className="text-ink-5 text-xs mt-0.5">※</span>
          <p className="text-ink-5 text-xs leading-relaxed max-w-lg">
            Todos os cases são projetos reais com clientes reais no Rio de Janeiro. Resultados documentados e verificáveis mediante solicitação.
          </p>
        </div>

      </div>
    </section>
  );
}
