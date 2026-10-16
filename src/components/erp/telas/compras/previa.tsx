/**
 * Prévia do impacto de uma nota (1.5), vinda do servidor pelo "Conferir":
 * nada foi gravado. Diz o que muda no custo de cada insumo ("Cheddar:
 * R$ 42,51/kg → R$ 44,90/kg") e das fichas que usam esses insumos, em cascata.
 * Subir e descer são ditos em palavra, não só por cor.
 */

import type { PreviaDaNota } from '@/lib/erp/compras';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { Painel } from '../../ui/superficies';

const EFEITO = {
  sobe: 'sobe',
  desce: 'desce',
  igual: 'igual',
  primeira: 'primeiro preço',
  'nao-muda': 'não muda',
} as const;

const MOSTRA_NO_CELULAR = 3;

function ItemDaFicha({ f, className = '' }: { f: PreviaDaNota['fichas'][number]; className?: string }) {
  return (
    <li className={`py-2.5 text-sm ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-medium text-texto">{f.nome}</span>
        <span className="text-[12px] text-suave">{f.tipo}</span>
      </div>
      <div className="tabular-nums text-suave">
        {f.antes} <span aria-hidden>→</span>
        <span className="sr-only"> passa a </span> <span className="font-semibold text-texto">{f.depois}</span>
        <span className={`ml-2 text-[12px] font-semibold ${f.sobe ? 'text-erro' : 'text-ok'}`}>{f.sobe ? 'sobe' : 'desce'}</span>
      </div>
      <div className="text-[12px] text-suave">{f.porQue}</div>
    </li>
  );
}

export function PreviaDoImpacto({ previa: p }: { previa: PreviaDaNota }) {
  const confere = p.somaItensCentavos + p.freteCentavos === p.totalCentavos;
  return (
    <section aria-live="polite" aria-label="Prévia: o que muda no custo" className="space-y-4">
      <Painel titulo="Prévia: o que muda no custo" subtitulo="Conferido no servidor. Nada foi gravado: lance a nota para valer.">
        <p className="text-sm tabular-nums">
          Itens {formatarDinheiro(p.somaItensCentavos)} + frete {formatarDinheiro(p.freteCentavos)} = <span className="font-semibold">{formatarDinheiro(p.somaItensCentavos + p.freteCentavos)}</span>
          {confere ? <span className="text-ok"> · confere com o total da nota</span> : null}
        </p>
        <ul className="mt-3 divide-y divide-linha border-y border-linha">
          {p.custos.map((i) => (
            <li key={i.insumoId} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 py-2.5 text-sm">
              <span className="min-w-0 font-medium text-texto">{i.nome}</span>
              <span className={`text-right text-[12px] font-semibold ${i.efeito === 'sobe' ? 'text-erro' : i.efeito === 'desce' ? 'text-ok' : 'text-suave'}`}>{EFEITO[i.efeito]}</span>
              <span className="col-span-2 tabular-nums text-suave">
                {i.efeito === 'nao-muda' ? (
                  <>
                    Fica {i.antes}: vale a nota de {i.vale}, mais nova que esta.
                  </>
                ) : (
                  <>
                    {i.antes} <span aria-hidden>→</span>
                    <span className="sr-only"> passa a </span> <span className="font-semibold text-texto">{i.depois}</span>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <h3 className="text-[13px] font-semibold text-texto">Estoque</h3>
          <p className="mt-1 text-sm text-suave">{p.estoque.frase}</p>
        </div>
        <div className="mt-4">
          <h3 className="text-[13px] font-semibold text-texto">Fichas que mudam junto</h3>
          {p.fichas.length === 0 ? (
            <p className="mt-1 text-sm text-suave">Nenhuma ficha usa estes insumos com custo diferente.</p>
          ) : (
            <>
              {/* Maior alta primeiro. No celular, as 3 primeiras e o resto em "ver todas"; a partir de 640 px, todas. */}
              <ul className="mt-1 divide-y divide-linha">
                {p.fichas.map((f, n) => (
                  <ItemDaFicha key={f.id} f={f} className={n >= MOSTRA_NO_CELULAR ? 'hidden sm:block' : ''} />
                ))}
                {p.maisFichas > 0 && <li className="hidden py-2.5 text-[13px] text-suave sm:block">E mais {p.maisFichas} fichas.</li>}
              </ul>
              {p.fichas.length > MOSTRA_NO_CELULAR && (
                <details className="sm:hidden">
                  <summary className="ff-transicao flex min-h-11 cursor-pointer items-center text-[13px] font-semibold text-texto underline decoration-linha-forte underline-offset-4">
                    Ver todas as {p.fichas.length + p.maisFichas} fichas
                  </summary>
                  <ul className="divide-y divide-linha">
                    {p.fichas.slice(MOSTRA_NO_CELULAR).map((f) => (
                      <ItemDaFicha key={f.id} f={f} />
                    ))}
                    {p.maisFichas > 0 && <li className="py-2.5 text-[13px] text-suave">E mais {p.maisFichas} fichas.</li>}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      </Painel>
    </section>
  );
}
