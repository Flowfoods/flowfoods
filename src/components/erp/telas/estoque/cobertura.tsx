/**
 * Cobertura do período contra o piso (1.7): duas barras (valor e insumos),
 * cada uma com a marca do piso e o número em texto — a cor só reforça
 * ("atinge" / "abaixo do piso" vêm escritos).
 */

import type { Cobertura, RegrasDaContagem } from '@/lib/erp/contagem-campos';
import { porcento } from '@/lib/erp/contagem-campos';
import { formatarDinheiro } from '@/lib/erp/unidades';

function BarraDoPiso({ rotulo, bp, pisoBp, detalhe, atinge }: { rotulo: string; bp: number; pisoBp: number; detalhe: string; atinge: boolean }) {
  const pct = Math.min(100, bp / 100);
  const piso = Math.min(100, pisoBp / 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-medium text-texto">{rotulo}</span>
        <span className="tabular-nums">
          <span className="font-semibold text-texto">{porcento(bp)}</span>
          <span className="text-suave"> · piso {porcento(pisoBp)}</span>
        </span>
      </div>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label={`${rotulo}: ${porcento(bp)}, piso ${porcento(pisoBp)}, ${atinge ? 'atinge' : 'abaixo do piso'}`}
        className="relative mt-1.5 h-2 w-full rounded-full bg-texto/10"
      >
        <div className={`h-full rounded-full ${atinge ? 'bg-ok' : 'bg-atencao'}`} style={{ width: `${pct}%` }} />
        <div aria-hidden className="absolute -top-1 h-4 w-0.5 rounded-full bg-texto" style={{ left: `calc(${piso}% - 1px)` }} />
      </div>
      <p className="mt-1 text-[12px] tabular-nums text-suave">
        {detalhe} · <span className={atinge ? 'text-ok' : 'text-atencao'}>{atinge ? 'atinge' : 'abaixo do piso'}</span>
      </p>
    </div>
  );
}

/** `verValores` falso (quem não vê as compras da loja, como o operador): a barra do valor fica, sem os R$ (24/10/2026). */
export function CoberturaComPiso({ c, regras, verValores = true }: { c: Cobertura; regras: Pick<RegrasDaContagem, 'pisoValorBp' | 'pisoItensBp'>; verValores?: boolean }) {
  return (
    <div className="space-y-4">
      <BarraDoPiso
        rotulo="Do valor do estoque"
        bp={c.valor.bp}
        pisoBp={regras.pisoValorBp}
        atinge={c.atingeValor}
        detalhe={verValores ? `${formatarDinheiro(c.valor.contadoCentavos)} de ${formatarDinheiro(c.valor.totalCentavos)} contados${c.semPreco ? ` (${c.semPreco} sem custo informado fora)` : ''}` : 'medido pelo valor do estoque da loja'}
      />
      <BarraDoPiso rotulo="Dos insumos" bp={c.itens.bp} pisoBp={regras.pisoItensBp} atinge={c.atingeItens} detalhe={`${c.itens.contados} de ${c.itens.total} contados`} />
    </div>
  );
}
