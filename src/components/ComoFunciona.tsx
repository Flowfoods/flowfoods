import { PRINCIPIOS, PROCESSO } from '@/lib/constants';
import { Etiqueta, Secao, Titulo } from './ui';

/** O ciclo em quatro passos e os três princípios que o sustentam. */
export default function ComoFunciona() {
  return (
    <Secao id="como-funciona" className="bg-papel">
      <div className="max-w-2xl">
        <Etiqueta>Como funciona</Etiqueta>
        <Titulo>Um ciclo, não um pacote. O acompanhamento reabre o diagnóstico.</Titulo>
      </div>

      <ol className="mt-12 grid gap-px border border-ink/10 bg-ink/10 md:grid-cols-2 lg:grid-cols-4">
        {PROCESSO.map((e) => (
          <li key={e.numero} className="bg-papel p-6 md:p-7">
            <span className="font-display text-3xl font-bold text-primary tabular-nums">{e.numero}</span>
            <h3 className="mt-4 font-display text-xl font-semibold leading-tight text-ink">{e.titulo}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-3">{e.descricao}</p>
          </li>
        ))}
      </ol>

      <div className="mt-16 grid gap-10 border-t border-ink/10 pt-12 lg:grid-cols-3">
        {PRINCIPIOS.map((p) => (
          <div key={p.titulo}>
            <h3 className="font-display text-xl font-semibold leading-tight text-ink">{p.titulo}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-3">{p.texto}</p>
          </div>
        ))}
      </div>
    </Secao>
  );
}
