/**
 * O que forma um número de despesa do DRE (jornada 4, decisão 464), a MESMA tela no nível 1 e na pessoa do parceiro. Vem do
 * número da linha no DRE com a linha, o recorte apurado e a visão (rede ou uma loja); mostra cada despesa da linha que cruza o
 * recorte com a parte que cai nele (apropriação dia a dia, a conta do DRE). O rodapé soma essas partes: é o número do DRE.
 * Cada despesa abre o detalhe, que volta para cá; "Voltar para o DRE" e "Todas as despesas de <mês>" desfazem o filtro.
 */

import Link from 'next/link';
import type { ComposicaoDaLinha, ParteDaDespesa } from '@/lib/erp/despesas';
import { formatarData } from '@/lib/erp/compra-campos';
import { rotuloDaCompetencia } from '@/lib/erp/despesa-campos';
import { rotuloDoMes } from '@/lib/erp/faturamento-campos';
import { COR } from '@/lib/erp/modulos';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { Contagem, Painel, Vazio } from '../../ui/superficies';

const LINK_TOQUE = `${LINK_DE_TEXTO} inline-flex min-h-11 items-center sm:min-h-0 [@media(pointer:coarse)]:min-h-11`;

/** "6 de 31 dias", "1 de 1 dia": quantos dias da competência caem no recorte. */
const parte = (i: ParteDaDespesa) => `${i.diasNoRecorte} de ${i.dias} ${i.dias === 1 ? 'dia' : 'dias'}`;

export function TelaDaComposicao({
  c,
  base,
  escopoNome,
  daLoja,
  recorte,
  voltarDre,
  aqui,
}: {
  c: ComposicaoDaLinha;
  /** `/erp/dre/despesas` ou `/rodolfo/erp/<slug>/dre/despesas`. */
  base: string;
  /** "Rede Completa", o nome da loja ou o parceiro (nível 1). */
  escopoNome: string;
  /** Visão de uma loja: a despesa da rede não entra (o DRE da loja não tem rateio). */
  daLoja: boolean;
  recorte: { de: string; ate: string };
  /** O DRE do período, na mesma visão. Nulo = quem lê não abre o DRE (só lança despesas). */
  voltarDre: string | null;
  /** A query desta tela (`?linha=…`), para o detalhe da despesa voltar para cá. */
  aqui: string;
}) {
  const quando = `${formatarData(recorte.de)} a ${formatarData(recorte.ate)}`;
  const mes = recorte.de.slice(0, 7);
  const limpar = `${base}?mes=${mes}`;
  const detalhe = (id: string) => `${base}/${id}?volta=${encodeURIComponent(`${base}${aqui}`)}`;
  const n = c.itens.length;
  return (
    <div className="space-y-6">
      <PageHeader icone="compras" cor={COR.dre} titulo={`${c.linha.nome} no DRE`} subtitulo={`${escopoNome} · ${quando}`}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {voltarDre && (
            <Link href={voltarDre} className={LINK_TOQUE}>
              Voltar para o DRE
            </Link>
          )}
          <Link href={limpar} className={LINK_TOQUE}>
            Todas as despesas de {rotuloDoMes(mes)}
          </Link>
        </div>
      </PageHeader>

      <Painel
        titulo="Despesas que formam este número"
        subtitulo={`Cada despesa entra com a parte dos dias dela que cai em ${quando}: a mesma conta do DRE, dia a dia, ao centavo.`}
        acessorio={<Contagem>{n}</Contagem>}
        semRespiro
      >
        {n === 0 ? (
          <Vazio titulo="Nenhuma despesa desta linha cai neste recorte.">Sem despesa lançada, a linha fica com traço no DRE.</Vazio>
        ) : (
          <>
            <ul className="divide-y divide-linha lg:hidden">
              {c.itens.map((i) => (
                <li key={i.id}>
                  <Link href={detalhe(i.id)} className="ff-transicao block px-4 py-3 hover:bg-texto/[0.04]">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium text-texto">{i.descricao}</span>
                      <span className="shrink-0 text-[15px] font-semibold tabular-nums">{formatarDinheiro(i.noRecorteCentavos)}</span>
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-suave">
                      {i.lojaNome ?? 'Rede'} · {rotuloDaCompetencia(i.competencia)} · {formatarDinheiro(i.valorCentavos)}, {parte(i)} no recorte
                    </span>
                  </Link>
                </li>
              ))}
              <li className="flex items-baseline justify-between gap-3 bg-forte px-4 py-3 text-sm font-semibold">
                <span>Soma, o número do DRE</span>
                <span className="tabular-nums">{formatarDinheiro(c.totalCentavos)}</span>
              </li>
            </ul>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[760px] text-sm">
                <caption className="sr-only">
                  Despesas que formam {c.linha.nome} no DRE de {quando}, {escopoNome}: valor inteiro, dias no recorte e a parte que entra
                </caption>
                <thead>
                  <tr className="bg-forte text-left text-[12px] text-suave">
                    <th scope="col" className="h-10 px-5 font-semibold">
                      Despesa
                    </th>
                    <th scope="col" className="h-10 px-3 font-semibold">
                      Loja
                    </th>
                    <th scope="col" className="h-10 px-3 font-semibold">
                      Competência
                    </th>
                    <th scope="col" className="h-10 px-3 text-right font-semibold">
                      Valor inteiro
                    </th>
                    <th scope="col" className="h-10 px-3 text-right font-semibold">
                      Dias no recorte
                    </th>
                    <th scope="col" className="h-10 px-5 text-right font-semibold">
                      Entra no DRE
                    </th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {c.itens.map((i) => (
                    <tr key={i.id} className="border-t border-linha align-top">
                      <th scope="row" className="max-w-[22rem] px-5 py-2.5 text-left font-medium">
                        <Link href={detalhe(i.id)} className={`${LINK_DE_TEXTO} block truncate`}>
                          {i.descricao}
                        </Link>
                        {i.recorrente && <span className="block text-[12px] font-normal text-suave">repete todo mês</span>}
                      </th>
                      <td className="px-3 py-2.5">{i.lojaNome ?? <span className="text-suave">Rede</span>}</td>
                      <td className="px-3 py-2.5">{rotuloDaCompetencia(i.competencia)}</td>
                      <td className="px-3 py-2.5 text-right">{formatarDinheiro(i.valorCentavos)}</td>
                      <td className="px-3 py-2.5 text-right">{parte(i)}</td>
                      <td className="px-5 py-2.5 text-right font-semibold">{formatarDinheiro(i.noRecorteCentavos)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="tabular-nums">
                  <tr className="border-t-2 border-linha-forte bg-forte font-semibold">
                    <th scope="row" colSpan={5} className="px-5 py-2.5 text-left">
                      Soma, o número do DRE
                    </th>
                    <td className="px-5 py-2.5 text-right">{formatarDinheiro(c.totalCentavos)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </Painel>
      <p className="text-[12px] leading-relaxed text-suave">
        {daLoja ? 'Na visão de uma loja, a despesa da rede (sem loja) não entra: o DRE da loja não tem rateio.' : 'Na rede entram as despesas de cada loja e as da rede (sem loja).'} Despesa conta pela competência, não pelo dia em que foi paga.
      </p>
    </div>
  );
}
