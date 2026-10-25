/**
 * O que forma um número de despesa do DRE (jornada 4, decisão 464), a MESMA tela no nível 1 e na pessoa do parceiro. Vem do
 * número da linha no DRE com a linha, o recorte apurado e a visão (rede ou uma loja). Síntese primeiro (o número, o período com
 * a situação dele e a visão), depois cada despesa da linha que cruza o recorte com a parte que cai nele (apropriação dia a dia, a
 * conta do DRE); o rodapé soma essas partes. Cada despesa abre o detalhe, que volta para cá; "Voltar para o DRE" (na linha de
 * onde veio) e "Todas as despesas de <mês>" desfazem o filtro.
 */

import Link from 'next/link';
import type { ComposicaoDaLinha, ParteDaDespesa } from '@/lib/erp/despesas';
import { formatarData } from '@/lib/erp/compra-campos';
import { mesesDoIntervalo, rotuloDaCompetencia } from '@/lib/erp/despesa-campos';
import { rotuloDoMes } from '@/lib/erp/faturamento-campos';
import { COR } from '@/lib/erp/modulos';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { ExplicacaoNoPonto } from '../../ui/ponto-de-ajuda';
import { Painel, Selo, Vazio } from '../../ui/superficies';
import { Voltar } from '../cadastro/partes';

const LINK_TOQUE = `${LINK_DE_TEXTO} inline-flex min-h-11 items-center sm:min-h-0 [@media(pointer:coarse)]:min-h-11`;

/** "6 de 31": quantos dias da despesa contam no período. */
const contam = (i: ParteDaDespesa) => `${i.diasNoRecorte} de ${i.dias}`;

/** O período de onde o número veio: o nome e a situação dele, como o DRE diz. Nulo = o recorte não é um período (endereço digitado). */
export interface PeriodoDaComposicao {
  nome: string;
  situacao: 'parcial' | 'encerrado' | 'fechado';
}

export function TelaDaComposicao({
  c,
  base,
  escopoNome,
  lojaId,
  recorte,
  periodo,
  voltarDre,
  aqui,
}: {
  c: ComposicaoDaLinha;
  /** `/erp/dre/despesas` ou `/rodolfo/erp/<slug>/dre/despesas`. */
  base: string;
  /** "Rede Completa", o nome da loja ou o parceiro (nível 1). */
  escopoNome: string;
  /** Visão de uma loja: a despesa da rede não entra (o DRE da loja não tem rateio). */
  lojaId?: string;
  recorte: { de: string; ate: string };
  periodo: PeriodoDaComposicao | null;
  /** O DRE do período, na mesma visão e na linha de onde veio. Nulo = quem lê não abre o DRE (só lança despesas). */
  voltarDre: string | null;
  /** A query desta tela (`?linha=…`), para o detalhe da despesa voltar para cá. */
  aqui: string;
}) {
  const nome = `${c.linha.nome} no DRE`;
  const ate = formatarData(recorte.ate, true);
  const quando = periodo
    ? `${periodo.nome}${periodo.situacao === 'parcial' ? ` · até ontem, ${ate}` : ''}`
    : `${formatarData(recorte.de)} a ${formatarData(recorte.ate)}`;
  const meses = mesesDoIntervalo(recorte.de, recorte.ate);
  const limpar = (mes: string) => `${base}?mes=${mes}${lojaId ? `&loja=${lojaId}` : ''}`;
  const detalhe = (id: string) => `${base}/${id}?volta=${encodeURIComponent(`${base}${aqui}`)}`;
  const n = c.itens.length;
  const total = formatarDinheiro(c.totalCentavos);
  const exemplo = c.itens.find((i) => i.diasNoRecorte < i.dias);
  return (
    <div className="space-y-6">
      {voltarDre && <Voltar href={voltarDre}>Voltar para o DRE</Voltar>}
      <PageHeader icone="dre" cor={COR.dre} titulo={nome} subtitulo={`${escopoNome} · ${quando}`}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {periodo && (periodo.situacao === 'parcial' ? <Selo tom="alerta">Parcial · até ontem</Selo> : periodo.situacao === 'fechado' ? <Selo tom="ok">Período fechado</Selo> : <Selo>Período encerrado</Selo>)}
          {meses.map((m) => (
            <Link key={m} href={limpar(m)} className={LINK_TOQUE}>
              Todas as despesas de {rotuloDoMes(m)}
              {lojaId ? `, ${escopoNome}` : ''}
            </Link>
          ))}
        </div>
      </PageHeader>

      <div className="rounded-[14px] border border-linha bg-painel px-4 py-3.5 sm:px-5">
        <div className="text-[12px] font-medium leading-snug text-suave">{nome}</div>
        <div className="pt-2 font-display text-[26px] font-bold leading-none tabular-nums">{total}</div>
        <div className="mt-1.5 text-[12px] text-suave">{n === 1 ? 'a soma de 1 despesa' : `a soma de ${n} despesas`}</div>
      </div>

      <Painel
        titulo={n === 0 ? 'Nenhuma despesa' : n === 1 ? `A despesa que forma ${total}` : `As ${n} despesas que formam ${total}`}
        subtitulo={`Cada despesa é espalhada pelos dias a que ela pertence; aqui contam só os dias deste período${periodo?.situacao === 'parcial' ? ' que já passaram' : ''}.${exemplo ? ` Ex.: ${exemplo.descricao}, ${formatarDinheiro(exemplo.valorCentavos)} em ${exemplo.dias} dias, contam ${exemplo.diasNoRecorte}: ${formatarDinheiro(exemplo.noRecorteCentavos)}.` : ''}`}
        semRespiro
      >
        {n === 0 ? (
          <Vazio titulo="Nenhuma despesa desta linha cai neste período.">Sem despesa lançada, a linha fica com traço no DRE.</Vazio>
        ) : (
          <>
            <ul className="divide-y divide-linha xl:hidden">
              {c.itens.map((i) => (
                <li key={i.id}>
                  <Link href={detalhe(i.id)} className="ff-transicao block px-4 py-3 hover:bg-texto/[0.04]">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="line-clamp-2 min-w-0 break-words text-sm font-medium text-texto">{i.descricao}</span>
                      <span className="shrink-0 text-[15px] font-semibold tabular-nums">{formatarDinheiro(i.noRecorteCentavos)}</span>
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-suave">{i.lojaNome ?? 'Rede'}</span>
                    <span className="block text-[12px] leading-snug text-suave">
                      {rotuloDaCompetencia(i.competencia)}: {formatarDinheiro(i.valorCentavos)}, contam {contam(i)} {i.dias === 1 ? 'dia' : 'dias'}
                    </span>
                  </Link>
                </li>
              ))}
              <li className="flex items-baseline justify-between gap-3 bg-forte px-4 py-3 text-sm font-semibold">
                <span>
                  {nome}
                  <span className="block text-[12px] font-normal text-suave">a soma de tudo acima</span>
                </span>
                <span className="tabular-nums">{total}</span>
              </li>
            </ul>
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Despesas que formam {nome}, {escopoNome}, {quando}: valor da despesa, dias que contam e o que entra no DRE
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
                      Pertence a
                    </th>
                    <th scope="col" className="h-10 px-3 text-right font-semibold">
                      Valor da despesa
                    </th>
                    <th scope="col" className="h-10 px-3 text-right font-semibold">
                      Dias que contam
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
                        <Link href={detalhe(i.id)} className={`${LINK_DE_TEXTO} block break-words`}>
                          {i.descricao}
                        </Link>
                        {i.recorrente && <span className="block text-[12px] font-normal text-suave">repete todo mês</span>}
                      </th>
                      <td className="px-3 py-2.5">{i.lojaNome ?? <span className="text-suave">Rede</span>}</td>
                      <td className="px-3 py-2.5">{rotuloDaCompetencia(i.competencia)}</td>
                      <td className="px-3 py-2.5 text-right">{formatarDinheiro(i.valorCentavos)}</td>
                      <td className="px-3 py-2.5 text-right">{contam(i)}</td>
                      <td className="px-5 py-2.5 text-right font-semibold">{formatarDinheiro(i.noRecorteCentavos)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="tabular-nums">
                  <tr className="border-t-2 border-linha-forte bg-forte font-semibold">
                    <th scope="row" colSpan={5} className="px-5 py-2.5 text-left">
                      {nome}
                      <span className="block text-[12px] font-normal text-suave">a soma de tudo acima</span>
                    </th>
                    <td className="px-5 py-2.5 text-right align-top">{total}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </Painel>
      <ExplicacaoNoPonto ponto="composicao">
        <p className="text-[12px] leading-relaxed text-suave">
          {lojaId ? 'Nesta loja não entram as despesas da rede (as que não são de uma loja, como o contador do grupo). ' : 'Na rede entram as despesas de cada loja e as da rede (as que não são de uma loja, como o contador do grupo). '}
          Cada despesa conta no período a que pertence, não no dia em que foi paga.
        </p>
      </ExplicacaoNoPonto>
    </div>
  );
}
