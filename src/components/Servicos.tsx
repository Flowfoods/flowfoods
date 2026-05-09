import { SERVICOS, CREDENCIAIS } from '@/lib/constants';

export default function Servicos() {
  return (
    <section id="servicos" className="bg-surface py-20 md:py-28 px-5 md:px-8 lg:px-12">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-16 md:mb-20" data-reveal>
          <div>
            <p className="text-primary text-xs font-semibold tracking-[0.4em] uppercase mb-4">Serviços</p>
            <h2 className="font-display leading-none uppercase">
              <span className="block text-[clamp(2.5rem,8vw,5rem)] text-ink">CONSULTORIA</span>
              <span className="block text-[clamp(2.5rem,8vw,5rem)] text-ink-5">360°</span>
            </h2>
          </div>
          <p className="text-ink-4 max-w-xs text-sm leading-relaxed md:text-right">
            Seis frentes integradas para estruturar, escalar e rentabilizar seu negócio.
          </p>
        </div>

        {/* Grid 3x2 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-surface-3 mb-16">
          {SERVICOS.map((servico, i) => (
            <div
              key={servico.id}
              className="relative bg-white p-8 md:p-10 group hover:bg-surface transition-colors duration-200"
            >
              {/* Número grande ao fundo */}
              <span className="absolute top-6 right-7 font-display text-7xl text-primary/[0.07] select-none group-hover:text-primary/[0.12] transition-colors duration-300 leading-none">
                {String(i + 1).padStart(2, '0')}
              </span>

              <div className="relative">
                <div className="text-3xl mb-4">{servico.icone}</div>
                <div className="w-8 h-0.5 bg-primary mb-4" />
                <h3 className="font-display text-xl md:text-2xl text-ink uppercase leading-tight mb-3">
                  {servico.titulo}
                </h3>
                <p className="text-ink-4 text-sm leading-relaxed mb-3">{servico.descricao}</p>
                {servico.beneficios[0] && (
                  <p className="text-primary text-xs font-semibold uppercase tracking-wide">
                    → {servico.beneficios[0]}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Credibility Callout — brief especifica este bloco */}
        <div className="bg-secondary/5 border border-secondary/15 rounded-none p-8 md:p-10">
          <p className="text-secondary text-xs font-semibold tracking-[0.4em] uppercase mb-5">
            Por que confiar em Rodolfo?
          </p>
          <ul className="space-y-3">
            {CREDENCIAIS.map((c) => (
              <li key={c} className="text-ink-3 text-sm leading-relaxed">
                {c}
              </li>
            ))}
          </ul>
          <p className="text-ink-5 text-xs mt-6 pt-6 border-t border-secondary/10 leading-relaxed">
            Projetos entregues no Rio de Janeiro: Bibi Sucos · Balada Mix · e outros
          </p>
        </div>

      </div>
    </section>
  );
}
