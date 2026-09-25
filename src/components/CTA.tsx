import { CONTACT_INFO, TAGLINE, whatsappUrl } from '@/lib/constants';
import { Etiqueta, Secao } from './ui';

const ENTREGA = [
  'Análise prévia da sua loja no iFood',
  'Conversa de 30 minutos, online',
  'As 3 prioridades do seu negócio, por escrito',
];

/** O primeiro passo. Fecha com a tagline, como todo material da FlowFoods. */
export default function CTA() {
  return (
    <Secao id="contato" className="bg-ink text-surface">
      <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <div>
          <Etiqueta escura>Primeiro passo</Etiqueta>
          <h2 className="mt-4 font-display text-3xl font-bold leading-tight [text-wrap:balance] md:text-5xl">
            Comece pelo diagnóstico gratuito.
          </h2>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-surface/75">
            Se não fizer sentido seguir, você fica com as três prioridades do mesmo jeito.
          </p>
          <ul className="mt-8 divide-y divide-surface/15 border-y border-surface/15">
            {ENTREGA.map((e) => (
              <li key={e} className="py-3.5 text-base text-surface/90">
                {e}
              </li>
            ))}
          </ul>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a
              href="/diagnostico"
              className="inline-flex min-h-[52px] items-center justify-center bg-primary px-8 text-[13px] font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:bg-bright"
            >
              Fazer meu diagnóstico
            </a>
            <a
              href={whatsappUrl('diagnostico')}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[52px] items-center justify-center border border-surface/30 px-8 text-[13px] font-semibold uppercase tracking-[0.12em] text-surface transition-colors hover:border-surface"
            >
              WhatsApp {CONTACT_INFO.whatsappDisplay}
            </a>
          </div>
        </div>

        <div className="flex flex-col justify-end lg:items-end lg:text-right">
          <p className="font-display text-2xl italic leading-snug text-surface/80 md:text-3xl">{TAGLINE}</p>
          <p className="mt-4 text-sm text-surface/50">FlowFoods · Rio de Janeiro</p>
        </div>
      </div>
    </Secao>
  );
}
