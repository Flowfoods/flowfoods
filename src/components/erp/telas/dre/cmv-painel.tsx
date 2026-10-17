/**
 * O painel "CMV: compra × real" (2.3, decisão 166), dentro da página do DRE (nenhuma rota nova).
 *
 * Só no período ENCERRADO. A compra é o que a casa comprou (data da nota); o real é o que ela consumiu
 * (estoque inicial + compras − estoque final, na contagem de fechamento). A diferença diz se o estoque
 * subiu ou desceu: comprar mais do que consumiu é dinheiro parado na prateleira. Por loja, com a soma das
 * lojas comparadas; quem ficou só pelas compras diz o motivo, e o painel nunca mostra número de loja que a
 * pessoa não alcança (a leitura já chega filtrada pelo alcance).
 */

import Link from 'next/link';
import { fraseDoSemPreco, type ComparacaoDaLoja } from '@/lib/erp/cmv-campos';
import { textoDaDiferenca, type PainelDoCmv } from '@/lib/erp/cmv-comparacao';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { Painel } from '../../ui/superficies';

const dinheiro = (c: number | null) => (c === null ? <span className="font-normal text-suave">sem nota</span> : formatarDinheiro(c));

function Avisos({ c }: { c: ComparacaoDaLoja }) {
  const itens = [fraseDoSemPreco(c.semPrecoInicial, 'inicial'), fraseDoSemPreco(c.semPrecoFinal, 'final')].filter((x): x is string => !!x);
  return (
    <>
      <p className="mt-1 text-[12px] leading-snug text-suave">{c.frase.charAt(0).toUpperCase() + c.frase.slice(1)}.</p>
      {itens.length > 0 && <p className="mt-0.5 text-[12px] leading-snug text-suave">{itens.join('; ').replace(/^./, (x) => x.toUpperCase())}.</p>}
    </>
  );
}

export function PainelDoCmv({
  painel,
  raiz,
  verCompras,
  verEstoque,
}: {
  painel: PainelDoCmv;
  /** `/erp` ou `/rodolfo/erp/<slug>`. */
  raiz: string;
  verCompras: boolean;
  verEstoque: boolean;
}) {
  const { comparacoes, total, semReal } = painel;
  if (comparacoes.length === 0 && semReal.length === 0) return null;
  return (
    <Painel
      titulo="CMV: compra × real"
      subtitulo="Compra é o que a casa comprou no período, pela data da nota. Real é o que ela consumiu: estoque inicial mais compras menos estoque final, na contagem de fechamento."
      semRespiro
    >
      {comparacoes.length > 0 && (
        <>
          <ul className="divide-y divide-linha sm:hidden">
            {comparacoes.map((c) => (
              <li key={c.lojaId} className="px-4 py-3">
                <p className="font-medium text-texto">{c.lojaNome}</p>
                <p className="mt-1 text-[13px] tabular-nums text-texto">
                  Compra {c.compraCentavos === null ? 'sem nota' : formatarDinheiro(c.compraCentavos)} · Real {formatarDinheiro(c.realCentavos)}
                </p>
                <p className="text-[13px] font-semibold tabular-nums text-texto">Diferença {textoDaDiferenca(c.diferencaCentavos, c.diferencaBp)}</p>
                <Avisos c={c} />
              </li>
            ))}
            {total && (
              <li className="bg-forte px-4 py-3">
                <p className="font-semibold text-texto">Lojas comparadas, somadas</p>
                <p className="mt-1 text-[13px] tabular-nums text-texto">
                  Compra {total.compraCentavos === null ? 'sem nota' : formatarDinheiro(total.compraCentavos)} · Real {formatarDinheiro(total.realCentavos)}
                </p>
                <p className="text-[13px] font-semibold tabular-nums text-texto">Diferença {textoDaDiferenca(total.diferencaCentavos, total.diferencaBp)}</p>
              </li>
            )}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[620px] text-sm">
              <caption className="sr-only">CMV de compra e real por loja, com a diferença e o estoque inicial e final</caption>
              <thead>
                <tr className="bg-forte text-left text-[12px] text-suave">
                  <th scope="col" className="h-10 px-5 font-semibold">
                    Loja
                  </th>
                  <th scope="col" className="h-10 px-3 text-right font-semibold">
                    Compra
                  </th>
                  <th scope="col" className="h-10 px-3 text-right font-semibold">
                    Real
                  </th>
                  <th scope="col" className="h-10 px-3 text-right font-semibold">
                    Real menos compra
                  </th>
                  <th scope="col" className="h-10 px-5 text-right font-semibold">
                    Estoque inicial e final
                  </th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {comparacoes.map((c) => (
                  <tr key={c.lojaId} className="border-t border-linha align-top">
                    <th scope="row" className="min-w-0 px-5 py-2 text-left font-medium">
                      {c.lojaNome}
                      <Avisos c={c} />
                    </th>
                    <td className="px-3 py-2 text-right">{dinheiro(c.compraCentavos)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatarDinheiro(c.realCentavos)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">{textoDaDiferenca(c.diferencaCentavos, c.diferencaBp)}</td>
                    <td className="whitespace-nowrap px-5 py-2 text-right">
                      {formatarDinheiro(c.inicialCentavos)} → {formatarDinheiro(c.finalCentavos)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {total && (
                <tfoot className="tabular-nums">
                  <tr className="border-t-2 border-linha-forte bg-forte font-semibold">
                    <th scope="row" className="px-5 py-2 text-left">
                      Lojas comparadas, somadas
                    </th>
                    <td className="px-3 py-2 text-right">{total.compraCentavos === null ? '—' : formatarDinheiro(total.compraCentavos)}</td>
                    <td className="px-3 py-2 text-right">{formatarDinheiro(total.realCentavos)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">{textoDaDiferenca(total.diferencaCentavos, total.diferencaBp)}</td>
                    <td className="whitespace-nowrap px-5 py-2 text-right">
                      {formatarDinheiro(total.inicialCentavos)} → {formatarDinheiro(total.finalCentavos)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
      {semReal.length > 0 && (
        <div className={comparacoes.length > 0 ? 'border-t border-linha px-4 py-3 sm:px-5' : 'px-4 py-3 sm:px-5'}>
          <p className="text-[13px] font-semibold text-texto">{comparacoes.length > 0 ? 'Sem o real, entram as compras' : 'O real ainda não foi apurado'}</p>
          <ul className="mt-1 space-y-0.5">
            {semReal.map((l) => (
              <li key={l.lojaId} className="text-[12px] leading-snug text-suave">
                <span className="font-medium text-texto">{l.lojaNome}</span>: {l.motivo}
                {verEstoque && /fechamento de estoque|contagem/.test(l.motivo) && (
                  <>
                    {' '}
                    <Link href={`${raiz}/estoque/${l.lojaId}/periodo`} className={LINK_DE_TEXTO}>
                      Ver o estoque
                    </Link>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {verCompras && (
        <p className="border-t border-linha px-4 py-2.5 text-[12px] text-suave sm:px-5">
          <Link href={`${raiz}/compras`} className={LINK_DE_TEXTO}>
            Ver as notas
          </Link>
          {' '}que entram na compra.
        </p>
      )}
    </Painel>
  );
}
