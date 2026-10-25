import { CONTACT_INFO, TAGLINE, whatsappUrl } from '@/lib/constants';
import FormComecar from './FormComecar';
import { Etiqueta, Secao } from './ui';

const COMO_COMECA = [
  'Uma conversa sobre a sua casa: o que pesa hoje e o que você quer que mude',
  'Diagnóstico inicial de duas semanas: operação, números, cardápio, canais e cozinha',
  'Plano de ação com prioridades, responsáveis e prazos, combinado com os sócios',
];

/** O convite. Fecha com a tagline, como todo material da FlowFoods. */
export default function CTA() {
  return (
    <Secao id="contato" className="bg-bloco text-bloco-texto">
      <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <div>
          <Etiqueta escura>Vamos conversar</Etiqueta>
          <h2 className="mt-4 font-display text-3xl font-bold leading-tight [text-wrap:balance] md:text-5xl">
            Conte como está a sua casa.
          </h2>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-bloco-texto/75">
            Uma mensagem no WhatsApp, ou o formulário, bastam para começar. Assim funciona daí em diante:
          </p>
          <ol className="mt-8 divide-y divide-bloco-texto/15 border-y border-bloco-texto/15">
            {COMO_COMECA.map((e, i) => (
              <li key={e} className="flex gap-5 py-3.5 text-base text-bloco-texto/90">
                <span className="font-display text-bloco-realce tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                {e}
              </li>
            ))}
          </ol>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a
              href={whatsappUrl('diagnostico')}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[52px] items-center justify-center bg-primary px-8 text-[13px] font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:bg-bright"
            >
              WhatsApp {CONTACT_INFO.whatsappDisplay}
            </a>
            <a
              href={CONTACT_INFO.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[52px] items-center justify-center border border-bloco-texto/30 px-8 text-[13px] font-semibold uppercase tracking-[0.12em] text-bloco-texto transition-colors hover:border-bloco-texto"
            >
              Instagram @{CONTACT_INFO.instagram}
            </a>
          </div>
        </div>

        <FormComecar />
      </div>

      <div className="mt-14 border-t border-bloco-texto/15 pt-8 lg:flex lg:items-end lg:justify-between lg:gap-8">
        <p className="font-display text-2xl italic leading-snug text-bloco-texto/80 md:text-3xl">{TAGLINE}</p>
        <p className="mt-4 text-sm text-bloco-texto/50 lg:mt-0">FlowFoods · Rio de Janeiro</p>
      </div>
    </Secao>
  );
}
