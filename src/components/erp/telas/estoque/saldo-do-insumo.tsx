/**
 * No detalhe do insumo (1.6): o saldo dele em cada loja onde a pessoa vê o
 * estoque (o alcance decide; loja fora dele nem sai do servidor), com o valor
 * pelo custo de referência de hoje. Loja sem estoque aberto diz isso, sem
 * inventar zero.
 */

import Link from 'next/link';
import type { SaldoDoInsumoNaLoja } from '@/lib/erp/estoque';
import { formatarDinheiro, formatarQuantidade, type Unidade } from '@/lib/erp/unidades';
import { Painel } from '../../ui/superficies';

export function PainelEstoqueDoInsumo({ saldos, unidade, estoqueBase }: { saldos: SaldoDoInsumoNaLoja[]; unidade: Unidade; estoqueBase: string }) {
  if (saldos.length === 0) return null;
  return (
    <Painel titulo="Estoque por loja" subtitulo="Saldo de agora; valor pelo custo de referência" semRespiro>
      <ul className="divide-y divide-linha">
        {saldos.map((s) => (
          <li key={s.lojaId}>
            <Link href={`${estoqueBase}/${s.lojaId}`} className="ff-transicao flex min-h-12 items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-texto/[0.03] sm:px-5">
              <span className="min-w-0 truncate font-medium text-texto">{s.loja}</span>
              {s.quantidadeMilesimos === null ? (
                <span className="shrink-0 text-[13px] text-suave">{s.estado === 'EM_CONTAGEM' ? 'em contagem' : 'estoque não aberto'}</span>
              ) : (
                <span className="shrink-0 text-right tabular-nums">
                  <span className={`block font-semibold ${s.quantidadeMilesimos < 0 ? 'text-erro' : 'text-texto'}`}>
                    {s.quantidadeMilesimos < 0 ? `−${formatarQuantidade(-s.quantidadeMilesimos, unidade)}` : formatarQuantidade(s.quantidadeMilesimos, unidade)}
                  </span>
                  {s.verValores && <span className="block text-[12px] text-suave">{s.valorCentavos === null ? 'valor pendente' : formatarDinheiro(s.valorCentavos)}</span>}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </Painel>
  );
}
