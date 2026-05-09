export default function Citacao() {
  return (
    <section className="relative bg-ink overflow-hidden">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2">

        {/* Texto — lado esquerdo escuro */}
        <div className="relative px-5 md:px-8 lg:px-16 py-20 md:py-28 flex flex-col justify-center">

          {/* Glow vermelho sutil */}
          <div
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse 80% 60% at 0% 50%, rgba(185,28,28,0.18) 0%, transparent 70%)',
            }}
          />

          <div className="relative">
            <div className="font-display text-primary/20 text-[7rem] leading-none select-none mb-[-2rem]">
              &ldquo;
            </div>

            <p className="font-display italic text-white/85 text-xl md:text-2xl lg:text-[1.6rem] leading-relaxed mb-10">
              Rodolfo Cavalcante passou 14 anos dentro dos restaurantes que outros consultores
              apenas visitam.{' '}
              <span className="text-primary not-italic font-semibold">
                A FlowFoods é esse conhecimento funcionando para o seu negócio.
              </span>
            </p>

            <div className="flex items-center gap-3">
              <div className="w-8 h-px bg-primary/40" />
              <p className="text-xs font-semibold tracking-[0.4em] uppercase text-white/30">
                FLOWFOODS · RIO DE JANEIRO
              </p>
            </div>
          </div>
        </div>

        {/* Foto — lado direito, exibe do topo */}
        <div className="relative h-72 lg:h-auto min-h-[320px] overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/galeria/foto-4.jpg"
            alt="Rodolfo Cavalcante"
            className="w-full h-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/30 to-transparent lg:block hidden" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/60 via-transparent to-transparent lg:hidden" />
        </div>

      </div>
    </section>
  );
}
