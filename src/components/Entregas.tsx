import { ENTREGAS, whatsappUrl } from '@/lib/constants';
import { Cartao, Etiqueta, Secao, Titulo } from './ui';

/**
 * O que a casa recebe. Sem termos comerciais: visitas, prazo, investimento e
 * escopo variam por cliente e ficam na proposta.
 */
export default function Entregas() {
  return (
    <Secao id="entregas">
      <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div>
          <Etiqueta>O que a casa recebe</Etiqueta>
          <Titulo>Documento na mesa, não conversa solta.</Titulo>
          <p className="mt-5 max-w-md text-base leading-relaxed text-ink-3">
            Cada ciclo deixa registro do que foi visto, do que foi combinado e do que foi feito.
            A equipe fica com o material para manter o padrão depois.
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
              {ENTREGAS.documentos.map((i) => (
                <div key={i.rotulo} className="grid gap-1 py-3.5 first:pt-0 last:pb-0 sm:grid-cols-[11rem_1fr] sm:gap-6">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-5 sm:pt-1">{i.rotulo}</dt>
                  <dd className="text-[15px] font-medium leading-snug text-ink">{i.valor}</dd>
                </div>
              ))}
            </dl>
          </Cartao>
          <Cartao>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-5">Como se combina</p>
            <ul className="mt-3 space-y-2">
              {ENTREGAS.comoSeCombina.map((f) => (
                <li key={f} className="flex gap-3 text-[15px] leading-snug text-ink-3">
                  <span className="mt-[9px] h-px w-4 shrink-0 bg-ink/40" aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm leading-relaxed text-ink-4">
              Os termos de cada trabalho ficam na proposta, feita depois da primeira conversa.
            </p>
          </Cartao>
        </div>
      </div>
    </Secao>
  );
}
