/**
 * O painel "CMV por categoria" (I.2a, decisões 274 a 279), a MESMA tela no nível 1 e na pessoa do parceiro.
 *
 * É o CMV do DRE aberto em categorias, pelas compras: a soma das categorias é a linha `cmv` do DRE, ao centavo. Por categoria:
 * realizado em R$ e em % da receita bruta, meta, desvio (realizado menos meta, o mesmo sinal do DRE) e o farol da 2.4. Quando o dado
 * não fecha, a categoria fica SEM COR e o motivo vem escrito uma vez, no aviso (nunca repetido linha a linha). "Outros / a classificar"
 * e "Sem categoria" são fila, sem farol. A cor mora só no `Farol` (régua de 5 casas, palavra e desvio); nada de borda ou fundo colorido.
 */

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatarData } from '@/lib/erp/compra-campos';
import { seloDoCmv } from '@/lib/erp/cmv-campos';
import { percentualComDuasCasas, pontosComDuasCasas, type LinhaDoPainel } from '@/lib/erp/cmv-categorias-campos';
import type { CmvPorCategoria } from '@/lib/erp/cmv-categorias';
import { textoDaMeta } from '@/lib/erp/dre-metas-campos';
import { COR } from '@/lib/erp/modulos';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso, Contagem, Metrica, Painel, Selo } from '../../ui/superficies';
import { Farol, Regua } from './farol';

export interface PermissoesDoPainelDeCategorias {
  /** `metas.editar` com a rede inteira: vê o convite para definir as metas por categoria. */
  definirMetas: boolean;
  /** `insumos.ver` e `insumos.editar`: o "Classificar N insumos" leva à fila. */
  classificar: boolean;
  /** A pessoa tem a rede inteira: pode alternar entre a rede e uma loja. */
  veRede: boolean;
}

/** Link de texto com alvo de 44 px onde o dedo é o ponteiro. */
const LINK_TOQUE = `${LINK_DE_TEXTO} inline-flex min-h-11 items-center sm:min-h-0 [@media(pointer:coarse)]:min-h-11`;
const dinheiroComSinal = (c: number) => `${c < 0 ? '−' : '+'}${formatarDinheiro(Math.abs(c))}`;
const idDaCategoria = (l: LinhaDoPainel) => `categoria-${l.chave.replace(/[^a-z0-9]/gi, '-')}`;

/** O farol de uma linha. Sem cor GERAL (o motivo está no aviso, uma vez): régua vazia e "sem cor"; os motivos da própria linha vêm por extenso. */
function FarolDaLinha({ l, semCorGeral, forma }: { l: LinhaDoPainel; semCorGeral: boolean; forma: 'celula' | 'linha' }) {
  if (!l.farol) return <span className="text-suave">—</span>;
  if (l.farol.tipo === 'sem' && semCorGeral) {
    return (
      <span className={`inline-flex ${forma === 'linha' ? 'flex-wrap items-center gap-x-2 gap-y-0.5' : 'flex-col items-start gap-1'}`}>
        <Regua posicao={null} />
        <span className="text-[12px] font-normal leading-snug text-suave">sem cor</span>
      </span>
    );
  }
  return <Farol f={l.farol} forma={forma} />;
}

function Nome({ l }: { l: LinhaDoPainel }) {
  return (
    <>
      <span className="block min-h-6 leading-6">{l.nome}</span>
      {l.tipo === 'categoria' && l.desativada && <span className="block text-[12px] font-normal leading-snug text-suave">categoria desativada</span>}
      {l.naoUsada && l.realizadoCentavos !== null && <span className="block text-[12px] font-normal leading-snug text-suave">não usada nesta loja, mas teve {formatarDinheiro(l.realizadoCentavos)}</span>}
      {l.aClassificar && (l.realizadoCentavos ?? 0) !== 0 && <span className="block text-[12px] font-normal leading-snug text-suave">{formatarDinheiro(l.realizadoCentavos!)} a classificar</span>}
      {l.metaParcial && <span className="block text-[12px] font-normal leading-snug text-suave">{l.metaParcial}: sem meta consolidada na rede</span>}
      {l.nota && <span className="block text-[12px] font-normal leading-snug text-suave">{l.nota}</span>}
    </>
  );
}

function LinhaDaTabela({ l, semCorGeral }: { l: LinhaDoPainel; semCorGeral: boolean }) {
  const apoio = l.tipo === 'variacao' || l.tipo === 'preparos';
  const mostraMeta = l.tipo === 'categoria' && l.metaBp !== null;
  const origem = l.metaVemDe === 'loja' ? 'da loja' : l.metaVemDe === 'rede' ? 'da rede' : l.metaVemDe === 'mista' ? 'varia por loja' : null;
  return (
    <tr id={idDaCategoria(l)} className={`border-t border-linha ${apoio ? 'bg-forte/30' : ''}`}>
      <th scope="row" className={`min-w-0 px-4 py-2 text-left align-top sm:px-5 ${apoio ? 'font-normal text-suave' : 'font-medium text-texto'}`}>
        <Nome l={l} />
        {(mostraMeta || l.farol) && (
          <span className="mt-0.5 block text-[12px] font-normal leading-snug text-suave sm:hidden">
            {mostraMeta && (
              <>
                Meta {percentualComDuasCasas(l.metaBp!)}
                {l.desvioTexto ? ` · desvio ${l.desvioTexto}` : ''}
              </>
            )}
            {l.farol && (
              <span className="mt-1 block">
                <FarolDaLinha l={l} semCorGeral={semCorGeral} forma="linha" />
              </span>
            )}
          </span>
        )}
      </th>
      <td className="px-3 py-2 text-right align-top">
        <span className="block min-h-6 leading-6">
          {l.realizadoCentavos === null ? <span className="font-normal text-suave">—</span> : l.realizadoCentavos === 0 ? <span className="font-normal text-suave">—</span> : <span className={apoio ? 'font-normal' : ''}>{l.tipo === 'variacao' ? dinheiroComSinal(l.realizadoCentavos) : formatarDinheiro(l.realizadoCentavos)}</span>}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right align-top font-normal sm:px-5">
        <span className="block min-h-6 leading-6">{l.realizadoBp === null || l.realizadoCentavos === 0 ? <span className="text-suave">—</span> : l.tipo === 'variacao' ? `${l.realizadoBp < 0 ? '−' : '+'}${percentualComDuasCasas(Math.abs(l.realizadoBp))}` : percentualComDuasCasas(l.realizadoBp)}</span>
      </td>
      <td className="hidden whitespace-nowrap px-3 py-2 text-right align-top font-normal sm:table-cell">
        <span className="block min-h-6 leading-6">{mostraMeta ? percentualComDuasCasas(l.metaBp!) : <span className="text-suave">—</span>}</span>
        {mostraMeta && origem && <span className="block text-[12px] leading-snug text-suave">{origem}</span>}
      </td>
      <td className="hidden whitespace-nowrap px-3 py-2 text-right align-top font-normal xl:table-cell">
        <span className="block min-h-6 leading-6">{mostraMeta && l.metaCentavos !== null && l.metaBp !== 0 ? formatarDinheiro(l.metaCentavos) : <span className="text-suave">—</span>}</span>
      </td>
      <td className="hidden whitespace-nowrap px-3 py-2 text-right align-top sm:table-cell">
        {l.desvioTexto ? (
          <>
            <span className="block min-h-6 leading-6">{l.desvioTexto}</span>
            {l.desvioCentavos !== null && <span className="block text-[12px] font-normal leading-snug text-suave">{dinheiroComSinal(l.desvioCentavos)}</span>}
          </>
        ) : (
          <span className="block min-h-6 leading-6 font-normal text-suave">—</span>
        )}
      </td>
      <td className="hidden px-3 py-2 text-left align-top font-normal sm:table-cell sm:pr-5">
        <FarolDaLinha l={l} semCorGeral={semCorGeral} forma="celula" />
      </td>
    </tr>
  );
}

export function TelaDoCmvPorCategoria({
  r,
  base,
  raiz,
  contexto,
  pode,
  bloqueio,
}: {
  r: CmvPorCategoria;
  /** `/erp/dre/cmv-categorias` ou `/rodolfo/erp/<slug>/dre/cmv-categorias`. */
  base: string;
  /** `/erp` ou `/rodolfo/erp/<slug>`. */
  raiz: string;
  contexto: string;
  pode: PermissoesDoPainelDeCategorias;
  bloqueio: string | null;
}) {
  const { d, total, painel } = r;
  const loja = d.escopo.tipo === 'loja' ? d.escopo : null;
  const escopoQuery = loja ? `&loja=${loja.lojaId}` : pode.veRede ? '&rede=1' : '';
  const link = (p: { inicio: string }) => `${base}?periodo=${p.inicio}${escopoQuery}`;
  const linha = total.linha;
  const selo = seloDoCmv(linha);
  const semFaturamento = d.resultado.semFaturamento;
  return (
    <div className="space-y-6">
      <PageHeader
        icone="dre"
        cor={COR.dre}
        titulo="CMV por categoria"
        subtitulo={`${loja ? loja.nome : contexto} · ${d.periodo.nome}`}
        acao={
          pode.definirMetas ? (
            <Link href={`${raiz}/dre/metas-categorias${loja ? `?loja=${loja.lojaId}` : ''}`} className={classeDeBotao('secundario')}>
              Metas por categoria
            </Link>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <nav aria-label="Trocar de período" className="flex items-center gap-1 rounded-[10px] border border-linha bg-painel p-1">
            {d.anterior ? (
              <Link href={link(d.anterior)} aria-label={`Período anterior: ${d.anterior.nome}`} className="ff-transicao grid h-10 w-10 place-items-center rounded-[7px] text-suave hover:bg-texto/5 hover:text-texto [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
                <ChevronLeft size={18} aria-hidden />
              </Link>
            ) : (
              <span aria-hidden className="grid h-10 w-10 place-items-center rounded-[7px] text-suave/40 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
                <ChevronLeft size={18} />
              </span>
            )}
            <span className="min-w-40 px-2 text-center text-sm font-semibold tabular-nums" aria-current="date">
              {d.periodo.nome}
            </span>
            {d.proximo ? (
              <Link href={link(d.proximo)} aria-label={`Período seguinte: ${d.proximo.nome}`} className="ff-transicao grid h-10 w-10 place-items-center rounded-[7px] text-suave hover:bg-texto/5 hover:text-texto [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
                <ChevronRight size={18} aria-hidden />
              </Link>
            ) : (
              <span aria-hidden className="grid h-10 w-10 place-items-center rounded-[7px] text-suave/40 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
                <ChevronRight size={18} />
              </span>
            )}
          </nav>
          {!d.emCurso && (
            <Link href={`${base}?${escopoQuery.slice(1)}`} className={classeDeBotao('secundario')}>
              Voltar para o período de agora
            </Link>
          )}
          {loja && pode.veRede && (
            <Link href={`${base}?periodo=${d.periodo.inicio}&rede=1`} className={classeDeBotao('secundario')}>
              Ver a rede
            </Link>
          )}
          <Link href={`${raiz}/dre?periodo=${d.periodo.inicio}${escopoQuery}`} className={classeDeBotao('secundario')}>
            Ver o DRE
          </Link>
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
          <Metrica
            rotulo="CMV do período, igual ao do DRE"
            valor={linha.valorCentavos === null ? '—' : formatarDinheiro(linha.valorCentavos)}
            detalhe={linha.valorCentavos === null ? linha.nota : linha.percentualBp === null ? undefined : `${percentualComDuasCasas(linha.percentualBp)} da receita bruta`}
          >
            <div className="mt-2">
              <Selo tom={selo.tom}>{selo.texto}</Selo>
            </div>
          </Metrica>
        </div>
        <div className="col-span-2 flex sm:col-span-1 [&>div]:w-full">
          <Metrica rotulo="Meta total do CMV" valor={total.meta ? textoDaMeta(total.meta.metaBp) : 'Sem meta'} detalhe={total.meta ? (total.meta.metaCentavos !== null ? `${formatarDinheiro(total.meta.metaCentavos)} na receita do período` : total.meta.semComparacao ?? undefined) : !d.emCurso ? 'não havia meta neste período' : pode.definirMetas ? 'defina em Metas por categoria' : undefined}>
            {total.meta && (
              <div className="mt-2 space-y-1">
                {total.meta.desvioTexto && <p className="text-[12px] tabular-nums text-suave">Desvio {total.meta.desvioTexto}</p>}
                {total.farol && <Farol f={total.farol} />}
              </div>
            )}
          </Metrica>
        </div>
        <div className="col-span-2 flex sm:col-span-1 [&>div]:w-full">
          <Metrica rotulo="Receita bruta" valor={semFaturamento ? '—' : formatarDinheiro(d.resultado.receitaBrutaCentavos)} detalhe={semFaturamento ? 'sem faturamento lançado no período' : r.lojasIncluidas > 0 && !loja ? `${r.lojasIncluidas} ${r.lojasIncluidas === 1 ? 'loja incluída' : 'lojas incluídas'}` : d.encerrado ? 'período inteiro' : d.ate ? `apurada até ontem, ${formatarData(d.ate, true)}` : undefined} />
        </div>
      </div>

      {r.antigo || !painel ? (
        <Aviso tom="neutro" titulo="Não apurado por categoria (fechado antes da I.2).">
          Este período foi fechado antes de o CMV por categoria existir. O total do CMV, acima, é o do DRE e continua valendo; a fotografia dele não é recalculada. A FlowFoods pode reabrir o período e fechar de novo para guardar o CMV por categoria.
        </Aviso>
      ) : (
        <>
          {painel.semCor && (
            <Aviso tom="alerta" titulo="As categorias estão sem cor.">
              {painel.semCor}.{' '}
              {painel.aClassificarCentavos > 0 && painel.insumosAClassificar !== null && painel.insumosAClassificar > 0 && pode.classificar && (
                <Link href={`${raiz}/insumos/classificar`} className={LINK_TOQUE}>
                  Classificar {painel.insumosAClassificar} {painel.insumosAClassificar === 1 ? 'insumo' : 'insumos'}
                </Link>
              )}
              {d.faltas.total > 0 && ' O desvio continua escrito em cada linha; a cor volta quando o dado fechar.'}
            </Aviso>
          )}

          <Painel titulo="Maiores desvios" subtitulo="As categorias que saíram da meta, em ordem de quanto passaram, em R$." acessorio={<Contagem>{painel.maioresDesvios.length}</Contagem>} semRespiro>
            {painel.maioresDesvios.length === 0 ? (
              <p className="px-4 py-4 text-sm text-suave sm:px-5">{painel.semCor ? 'Sem destaque enquanto as categorias estão sem cor.' : 'Nenhuma categoria saiu da meta neste recorte.'}</p>
            ) : (
              <ol className="divide-y divide-linha">
                {painel.maioresDesvios.map((l, i) => (
                  <li key={l.chave} className="grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
                    <div className="min-w-0">
                      <a href={`#${idDaCategoria(l)}`} className={`${LINK_TOQUE} font-medium`}>
                        {i + 1}. {l.nome}
                      </a>
                      <p className="text-[12px] tabular-nums leading-snug text-suave">
                        {formatarDinheiro(l.desvioCentavos!)} acima da meta · realizado {percentualComDuasCasas(l.realizadoBp!)}, meta {percentualComDuasCasas(l.metaBp!)} · {l.desvioTexto}
                      </p>
                    </div>
                    <FarolDaLinha l={l} semCorGeral={false} forma="linha" />
                  </li>
                ))}
              </ol>
            )}
          </Painel>

          <Painel
            titulo="Categorias"
            subtitulo={d.ate ? `Pelas compras de ${formatarData(d.periodo.inicio)} a ${formatarData(d.ate)}, ${d.status === 'FECHADO' ? 'na categoria que o insumo tinha no dia do fechamento' : 'na categoria que o insumo tem hoje'}. Percentuais sobre a receita bruta.` : 'Nenhum dia apurado ainda neste período.'}
            semRespiro
          >
            {linha.valorCentavos === null && painel.linhas.every((l) => (l.realizadoCentavos ?? 0) === 0) ? (
              <p className="px-4 py-6 text-sm text-suave sm:px-5">Sem nota de compra no período: nenhuma loja tem CMV para abrir em categorias.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    CMV por categoria de {d.periodo.nome}, {loja ? loja.nome : 'rede completa'}, em reais e em percentual da receita bruta, com a meta, o desvio e o farol
                  </caption>
                  <thead>
                    <tr className="bg-forte text-left text-[12px] text-suave">
                      <th scope="col" className="h-10 px-4 font-semibold sm:px-5">
                        Categoria
                      </th>
                      <th scope="col" className="h-10 px-3 text-right font-semibold">
                        Realizado
                      </th>
                      <th scope="col" className="h-10 w-[5.5rem] px-3 text-right font-semibold sm:w-24 sm:px-5">
                        <span className="sm:hidden">% rec.</span>
                        <span className="hidden sm:inline">% da receita</span>
                      </th>
                      <th scope="col" className="hidden h-10 px-3 text-right font-semibold sm:table-cell">
                        Meta
                      </th>
                      <th scope="col" className="hidden h-10 px-3 text-right font-semibold xl:table-cell">
                        Meta em R$
                      </th>
                      <th scope="col" className="hidden h-10 px-3 text-right font-semibold sm:table-cell">
                        Desvio
                      </th>
                      <th scope="col" className="hidden h-10 w-44 px-3 text-left font-semibold sm:table-cell sm:pr-5">
                        Farol
                      </th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {painel.linhas.map((l) => (
                      <LinhaDaTabela key={l.chave} l={l} semCorGeral={painel.semCor !== null} />
                    ))}
                  </tbody>
                  <tfoot className="tabular-nums">
                    <tr className="border-t-2 border-linha-forte bg-forte font-semibold">
                      <th scope="row" className="px-4 py-2.5 text-left sm:px-5">
                        CMV do DRE
                        <span className="block text-[12px] font-normal leading-snug text-suave">a soma de tudo acima</span>
                      </th>
                      <td className="px-3 py-2.5 text-right align-top">{linha.valorCentavos === null ? '—' : formatarDinheiro(linha.valorCentavos)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right align-top sm:px-5">{linha.percentualBp === null ? '—' : percentualComDuasCasas(linha.percentualBp)}</td>
                      <td className="hidden whitespace-nowrap px-3 py-2.5 text-right align-top sm:table-cell">{total.meta ? percentualComDuasCasas(total.meta.metaBp) : '—'}</td>
                      <td className="hidden whitespace-nowrap px-3 py-2.5 text-right align-top xl:table-cell">{total.meta && total.meta.metaCentavos !== null ? formatarDinheiro(total.meta.metaCentavos) : '—'}</td>
                      <td className="hidden whitespace-nowrap px-3 py-2.5 text-right align-top sm:table-cell">{total.meta?.desvioBp != null ? pontosComDuasCasas(total.meta.desvioBp) : '—'}</td>
                      <td className="hidden px-3 py-2.5 text-left align-top font-normal sm:table-cell sm:pr-5">{total.farol ? <Farol f={total.farol} /> : <span className="text-suave">—</span>}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Painel>
        </>
      )}

      <p className="text-[12px] leading-relaxed text-suave">
        A meta é o percentual da receita bruta, a mesma base do DRE. O desvio é o realizado menos a meta, em pontos percentuais (pp): positivo é custo acima da meta. {d.status === 'FECHADO' ? 'Esta tela é a fotografia do fechamento: a categoria e a meta são as daquele dia.' : 'A conta usa a categoria de hoje do insumo em todas as compras do período: reclassificar um insumo muda o período inteiro, e o total não muda.'} Pelas compras, o painel não mostra o que sobrou ou faltou no estoque; o CMV real por categoria vem depois.
      </p>
    </div>
  );
}
