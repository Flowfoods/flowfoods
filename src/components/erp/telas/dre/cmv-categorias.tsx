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
import {
  dinheiroComSinal,
  percentualComDuasCasas,
  pontosComDuasCasas,
  pontosComSinalDaDiferenca,
  textoDoDesvioRelativo,
  type CompraXRealDoPainel,
  type EvolucaoDeCategorias,
  type LinhaDoPainel,
  type MatrizDoPainel,
} from '@/lib/erp/cmv-categorias-campos';
import type { CmvPorCategoria } from '@/lib/erp/cmv-categorias';
import { textoDaMeta } from '@/lib/erp/dre-metas-campos';
import { COR } from '@/lib/erp/modulos';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso, Contagem, Metrica, Painel, Selo } from '../../ui/superficies';
import { Farol, Regua } from './farol';
import { ExplicacaoNoPonto } from '../../ui/ponto-de-ajuda';
import { BarrasHorizontais, type BarraDoGrafico } from '../../ui/barras-horizontais';
import { rotuloDoEscopo } from '@/lib/erp/visao';

export interface PermissoesDoPainelDeCategorias {
  /** `metas.editar` com a rede inteira: vê o convite para definir as metas por categoria. */
  definirMetas: boolean;
  /** `insumos.ver` e `insumos.editar`: o "Classificar N insumos" leva à fila. */
  classificar: boolean;
  /** A pessoa tem a rede inteira: pode alternar entre a rede e uma loja. */
  veRede: boolean;
  /** `compras.ver`: o valor de cada categoria (pelas compras, ao vivo) abre o relatório de compras dela (decisão 464). */
  verCompras?: boolean;
}

/** Link de texto com alvo de 44 px onde o dedo é o ponteiro. */
const LINK_TOQUE = `${LINK_DE_TEXTO} inline-flex min-h-11 items-center sm:min-h-0 [@media(pointer:coarse)]:min-h-11`;
/** Dinheiro com o menos de verdade (o formatador do navegador usa hífen). */
const moeda = (c: number) => (c < 0 ? `−${formatarDinheiro(-c)}` : formatarDinheiro(c));
export type VistaDoPainel = 'categorias' | 'compra-real' | 'evolucao' | 'matriz';
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
      {l.fonte === 'mista' && <span className="block text-[12px] font-normal leading-snug text-suave">parte pelo real, parte pelas compras</span>}
      {l.nota && <span className="block text-[12px] font-normal leading-snug text-suave">{l.nota}</span>}
    </>
  );
}

/** Número que abre os registros: o mesmo sublinhado do DRE; no toque, o alvo cresce para 44 px por fora (sem mexer na altura da linha). */
const NUMERO_QUE_ABRE = "ff-transicao relative rounded-[5px] underline decoration-linha-forte underline-offset-4 hover:decoration-texto [@media(pointer:coarse)]:after:absolute [@media(pointer:coarse)]:after:-inset-y-2.5 [@media(pointer:coarse)]:after:inset-x-0 [@media(pointer:coarse)]:after:content-['']";

function LinhaDaTabela({ l, semCorGeral, abre }: { l: LinhaDoPainel; semCorGeral: boolean; abre?: string | null }) {
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
                {l.desvioRelativoBp !== null ? ` (${textoDoDesvioRelativo(l.desvioRelativoBp)})` : ''}
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
          {l.realizadoCentavos === null ? (
            <span className="font-normal text-suave">—</span>
          ) : l.realizadoCentavos === 0 ? (
            <span className="font-normal text-suave">—</span>
          ) : abre && !apoio ? (
            <Link href={abre} aria-label={`${l.nome}, ${moeda(l.realizadoCentavos)}: ver as compras que formam este número`} className={NUMERO_QUE_ABRE}>
              {moeda(l.realizadoCentavos)}
            </Link>
          ) : (
            <span className={apoio ? 'font-normal' : ''}>{apoio ? dinheiroComSinal(l.realizadoCentavos) : moeda(l.realizadoCentavos)}</span>
          )}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right align-top font-normal sm:px-5">
        <span className="block min-h-6 leading-6">{l.realizadoBp === null || l.realizadoCentavos === 0 ? <span className="text-suave">—</span> : apoio ? `${l.realizadoBp < 0 ? '−' : '+'}${percentualComDuasCasas(Math.abs(l.realizadoBp))}` : `${l.realizadoBp < 0 ? '−' : ''}${percentualComDuasCasas(Math.abs(l.realizadoBp))}`}</span>
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
            {l.desvioRelativoBp !== null && <span className="block text-[12px] font-normal leading-snug text-suave">{textoDoDesvioRelativo(l.desvioRelativoBp)}</span>}
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
  parceiro,
  pode,
  bloqueio,
  vista = 'categorias',
  evolucao = null,
}: {
  vista?: VistaDoPainel;
  /** Só na vista da evolução. */
  evolucao?: EvolucaoDeCategorias | null;
  r: CmvPorCategoria;
  /** `/erp/dre/cmv-categorias` ou `/rodolfo/erp/<slug>/dre/cmv-categorias`. */
  base: string;
  /** `/erp` ou `/rodolfo/erp/<slug>`. */
  raiz: string;
  /** Nível 1: o nome do parceiro, na frente da loja ou da rede no subtítulo. */
  parceiro?: string;
  pode: PermissoesDoPainelDeCategorias;
  bloqueio: string | null;
}) {
  const { d, total, painel } = r;
  const loja = d.escopo.tipo === 'loja' ? d.escopo : null;
  const escopoQuery = loja ? `&loja=${loja.lojaId}` : pode.veRede ? '&rede=1' : '';
  const vistaQuery = vista === 'categorias' ? '' : `&vista=${vista}`;
  const link = (p: { inicio: string }) => `${base}?periodo=${p.inicio}${escopoQuery}${vistaQuery}`;
  const linkDaVista = (v: VistaDoPainel) => `${base}?periodo=${d.periodo.inicio}${escopoQuery}${v === 'categorias' ? '' : `&vista=${v}`}`;
  const linha = total.linha;
  // Decisão 464: categoria pelas compras, ao vivo, abre as compras dela no MESMO recorte e visão (o relatório soma itens + frete,
  // pela data da nota e pela categoria de hoje do insumo: a mesma conta). Fechado (categoria da época) e o real (estoque) não abrem.
  // Na rede, as lojas vão por extenso: sem loja marcada o relatório usaria a loja escolhida no topo.
  const aqui = `${base}?periodo=${d.periodo.inicio}${escopoQuery}`;
  // Só abre quando o relatório soma o mesmo número: nenhuma loja do escopo no real por categoria (o relatório é só compras) e
  // nenhum pré-preparo comprado na categoria (no painel ele está na linha dos pré-preparos; no relatório, na categoria dele).
  const soCompras = (painel?.compraReal?.lojasComparadas.length ?? 0) === 0;
  const comPreparo = new Set(r.categoriasComPreparoComprado ?? []);
  const abreCategoria = (l: LinhaDoPainel): string | null =>
    pode.verCompras && d.ate && d.status !== 'FECHADO' && soCompras && l.tipo === 'categoria' && l.categoriaId && !comPreparo.has(l.categoriaId) && l.fonte === 'compras' && (l.realizadoCentavos ?? 0) > 0
      ? `${raiz}/compras/relatorios/periodo?de=${d.periodo.inicio}&ate=${d.ate}&categoria=${l.categoriaId}${loja ? `&loja=${loja.lojaId}` : d.lojasDoEscopo.map((x) => `&loja=${x.id}`).join('')}&volta=${encodeURIComponent(aqui)}`
      : null;
  const comValor = painel ? painel.linhas.filter((l) => l.tipo === 'categoria' && (l.realizadoCentavos ?? 0) > 0) : [];
  const abrem = comValor.some((l) => abreCategoria(l) !== null);
  const naoAbrem = pode.verCompras === true && comValor.some((l) => abreCategoria(l) === null);
  const selo = seloDoCmv(linha);
  const semFaturamento = d.resultado.semFaturamento;
  // Parte das categorias vem do real (estoque contado por insumo) e parte das compras: o selo diz "misto" e de quem é cada parte.
  const misto = painel && painel.lojasSemRealAberto.length > 0 && painel.compraReal ? { real: painel.compraReal.lojasComparadas.join(', '), compras: painel.lojasSemRealAberto.map((l) => l.nome).join(', ') } : null;
  return (
    <div className="space-y-6">
      <PageHeader
        icone="dre"
        cor={COR.dre}
        titulo="CMV por categoria"
        subtitulo={`${rotuloDoEscopo(loja?.nome, parceiro)} · ${d.periodo.nome}`}
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
            <Link href={`${base}?${escopoQuery.slice(1)}`} className={LINK_TOQUE}>
              Voltar para o período de agora
            </Link>
          )}
          {loja && pode.veRede && (
            <Link href={`${base}?periodo=${d.periodo.inicio}&rede=1`} className={LINK_TOQUE}>
              Ver a rede
            </Link>
          )}
          <Link href={`${raiz}/dre?periodo=${d.periodo.inicio}${escopoQuery}`} className={LINK_TOQUE}>
            Ver o DRE
          </Link>
          {d.emCurso ? <Selo tom="alerta">Parcial · até ontem</Selo> : d.status === 'FECHADO' ? <Selo tom="ok">Período fechado</Selo> : <Selo>Período encerrado</Selo>}
        </div>
      </PageHeader>

      <nav aria-label="O que ver do CMV por categoria" className="min-w-0 max-w-full overflow-x-auto rounded-[10px] border border-linha bg-painel p-1">
        <ul className="flex min-w-max gap-1">
          {(
            [
              ['categorias', 'Categorias'],
              ['compra-real', 'Compra × real'],
              ['evolucao', 'Evolução'],
              ...(!loja && r.painel?.matriz ? [['matriz', 'Por loja']] : []),
            ] as [VistaDoPainel, string][]
          ).map(([v, rotulo]) => (
            <li key={v}>
              <Link
                href={linkDaVista(v)}
                aria-current={vista === v ? 'page' : undefined}
                className="ff-transicao flex min-h-9 items-center whitespace-nowrap rounded-[7px] px-2.5 text-[13px] text-suave hover:bg-texto/5 hover:text-texto aria-[current=page]:bg-forte aria-[current=page]:font-semibold aria-[current=page]:text-texto [@media(pointer:coarse)]:min-h-11"
              >
                {rotulo}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

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
            <div className="mt-2 space-y-1">
              {misto ? <Selo tom="alerta">CMV misto</Selo> : <Selo tom={selo.tom}>{selo.texto}</Selo>}
              {misto && <p className="text-[12px] leading-snug text-suave">Categorias pelo real em {misto.real}; pelas compras em {misto.compras}.</p>}
            </div>
          </Metrica>
        </div>
        <div className="col-span-2 flex sm:col-span-1 [&>div]:w-full">
          <Metrica rotulo="Meta total do CMV" valor={total.meta ? textoDaMeta(total.meta.metaBp) : 'Sem meta'} detalhe={total.meta ? (total.meta.metaCentavos !== null ? `${formatarDinheiro(total.meta.metaCentavos)} na receita do período${d.metaDoCmvDaLoja === 'loja' ? ' · meta própria desta loja' : ''}` : total.meta.semComparacao ?? undefined) : !d.emCurso ? 'não havia meta neste período' : pode.definirMetas ? 'defina em Metas por categoria' : undefined}>
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

      {vista === 'evolucao' ? (
        <VistaDaEvolucao e={evolucao} escopoNome={loja ? `de ${loja.nome}` : 'da rede'} />
      ) : r.antigo || !painel ? (
        <Aviso tom="neutro" titulo="Não apurado por categoria (fechado antes da I.2).">
          Este período foi fechado antes de o CMV por categoria existir. O total do CMV, acima, é o do DRE e continua valendo; a fotografia dele não é recalculada. A FlowFoods pode reabrir o período e fechar de novo para guardar o CMV por categoria.
        </Aviso>
      ) : vista === 'compra-real' ? (
        <VistaDaCompraReal c={painel.compraReal} lojasSemReal={painel.lojasSemRealAberto} periodoNome={d.periodo.nome} encerrado={d.encerrado} fechado={d.status === 'FECHADO'} />
      ) : vista === 'matriz' && painel.matriz ? (
        <VistaDaMatriz m={painel.matriz} periodoNome={d.periodo.nome} />
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

          <RealizadoXMeta linhas={painel.linhas} />

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
            subtitulo={d.ate ? `${fonteDoPainel(painel.linhas)} de ${formatarData(d.periodo.inicio)} a ${formatarData(d.ate)}, ${d.status === 'FECHADO' ? 'na categoria que o insumo tinha no dia do fechamento' : 'na categoria que o insumo tem hoje'}. Percentuais sobre a receita bruta.${abrem ? ' O valor sublinhado abre as compras da categoria.' : ''}` : 'Nenhum dia apurado ainda neste período.'}
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
                      <LinhaDaTabela key={l.chave} l={l} semCorGeral={painel.semCor !== null} abre={abreCategoria(l)} />
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
            {naoAbrem && (
              <p className="border-t border-linha px-4 py-2.5 text-[12px] leading-snug text-suave sm:px-5">
                Valor sem sublinhado não abre as compras: vem da contagem de estoque, é de período fechado ou a categoria tem pré-preparo comprado em nota (no painel ele fica na linha dos pré-preparos).
              </p>
            )}
          </Painel>
        </>
      )}

      <details className="rounded-[10px] border border-linha bg-painel px-4 py-1 sm:px-5">
        <summary className="flex min-h-11 cursor-pointer items-center text-[13px] font-medium text-texto">Como ler esta tela</summary>
      <p className="mt-2 text-[12px] leading-relaxed text-suave">
        A meta é o percentual da receita bruta, a mesma base do DRE. O desvio é o realizado menos a meta, em pontos percentuais (pp): positivo é custo acima da meta; o percentual da própria meta, embaixo, ajuda a ler a categoria pequena (0,20 pp em Limpeza pode ser 40% da meta) e nunca muda a cor.{' '}
        {!loja && 'Na rede, o percentual de cada categoria é sobre a receita das lojas que a usam: a loja que marcou a categoria como não usa fica fora dessa conta, e por isso a coluna não precisa somar o percentual do CMV total. '}
        {d.status === 'FECHADO' ? 'Esta tela é a fotografia do fechamento: a categoria e a meta são as daquele dia.' : 'A conta usa a categoria de hoje do insumo em todas as parcelas do período: reclassificar um insumo muda o período inteiro, e o total não muda.'}{' '}
        O estoque que saiu de uma loja para outra não existe no sistema (não há transferência entre lojas): o real de cada loja não a desconta, e o da rede continua certo.
      </p>
      </details>
    </div>
  );
}

/**
 * Realizado × meta (24/10/2026, referência Nina): cada categoria com valor, em % da receita, da maior para a menor, com o traço da
 * meta. Lê de relance o que a tabela diz linha a linha; a cor do farol continua só no farol (aqui a barra é uma série só, e "a
 * classificar" fica em cinza). Cada barra leva à linha da tabela.
 */
export function RealizadoXMeta({ linhas }: { linhas: readonly LinhaDoPainel[] }) {
  const barras: BarraDoGrafico[] = linhas
    .filter((l) => (l.tipo === 'categoria' || l.tipo === 'sem-categoria') && l.realizadoBp !== null && (l.realizadoCentavos ?? 0) > 0)
    .sort((a, b) => b.realizadoBp! - a.realizadoBp! || a.nome.localeCompare(b.nome, 'pt-BR'))
    .map((l) => {
      const fila = l.aClassificar || l.tipo === 'sem-categoria';
      const meta = l.tipo === 'categoria' && !fila && l.metaBp !== null ? l.metaBp : null;
      return {
        chave: l.chave,
        rotulo: l.nome,
        valor: l.realizadoBp!,
        valorTexto: percentualComDuasCasas(l.realizadoBp!),
        detalhe: fila ? 'falta classificar os insumos' : meta === null ? 'sem meta' : `meta ${percentualComDuasCasas(meta)}${l.desvioTexto ? ` · ${l.desvioTexto}` : ''}`,
        marca: meta,
        neutra: fila,
        href: `#${idDaCategoria(l)}`,
      };
    });
  if (barras.length === 0) return null;
  return (
    <Painel titulo="Realizado × meta, por categoria" subtitulo="Em % da receita bruta, da maior para a menor. O traço é a meta; passar dele é custo acima da meta.">
      <BarrasHorizontais titulo="CMV realizado por categoria, em percentual da receita, com a meta" barras={barras} marca={{ rotulo: 'meta' }} />
    </Painel>
  );
}

/** "Pelo CMV real" / "Pelas compras" / as duas: de onde saem os números da tabela de categorias. */
function fonteDoPainel(linhas: readonly LinhaDoPainel[]): string {
  const fontes = new Set(linhas.filter((l) => l.tipo === 'categoria' || l.tipo === 'sem-categoria').map((l) => l.fonte).filter(Boolean));
  if (fontes.has('real') && !fontes.has('compras') && !fontes.has('mista')) return 'Pelo CMV real (estoque inicial + compras − estoque final), por insumo,';
  if (fontes.has('real') || fontes.has('mista')) return 'Pelo CMV real onde o estoque foi contado por insumo e pelas compras nas outras lojas,';
  return 'Pelas compras';
}

const pp = (bp: number | null) => (bp === null ? '' : ` · ${pontosComSinalDaDiferenca(bp)}`);

// ================================================================ compra × real por categoria

function VistaDaCompraReal({ c, lojasSemReal, periodoNome, encerrado, fechado }: { c: CompraXRealDoPainel | null; lojasSemReal: readonly { nome: string; motivo: string }[]; periodoNome: string; encerrado: boolean; fechado: boolean }) {
  if (!c) {
    return (
      <Aviso tom="neutro" titulo="Sem o real aberto por categoria neste recorte.">
        {!encerrado
          ? `${periodoNome} ainda não terminou: o real nasce com a contagem de fechamento do estoque, depois do último dia.`
          : lojasSemReal.length > 0
            ? `${lojasSemReal.map((l) => `${l.nome}: ${l.motivo}`).join('; ')}.`
            : 'Nenhuma loja deste recorte tem o CMV real apurado (faltam o estoque inicial ou o fechamento).'}{' '}
        {fechado ? 'O período foi fechado sem esse detalhe e a fotografia dele não se recalcula.' : 'O total do CMV segue sendo o do DRE.'}
      </Aviso>
    );
  }
  return (
    <div className="space-y-4">
      <Painel
        titulo="Compra × real por categoria"
        subtitulo={`${c.lojasComparadas.length === 1 ? 'Loja comparada' : 'Lojas comparadas'}: ${c.lojasComparadas.join(', ')}. Diferença = real menos compra. Negativa (−): comprou mais do que consumiu, o estoque da categoria subiu. Positiva (+): consumiu mais do que comprou, o estoque desceu.`}
        semRespiro
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Compra, real e diferença por categoria em {periodoNome}</caption>
            <thead>
              <tr className="bg-forte text-left text-[12px] text-suave">
                <th scope="col" className="h-10 px-4 font-semibold sm:px-5">Categoria</th>
                <th scope="col" className="hidden h-10 px-3 text-right font-semibold sm:table-cell">Compra</th>
                <th scope="col" className="h-10 px-3 text-right font-semibold">Real</th>
                <th scope="col" className="h-10 px-3 text-right font-semibold sm:pr-5">Diferença</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {c.linhas.map((l) => (
                <tr key={l.chave} className="border-t border-linha">
                  <th scope="row" className="min-w-0 px-4 py-2 text-left align-top font-medium text-texto sm:px-5">
                    <span className="block min-h-6 leading-6">{l.nome}</span>
                    <span className="block text-[12px] font-normal leading-snug text-suave sm:hidden">{!l.compraCentavos ? 'sem compra' : `compra ${moeda(l.compraCentavos)}`}</span>
                    {l.frase ? <span className="block text-[12px] font-normal leading-snug text-suave">{l.frase}</span> : <span className="block text-[12px] font-normal leading-snug text-suave">o estoque ficou igual</span>}
                  </th>
                  <td className="hidden px-3 py-2 text-right align-top sm:table-cell">{!l.compraCentavos ? <span className="text-suave">—</span> : moeda(l.compraCentavos)}</td>
                  <td className="px-3 py-2 text-right align-top">{l.tipo === 'preparos' ? dinheiroComSinal(l.realCentavos) || moeda(0) : moeda(l.realCentavos)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right align-top sm:pr-5">
                    {l.diferencaCentavos === null ? (
                      <span className="font-normal text-suave">—</span>
                    ) : (
                      <>
                        <span className="block min-h-6 leading-6">{l.diferencaCentavos === 0 ? moeda(0) : dinheiroComSinal(l.diferencaCentavos)}</span>
                        {l.diferencaBp !== null && <span className="block text-[12px] font-normal leading-snug text-suave">{pontosComSinalDaDiferenca(l.diferencaBp)}</span>}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="tabular-nums">
              <tr className="border-t-2 border-linha-forte bg-forte font-semibold">
                <th scope="row" className="px-4 py-2.5 text-left sm:px-5">
                  Total
                  <span className="block text-[12px] font-normal leading-snug text-suave sm:hidden">compra {moeda(c.totalCompraCentavos)}</span>
                </th>
                <td className="hidden px-3 py-2.5 text-right sm:table-cell">{moeda(c.totalCompraCentavos)}</td>
                <td className="px-3 py-2.5 text-right">{moeda(c.totalRealCentavos)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right sm:pr-5">
                  {c.totalDiferencaCentavos === 0 ? moeda(0) : dinheiroComSinal(c.totalDiferencaCentavos)}
                  {c.totalDiferencaBp !== null && <span className="block text-[12px] font-normal leading-snug text-suave">{pontosComSinalDaDiferenca(c.totalDiferencaBp)}</span>}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Painel>
      {c.lojasDeFora.length > 0 && (
        <Aviso tom="neutro" titulo="Ficaram de fora da comparação.">
          {c.lojasDeFora.map((l) => `${l.nome}: ${l.motivo}`).join('; ')}. {c.lojasDeFora.length === 1 ? 'Essa loja segue' : 'Essas lojas seguem'} pelas compras no painel de categorias.
        </Aviso>
      )}
      <ExplicacaoNoPonto ponto="percentuais">
        <p className="text-[12px] leading-relaxed text-suave">
          Os percentuais são pontos da receita bruta das lojas comparadas. A comparação é a mesma da página do DRE, aberta por categoria (a categoria de hoje do insumo). O estoque de pré-preparo fica à parte e não tem compra para comparar.
        </p>
      </ExplicacaoNoPonto>
    </div>
  );
}

// ================================================================ categoria × loja

function VistaDaMatriz({ m, periodoNome }: { m: MatrizDoPainel; periodoNome: string }) {
  const celula = (c: MatrizDoPainel['linhas'][number]['celulas'][number], apoio: boolean) => {
    if (!c) return <span className="text-suave">—</span>;
    if (c.centavos === 0) return <span className="text-suave">{c.naoUsa ? <span className="text-[12px]">não usa</span> : '—'}</span>;
    return (
      <>
        <span className="block min-h-6 leading-6">{apoio ? dinheiroComSinal(c.centavos) || moeda(0) : moeda(c.centavos)}</span>
        {c.bp !== null && <span className="block text-[12px] font-normal leading-snug text-suave">{c.bp < 0 ? '−' : ''}{percentualComDuasCasas(Math.abs(c.bp))}</span>}
        {c.metaBp !== null && c.desvioBp !== null && (
          <span className="block text-[12px] font-normal leading-snug text-suave">
            meta {percentualComDuasCasas(c.metaBp)} · {pontosComDuasCasas(c.desvioBp)}
          </span>
        )}
      </>
    );
  };
  return (
    <MatrizEmPainel m={m} periodoNome={periodoNome} celula={celula} />
  );
}

function MatrizEmPainel({ m, periodoNome, celula }: { m: MatrizDoPainel; periodoNome: string; celula: (c: MatrizDoPainel['linhas'][number]['celulas'][number], apoio: boolean) => React.ReactNode }) {
  return (
    <Painel titulo="Categoria por loja" subtitulo="Cada loja contra a própria receita, sem cor: o farol é do painel de categorias. A coluna de cada loja fecha no CMV do DRE dela." semRespiro>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">CMV de cada categoria em cada loja em {periodoNome}</caption>
          <thead>
            <tr className="bg-forte text-left text-[12px] text-suave">
              <th scope="col" className="h-10 px-5 font-semibold">Categoria</th>
              {m.lojas.map((l) => (
                <th key={l.lojaId} scope="col" className="h-10 px-3 text-right font-semibold">{l.nome}</th>
              ))}
              <th scope="col" className="h-10 px-3 pr-5 text-right font-semibold">Rede</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {m.linhas.map((x) => {
              const apoio = x.tipo === 'preparos' || x.tipo === 'variacao';
              return (
                <tr key={x.chave} className={`border-t border-linha ${apoio ? 'bg-forte/30' : ''}`}>
                  <th scope="row" className={`px-5 py-2 text-left align-top ${apoio ? 'font-normal text-suave' : 'font-medium text-texto'}`}>{x.nome}</th>
                  {x.celulas.map((c, i) => (
                    <td key={m.lojas[i].lojaId} className="px-3 py-2 text-right align-top">{celula(c, apoio)}</td>
                  ))}
                  <td className="px-3 py-2 pr-5 text-right align-top font-semibold">{celula(x.rede, apoio)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="tabular-nums">
            <tr className="border-t-2 border-linha-forte bg-forte font-semibold">
              <th scope="row" className="px-5 py-2.5 text-left">CMV do DRE</th>
              {m.lojas.map((l) => (
                <td key={l.lojaId} className="px-3 py-2.5 text-right">{l.cmvCentavos === null ? '—' : moeda(l.cmvCentavos)}</td>
              ))}
              <td className="px-3 py-2.5 pr-5 text-right">{m.redeCmvCentavos === null ? '—' : moeda(m.redeCmvCentavos)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <ul className="divide-y divide-linha md:hidden">
        {m.linhas.map((x) => {
          const apoio = x.tipo === 'preparos' || x.tipo === 'variacao';
          return (
            <li key={x.chave} className="px-4 py-3">
              <p className={`text-sm ${apoio ? 'text-suave' : 'font-medium text-texto'}`}>{x.nome}</p>
              <dl className="mt-1 space-y-1 tabular-nums">
                {x.celulas.map((c, i) => (
                  <div key={m.lojas[i].lojaId} className="flex items-baseline justify-between gap-3 text-sm">
                    <dt className="min-w-0 text-[13px] text-suave">{m.lojas[i].nome}</dt>
                    <dd className="text-right">{celula(c, apoio)}</dd>
                  </div>
                ))}
                <div className="flex items-baseline justify-between gap-3 border-t border-linha pt-1 text-sm font-semibold">
                  <dt className="text-[13px] font-normal text-suave">Rede</dt>
                  <dd className="text-right">{celula(x.rede, apoio)}</dd>
                </div>
              </dl>
            </li>
          );
        })}
        <li className="bg-forte px-4 py-3 font-semibold tabular-nums">
          <p className="text-sm">CMV do DRE</p>
          <dl className="mt-1 space-y-1">
            {m.lojas.map((l) => (
              <div key={l.lojaId} className="flex items-baseline justify-between gap-3 text-sm">
                <dt className="min-w-0 text-[13px] font-normal text-suave">{l.nome}</dt>
                <dd>{l.cmvCentavos === null ? '—' : moeda(l.cmvCentavos)}</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-3 border-t border-linha pt-1 text-sm">
              <dt className="text-[13px] font-normal text-suave">Rede</dt>
              <dd>{m.redeCmvCentavos === null ? '—' : moeda(m.redeCmvCentavos)}</dd>
            </div>
          </dl>
        </li>
      </ul>
    </Painel>
  );
}

// ================================================================ evolução

/** "Maio de 2026" → "Mai 26": o rótulo curto das linhas do celular. Outro formato de nome (semana, quinzena) fica como está. */
function rotuloCurto(nome: string): string {
  const m = /^(\p{L}+) de (\d{4})$/u.exec(nome);
  return m ? `${m[1].slice(0, 3)} ${m[2].slice(2)}` : nome;
}

function VistaDaEvolucao({ e, escopoNome }: { e: EvolucaoDeCategorias | null; escopoNome: string }) {
  if (!e || e.periodos.length === 0) {
    return (
      <Aviso tom="neutro" titulo="Sem períodos para mostrar.">
        A evolução precisa de ao menos um período com dado.
      </Aviso>
    );
  }
  type Celula = EvolucaoDeCategorias['linhas'][number]['celulas'][number];
  /** Sem dado (nulo) ou sem valor no período: "—", nunca R$ 0,00. */
  const semValor = (c: Celula) => !c || c.realizadoCentavos === 0;
  const celula = (c: Celula) => {
    if (!c || semValor(c)) return <span className="text-suave">—</span>;
    return (
      <>
        <span className="block min-h-6 leading-6">{c.realizadoBp === null ? moeda(c.realizadoCentavos) : `${c.realizadoBp < 0 ? '−' : ''}${percentualComDuasCasas(Math.abs(c.realizadoBp))}`}</span>
        <span className="block text-[12px] font-normal leading-snug text-suave">{moeda(c.realizadoCentavos)}</span>
        {c.metaBp !== null && (
          <span className="block text-[12px] font-normal leading-snug text-suave">
            meta {percentualComDuasCasas(c.metaBp)}
            {c.desvioBp !== null ? ` · ${pontosComDuasCasas(c.desvioBp)}` : ''}
          </span>
        )}
      </>
    );
  };
  /** A mesma célula em uma linha curta: "4,00% · R$ 4.000,00 · meta 11,00% · −7,00 pp". */
  const linhaCurta = (c: Celula) => {
    if (!c || semValor(c)) return '—';
    const partes = [c.realizadoBp === null ? moeda(c.realizadoCentavos) : `${c.realizadoBp < 0 ? '−' : ''}${percentualComDuasCasas(Math.abs(c.realizadoBp))}`];
    if (c.realizadoBp !== null) partes.push(moeda(c.realizadoCentavos));
    if (c.metaBp !== null) partes.push(`meta ${percentualComDuasCasas(c.metaBp)}`);
    if (c.metaBp !== null && c.desvioBp !== null) partes.push(pontosComDuasCasas(c.desvioBp));
    return partes.join(' · ');
  };
  const rotulo = (p: EvolucaoDeCategorias['periodos'][number]) => `${p.nome}${p.situacao === 'em-curso' ? ' (parcial)' : ''}`;
  const rotuloDoCartao = (p: EvolucaoDeCategorias['periodos'][number]) => `${rotuloCurto(p.nome)}${p.situacao === 'em-curso' ? ' (parcial)' : ''}`;
  const vazioNoPeriodo = (p: EvolucaoDeCategorias['periodos'][number], l: EvolucaoDeCategorias['linhas'][number]) => !!p.semDado && l.tipo !== 'total';
  const comAviso = e.periodos.filter((p) => p.semDado);
  return (
    <div className="space-y-4">
      <Painel titulo="Evolução por categoria" subtitulo={`Os últimos ${e.periodos.length} períodos ${escopoNome}, do mais antigo ao mais novo: % da receita bruta, valor, meta que valia na época e desvio. Sem cor: a cor é do painel de cada período.`} semRespiro>
        <div className="hidden overflow-x-auto min-[1180px]:block">
          <table className="w-full text-sm">
            <caption className="sr-only">Evolução do CMV por categoria nos últimos períodos</caption>
            <thead>
              <tr className="bg-forte text-left text-[12px] text-suave">
                <th scope="col" className="h-10 px-5 font-semibold">Categoria</th>
                {e.periodos.map((p) => (
                  <th key={p.inicio} scope="col" className="h-10 px-3 text-right font-semibold">{rotulo(p)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {e.linhas.map((l) => (
                <tr key={l.chave} className={`border-t border-linha ${l.tipo === 'total' ? 'border-t-2 border-linha-forte bg-forte font-semibold' : l.tipo === 'preparos' ? 'bg-forte/30' : ''}`}>
                  <th scope="row" className={`px-5 py-2 text-left align-top ${l.tipo === 'preparos' ? 'font-normal text-suave' : 'font-medium text-texto'}`}>{l.nome}</th>
                  {l.celulas.map((c, i) => (
                    <td key={e.periodos[i].inicio} className="px-3 py-2 text-right align-top">{vazioNoPeriodo(e.periodos[i], l) ? <span className="text-suave">—</span> : celula(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="divide-y divide-linha min-[1180px]:hidden">
          {e.linhas.map((l) => (
            <li key={l.chave} className={`px-4 py-3 ${l.tipo === 'total' ? 'bg-forte' : ''}`}>
              <p className={`text-sm ${l.tipo === 'total' ? 'font-semibold' : l.tipo === 'preparos' ? 'text-suave' : 'font-medium text-texto'}`}>{l.nome}</p>
              <ol className="mt-1 space-y-1 tabular-nums" aria-label={`${l.nome}, do período mais antigo ao mais novo`}>
                {l.celulas.map((c, i) => {
                  const ultimo = i === l.celulas.length - 1;
                  return (
                    <li key={e.periodos[i].inicio} className={`flex flex-wrap items-baseline justify-between gap-x-3 text-[13px] leading-snug ${ultimo ? 'font-semibold text-texto' : ''}`}>
                      <span className="font-normal text-suave">{rotuloDoCartao(e.periodos[i])}</span>
                      <span className="text-right">{vazioNoPeriodo(e.periodos[i], l) ? '—' : linhaCurta(c)}</span>
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ul>
      </Painel>
      {comAviso.length > 0 && (
        <Aviso tom="neutro" titulo="Períodos sem categorias.">
          {comAviso.map((p) => `${p.nome}: ${p.semDado}`).join('; ')}. O total do CMV, na última linha, é o do DRE do período.
        </Aviso>
      )}
      <ExplicacaoNoPonto ponto="origem">
        <p className="text-[12px] leading-relaxed text-suave">
          Período fechado vem da fotografia como ela está (categoria e meta da época); período aberto, do que o sistema sabe hoje. Onde o estoque foi contado por insumo nos dois fechamentos o número é o CMV real; nos outros, as compras.
        </p>
      </ExplicacaoNoPonto>
    </div>
  );
}
