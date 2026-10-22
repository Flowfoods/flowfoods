/**
 * Relatórios de compras (L.2) — as peças da tela: indicadores que abrem as linhas, tabela dos grupos, tabela das compras (cartões
 * no celular e no tablet), as notas "para ler os números" e a barra da planilha/impressão. Nenhuma conta mora aqui: tudo vem do
 * motor (`compras-relatorio.ts`) e das funções puras (`compras-relatorio-campos.ts`).
 *
 * O que a tela nunca faz: somar kg, L e un num número só (uma linha por unidade); mostrar R$ 0,00 no lugar de "sem base"; chamar de
 * compra uma nota cancelada ou um documento fiscal que só aguarda conferência.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { LinhaDeCompra, LinhaDeGrupo, RelatorioDaTela, TotaisDoRecorte } from '@/lib/erp/compras-relatorio';
import {
  BASES_DE_DATA,
  custoMedioEntregue,
  FRASE_DO_MOTIVO,
  linhasSemBase,
  precoDaLinha,
  precoMedioPonderado,
  queryDoRelatorio,
  ROTULO_DO_AGRUPAMENTO,
  type FiltrosDoRelatorio,
  type TotalPorUnidade,
} from '@/lib/erp/compras-relatorio-campos';
import { formatarData } from '@/lib/erp/compra-campos';
import { formatarCusto, formatarDinheiro, formatarQuantidade, type Unidade } from '@/lib/erp/unidades';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { Painel, Selo } from '../../ui/superficies';
import { hrefDoRelatorio, RECORTE_NOVO } from './relatorio-filtros';

const sp = (n: number) => n.toLocaleString('pt-BR');
const pl = (n: number, um: string, varios: string) => `${sp(n)} ${n === 1 ? um : varios}`;
const SIGLA = { KG: 'kg', L: 'L', UN: 'un' } as const;
const quantidade = (t: Pick<TotalPorUnidade, 'unidade' | 'quantidadeMilesimos'>) => (t.unidade ? formatarQuantidade(t.quantidadeMilesimos, t.unidade) : 'sem unidade');

// ------------------------------------------------------------- indicadores

function Cartao({ rotulo, children, ver, className = '' }: { rotulo: string; children: ReactNode; ver?: { href: string; texto: string }; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col rounded-[14px] border border-linha bg-painel px-4 py-3.5 sm:px-5 ${className}`}>
      <h3 className="text-[12px] font-medium leading-snug text-suave">{rotulo}</h3>
      <div className="mt-2 min-w-0 flex-1">{children}</div>
      {ver && (
        <Link href={ver.href} className={`${LINK_DE_TEXTO} -mx-1 mt-2 inline-flex min-h-11 items-center self-start px-1 sm:min-h-9`}>
          {ver.texto}
        </Link>
      )}
    </div>
  );
}

const GRANDE = 'font-display text-[26px] font-bold leading-none tabular-nums';

/** A conta por extenso, igual em toda parte: "R$ 1.186,00 ÷ 26 kg = R$ 45,62/kg". */
function contaDoPreco(t: TotalPorUnidade, comFrete: boolean): string {
  const u = t.unidade as Unidade;
  const valor = t.comparavel.valorCentavos + (comFrete ? t.comparavel.freteCentavos : 0);
  const custo = comFrete ? custoMedioEntregue(t) : precoMedioPonderado(t);
  return `${formatarDinheiro(valor)} ÷ ${formatarQuantidade(t.comparavel.quantidadeMilesimos, u)} = ${formatarCusto(custo, u)}`;
}

function PrecoMedio({ t, comFrete }: { t: TotalPorUnidade; comFrete: boolean }) {
  const u = t.unidade;
  const custo = comFrete ? custoMedioEntregue(t) : precoMedioPonderado(t);
  if (!u) return null;
  if (!custo) return <p className="text-sm text-suave">Sem base em {SIGLA[u]}: {t.linhas === 1 ? 'a linha' : 'as linhas'} não tem{t.linhas === 1 ? '' : 'm'} valor para calcular.</p>;
  return (
    <div>
      <p className={GRANDE}>{formatarCusto(custo, u)}</p>
      <p className="mt-1.5 text-[12px] tabular-nums text-suave">{contaDoPreco(t, comFrete)}</p>
      {linhasSemBase(t) > 0 && <p className="mt-0.5 text-[12px] text-atencao">{pl(linhasSemBase(t), 'linha ficou', 'linhas ficaram')} de fora desta média (sem base).</p>}
    </div>
  );
}

export function Indicadores({
  f,
  caminho,
  t,
  umInsumo,
  modo,
  nFornecedores,
}: {
  f: FiltrosDoRelatorio;
  caminho: string;
  t: TotaisDoRecorte;
  umInsumo: boolean;
  modo: 'insumo' | 'periodo';
  nFornecedores?: number;
}) {
  // Abrir as linhas: no histórico de um insumo elas estão logo abaixo (âncora); no período, é o mesmo recorte em `ver=linhas`.
  const verTodas = modo === 'insumo' ? `#compras` : hrefDoRelatorio(caminho, f, { ver: 'linhas', ...RECORTE_NOVO });
  const verSemBase = hrefDoRelatorio(caminho, f, { ver: 'linhas', ...RECORTE_NOVO, so: 'sembase' });
  const comUnidade = t.unidades.filter((u) => u.unidade);
  const semUnidade = t.unidades.find((u) => !u.unidade);
  const semBaseTotal = Object.values(t.semBase).reduce((s, n) => s + (n ?? 0), 0);
  return (
    <section aria-labelledby="rel-resumo" className="space-y-3">
      <h2 id="rel-resumo" className="sr-only">
        Resumo do recorte
      </h2>
      <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 xl:grid-cols-4">
        <Cartao rotulo="Total das compras (itens + frete)" ver={{ href: verTodas, texto: `Ver as ${pl(t.linhas, 'linha', 'linhas')}` }}>
          <p className={GRANDE}>{formatarDinheiro(t.totalCentavos)}</p>
          <p className="mt-1.5 text-[12px] tabular-nums text-suave">
            {pl(t.notas, 'nota', 'notas')} · {pl(t.linhas, 'linha', 'linhas')}
          </p>
        </Cartao>
        <Cartao rotulo="Valor dos itens e frete atribuído" ver={{ href: verTodas, texto: 'Ver o frete de cada linha' }}>
          <p className={GRANDE}>{formatarDinheiro(t.valorCentavos)}</p>
          <p className="mt-1.5 text-[12px] tabular-nums text-suave">
            + {formatarDinheiro(t.freteCentavos)} de frete · desconto {formatarDinheiro(0)}
          </p>
        </Cartao>
        <Cartao rotulo="Quantidade comprada" ver={{ href: verTodas, texto: 'Ver as compras' }}>
          {comUnidade.length === 0 && !semUnidade ? <p className="text-sm text-suave">Nada comprado neste recorte.</p> : null}
          <ul className="space-y-1">
            {comUnidade.map((u) => (
              <li key={u.unidade} className={`${GRANDE} text-[22px]`}>
                {quantidade(u)}
                {comUnidade.length > 1 && <span className="ml-2 text-[12px] font-normal text-suave">{pl(u.linhas, 'linha', 'linhas')}</span>}
              </li>
            ))}
          </ul>
          {comUnidade.length > 1 && <p className="mt-1.5 text-[12px] text-suave">Cada unidade tem a sua linha: kg, L e un não se somam.</p>}
          {semUnidade && (
            <p className="mt-1.5 text-[12px] text-atencao">
              + {pl(semUnidade.linhas, 'linha', 'linhas')} sem unidade gravada ({formatarDinheiro(semUnidade.valorCentavos)}): entra no dinheiro, fora das quantidades.
            </p>
          )}
        </Cartao>
        {modo === 'insumo' ? (
          <Cartao rotulo="Fornecedores" ver={{ href: '#fornecedores', texto: 'Ver por fornecedor' }}>
            <p className={GRANDE}>{nFornecedores ?? 0}</p>
            <p className="mt-1.5 text-[12px] text-suave">{(nFornecedores ?? 0) === 1 ? 'vendeu' : 'venderam'} este insumo no período</p>
          </Cartao>
        ) : (
          <Cartao rotulo="Preço médio" ver={semBaseTotal > 0 ? { href: verSemBase, texto: `Ver as ${pl(semBaseTotal, 'linha sem base', 'linhas sem base')}` } : undefined}>
            <p className="text-sm text-suave">Só vale para um insumo por vez: kg de coisas diferentes não têm um preço só. Agrupe por insumo ou escolha um.</p>
          </Cartao>
        )}
      </div>
      {umInsumo && comUnidade.length > 0 && (
        <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2">
          {comUnidade.map((u) => (
            <Cartao
              key={u.unidade}
              rotulo={`Preço médio ponderado${comUnidade.length > 1 ? ` em ${SIGLA[u.unidade as Unidade]}` : ''} (só os itens)`}
              ver={{ href: verTodas, texto: `Ver as ${pl(u.comparavel.linhas, 'linha que entra', 'linhas que entram')}` }}
            >
              <PrecoMedio t={u} comFrete={false} />
            </Cartao>
          ))}
          {comUnidade.map((u) => (
            <Cartao
              key={`e${u.unidade}`}
              rotulo={`Custo médio entregue${comUnidade.length > 1 ? ` em ${SIGLA[u.unidade as Unidade]}` : ''} (itens + frete)`}
              ver={{ href: verTodas, texto: 'Ver o frete de cada compra' }}
            >
              <PrecoMedio t={u} comFrete />
            </Cartao>
          ))}
        </div>
      )}
      {modo === 'insumo' && semBaseTotal > 0 && (
        <p className="text-[13px] text-suave">
          {pl(semBaseTotal, 'linha', 'linhas')} sem base ficou de fora do preço médio.{' '}
          <Link href={verSemBase} className={LINK_DE_TEXTO}>
            Ver quais são
          </Link>
        </p>
      )}
    </section>
  );
}

// ------------------------------------------------------------------- notas

export function NotasDoRelatorio({
  f,
  caminho,
  r,
  comprasBase,
}: {
  f: FiltrosDoRelatorio;
  caminho: string;
  r: RelatorioDaTela;
  comprasBase: string;
}) {
  const itens: ReactNode[] = [];
  itens.push(
    <li key="data">
      <strong className="font-semibold text-texto">Data usada: {BASES_DE_DATA[f.base].rotulo}.</strong> {BASES_DE_DATA[f.base].explica} Os filtros, os totais, a planilha e a impressão usam esta mesma data.
    </li>,
  );
  if (r.semEmissao) {
    itens.push(
      <li key="emissao">
        {pl(r.semEmissao, 'nota lançada neste período não tem', 'notas lançadas neste período não têm')} data de emissão (foram digitadas à mão) e por isso não entram. Para vê-las, use a data da entrada.
      </li>,
    );
  }
  if (r.canceladas && r.canceladas.notas > 0) {
    itens.push(
      <li key="canceladas">
        {pl(r.canceladas.notas, 'nota cancelada', 'notas canceladas')} ({formatarDinheiro(r.canceladas.valorCentavos + r.canceladas.freteCentavos)}) neste recorte ficou de fora de todos os totais.{' '}
        <Link href={hrefDoRelatorio(caminho, f, { situacao: 'canceladas', ver: 'linhas', ...RECORTE_NOVO })} className={LINK_DE_TEXTO}>
          Ver as canceladas
        </Link>
      </li>,
    );
  }
  if (r.aguardando > 0) {
    itens.push(
      <li key="aguardando">
        {pl(r.aguardando, 'nota fiscal recebida (XML) aguarda', 'notas fiscais recebidas (XML) aguardam')} conferência e não {r.aguardando === 1 ? 'conta' : 'contam'} como compra até serem conciliadas.{' '}
        <Link href={`${comprasBase}/recebidas`} className={LINK_DE_TEXTO}>
          Ver as notas recebidas
        </Link>
      </li>,
    );
  }
  if (r.totais && r.totais.notasComDesconto > 0) {
    itens.push(
      <li key="desconto">
        {pl(r.totais.notasComDesconto, 'nota tem', 'notas têm')} desconto no cabeçalho que o sistema ainda não divide pelos itens: o valor de cada item é o que a nota cobra.
      </li>,
    );
  }
  if (r.totais) {
    const m = r.totais.semBase;
    const motivos = (Object.keys(m) as (keyof typeof m)[]).filter((k) => m[k]).map((k) => `${pl(m[k] ?? 0, 'linha', 'linhas')}: ${FRASE_DO_MOTIVO[k]}`);
    if (motivos.length) itens.push(<li key="base">Sem base para o preço médio (não calculamos para não enganar): {motivos.join('; ')}.</li>);
  }
  itens.push(
    <li key="historico">
      Quantidade, valor e frete são os gravados no lançamento de cada nota: mudar o cadastro do insumo ou da embalagem depois não reescreve compra antiga. A categoria é a de hoje do insumo.
    </li>,
  );
  return (
    <Painel titulo="Para ler os números" semRespiro>
      <ul className="space-y-2 px-4 py-3 text-[13px] leading-relaxed text-suave sm:px-5">{itens}</ul>
    </Painel>
  );
}

// ----------------------------------------------------------------- grupos

const hrefDoGrupo = (caminho: string, f: FiltrosDoRelatorio, g: LinhaDeGrupo, agrupar = f.agrupar) =>
  hrefDoRelatorio(caminho, f, { agrupar, grupo: g.chave, unidade: g.total.unidade ?? 'sem', ver: 'linhas', so: '', pagina: 1 });

export function TabelaDosGrupos({
  caminho,
  f,
  grupos,
  agrupar = f.agrupar,
  comPreco,
  titulo,
  id,
  ancora,
  rodape,
}: {
  caminho: string;
  f: FiltrosDoRelatorio;
  grupos: LinhaDeGrupo[];
  agrupar?: FiltrosDoRelatorio['agrupar'];
  comPreco: boolean;
  titulo?: string;
  id?: string;
  /** Depois de abrir o grupo, onde a página deve cair (o histórico de um insumo mostra as linhas na mesma tela). */
  ancora?: string;
  /** A paginação, dentro do mesmo quadro da tabela. */
  rodape?: ReactNode;
}) {
  const rotulo = ROTULO_DO_AGRUPAMENTO[agrupar];
  const href = (g: LinhaDeGrupo) => `${hrefDoGrupo(caminho, f, g, agrupar)}${ancora ?? ''}`;
  return (
    <Painel id={id} titulo={titulo ?? `Resumo por ${rotulo.toLowerCase()}`} semRespiro>
      <ul className="divide-y divide-linha lg:hidden">
        {grupos.map((g) => {
          const t = g.total;
          const preco = comPreco && t.unidade ? precoMedioPonderado(t) : null;
          return (
            <li key={`${g.chave}|${t.unidade}`} className="px-4 py-3">
              <Link href={href(g)} className="ff-transicao -mx-1 flex min-h-11 items-center justify-between gap-3 rounded-[7px] px-1 hover:bg-texto/[0.03]">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-texto">{g.rotulo}</span>
                  <span className="block text-[12px] tabular-nums text-suave">
                    {quantidade(t)} · {pl(g.notas, 'nota', 'notas')}
                  </span>
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  <span className="block font-semibold">{formatarDinheiro(t.valorCentavos + t.freteCentavos)}</span>
                  {comPreco && t.unidade && <span className="block text-[12px] text-suave">{preco ? formatarCusto(preco, t.unidade) : 'sem base'}</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <table className="hidden w-full text-sm lg:table">
        <caption className="sr-only">
          Resumo por {rotulo.toLowerCase()}: quantidade na unidade de cada linha, valor dos itens, frete e total{comPreco ? ', e o preço médio ponderado' : ''}. Cada nome abre as compras dele.
        </caption>
        <thead>
          <tr className="bg-forte text-left text-[12px] text-suave">
            <th scope="col" className="h-10 pl-5 pr-3 font-semibold">
              {rotulo}
            </th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">
              Quantidade
            </th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">
              Valor dos itens
            </th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">
              Frete
            </th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">
              Total
            </th>
            {comPreco && (
              <th scope="col" className="h-10 px-3 text-right font-semibold">
                Preço médio
              </th>
            )}
            <th scope="col" className="h-10 pl-3 pr-5 text-right font-semibold">
              Notas
            </th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {grupos.map((g) => {
            const t = g.total;
            const preco = comPreco && t.unidade ? precoMedioPonderado(t) : null;
            return (
              <tr key={`${g.chave}|${t.unidade}`} className="ff-transicao border-t border-linha hover:bg-texto/[0.03]">
                <td className="h-11 py-2 pl-5 pr-3">
                  <Link href={href(g)} className="ff-transicao rounded-[5px] font-medium text-texto underline-offset-4 hover:underline">
                    {g.rotulo}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right">{quantidade(t)}</td>
                <td className="px-3 py-2 text-right">{formatarDinheiro(t.valorCentavos)}</td>
                <td className="px-3 py-2 text-right text-suave">{formatarDinheiro(t.freteCentavos)}</td>
                <td className="px-3 py-2 text-right font-semibold">{formatarDinheiro(t.valorCentavos + t.freteCentavos)}</td>
                {comPreco && (
                  <td className="px-3 py-2 text-right">
                    {t.unidade ? (preco ? <span className="font-semibold">{formatarCusto(preco, t.unidade)}</span> : <Selo tom="alerta">Sem base</Selo>) : '—'}
                    {t.unidade && linhasSemBase(t) > 0 && preco && <span className="block text-[12px] text-suave">{pl(linhasSemBase(t), 'linha', 'linhas')} sem base</span>}
                  </td>
                )}
                <td className="py-2 pl-3 pr-5 text-right text-suave">{g.notas}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rodape}
    </Painel>
  );
}

// ----------------------------------------------------------------- linhas

function PrecoDaLinha({ l }: { l: LinhaDeCompra }) {
  if (l.motivoSemBase) {
    return (
      <>
        <Selo tom="alerta">Sem base</Selo>
        <span className="mt-1 block text-[12px] text-suave">{FRASE_DO_MOTIVO[l.motivoSemBase]}</span>
      </>
    );
  }
  const { preco, entregue } = precoDaLinha(l);
  const u = l.unidade as Unidade;
  return (
    <>
      <span className="font-semibold">{formatarCusto(preco, u)}</span>
      <span className="block text-[12px] text-suave">com frete {formatarCusto(entregue, u)}</span>
    </>
  );
}

function ComposicaoDoTotal({ l }: { l: LinhaDeCompra }) {
  return (
    <>
      <span className={l.cancelada ? 'font-semibold text-suave line-through' : 'font-semibold'}>{formatarDinheiro(l.totalCentavos)}</span>
      <span className="block text-[12px] text-suave">
        itens {formatarDinheiro(l.valorCentavos)} + frete {formatarDinheiro(l.freteCentavos)} − desc. {formatarDinheiro(0)}
      </span>
    </>
  );
}

function LinkDaNota({ l, comprasBase, volta }: { l: LinhaDeCompra; comprasBase: string; volta: string }) {
  return (
    <>
      <Link href={`${comprasBase}/${l.notaId}?volta=${encodeURIComponent(volta)}`} className="ff-transicao rounded-[5px] font-medium text-texto underline decoration-linha-forte underline-offset-4 hover:decoration-texto">
        Nota {l.rotuloDaNota}
      </Link>
      {l.documentoId && (
        <>
          <span aria-hidden className="text-suave"> · </span>
          <Link href={`${comprasBase}/recebidas/${l.documentoId}`} className="ff-transicao rounded-[5px] text-[12px] text-suave underline decoration-linha-forte underline-offset-4 hover:text-texto">
            nota fiscal (XML)
          </Link>
        </>
      )}
    </>
  );
}

const embalagemDaLinha = (l: LinhaDeCompra) => `${(l.embalagensMilesimos / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} × ${l.embalagem || 'embalagem não gravada'}`;

export function TabelaDasCompras({
  caminho,
  f,
  linhas,
  comprasBase,
  total,
  insumosBase,
  rodape,
}: {
  caminho: string;
  f: FiltrosDoRelatorio;
  linhas: LinhaDeCompra[];
  comprasBase: string;
  total: number;
  insumosBase?: string;
  /** A paginação, dentro do mesmo quadro da tabela. */
  rodape?: ReactNode;
}) {
  const volta = hrefDoRelatorio(caminho, f);
  const dataRotulo = BASES_DE_DATA[f.base].curto;
  return (
    <Painel id="compras" titulo={f.situacao === 'canceladas' ? 'Notas canceladas (não são compra)' : 'As compras, linha por linha'} subtitulo={`Datas pela ${dataRotulo}. Cada linha abre a nota de origem.`} semRespiro>
      <ul className="divide-y divide-linha lg:hidden">
        {linhas.map((l) => (
          <li key={l.itemId} className="space-y-1.5 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={`font-medium ${l.cancelada ? 'text-suave line-through' : 'text-texto'}`}>{l.insumo}</p>
                <p className="text-[12px] text-suave">
                  {l.fornecedor} · {l.loja}
                </p>
              </div>
              <p className={`shrink-0 text-right text-sm font-semibold tabular-nums ${l.cancelada ? 'text-suave line-through' : ''}`}>{formatarDinheiro(l.totalCentavos)}</p>
            </div>
            <p className="text-[12px] tabular-nums text-suave">
              itens {formatarDinheiro(l.valorCentavos)} + frete {formatarDinheiro(l.freteCentavos)} − desc. {formatarDinheiro(0)}
            </p>
            <p className="text-[12px] tabular-nums text-suave">
              {formatarData(l.data)} · {embalagemDaLinha(l)} = <span className="font-semibold text-texto">{l.unidade ? formatarQuantidade(l.quantidadeMilesimos, l.unidade) : 'sem unidade'}</span>
            </p>
            <p className="text-sm tabular-nums">
              <PrecoDaLinha l={l} />
            </p>
            <p className="flex min-h-11 flex-wrap items-center gap-x-1 text-[13px]">
              <LinkDaNota l={l} comprasBase={comprasBase} volta={volta} />
              {l.cancelada && <Selo>Cancelada</Selo>}
            </p>
          </li>
        ))}
      </ul>
      <table className="hidden w-full text-sm lg:table">
        <caption className="sr-only">
          As compras do recorte, {total} no total: data, fornecedor e nota, insumo e embalagem original, quantidade convertida, preço unitário e a composição do total (itens, frete e desconto).
        </caption>
        <thead>
          <tr className="bg-forte text-left text-[12px] text-suave">
            <th scope="col" className="h-10 pl-5 pr-3 font-semibold">
              Data
            </th>
            <th scope="col" className="h-10 px-3 font-semibold">
              Fornecedor e nota
            </th>
            <th scope="col" className="h-10 px-3 font-semibold">
              Insumo e embalagem
            </th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">
              Quantidade
            </th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">
              Preço unitário
            </th>
            <th scope="col" className="h-10 pl-3 pr-5 text-right font-semibold">
              Total
            </th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {linhas.map((l) => (
            <tr key={l.itemId} className="ff-transicao border-t border-linha align-top hover:bg-texto/[0.03]">
              <td className="whitespace-nowrap py-2.5 pl-5 pr-3">
                {formatarData(l.data)}
                <span className="block text-[12px] text-suave">{l.loja}</span>
              </td>
              <td className="px-3 py-2.5">
                <span className={`block ${l.cancelada ? 'text-suave line-through' : 'text-texto'}`}>{l.fornecedor}</span>
                <span className="block min-h-6 text-[13px]">
                  <LinkDaNota l={l} comprasBase={comprasBase} volta={volta} />
                </span>
                {l.cancelada && <Selo>Cancelada</Selo>}
              </td>
              <td className="px-3 py-2.5">
                {l.insumoId && insumosBase ? (
                  <Link href={`${insumosBase}/${l.insumoId}`} className="ff-transicao rounded-[5px] font-medium text-texto underline-offset-4 hover:underline">
                    {l.insumo}
                  </Link>
                ) : (
                  <span className="font-medium">{l.insumo}</span>
                )}
                <span className="block text-[12px] text-suave">{embalagemDaLinha(l)}</span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">{l.unidade ? formatarQuantidade(l.quantidadeMilesimos, l.unidade) : <span className="font-normal text-suave">sem unidade</span>}</td>
              <td className="px-3 py-2.5 text-right">
                <PrecoDaLinha l={l} />
              </td>
              <td className="py-2.5 pl-3 pr-5 text-right">
                <ComposicaoDoTotal l={l} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rodape}
    </Painel>
  );
}

// -------------------------------------------------------- exportar e imprimir

/** Planilha e impressão do que está na tela: o mesmo recorte (a URL leva tudo). Só a planilha das linhas e a do resumo. */
export function BarraDeSaida({ f, exportar, imprimir, modo }: { f: FiltrosDoRelatorio; exportar: string; imprimir: string; modo: 'insumo' | 'periodo' }) {
  const q = (extra: Record<string, string>) => {
    const base = queryDoRelatorio(f, { pagina: 1 }, { semPagina: true });
    const p = new URLSearchParams(base);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return p.toString();
  };
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Levar o relatório">
      <a href={`${exportar}?${q({ parte: 'linhas', tela: modo })}`} className={classeDeBotao('secundario')}>
        Planilha das compras
      </a>
      {modo === 'periodo' && (
        <a href={`${exportar}?${q({ parte: 'resumo', tela: modo })}`} className={classeDeBotao('secundario')}>
          Planilha do resumo
        </a>
      )}
      <Link href={`${imprimir}?${q({ imprimir: '1' })}`} className={classeDeBotao('secundario')}>
        Imprimir ou salvar em PDF
      </Link>
    </div>
  );
}
