// Scanner avoid-ai-design, SD4d (P2) aceito: "x % da receita · sem contar o CMV" e "apurado até ontem, 15/10" são as linhas de apoio do resultado e do período, no padrão "A · B" das telas da 1.1–2.1.
/**
 * O DRE realizado (2.2a), a MESMA tela no nível 1 e na pessoa do parceiro.
 * Corporativo/data-first: tabela densa, números tabulares à direita, linhas de
 * grupo e de resultado claras. O período em curso mostra o PARCIAL ao vivo até
 * ontem (hoje fica em aberto), sem projeção. A rede e a loja são duas visões:
 * a rede soma as lojas e as despesas da rede; a loja traz só o que é dela.
 */

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatarData } from '@/lib/erp/compra-campos';
import { textoDoPercentual, type LinhaDoDre } from '@/lib/erp/dre-campos';
import { CODIGO, codigoDoSubtotal } from '@/lib/erp/dre-plano';
import type { DreDoPeriodo } from '@/lib/erp/dre';
import { COR } from '@/lib/erp/modulos';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso, Barra, Contagem, Metrica, Painel, Selo, Vazio } from '../../ui/superficies';
import { BotaoOuMotivo } from '../cadastro/partes';
import { dataCurta } from '../faturamento/formato';

export interface PermissoesDaTela {
  lancarDespesa: boolean;
  verFaturamento: boolean;
  verPrecos: boolean;
  /** A pessoa tem a rede inteira: pode alternar entre a rede e uma loja. */
  veRede: boolean;
}

const CUSTOS = new Set(['DEDUCAO', 'CMV', 'DESPESA_VARIAVEL', 'PESSOAL', 'OCUPACAO', 'UTILIDADES', 'ADMINISTRATIVA', 'MARKETING', 'OUTRAS', 'FINANCEIRA']);

/** "−" na frente do nome das linhas que se subtraem, "=" nos resultados: a leitura de um DRE em papel. */
function prefixo(l: LinhaDoDre): string {
  if (l.tipo === 'resultado') return '= ';
  if (l.nivel === 0 && (l.tipo === 'cmv' || (l.tipo === 'subtotal' && l.codigo !== codigoDoSubtotal('RECEITA') && CUSTOS.has(l.codigo!.replace('grupo:', ''))))) return '(−) ';
  return '';
}

function Celula({ l, semFaturamento }: { l: LinhaDoDre; semFaturamento: boolean }) {
  if (l.valorCentavos === null) return <span className="text-[13px] font-normal text-suave">{l.nota}</span>;
  // Zero é "nada lançado" (nunca R$ 0,00 no lugar de dado ausente); só um resultado que fechou em zero com receita mostra o zero.
  if (l.valorCentavos === 0 && (l.tipo !== 'resultado' || semFaturamento)) return <span className="font-normal text-suave">—</span>;
  const negativo = l.valorCentavos < 0;
  return <span className={negativo && l.tipo === 'resultado' ? 'text-erro' : undefined}>{formatarDinheiro(l.valorCentavos)}</span>;
}

function Tabela({ d, raiz, pode }: { d: DreDoPeriodo; raiz: string; pode: PermissoesDaTela }) {
  const r = d.resultado;
  const daLoja = d.escopo.tipo === 'loja';
  const rotuloDoResultado = (l: LinhaDoDre) => (l.codigo === CODIGO.resultado && daLoja ? 'Resultado do período, antes das despesas da rede' : l.nome);
  /** Linha de despesa ou grupo sem valor: no celular fica escondida até a pessoa pedir (o DRE inteiro tem mais de 40 linhas). */
  const zerada = (l: LinhaDoDre) => (l.tipo === 'linha' || l.tipo === 'subtotal') && l.valorCentavos === 0 && l.codigo !== codigoDoSubtotal('RECEITA');
  const nZeradas = r.linhas.filter(zerada).length;
  return (
    <div>
      {nZeradas > 0 && (
        <>
          <input type="checkbox" id="dre-zeradas" className="peer sr-only sm:hidden" />
          <label htmlFor="dre-zeradas" className="block cursor-pointer border-b border-linha px-4 py-2.5 text-[13px] text-texto underline decoration-linha-forte underline-offset-4 peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-[-3px] peer-focus-visible:outline-acento peer-checked:[&>span:first-child]:hidden peer-checked:[&>span:last-child]:inline sm:hidden">
            <span>Mostrar linhas zeradas ({nZeradas})</span>
            <span className="hidden">Esconder linhas zeradas</span>
          </label>
        </>
      )}
    <div className="overflow-x-auto [@media(max-width:639px)]:[&_tr[data-zerada]]:hidden [@media(max-width:639px)]:peer-checked:[&_tr[data-zerada]]:table-row">
      <table className="w-full text-sm">
        <caption className="sr-only">
          DRE de {d.periodo.nome}, {d.escopo.tipo === 'loja' ? d.escopo.nome : 'rede completa'}, em reais e em percentual da receita bruta
        </caption>
        <thead>
          <tr className="bg-forte text-left text-[12px] text-suave">
            <th scope="col" className="h-10 px-4 font-semibold sm:px-5">
              Linha
            </th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">
              Realizado
            </th>
            <th scope="col" className="h-10 w-[5.5rem] px-3 text-right font-semibold sm:w-24 sm:px-5">
              <span className="sm:hidden">% rec.</span>
              <span className="hidden sm:inline">% da receita</span>
            </th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {r.linhas.map((l) => {
            const grupo = l.tipo === 'subtotal' || l.tipo === 'cmv';
            const resultado = l.tipo === 'resultado';
            const linha = resultado ? 'border-t-2 border-linha-forte bg-forte font-semibold' : grupo ? 'border-t border-linha bg-forte/50 font-semibold' : 'border-t border-linha';
            const apoio: string[] = [];
            if (l.semContar.length) apoio.push(`sem contar ${l.semContar.join(' e ')}`);
            if (l.tipo !== 'cmv' && l.valorCentavos !== null && l.nota && l.tipo !== 'subtotal') apoio.push(l.nota);
            if (l.tipo === 'taxa' && l.valorCentavos === null) apoio.push(l.nota!);
            return (
              <tr key={l.chave} data-zerada={zerada(l) ? '' : undefined} className={`${linha} ${l.tipo === 'cmv' ? 'text-suave' : ''}`}>
                <th scope="row" className={`min-w-0 py-2 text-left align-top ${l.nivel === 1 ? 'pl-8 pr-2 font-normal sm:pl-10' : 'px-4 sm:px-5'} ${resultado || grupo ? '' : 'text-texto'}`}>
                  <span className="block min-h-6 leading-6">
                    {prefixo(l)}
                    {rotuloDoResultado(l)}
                  </span>
                  {apoio.length > 0 && (
                    <span className="block text-[12px] font-normal leading-snug text-suave">
                      {apoio.join(' · ')}
                      {l.tipo === 'taxa' && l.valorCentavos === null && pode.verPrecos && (
                        <>
                          {' '}
                          <Link href={`${raiz}/fichas/canais`} className={LINK_DE_TEXTO}>
                            Configurar
                          </Link>
                        </>
                      )}
                    </span>
                  )}
                </th>
                <td className="px-3 py-2 text-right align-top">
                  <span className="block min-h-6 leading-6">
                    <Celula l={l} semFaturamento={r.semFaturamento} />
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right align-top sm:px-5">
                  <span className="block min-h-6 leading-6">
                    {l.percentualBp === null || l.valorCentavos === 0 ? <span className="font-normal text-suave">—</span> : <span className={resultado ? '' : 'font-normal'}>{textoDoPercentual(l.percentualBp)}</span>}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </div>
  );
}

function PorLoja({ d, base }: { d: DreDoPeriodo; base: string }) {
  const lojas = d.porLoja ?? [];
  const aqui = (id: string) => `${base}?periodo=${d.periodo.inicio}&loja=${id}`;
  const total = d.resultado.linhas.find((l) => l.codigo === CODIGO.resultado)!;
  const semContar = total.semContar.length ? `sem contar ${total.semContar.join(' e ')}` : null;
  return (
    <Painel
      titulo="Por loja"
      subtitulo="O resultado de cada loja antes das despesas da rede (aluguel do escritório, contador do grupo): a rede é a soma das lojas menos o que é da rede."
      semRespiro
      acessorio={<Contagem>{lojas.length}</Contagem>}
    >
      {lojas.length === 0 ? (
        <Vazio titulo="Nenhuma loja com movimento no período." />
      ) : (
        <>
          <ul className="divide-y divide-linha sm:hidden">
            {lojas.map((l) => (
              <li key={l.loja.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <Link href={aqui(l.loja.id)} className={`${LINK_DE_TEXTO} min-w-0 truncate font-medium`}>
                    {l.loja.nome}
                  </Link>
                  <span className="shrink-0 text-[15px] font-semibold tabular-nums">{l.receitaBrutaCentavos === 0 ? '—' : formatarDinheiro(l.resultadoCentavos)}</span>
                </div>
                <p className="mt-1 text-[12px] leading-snug tabular-nums text-suave">
                  Receita {l.receitaBrutaCentavos === 0 ? 'sem faturamento' : formatarDinheiro(l.receitaBrutaCentavos)}
                  {l.resultadoBp !== null && ` · ${textoDoPercentual(l.resultadoBp)}`}
                </p>
                {l.faltas > 0 && <p className="mt-0.5 text-[12px] font-semibold text-erro">{l.faltas} {l.faltas === 1 ? 'lançamento faltando' : 'lançamentos faltando'}</p>}
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="bg-forte text-left text-[12px] text-suave">
                  <th scope="col" className="h-10 px-5 font-semibold">
                    Loja
                  </th>
                  <th scope="col" className="h-10 px-3 text-right font-semibold">
                    Receita bruta
                  </th>
                  <th scope="col" className="h-10 px-3 text-right font-semibold">
                    Resultado
                  </th>
                  <th scope="col" className="h-10 px-3 text-right font-semibold">
                    % da receita
                  </th>
                  <th scope="col" className="h-10 px-5 text-right font-semibold">
                    Faltas
                  </th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {lojas.map((l) => (
                  <tr key={l.loja.id} className="border-t border-linha">
                    <th scope="row" className="h-11 max-w-[16rem] px-5 text-left font-medium">
                      <Link href={aqui(l.loja.id)} className={`${LINK_DE_TEXTO} block truncate`}>
                        {l.loja.nome}
                      </Link>
                    </th>
                    <td className="px-3 text-right">{l.receitaBrutaCentavos === 0 ? <span className="text-suave">—</span> : formatarDinheiro(l.receitaBrutaCentavos)}</td>
                    <td className="px-3 text-right font-semibold">{l.receitaBrutaCentavos === 0 && l.resultadoCentavos === 0 ? <span className="font-normal text-suave">—</span> : <span className={l.resultadoCentavos < 0 ? 'text-erro' : ''}>{formatarDinheiro(l.resultadoCentavos)}</span>}</td>
                    <td className="px-3 text-right">{l.resultadoBp === null ? <span className="text-suave">—</span> : textoDoPercentual(l.resultadoBp)}</td>
                    <td className="px-5 text-right">{l.faltas > 0 ? <span className="font-semibold text-erro">{l.faltas}</span> : <span className="text-suave">0</span>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="tabular-nums">
                <tr className="border-t-2 border-linha-forte bg-forte font-semibold">
                  <th scope="row" className="h-11 px-5 text-left">
                    Rede, com as despesas da rede
                  </th>
                  <td className="px-3 text-right">{d.resultado.receitaBrutaCentavos === 0 ? '—' : formatarDinheiro(d.resultado.receitaBrutaCentavos)}</td>
                  <td className="px-3 text-right">{total.valorCentavos === null || (d.resultado.semFaturamento && total.valorCentavos === 0) ? '—' : formatarDinheiro(total.valorCentavos)}</td>
                  <td className="px-3 text-right">{total.percentualBp === null ? '—' : textoDoPercentual(total.percentualBp)}</td>
                  <td className="px-5 text-right">{d.faltas.total}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {semContar && <p className="border-t border-linha px-4 py-2.5 text-[12px] text-suave sm:px-5">Resultados {semContar}.</p>}
        </>
      )}
    </Painel>
  );
}

export function TelaDoDre({
  d,
  base,
  raiz,
  contexto,
  pode,
  bloqueio,
}: {
  d: DreDoPeriodo;
  /** `/erp/dre` ou `/rodolfo/erp/<slug>/dre`. */
  base: string;
  /** `/erp` ou `/rodolfo/erp/<slug>`. */
  raiz: string;
  /** "Rede Completa", o nome da loja ou o parceiro (N1). */
  contexto: string;
  pode: PermissoesDaTela;
  bloqueio: string | null;
}) {
  const loja = d.escopo.tipo === 'loja' ? d.escopo : null;
  const escopoQuery = loja ? `&loja=${loja.lojaId}` : pode.veRede ? '&rede=1' : '';
  const link = (p: { inicio: string }) => `${base}?periodo=${p.inicio}${escopoQuery}`;
  const r = d.resultado;
  const final = r.linhas.find((l) => l.codigo === CODIGO.resultado)!;
  const sem = final.semContar.length ? `sem contar ${final.semContar.join(' e ')}` : null;
  const mesDaFalta = (d.ate ?? d.periodo.inicio).slice(0, 7);
  const faltaLancar = Array.from(new Set(d.faltaLancar.map((f) => f.descricao)));
  return (
    <div className="space-y-6">
      <PageHeader
        icone="dre"
        cor={COR.dre}
        titulo="DRE"
        subtitulo={`${loja ? loja.nome : contexto} · ${d.periodo.nome}`}
        acao={
          pode.lancarDespesa ? (
            <BotaoOuMotivo href={`${raiz}/dre/despesas/nova`} bloqueio={bloqueio} variante="primario">
              Lançar despesa
            </BotaoOuMotivo>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <nav aria-label="Trocar de período" className="flex items-center gap-1 rounded-[10px] border border-linha bg-painel p-1">
            {d.anterior ? (
              <Link href={link(d.anterior)} aria-label={`Período anterior: ${d.anterior.nome}`} className="ff-transicao grid h-10 w-10 place-items-center rounded-[7px] text-suave hover:bg-texto/5 hover:text-texto">
                <ChevronLeft size={18} aria-hidden />
              </Link>
            ) : (
              <span aria-hidden className="grid h-10 w-10 place-items-center rounded-[7px] text-suave/40">
                <ChevronLeft size={18} />
              </span>
            )}
            <span className="min-w-40 px-2 text-center text-sm font-semibold tabular-nums" aria-current="date">
              {d.periodo.nome}
            </span>
            {d.proximo ? (
              <Link href={link(d.proximo)} aria-label={`Período seguinte: ${d.proximo.nome}`} className="ff-transicao grid h-10 w-10 place-items-center rounded-[7px] text-suave hover:bg-texto/5 hover:text-texto">
                <ChevronRight size={18} aria-hidden />
              </Link>
            ) : (
              <span aria-hidden className="grid h-10 w-10 place-items-center rounded-[7px] text-suave/40">
                <ChevronRight size={18} />
              </span>
            )}
          </nav>
          {!d.emCurso && (
            <Link href={`${base}?${escopoQuery.slice(1)}`} className={LINK_DE_TEXTO}>
              Voltar para o período de agora
            </Link>
          )}
          {loja && pode.veRede && (
            <Link href={`${base}?periodo=${d.periodo.inicio}&rede=1`} className={LINK_DE_TEXTO}>
              Ver a rede
            </Link>
          )}
          {d.emCurso ? <Selo tom="alerta">Parcial · até ontem</Selo> : d.status === 'FECHADO' ? <Selo tom="ok">Período fechado</Selo> : <Selo>Período encerrado</Selo>}
        </div>
      </PageHeader>

      {bloqueio && (
        <Aviso tom="alerta" titulo="Somente leitura.">
          {bloqueio}
        </Aviso>
      )}

      {d.avisoDaData && <Aviso tom="alerta" titulo={d.avisoDaData} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="col-span-2 flex lg:col-span-1 [&>div]:w-full">
          <Metrica rotulo="Receita bruta" valor={r.semFaturamento ? '—' : formatarDinheiro(r.receitaBrutaCentavos)} detalhe={r.semFaturamento ? (d.ate ? 'sem faturamento lançado no período' : 'nenhum dia apurado ainda') : d.encerrado ? 'período inteiro' : `apurada até ontem, ${formatarData(d.ate!, true)}`} />
        </div>
        <div className="col-span-2 flex sm:col-span-1 [&>div]:w-full">
        <Metrica
          rotulo={loja ? 'Resultado da loja' : 'Resultado do período'}
          valor={r.semFaturamento && (final.valorCentavos ?? 0) === 0 ? '—' : formatarDinheiro(final.valorCentavos ?? 0)}
          detalhe={r.semFaturamento ? 'sem faturamento' : final.percentualBp === null ? undefined : `${textoDoPercentual(final.percentualBp)} da receita`}
        >
          {sem && (
            <div className="mt-2">
              <Selo tom="alerta">{sem.charAt(0).toUpperCase() + sem.slice(1)}</Selo>
            </div>
          )}
        </Metrica>
        </div>
        <div className="col-span-2 flex sm:col-span-1 [&>div]:w-full">
        <Metrica
          rotulo={d.emCurso ? 'Dia do período' : 'Dias apurados'}
          valor={d.emCurso ? `${d.diaDeHoje} de ${d.diasDoPeriodo}` : `${d.diasApurados} de ${d.diasDoPeriodo}`}
          detalhe={d.emCurso ? (d.ate ? `até ontem, ${formatarData(d.ate, true)} · hoje em aberto` : 'hoje é o primeiro dia: ainda sem dia apurado') : `${dataCurta(d.periodo.inicio)} a ${dataCurta(d.periodo.fim)}`}
        >
          <div className="mt-2">
            <Barra valor={d.diasApurados} total={d.diasDoPeriodo} tom="neutro" rotulo={`${d.diasApurados} de ${d.diasDoPeriodo} dias do período entram na conta`} />
          </div>
        </Metrica>
        </div>
      </div>

      {d.faltas.total > 0 && (
        <Aviso tom="alerta" titulo={`Incompleto: ${d.faltas.total} ${d.faltas.total === 1 ? 'lançamento' : 'lançamentos'} de faturamento faltando.`}>
          A receita só conta o que foi lançado.{' '}
          {pode.verFaturamento && (
            <Link href={`${raiz}/faturamento?mes=${mesDaFalta}${loja ? `&loja=${loja.lojaId}` : '&rede=1'}`} className={LINK_DE_TEXTO}>
              Ver as faltas
            </Link>
          )}
        </Aviso>
      )}
      {d.faltaLancar.length > 0 && (
        <Aviso tom="alerta" titulo={`Falta lançar: ${faltaLancar.slice(0, 4).join(', ')}${faltaLancar.length > 4 ? ` e mais ${faltaLancar.length - 4}` : ''}.`}>
          São despesas que repetem todo mês e ainda não têm o lançamento deste mês.{' '}
          {pode.lancarDespesa && !bloqueio && (
            <Link href={`${raiz}/dre/despesas/nova?modo=mes-passado&mes=${d.faltaLancar[0].mesAlvo}`} className={LINK_DE_TEXTO}>
              Lançar as do mês passado
            </Link>
          )}
        </Aviso>
      )}

      <Painel
        titulo={loja ? `Resultado da loja · ${loja.nome}` : 'Resultado da rede'}
        subtitulo={
          d.ate
            ? `${dataCurta(d.periodo.inicio)} a ${dataCurta(d.ate)}${d.emCurso ? '. Despesa entra dia a dia (o aluguel do mês, um trinta avos por dia). Sem projeção: só o que já aconteceu.' : '.'} Percentuais sobre a receita bruta.`
            : 'Nenhum dia apurado ainda neste período.'
        }
        semRespiro
        acessorio={r.faltaConfigurarTaxa ? <Selo tom="alerta">Falta configurar a taxa do iFood</Selo> : undefined}
      >
        {d.lojasDoEscopo.length === 0 ? <Vazio titulo="Nenhuma loja no seu acesso.">Peça a quem cuida da equipe para incluir as lojas em que você trabalha.</Vazio> : <Tabela d={d} raiz={raiz} pode={pode} />}
      </Painel>

      {d.porLoja && <PorLoja d={d} base={base} />}

      <p className="text-[12px] leading-relaxed text-suave">
        Despesa conta pela competência (o mês a que pertence), não pelo dia em que foi paga. A taxa do iFood é estimada pela taxa configurada hoje. O CMV ainda não entra no DRE (em breve): até lá, margem e resultados saem sem ele.{' '}
        {loja ? 'A loja não recebe rateio da rede.' : 'Receita por canal nas três primeiras linhas.'}
      </p>
    </div>
  );
}
