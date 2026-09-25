import { SERVICOS } from '@/lib/constants';
import { Cartao, Etiqueta, Secao, Titulo } from './ui';

/** As seis frentes, em cartões claros. O número é etiqueta, não decoração: é a ordem do briefing. */
export default function Frentes() {
  return (
    <Secao id="frentes">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-xl">
          <Etiqueta>Seis frentes</Etiqueta>
          <Titulo>Estrutura, rentabilidade e crescimento. Na ordem que a sua marca precisa.</Titulo>
        </div>
        <p className="max-w-sm text-base leading-relaxed text-ink-4">
          As frentes não saem todas de uma vez. O diagnóstico diz por onde começar, e o plano segue
          a ordem das prioridades.
        </p>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SERVICOS.map((s, i) => (
          <Cartao key={s.id} className="flex flex-col">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-5">
              Frente {String(i + 1).padStart(2, '0')}
            </p>
            <h3 className="mt-3 font-display text-2xl font-semibold leading-tight text-ink">{s.titulo}</h3>
            <p className="mt-3 flex-1 text-[15px] leading-relaxed text-ink-3">{s.descricao}</p>
            <p className="mt-5 border-t border-ink/10 pt-4 text-[13px] font-medium text-ink">{s.beneficios[0]}</p>
          </Cartao>
        ))}
      </div>
    </Secao>
  );
}
