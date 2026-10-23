/**
 * Comparação de períodos (L.3) — a tela e a versão para imprimir. A MESMA nas duas árvores (`/erp` e `/rodolfo/erp/<slug>`).
 *
 * Ordem de leitura: título e o que está valendo, filtros, avisos de cobertura, os dois períodos e a variação, de onde veio a
 * variação (volume, preço, troca de fornecedor, o que só aparece num lado) com a soma conferida, a tabela por insumo (cartões no
 * celular) e, com um insumo só, os fornecedores lado a lado. Cada número de gasto abre as linhas na tela "Compras do período".
 * A tela nunca chama a variação de inflação nem de economia: diz o efeito de cada coisa.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ComparacaoDePeriodosDaTela, LadoDaTela } from '@/lib/erp/compras-comparacao';
import {
  avisosDaComparacao,
  diasDoPeriodo,
  formatarPercentual,
  formatarVariacao,
  FRASE_DA_FORMULA,
  FRASE_PRECO_VOLUME,
  MEDIDAS,
  type FiltrosDePeriodos,
  type ItemComparado,
  type Lado,
} from '@/lib/erp/compras-comparacao-campos';
import { BASES_DE_DATA, type FiltrosDoRelatorio } from '@/lib/erp/compras-relatorio-campos';
import { formatarData } from '@/lib/erp/compra-campos';
import { faixaDaPagina } from '@/lib/erp/paginacao';
import { COR } from '@/lib/erp/modulos';
import { OPCOES_POR_PAGINA } from '@/lib/erp/insumo-campos';
import { formatarCusto, formatarDinheiro, formatarQuantidade, UNIDADES, type Unidade } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { PaginacaoNumerada } from '../../ui/paginacao-numerada';
import { Aviso, Painel, Selo, Vazio } from '../../ui/superficies';
import { BotaoImprimir } from './botao-imprimir';
import { ChipsDosPeriodos, FormularioDosPeriodos, hrefDosPeriodos } from './comparacao-filtros';
import { BarraDeSaidaDaComparacao } from './comparacao-fornecedores';
import { hrefDoRelatorio } from './relatorio-filtros';
import { Cartao, GRANDE, pl } from './relatorio-partes';

const SIGLA = (u: Unidade) => UNIDADES[u].sigla;
const br = (d: string) => d.split('-').reverse().join('/');
const faixa = (de: string, ate: string) => (de === ate ? br(de) : `${br(de)} a ${br(ate)}`);
const dias = (de: string, ate: string) => pl(diasDoPeriodo(de, ate), 'dia', 'dias');

/** Soma das quantidades por unidade ("10 kg · 100 un"): kg, L e un nunca se somam num número só. */
function quantidades(l: LadoDaTela): string {
  const por = new Map<Unidade, number>();
  for (const c of l.celulas) por.set(c.unidade, (por.get(c.unidade) ?? 0) + c.quantidadeMilesimos);
  const ordem: Unidade[] = ['KG', 'L', 'UN'];
  const txt = ordem.filter((u) => por.has(u)).map((u) => formatarQuantidade(por.get(u)!, u));
  return txt.length ? txt.join(' · ') : 'nada comparável';
}

function Sinal({ centavos, className = '' }: { centavos: number | null; className?: string }) {
  if (centavos === null) return <span className={`text-suave ${className}`}>—</span>;
  return <span className={className}>{formatarVariacao(centavos)}</span>;
}

// ------------------------------------------------------------------ avisos

function avisosDaTela(r: ComparacaoDePeriodosDaTela, f: FiltrosDePeriodos, hoje: string) {
  return avisosDaComparacao({ de: f.rel.de, ate: f.rel.ate, deB: f.deB, ateB: f.ateB }, r.a!, r.b!, r.aguardando, hoje);
}

// ----------------------------------------------------------------- tabela

type Lig = (lado: 'A' | 'B', extra?: Partial<FiltrosDoRelatorio>) => string;

function CelulaDeLado({ nome, lado, unidade, href, campo }: { nome: 'A' | 'B'; lado: Lado | null; unidade: Unidade; href: string; campo: 'qtd' | 'custo' | 'gasto' }) {
  const rotulo = <span className="text-suave">{nome}: </span>;
  if (!lado) return <span className="block whitespace-nowrap">{rotulo}<span className="text-suave">—</span></span>;
  if (campo === 'qtd') return <span className="block whitespace-nowrap">{rotulo}{formatarQuantidade(lado.quantidadeMilesimos, unidade)}</span>;
  if (campo === 'custo') return <span className="block whitespace-nowrap">{rotulo}{lado.custo ? formatarCusto(lado.custo, unidade) : 'sem base'}</span>;
  return (
    <span className="block whitespace-nowrap">
      <Link href={href} className="ff-transicao inline-flex items-center rounded-[5px] underline decoration-linha-forte underline-offset-4 hover:decoration-texto [@media(pointer:coarse)]:min-h-11">
        {rotulo}
        {formatarDinheiro(lado.gastoCentavos)}
      </Link>
    </span>
  );
}

function Situacao({ i, r }: { i: ItemComparado; r: ComparacaoDePeriodosDaTela }) {
  if (i.situacao === 'ambos') return null;
  const lado = i.situacao === 'so-b' ? r.a : r.b;
  const sem = lado?.semBase.porInsumo[i.insumoId];
  const nome = i.situacao === 'so-b' ? 'A' : 'B';
  return (
    <span className="mt-1 block">
      <Selo tom="alerta">{i.situacao === 'so-b' ? 'Só em B (entrou)' : 'Só em A (saiu)'}</Selo>
      <span className="mt-1 block text-[12px] text-suave">
        Sem compra comparável em {nome}: não dá para separar preço de volume.
        {sem ? ` Em ${nome} havia ${pl(sem.linhas, 'linha', 'linhas')} sem base (${formatarDinheiro(sem.valorCentavos + sem.freteCentavos)}), que não entra na conta.` : ''}
      </span>
    </span>
  );
}

function Variacao({ i }: { i: ItemComparado }) {
  return (
    <>
      <Sinal centavos={i.variacaoCentavos} className="font-semibold" />
      {i.variacaoDoCustoDecimos !== null && <span className="block text-[12px] text-suave">custo médio {formatarPercentual(i.variacaoDoCustoDecimos)}</span>}
    </>
  );
}

function PrecoETroca({ i }: { i: ItemComparado }) {
  return (
    <>
      <Sinal centavos={i.precoCentavos} />
      {i.trocaCentavos !== null && i.trocaCentavos !== 0 && (
        <span className="block lg:ml-auto lg:max-w-[11rem] text-[12px] text-suave">
          dos quais troca de fornecedor <Sinal centavos={i.trocaCentavos} />
        </span>
      )}
    </>
  );
}

export function TabelaPorInsumo({
  r,
  f,
  caminho,
  liga,
  umInsumo,
}: {
  r: ComparacaoDePeriodosDaTela;
  f: FiltrosDePeriodos;
  caminho: string;
  liga: Lig;
  umInsumo: boolean;
}) {
  const s = r.comparacao!.resumo;
  const semLado = s.semCompraA || s.semCompraB;
  const semEfeitos = semLado || s.nosDois === 0;
  const itens = r.itensDaPagina;
  const abrir = (i: ItemComparado) => hrefDosPeriodos(caminho, f, { rel: { insumoId: i.insumoId, q: '' }, pagina: 1 });
  const nome = (i: ItemComparado) =>
    umInsumo ? (
      <span className="font-medium text-texto">{i.insumo}</span>
    ) : (
      <Link href={abrir(i)} className="ff-toque ff-transicao rounded-[5px] font-medium text-texto underline-offset-4 hover:underline">
        {i.insumo}
      </Link>
    );
  const { de, ate } = faixaDaPagina(r.pagina, f.porPagina, itens.length);
  const rodape = (
    <PaginacaoNumerada
      de={de}
      ate={ate}
      total={r.totalDeItens}
      pagina={r.pagina}
      paginas={r.paginas}
      singular="insumo"
      plural="insumos"
      href={(p) => `${hrefDosPeriodos(caminho, f, { pagina: p })}#insumos`}
      tamanhos={{ opcoes: OPCOES_POR_PAGINA, atual: f.porPagina, href: (n) => `${hrefDosPeriodos(caminho, f, { porPagina: n, pagina: 1 })}#insumos` }}
    />
  );
  return (
    <Painel id="insumos" titulo="Por insumo" subtitulo="Do que mais mexeu no gasto ao que menos. Cada insumo é comparado só com ele mesmo, na mesma unidade." semRespiro>
      <ul className="divide-y divide-linha lg:hidden">
        {itens.map((i) => (
          <li key={i.chave} className="space-y-1.5 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p>{nome(i)}</p>
                <p className="text-[12px] text-suave">em {SIGLA(i.unidade)}</p>
              </div>
              <p className="shrink-0 text-right text-sm tabular-nums">
                <Variacao i={i} />
              </p>
            </div>
            <Situacao i={i} r={r} />
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[13px] tabular-nums">
              <div>
                <dt className="text-[12px] text-suave">Quantidade</dt>
                <dd><CelulaDeLado nome="A" lado={i.a} unidade={i.unidade} href="" campo="qtd" /><CelulaDeLado nome="B" lado={i.b} unidade={i.unidade} href="" campo="qtd" /></dd>
              </div>
              <div>
                <dt className="text-[12px] text-suave">Custo médio</dt>
                <dd><CelulaDeLado nome="A" lado={i.a} unidade={i.unidade} href="" campo="custo" /><CelulaDeLado nome="B" lado={i.b} unidade={i.unidade} href="" campo="custo" /></dd>
              </div>
              <div>
                <dt className="text-[12px] text-suave">Efeito volume</dt>
                <dd><Sinal centavos={i.volumeCentavos} /></dd>
              </div>
              <div>
                <dt className="text-[12px] text-suave">Efeito preço</dt>
                <dd><PrecoETroca i={i} /></dd>
              </div>
            </dl>
            <p className="flex flex-wrap gap-x-4">
              {i.a && (
                <Link href={liga('A', { insumoId: i.insumoId, q: '', unidade: i.unidade })} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center`}>
                  Compras de A ({formatarDinheiro(i.a.gastoCentavos)})
                </Link>
              )}
              {i.b && (
                <Link href={liga('B', { insumoId: i.insumoId, q: '', unidade: i.unidade })} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center`}>
                  Compras de B ({formatarDinheiro(i.b.gastoCentavos)})
                </Link>
              )}
            </p>
          </li>
        ))}
        {r.totalDeItens > 1 && (
        <li className="px-4 py-3 text-sm tabular-nums">
          <p className="text-[12px] text-suave">Total de todos os {pl(r.totalDeItens, 'insumo', 'insumos')} (não só desta página)</p>
          <p>
            Variação {semLado ? <span className="font-semibold">sem base</span> : <Sinal centavos={s.variacaoCentavos} className="font-semibold" />} · volume {semEfeitos ? '—' : <Sinal centavos={s.volumeCentavos} />} · preço {semEfeitos ? '—' : <Sinal centavos={s.precoCentavos} />}
          </p>
        </li>
        )}
      </ul>
      <table className="hidden w-full text-sm lg:table">
        <caption className="sr-only">
          Comparação por insumo, {r.totalDeItens} no total: quantidade, custo médio e gasto nos períodos A e B, a variação do gasto e quanto dela vem do volume e do preço. O gasto de cada período abre as compras dele.
        </caption>
        <thead>
          <tr className="bg-forte text-left text-[12px] text-suave">
            <th scope="col" className="h-10 pl-5 pr-3 font-semibold">Insumo</th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">Quantidade</th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">Custo médio</th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">Gasto</th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">Variação</th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">Efeito volume</th>
            <th scope="col" className="h-10 pl-3 pr-5 text-right font-semibold">Efeito preço</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {itens.map((i) => (
            <tr key={i.chave} className="ff-transicao border-t border-linha align-top hover:bg-texto/[0.03]">
              <td className="py-2.5 pl-5 pr-3">
                {nome(i)}
                <span className="block text-[12px] text-suave">em {SIGLA(i.unidade)}</span>
                <Situacao i={i} r={r} />
              </td>
              <td className="px-3 py-2.5 text-right"><CelulaDeLado nome="A" lado={i.a} unidade={i.unidade} href="" campo="qtd" /><CelulaDeLado nome="B" lado={i.b} unidade={i.unidade} href="" campo="qtd" /></td>
              <td className="px-3 py-2.5 text-right"><CelulaDeLado nome="A" lado={i.a} unidade={i.unidade} href="" campo="custo" /><CelulaDeLado nome="B" lado={i.b} unidade={i.unidade} href="" campo="custo" /></td>
              <td className="px-3 py-2.5 text-right">
                <CelulaDeLado nome="A" lado={i.a} unidade={i.unidade} href={liga('A', { insumoId: i.insumoId, q: '', unidade: i.unidade })} campo="gasto" />
                <CelulaDeLado nome="B" lado={i.b} unidade={i.unidade} href={liga('B', { insumoId: i.insumoId, q: '', unidade: i.unidade })} campo="gasto" />
              </td>
              <td className="px-3 py-2.5 text-right"><Variacao i={i} /></td>
              <td className="px-3 py-2.5 text-right"><Sinal centavos={i.volumeCentavos} /></td>
              <td className="py-2.5 pl-3 pr-5 text-right"><PrecoETroca i={i} /></td>
            </tr>
          ))}
        </tbody>
        {r.totalDeItens > 1 && (
        <tfoot className="tabular-nums">
          <tr className="border-t border-linha-forte bg-forte">
            <th scope="row" className="py-2.5 pl-5 pr-3 text-left text-[12px] font-semibold text-suave">
              Total de todos os {pl(r.totalDeItens, 'insumo', 'insumos')}
              <span className="block font-normal">(não só desta página)</span>
            </th>
            <td />
            <td />
            <td className="px-3 py-2.5 text-right text-[13px]">
              <span className="block"><span className="text-suave">A: </span>{s.semCompraA ? <span className="text-suave">Sem compra</span> : formatarDinheiro(s.gastoACentavos)}</span>
              <span className="block"><span className="text-suave">B: </span>{s.semCompraB ? <span className="text-suave">Sem compra</span> : formatarDinheiro(s.gastoBCentavos)}</span>
            </td>
            <td className="px-3 py-2.5 text-right">
              {semLado ? <span className="font-semibold">sem base</span> : <Sinal centavos={s.variacaoCentavos} className="font-semibold" />}
              <span className="block text-[12px] text-suave">inclui entrou <Sinal centavos={s.entrouCentavos} /> e saiu <Sinal centavos={s.saiuCentavos} /></span>
            </td>
            <td className="px-3 py-2.5 text-right">{semEfeitos ? '—' : <Sinal centavos={s.volumeCentavos} className="font-semibold" />}</td>
            <td className="py-2.5 pl-3 pr-5 text-right">
              {semEfeitos ? '—' : <Sinal centavos={s.precoCentavos} className="font-semibold" />}
              {!semEfeitos && s.trocaCentavos !== 0 && <span className="block lg:ml-auto lg:max-w-[11rem] text-[12px] text-suave">dos quais troca de fornecedor <Sinal centavos={s.trocaCentavos} /></span>}
            </td>
          </tr>
        </tfoot>
        )}
      </table>
      {rodape}
    </Painel>
  );
}

// ------------------------------------------------------ fornecedores do insumo

export function FornecedoresDoInsumo({ i }: { i: ItemComparado }) {
  const u = i.unidade;
  return (
    <Painel
      titulo={`Fornecedores de ${i.insumo} em ${SIGLA(u)}, lado a lado`}
      subtitulo="O efeito preço de cada fornecedor só existe quando ele vendeu nos dois períodos; o resto do efeito preço é troca de fornecedor."
      semRespiro
    >
      <ul className="divide-y divide-linha lg:hidden">
        {i.fornecedores.map((x) => (
          <li key={x.fornecedorId} className="space-y-1 px-4 py-3 text-[13px] tabular-nums">
            <p className="font-medium text-texto">{x.fornecedor}</p>
            <p className="text-suave">A: {x.a ? `${formatarQuantidade(x.a.quantidadeMilesimos, u)} a ${formatarCusto(x.a.custo, u)}` : 'não vendeu'}</p>
            <p className="text-suave">B: {x.b ? `${formatarQuantidade(x.b.quantidadeMilesimos, u)} a ${formatarCusto(x.b.custo, u)}` : 'não vendeu'}</p>
            <p>
              Efeito preço do fornecedor: <Sinal centavos={x.efeitoPrecoCentavos} />
            </p>
          </li>
        ))}
      </ul>
      <table className="hidden w-full text-sm lg:table">
        <caption className="sr-only">
          Fornecedores de {i.insumo} em {SIGLA(u)} nos períodos A e B: quantidade, custo médio, gasto e o efeito preço de cada fornecedor.
        </caption>
        <thead>
          <tr className="bg-forte text-left text-[12px] text-suave">
            <th scope="col" className="h-10 pl-5 pr-3 font-semibold">Fornecedor</th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">Quantidade</th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">Custo médio</th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">Gasto</th>
            <th scope="col" className="h-10 pl-3 pr-5 text-right font-semibold">Efeito preço dele</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {i.fornecedores.map((x) => (
            <tr key={x.fornecedorId} className="border-t border-linha align-top">
              <td className="py-2.5 pl-5 pr-3 font-medium text-texto">{x.fornecedor}</td>
              <td className="px-3 py-2.5 text-right"><CelulaDeLado nome="A" lado={x.a} unidade={u} href="" campo="qtd" /><CelulaDeLado nome="B" lado={x.b} unidade={u} href="" campo="qtd" /></td>
              <td className="px-3 py-2.5 text-right"><CelulaDeLado nome="A" lado={x.a} unidade={u} href="" campo="custo" /><CelulaDeLado nome="B" lado={x.b} unidade={u} href="" campo="custo" /></td>
              <td className="px-3 py-2.5 text-right">
                <span className="block"><span className="text-suave">A: </span>{x.a ? formatarDinheiro(x.a.gastoCentavos) : '—'}</span>
                <span className="block"><span className="text-suave">B: </span>{x.b ? formatarDinheiro(x.b.gastoCentavos) : '—'}</span>
              </td>
              <td className="py-2.5 pl-3 pr-5 text-right"><Sinal centavos={x.efeitoPrecoCentavos} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {i.situacao === 'ambos' && i.trocaCentavos !== null && (
        <p className="border-t border-linha px-4 py-3 text-[13px] text-suave sm:px-5">
          Efeito preço do insumo <Sinal centavos={i.precoCentavos} className="text-texto" />: <Sinal centavos={i.mesmoFornecedorCentavos} className="text-texto" /> vêm de fornecedores que mudaram o próprio preço e <Sinal centavos={i.trocaCentavos} className="text-texto" /> de trocar de fornecedor ou mudar a fatia de cada um.
        </p>
      )}
    </Painel>
  );
}

// ------------------------------------------------------------------- notas

export function NotasDosPeriodos({ r, f, comprasBase }: { r: ComparacaoDePeriodosDaTela; f: FiltrosDePeriodos; comprasBase: string }) {
  const itens: ReactNode[] = [];
  itens.push(
    <li key="custo">
      <strong className="font-semibold text-texto">Medida: {MEDIDAS[f.medida].rotulo}.</strong> {MEDIDAS.entregue.explica} {MEDIDAS.item.explica} O frete é o rateio gravado em cada item da nota.
    </li>,
  );
  itens.push(
    <li key="efeitos">
      <strong className="font-semibold text-texto">Efeito preço e efeito volume.</strong> {FRASE_PRECO_VOLUME} {FRASE_DA_FORMULA}
    </li>,
  );
  itens.push(
    <li key="troca">
      <strong className="font-semibold text-texto">Troca de fornecedor.</strong> É a parte do efeito preço que não vem de um fornecedor mudar o próprio preço: comprar de outro, ou comprar mais de um e menos de outro. Por isso a tela não chama o efeito preço de inflação nem de economia.
    </li>,
  );
  itens.push(
    <li key="so">
      <strong className="font-semibold text-texto">Só num período.</strong> Insumo que só aparece em A ou só em B (ou em outra unidade) não tem como separar preço de volume, e o gasto dele inteiro aparece como “entrou” ou “saiu”.
    </li>,
  );
  itens.push(
    <li key="data">
      <strong className="font-semibold text-texto">Data usada: {BASES_DE_DATA[f.rel.base].rotulo}.</strong> {BASES_DE_DATA[f.rel.base].explica} Vale para os dois períodos, para a planilha e para a impressão.
    </li>,
  );
  for (const [nome, l] of [['A', r.a!], ['B', r.b!]] as const) {
    if (l.canceladas.notas > 0) {
      itens.push(
        <li key={`canc-${nome}`}>
          {pl(l.canceladas.notas, 'nota cancelada', 'notas canceladas')} no período {nome} ({formatarDinheiro(l.canceladas.valorCentavos + l.canceladas.freteCentavos)}) ficou de fora de tudo.
        </li>,
      );
    }
    if (l.notasComDesconto > 0) {
      itens.push(<li key={`desc-${nome}`}>{pl(l.notasComDesconto, 'nota tem', 'notas têm')} desconto no cabeçalho (período {nome}) que o sistema ainda não divide pelos itens: o valor de cada item é o que a nota cobra.</li>);
    }
  }
  if (r.aguardando > 0) {
    itens.push(
      <li key="aguardando">
        <Link href={`${comprasBase}/recebidas`} className={`${LINK_DE_TEXTO} ff-toque`}>
          Ver as notas recebidas que aguardam conferência
        </Link>
      </li>,
    );
  }
  return (
    <Painel titulo="Para ler os números" semRespiro>
      <ul className="space-y-2 px-4 py-3 text-[13px] leading-relaxed text-suave sm:px-5">{itens}</ul>
    </Painel>
  );
}

// -------------------------------------------------------------------- tela

export function TelaDosPeriodos({
  caminho,
  comprasBase,
  contexto,
  f,
  r,
  hoje,
  visaoDaLoja,
}: {
  caminho: string;
  comprasBase: string;
  contexto: string;
  f: FiltrosDePeriodos;
  r: ComparacaoDePeriodosDaTela;
  hoje: string;
  visaoDaLoja?: string | null;
}) {
  const subtitulo = [contexto, r.insumo?.nome, `A ${faixa(f.rel.de, f.rel.ate)} × B ${faixa(f.deB, f.ateB)}`, BASES_DE_DATA[f.rel.base].curto].filter(Boolean).join(' · ');
  const volta = hrefDosPeriodos(caminho, f);
  const liga: Lig = (lado, extra = {}) =>
    hrefDoRelatorio(
      `${comprasBase}/relatorios/periodo`,
      { ...f.rel, de: lado === 'A' ? f.rel.de : f.deB, ate: lado === 'A' ? f.rel.ate : f.ateB, agrupar: 'insumo', grupo: '', unidade: '', so: '', ver: 'linhas', volta, pagina: 1, ...extra },
      {},
      { semPagina: true },
    );
  const vazio = r.motivoVazio
    ? r.motivoVazio === 'periodo'
      ? { titulo: 'O período não faz sentido.', texto: f.periodoInvalido ?? '' }
      : { titulo: 'Nenhuma dessas lojas está no seu acesso.', texto: 'O relatório só mostra as lojas que você pode ver. Escolha entre as que aparecem em “Lojas”, ou deixe sem marcar para ver todas as suas.' }
    : null;
  const c = r.comparacao;
  const s = c?.resumo;
  const a = r.a;
  const b = r.b;
  const avisos = a && b && c ? avisosDaTela(r, f, hoje) : [];
  const temFiltro = f.rel.lojaIds.length > 0 || !!f.rel.fornecedorId || !!f.rel.insumoId || !!f.rel.q || !!f.rel.categoriaId;
  const itensComBase = c?.itens ?? [];
  const semLado = !!s && (s.semCompraA || s.semCompraB);
  const semEfeitos = !!s && (semLado || s.nosDois === 0);
  const SEM_EFEITOS = semLado ? 'Sem compra comparável num dos períodos: não há como separar preço de volume.' : 'Nenhum insumo tem compra comparável nos dois períodos: não há como separar preço de volume.';
  const verDoLado = (nome: 'A' | 'B', l: NonNullable<typeof a>) => [
    ...(l.linhas > 0 ? [{ href: liga(nome), texto: l.linhas === 1 ? `Ver a linha de ${nome}` : `Ver as ${pl(l.linhas, 'linha', 'linhas')} de ${nome}` }] : []),
    ...(l.semBase.linhas > 0 ? [{ href: liga(nome, { so: 'sembase' }), texto: l.semBase.linhas === 1 ? `Ver a linha sem base de ${nome}` : `Ver as ${pl(l.semBase.linhas, 'linha', 'linhas')} sem base de ${nome}` }] : []),
  ];
  const avisosPainel =
    avisos.length > 0 ? (
      <Painel id="antes-de-ler" titulo="Antes de ler" subtitulo="O que muda o jeito de ler esta comparação." semRespiro className="scroll-mt-24">
        <ul className="space-y-2 px-4 py-3 text-[13px] leading-relaxed text-suave sm:px-5">
          {avisos.map((x) => (
            <li key={x.chave}>
              {x.texto}
              {x.semBaseDoLado && (
                <>
                  {' '}
                  <Link href={liga(x.semBaseDoLado, { so: 'sembase' })} className={`${LINK_DE_TEXTO} ff-toque`}>
                    Ver as linhas sem base de {x.semBaseDoLado}
                  </Link>
                </>
              )}
            </li>
          ))}
        </ul>
      </Painel>
    ) : null;
  return (
    <div className="space-y-6">
      <PageHeader icone="periodos" cor={COR.compras} titulo="Comparar períodos" subtitulo={subtitulo}>
        <FormularioDosPeriodos caminho={caminho} f={f} opcoes={r.opcoes} hoje={hoje} />
        {visaoDaLoja && (
          <p className="text-[13px] text-suave">
            Mostrando só <strong className="font-semibold text-texto">{visaoDaLoja}</strong>, a loja escolhida no topo. Para ver outras, marque-as em “Lojas”.
          </p>
        )}
        <ChipsDosPeriodos caminho={caminho} f={f} opcoes={r.opcoes} insumoNome={r.insumo?.nome} />
      </PageHeader>

      {vazio && (
        <Painel semRespiro>
          <Vazio titulo={vazio.titulo} acao={<Link href={caminho} className={classeDeBotao('secundario')}>Limpar e recomeçar</Link>}>
            {vazio.texto}
          </Vazio>
        </Painel>
      )}

      {r.passouDoTeto && (
        <Aviso tom="alerta" titulo="Este recorte tem combinações demais de insumo e fornecedor para comparar de uma vez.">
          Filtre por loja, fornecedor, categoria ou insumo (a tela não corta calada).
        </Aviso>
      )}

      {!vazio && a && b && c && s && !r.passouDoTeto && (
        <>
          {c.itens.length === 0 && avisosPainel}

          {c.itens.length === 0 ? (
            <Painel semRespiro>
              <Vazio titulo="Nenhuma compra comparável nos dois períodos." acao={temFiltro ? <Link href={hrefDosPeriodos(caminho, f, { rel: { lojaIds: [], fornecedorId: '', insumoId: '', q: '', categoriaId: '' } })} className={classeDeBotao('secundario')}>Tirar os filtros</Link> : undefined}>
                Confira os períodos e a data usada ({BASES_DE_DATA[f.rel.base].curto}).
              </Vazio>
            </Painel>
          ) : (
            <>
              <section aria-labelledby="cmp-resumo" className="space-y-3">
                <h2 id="cmp-resumo" className="sr-only">
                  Os dois períodos e a variação
                </h2>
                <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 xl:grid-cols-3">
                  <Cartao rotulo={`Período A (a base) · ${faixa(a.de, a.ate)} · ${dias(a.de, a.ate)}`} ver={verDoLado('A', a)}>
                    {s.semCompraA ? (
                      <>
                        <p className={GRANDE}>Sem compra</p>
                        <p className="mt-1.5 text-[12px] text-suave">Nada comparável neste período{a.linhas > 0 ? `: só ${pl(a.linhas, 'linha', 'linhas')} sem base` : ''}.</p>
                      </>
                    ) : (
                      <>
                        <p className={GRANDE}>{formatarDinheiro(s.gastoACentavos)}</p>
                        <p className="mt-1.5 text-[12px] tabular-nums text-suave">
                          {MEDIDAS[f.medida].curto} · {pl(a.notas, 'compra', 'compras')} · {quantidades(a)}
                        </p>
                      </>
                    )}
                  </Cartao>
                  <Cartao rotulo={`Período B · ${faixa(b.de, b.ate)} · ${dias(b.de, b.ate)}`} ver={verDoLado('B', b)}>
                    {s.semCompraB ? (
                      <>
                        <p className={GRANDE}>Sem compra</p>
                        <p className="mt-1.5 text-[12px] text-suave">Nada comparável neste período{b.linhas > 0 ? `: só ${pl(b.linhas, 'linha', 'linhas')} sem base` : ''}.</p>
                      </>
                    ) : (
                      <>
                        <p className={GRANDE}>{formatarDinheiro(s.gastoBCentavos)}</p>
                        <p className="mt-1.5 text-[12px] tabular-nums text-suave">
                          {MEDIDAS[f.medida].curto} · {pl(b.notas, 'compra', 'compras')} · {quantidades(b)}
                        </p>
                      </>
                    )}
                  </Cartao>
                  <Cartao rotulo="Variação do gasto (B menos A)" ver={avisos.length > 0 ? { href: '#antes-de-ler', texto: avisos.length === 1 ? 'Ver o aviso sobre esta comparação' : `Ver os ${avisos.length} avisos sobre esta comparação` } : undefined}>
                    {semLado ? (
                      <>
                        <p className={GRANDE}>Sem base</p>
                        <p className="mt-1.5 text-[12px] text-suave">
                          Um dos períodos não tem compra comparável: não há variação nem % a calcular.{' '}
                          {s.semCompraB ? `O que A comprou (${formatarDinheiro(-s.saiuCentavos)}) aparece como “saiu”.` : `O que B comprou (${formatarDinheiro(s.entrouCentavos)}) aparece como “entrou”.`}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className={GRANDE}>
                          <Sinal centavos={s.variacaoCentavos} />
                        </p>
                        <p className="mt-1.5 text-[12px] text-suave">
                          {s.variacaoDecimos === null ? 'Sem base para o percentual.' : `${formatarPercentual(s.variacaoDecimos)} sobre o período A`}
                          {s.entrouDomina ? ` A maior parte (${formatarDinheiro(s.entrouCentavos)}) é de insumo que só aparece em B: não é aumento de preço.` : ''}
                        </p>
                      </>
                    )}
                  </Cartao>
                </div>
                <p className="text-[12px] text-suave">Gasto comparável: só as linhas com insumo, unidade e valor, nos dois períodos. {s.nosDois} {s.nosDois === 1 ? 'insumo está' : 'insumos estão'} nos dois.</p>
              </section>

              {avisosPainel}

              <section aria-labelledby="cmp-origem" className="space-y-3">
                <div>
                  <h2 id="cmp-origem" className="text-[13px] font-semibold text-texto">
                    De onde veio a variação
                  </h2>
                  <p className="mt-0.5 text-[12px] text-suave">{FRASE_PRECO_VOLUME}</p>
                </div>
                <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 xl:grid-cols-4">
                  <Cartao rotulo="Efeito volume (comprou mais ou menos)" ver={{ href: '#insumos', texto: 'Ver por insumo' }}>
                    <p className={GRANDE}>{semEfeitos ? '—' : <Sinal centavos={s.volumeCentavos} />}</p>
                    <p className="mt-1.5 text-[12px] text-suave">{semEfeitos ? SEM_EFEITOS : 'Quantidade que mudou, ao custo médio dos dois períodos.'}</p>
                  </Cartao>
                  <Cartao rotulo="Efeito preço (cada unidade custou mais ou menos)" ver={{ href: '#insumos', texto: 'Ver por insumo' }}>
                    <p className={GRANDE}>{semEfeitos ? '—' : <Sinal centavos={s.precoCentavos} />}</p>
                    <p className="mt-1.5 text-[12px] tabular-nums text-suave">
                      {semEfeitos ? SEM_EFEITOS : <>do mesmo fornecedor <Sinal centavos={s.mesmoFornecedorCentavos} /> · troca de fornecedor <Sinal centavos={s.trocaCentavos} /></>}
                    </p>
                  </Cartao>
                  <Cartao rotulo="Só num dos períodos (sem como separar preço de volume)" ver={s.soEmA + s.soEmB > 0 ? { href: '#insumos', texto: 'Ver quais insumos' } : undefined}>
                    {s.soEmA + s.soEmB === 0 ? (
                      <>
                        <p className={GRANDE}>Nenhum</p>
                        <p className="mt-1.5 text-[12px] text-suave">Todos os insumos têm compra comparável nos dois períodos.</p>
                      </>
                    ) : (
                      <>
                        <p className={GRANDE}><Sinal centavos={s.entrouCentavos + s.saiuCentavos} /></p>
                        <p className="mt-1.5 text-[12px] tabular-nums text-suave">
                          entrou <Sinal centavos={s.entrouCentavos} /> ({pl(s.soEmB, 'insumo', 'insumos')}) · saiu <Sinal centavos={s.saiuCentavos} /> ({pl(s.soEmA, 'insumo', 'insumos')})
                        </p>
                      </>
                    )}
                  </Cartao>
                  {!semLado && (
                  <Cartao rotulo="A soma">
                    <ul className="space-y-0.5 text-sm tabular-nums">
                      <li><Sinal centavos={s.volumeCentavos} /> <span className="text-suave">efeito volume</span></li>
                      <li><Sinal centavos={s.precoCentavos} /> <span className="text-suave">efeito preço</span></li>
                      <li><Sinal centavos={s.entrouCentavos} /> <span className="text-suave">entrou</span></li>
                      <li><Sinal centavos={s.saiuCentavos} /> <span className="text-suave">saiu</span></li>
                    </ul>
                    <p className="mt-1.5 border-t border-linha pt-1.5 text-sm font-semibold tabular-nums">
                      = <Sinal centavos={s.volumeCentavos + s.precoCentavos + s.entrouCentavos + s.saiuCentavos} /> {s.fecha ? <span className="font-normal text-suave">(igual à variação)</span> : <Selo tom="erro">não fecha com a variação</Selo>}
                    </p>
                  </Cartao>
                  )}
                </div>
                {r.umInsumo && (
                  <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-3">
                    {itensComBase.map((i) => (
                      <Cartao key={`custo-${i.chave}`} rotulo={`Custo médio de ${i.insumo} em ${SIGLA(i.unidade)}`}>
                        <p className="text-sm tabular-nums">
                          <span className="text-suave">A: </span>{i.a?.custo ? formatarCusto(i.a.custo, i.unidade) : 'sem base'}
                          <br />
                          <span className="text-suave">B: </span>{i.b?.custo ? formatarCusto(i.b.custo, i.unidade) : 'sem base'}
                        </p>
                        <p className="mt-1.5 text-[12px] text-suave">{i.variacaoDoCustoDecimos === null ? 'Sem base para a variação do custo: falta compra num dos períodos.' : `Variação do custo médio: ${formatarPercentual(i.variacaoDoCustoDecimos)}`}</p>
                      </Cartao>
                    ))}
                  </div>
                )}
              </section>

              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <p className="text-[13px] text-suave">Levar o que está na tela, com os mesmos períodos, a mesma medida e os mesmos números:</p>
                <BarraDeSaidaDaComparacao exportar={`${comprasBase}/relatorios/comparar/exportar`} imprimir={caminho} query={hrefDosPeriodos('', f, {}, { semPagina: true }).slice(1)} tela="periodos" />
              </div>

              <TabelaPorInsumo r={r} f={f} caminho={caminho} liga={liga} umInsumo={r.umInsumo} />

              {r.umInsumo && itensComBase.map((i) => <FornecedoresDoInsumo key={i.chave} i={i} />)}
            </>
          )}

          <NotasDosPeriodos r={r} f={f} comprasBase={comprasBase} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- impressão

const TH = 'border-b border-linha-forte px-2 py-1.5 text-left text-[11px] font-semibold text-suave print:text-black';
const TD = 'border-b border-linha px-2 py-1.5 align-top text-[12px] print:text-black';
const txtSinal = formatarVariacao;
const lado = (l: Lado | null, u: Unidade, c: 'q' | 'c' | 'g') => (!l ? '—' : c === 'q' ? formatarQuantidade(l.quantidadeMilesimos, u) : c === 'c' ? (l.custo ? formatarCusto(l.custo, u) : 'sem base') : formatarDinheiro(l.gastoCentavos));

/** A versão para imprimir ou salvar em PDF: o que a tela diz, sem menu e sem botão, com a tabela inteira. */
export function ImpressaoDosPeriodos({ caminho, contexto, f, r, geradoEm, hoje }: { caminho: string; contexto: string; f: FiltrosDePeriodos; r: ComparacaoDePeriodosDaTela; geradoEm: string; hoje: string }) {
  const avisos = avisosDaTela(r, f, hoje);
  const voltar = hrefDosPeriodos(caminho, f);
  const c = r.comparacao!;
  const s = c.resumo;
  const semLado = s.semCompraA || s.semCompraB;
  const semEfeitos = semLado || s.nosDois === 0;
  const linhas: [string, string][] = [
    [`Gasto no período A`, s.semCompraA ? 'sem compra comparável' : formatarDinheiro(s.gastoACentavos)],
    [`Gasto no período B`, s.semCompraB ? 'sem compra comparável' : formatarDinheiro(s.gastoBCentavos)],
    ['Variação (B menos A)', semLado ? 'sem base (um dos períodos não tem compra comparável)' : `${txtSinal(s.variacaoCentavos)}${s.variacaoDecimos === null ? ' · sem base para o percentual' : ` · ${formatarPercentual(s.variacaoDecimos)} sobre A`}${s.entrouDomina ? ` · a maior parte (${formatarDinheiro(s.entrouCentavos)}) é de insumo que só aparece em B` : ''}`],
    ['Efeito volume', semEfeitos ? '—' : txtSinal(s.volumeCentavos)],
    ['Efeito preço', semEfeitos ? '—' : `${txtSinal(s.precoCentavos)} (do mesmo fornecedor ${txtSinal(s.mesmoFornecedorCentavos)}; troca de fornecedor ${txtSinal(s.trocaCentavos)})`],
    ['Só num período', `entrou ${txtSinal(s.entrouCentavos)} (${pl(s.soEmB, 'insumo', 'insumos')}) · saiu ${txtSinal(s.saiuCentavos)} (${pl(s.soEmA, 'insumo', 'insumos')})`],
    ...(semLado ? [] : ([['Conferência', `volume ${txtSinal(s.volumeCentavos)}, preço ${txtSinal(s.precoCentavos)}, entrou ${txtSinal(s.entrouCentavos)}, saiu ${txtSinal(s.saiuCentavos)} = ${txtSinal(s.volumeCentavos + s.precoCentavos + s.entrouCentavos + s.saiuCentavos)} ${s.fecha ? '(igual à variação)' : '(NÃO FECHA)'}`]] as [string, string][])),
  ];
  return (
    <div className="ff-relatorio-impressao mx-auto max-w-[1100px] space-y-5">
      <style>{'@media print{@page{size:A4 landscape;margin:12mm}}'}</style>
      <div className="ff-nao-imprime flex flex-wrap items-center gap-2 rounded-[14px] border border-linha bg-painel p-4">
        <BotaoImprimir />
        <Link href={voltar} className={classeDeBotao('secundario')}>
          Voltar para a comparação
        </Link>
        <p className="w-full text-[13px] text-suave">Na janela de impressão, escolha “Salvar como PDF”. O arquivo sai sem menu e sem botões, com os mesmos períodos, a mesma medida e os mesmos números da tela.</p>
      </div>
      <article className="space-y-5 rounded-[14px] border border-linha bg-painel p-5 print:border-0 print:bg-white print:p-0 print:text-black">
        <header className="space-y-1 border-b border-linha-forte pb-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-suave print:text-black">{contexto} · FlowFoods ERP</p>
          <h1 className="font-display text-2xl font-bold">Comparação de períodos</h1>
          <dl className="grid gap-x-6 gap-y-0.5 text-[12px] sm:grid-cols-[auto_1fr]">
            <dt className="text-suave print:text-black">Período A (base)</dt>
            <dd>{faixa(f.rel.de, f.rel.ate)} ({dias(f.rel.de, f.rel.ate)})</dd>
            <dt className="text-suave print:text-black">Período B</dt>
            <dd>{faixa(f.deB, f.ateB)} ({dias(f.deB, f.ateB)})</dd>
            <dt className="text-suave print:text-black">Data usada</dt>
            <dd>{BASES_DE_DATA[f.rel.base].rotulo}. {BASES_DE_DATA[f.rel.base].explica}</dd>
            <dt className="text-suave print:text-black">Medida do gasto</dt>
            <dd>{MEDIDAS[f.medida].explica}</dd>
            <dt className="text-suave print:text-black">Lojas</dt>
            <dd>{r.lojasUsadas.map((l) => l.nome).join(', ')}</dd>
            {r.insumo && (
              <>
                <dt className="text-suave print:text-black">Insumo</dt>
                <dd>{r.insumo.nome}</dd>
              </>
            )}
            <dt className="text-suave print:text-black">Como ler</dt>
            <dd>{FRASE_PRECO_VOLUME}</dd>
            <dt className="text-suave print:text-black">A conta</dt>
            <dd>{FRASE_DA_FORMULA}</dd>
            <dt className="text-suave print:text-black">Gerado em</dt>
            <dd>{geradoEm}</dd>
          </dl>
        </header>
        <section aria-label="Totais da comparação" className="break-inside-avoid">
          <h2 className="mb-1 break-after-avoid text-sm font-semibold">Totais</h2>
          <div className="overflow-x-auto" role="region" aria-label="Tabela dos totais da comparação" tabIndex={0}>
            <table className="w-full max-w-3xl">
              <tbody>
                {linhas.map(([k, v]) => (
                  <tr key={k}>
                    <th scope="row" className={TH}>{k}</th>
                    <td className={`${TD} tabular-nums`}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {avisos.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[12px]">
              {avisos.map((x) => (
                <li key={x.chave}>{x.texto}</li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="Comparação por insumo">
          <h2 className="mb-1 break-after-avoid text-sm font-semibold">Por insumo ({c.itens.length})</h2>
          <div className="overflow-x-auto" role="region" aria-label="Tabela da comparação por insumo" tabIndex={0}>
            <table className="w-full">
              <thead>
                <tr>
                  <th scope="col" className={TH}>Insumo</th>
                  <th scope="col" className={`${TH} text-right`}>Quantidade A → B</th>
                  <th scope="col" className={`${TH} text-right`}>Custo médio A → B</th>
                  <th scope="col" className={`${TH} text-right`}>Gasto A → B</th>
                  <th scope="col" className={`${TH} text-right`}>Variação</th>
                  <th scope="col" className={`${TH} text-right`}>Volume</th>
                  <th scope="col" className={`${TH} text-right`}>Preço</th>
                  <th scope="col" className={`${TH} text-right`}>Troca de fornecedor</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {c.itens.map((i) => (
                  <tr key={i.chave} className="break-inside-avoid">
                    <td className={TD}>
                      {i.insumo} ({SIGLA(i.unidade)}){i.situacao === 'so-b' ? ' · só em B (entrou)' : i.situacao === 'so-a' ? ' · só em A (saiu)' : ''}
                    </td>
                    <td className={`${TD} text-right`}>{lado(i.a, i.unidade, 'q')} → {lado(i.b, i.unidade, 'q')}</td>
                    <td className={`${TD} text-right`}>{lado(i.a, i.unidade, 'c')} → {lado(i.b, i.unidade, 'c')}{i.variacaoDoCustoDecimos !== null ? ` (${formatarPercentual(i.variacaoDoCustoDecimos)})` : ''}</td>
                    <td className={`${TD} text-right`}>{lado(i.a, i.unidade, 'g')} → {lado(i.b, i.unidade, 'g')}</td>
                    <td className={`${TD} text-right font-semibold`}>{txtSinal(i.variacaoCentavos)}</td>
                    <td className={`${TD} text-right`}>{i.volumeCentavos === null ? '—' : txtSinal(i.volumeCentavos)}</td>
                    <td className={`${TD} text-right`}>{i.precoCentavos === null ? '—' : txtSinal(i.precoCentavos)}</td>
                    <td className={`${TD} text-right`}>{i.trocaCentavos === null ? '—' : txtSinal(i.trocaCentavos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {r.umInsumo && c.itens.map((i) => (
          <section key={i.chave} aria-label={`Fornecedores de ${i.insumo} em ${SIGLA(i.unidade)}`}>
            <h2 className="mb-1 break-after-avoid text-sm font-semibold">Fornecedores de {i.insumo} em {SIGLA(i.unidade)}</h2>
            <div className="overflow-x-auto" role="region" aria-label={`Tabela dos fornecedores de ${i.insumo} em ${SIGLA(i.unidade)}`} tabIndex={0}>
              <table className="w-full">
                <thead>
                  <tr>
                    <th scope="col" className={TH}>Fornecedor</th>
                    <th scope="col" className={`${TH} text-right`}>Quantidade A → B</th>
                    <th scope="col" className={`${TH} text-right`}>Custo médio A → B</th>
                    <th scope="col" className={`${TH} text-right`}>Gasto A → B</th>
                    <th scope="col" className={`${TH} text-right`}>Efeito preço dele</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {i.fornecedores.map((x) => (
                    <tr key={x.fornecedorId} className="break-inside-avoid">
                      <td className={TD}>{x.fornecedor}</td>
                      <td className={`${TD} text-right`}>{lado(x.a, i.unidade, 'q')} → {lado(x.b, i.unidade, 'q')}</td>
                      <td className={`${TD} text-right`}>{lado(x.a, i.unidade, 'c')} → {lado(x.b, i.unidade, 'c')}</td>
                      <td className={`${TD} text-right`}>{lado(x.a, i.unidade, 'g')} → {lado(x.b, i.unidade, 'g')}</td>
                      <td className={`${TD} text-right`}>{x.efeitoPrecoCentavos === null ? '—' : txtSinal(x.efeitoPrecoCentavos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </article>
    </div>
  );
}
