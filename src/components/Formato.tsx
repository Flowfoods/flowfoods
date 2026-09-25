import { FORMATO, whatsappUrl } from '@/lib/constants';
import { Cartao, Etiqueta, Secao, Titulo } from './ui';

/** O formato da consultoria, sem letra miúda: o que entra, o que fica de fora, como se paga. */
export default function Formato() {
  return (
    <Secao id="formato">
      <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div>
          <Etiqueta>Formato</Etiqueta>
          <Titulo>Presença na casa, prestação de contas todo mês.</Titulo>
          <p className="mt-5 max-w-md text-base leading-relaxed text-ink-3">
            A consultoria é contratada por grupo, não por loja, e funciona em ciclos. O investimento
            é definido depois do diagnóstico inicial, quando o escopo está claro.
          </p>
          <a
            href={whatsappUrl('consultoria')}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex min-h-[52px] items-center justify-center border border-ink px-8 text-[13px] font-semibold uppercase tracking-[0.12em] text-ink transition-colors hover:bg-ink hover:text-surface"
          >
            Conversar sobre a consultoria
          </a>
        </div>

        <div className="grid gap-4">
          <Cartao>
            <dl className="divide-y divide-ink/10">
              {FORMATO.itens.map((i) => (
                <div key={i.rotulo} className="grid gap-1 py-3.5 first:pt-0 last:pb-0 sm:grid-cols-[11rem_1fr] sm:gap-6">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-5 sm:pt-1">{i.rotulo}</dt>
                  <dd className="text-[15px] font-medium text-ink">{i.valor}</dd>
                </div>
              ))}
            </dl>
          </Cartao>
          <Cartao>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-5">Fica fora do escopo</p>
            <ul className="mt-3 space-y-2">
              {FORMATO.foraDoEscopo.map((f) => (
                <li key={f} className="flex gap-3 text-[15px] leading-snug text-ink-3">
                  <span className="mt-[9px] h-px w-4 shrink-0 bg-ink/40" aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm leading-relaxed text-ink-4">
              Quando algum desses for necessário, a consultoria indica e acompanha, mas quem
              contrata é a casa.
            </p>
          </Cartao>
        </div>
      </div>
    </Secao>
  );
}
