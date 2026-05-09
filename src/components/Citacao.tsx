export default function Citacao() {
  return (
    <section className="relative bg-ink py-24 md:py-36 px-5 md:px-8 lg:px-12 overflow-hidden">

      {/* Foto de fundo */}
      <div className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/galeria/foto-4.jpg"
          alt=""
          aria-hidden="true"
          className="w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-ink/88" />
      </div>

      {/* Glow laranja sutil */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(249,115,22,0.15) 0%, transparent 70%)',
        }}
      />

      <div className="relative max-w-4xl mx-auto text-center">
        <div className="font-display text-primary/25 text-[8rem] leading-none select-none mb-[-2rem]">
          &ldquo;
        </div>

        <p className="font-display italic text-white/85 text-xl md:text-2xl lg:text-[1.75rem] leading-relaxed mb-10">
          Rodolfo Cavalcante passou 14 anos dentro dos restaurantes que outros consultores
          apenas visitam.{' '}
          <span className="text-primary not-italic font-semibold">
            A FlowFoods é esse conhecimento funcionando para o seu negócio.
          </span>
        </p>

        <div className="flex items-center justify-center gap-3">
          <div className="w-8 h-px bg-primary/40" />
          <p className="text-xs font-semibold tracking-[0.4em] uppercase text-white/30">
            FLOWFOODS · CONSULTORIA GASTRONÔMICA · RIO DE JANEIRO
          </p>
          <div className="w-8 h-px bg-primary/40" />
        </div>
      </div>
    </section>
  );
}
