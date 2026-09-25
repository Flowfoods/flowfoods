import { TAGLINE, whatsappUrl } from '@/lib/constants';

const FATOS = [
  { valor: '14+', rotulo: 'anos no food service' },
  { valor: '16', rotulo: 'lojas e 5 marcas no delivery que opera hoje' },
  { valor: 'iFood', rotulo: 'conselheiro do Fórum de Restaurantes' },
];

/**
 * Abertura: a tagline como título, sobre creme, com o retrato ao lado. Sem
 * tela cheia — o resto da página precisa aparecer no primeiro rolar.
 */
export default function Hero() {
  const [frase1, frase2] = TAGLINE.split('. ');

  return (
    <section className="px-5 pb-14 pt-28 md:px-8 md:pb-20 md:pt-40">
      <div className="mx-auto grid max-w-6xl items-end gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
            Consultoria para restaurantes · Rio de Janeiro
          </p>
          <h1 className="mt-5 font-display text-[clamp(2.6rem,7vw,5.2rem)] font-bold leading-[1.02] tracking-tight text-ink [text-wrap:balance]">
            {frase1}.<br />
            <span className="text-ink-4">{frase2}</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-ink-3">
            Estrutura, rentabilidade e crescimento, do diagnóstico à execução. Seis frentes de
            trabalho, um ciclo contínuo, e um consultor que opera delivery todos os dias.
            Muito além do delivery.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a
              href={whatsappUrl('hero')}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[52px] items-center justify-center bg-primary px-8 text-[13px] font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:bg-primary-dark"
            >
              Falar no WhatsApp
            </a>
            <a
              href="#frentes"
              className="inline-flex min-h-[52px] items-center justify-center border border-ink/25 px-8 text-[13px] font-semibold uppercase tracking-[0.12em] text-ink transition-colors hover:border-ink"
            >
              Conhecer as frentes
            </a>
          </div>

          <dl className="mt-12 grid grid-cols-1 gap-6 border-t border-ink/10 pt-8 sm:grid-cols-3">
            {FATOS.map((f) => (
              <div key={f.rotulo}>
                <dt className="font-display text-3xl font-bold leading-none text-ink">{f.valor}</dt>
                <dd className="mt-2 max-w-[14rem] text-sm leading-snug text-ink-4">{f.rotulo}</dd>
              </div>
            ))}
          </dl>
        </div>

        <figure className="relative mx-auto w-full max-w-sm lg:max-w-none">
          <div className="overflow-hidden border border-ink/10 bg-papel p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/galeria/foto-7.jpg"
              alt="Rodolfo Cavalcante, chef e consultor da FlowFoods"
              width={860}
              height={1280}
              className="aspect-[3/4] w-full object-cover object-top"
            />
          </div>
          <figcaption className="mt-3 flex items-baseline justify-between text-[11px] uppercase tracking-[0.16em] text-ink-5">
            <span>Rodolfo Cavalcante</span>
            <span>Chef · Gestor · Consultor</span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
