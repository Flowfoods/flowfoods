import { SINAIS } from '@/lib/constants';
import { Etiqueta, Secao } from './ui';

/** As perguntas que costumam trazer um dono de restaurante até aqui. */
export default function Sinais() {
  return (
    <Secao id="sinais" className="bg-ink text-surface">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div>
          <Etiqueta escura>Quando faz sentido</Etiqueta>
          <h2 className="mt-4 font-display text-3xl font-bold leading-tight [text-wrap:balance] md:text-4xl">
            Você reconhece a sua casa em alguma destas frases?
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-surface/70">
            Não são defeitos. São sinais de que a operação cresceu mais rápido que a gestão. É por
            aí que o diagnóstico começa.
          </p>
        </div>
        <ul className="divide-y divide-surface/15 border-y border-surface/15">
          {SINAIS.map((s, i) => (
            <li key={s} className="flex gap-6 py-6">
              <span className="font-display text-lg text-primary tabular-nums">{String(i + 1).padStart(2, '0')}</span>
              <p className="text-lg leading-snug text-surface/90 [text-wrap:pretty]">{s}</p>
            </li>
          ))}
        </ul>
      </div>
    </Secao>
  );
}
