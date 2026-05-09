'use client';

const FOTOS_ROW1 = [
  { src: '/images/galeria/foto-4.jpg', alt: 'Fórum iFood — Palco Principal' },
  { src: '/images/galeria/foto-5.jpg', alt: 'Rodolfo — Apresentação Nacional' },
  { src: '/images/galeria/foto-6.jpg', alt: 'Rodolfo — Evento Gastronômico' },
  { src: '/images/galeria/foto-3.jpg', alt: 'Fórum Restaurantes — Workshop' },
];

const FOTOS_ROW2 = [
  { src: '/images/galeria/foto-1.jpg', alt: 'Rodolfo Cavalcante' },
  { src: '/images/galeria/foto-7.jpg', alt: 'Rodolfo Cavalcante — Retrato' },
  { src: '/images/galeria/foto-2.jpg', alt: 'Equipe FlowFoods' },
  { src: '/images/galeria/foto-6.jpg', alt: 'Rodolfo — Evento' },
];

function FotoCard({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="w-72 h-52 flex-shrink-0 relative overflow-hidden bg-surface-2 group">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
        onError={(e) => {
          const el = e.currentTarget.parentElement;
          if (el) el.classList.add('foto-placeholder');
          e.currentTarget.style.display = 'none';
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-surface/50 via-transparent to-transparent" />
      <p className="absolute bottom-3 left-4 text-ink-4 text-[10px] font-semibold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        {alt}
      </p>
    </div>
  );
}

export default function Galeria() {
  const row1 = [...FOTOS_ROW1, ...FOTOS_ROW1];
  const row2 = [...FOTOS_ROW2, ...FOTOS_ROW2];

  return (
    <section className="bg-surface py-16 md:py-20 overflow-hidden">

      <div className="max-w-6xl mx-auto px-5 md:px-8 lg:px-12 mb-12">
        <p className="text-primary text-xs font-semibold tracking-[0.4em] uppercase mb-4">
          Trajetória
        </p>
        <h2 className="font-display uppercase leading-none">
          <span className="block text-[clamp(2.5rem,7vw,5rem)] text-ink">QUEM OPERA,</span>
          <span className="block text-[clamp(2.5rem,7vw,5rem)] text-ink-5">CONHECE O CHÃO.</span>
        </h2>
      </div>

      {/* Row 1 — esquerda */}
      <div className="overflow-hidden mb-4 [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
        <div
          className="flex gap-4 animate-scroll-left"
          style={{ width: 'max-content' }}
          onMouseEnter={(e) => (e.currentTarget.style.animationPlayState = 'paused')}
          onMouseLeave={(e) => (e.currentTarget.style.animationPlayState = 'running')}
        >
          {row1.map((foto, i) => <FotoCard key={i} {...foto} />)}
        </div>
      </div>

      {/* Row 2 — direita */}
      <div className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
        <div
          className="flex gap-4 animate-scroll-right"
          style={{ width: 'max-content' }}
          onMouseEnter={(e) => (e.currentTarget.style.animationPlayState = 'paused')}
          onMouseLeave={(e) => (e.currentTarget.style.animationPlayState = 'running')}
        >
          {row2.map((foto, i) => <FotoCard key={i} {...foto} />)}
        </div>
      </div>

      <p className="text-center text-ink-5 text-xs tracking-widest uppercase mt-8">
        FlowFoods · Fórum iFood · Eventos Nacionais
      </p>
    </section>
  );
}
