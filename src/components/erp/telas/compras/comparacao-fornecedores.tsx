/**
 * Comparação de fornecedores (L.3) — a tela e a versão para imprimir. A MESMA nas duas árvores (`/erp` e `/rodolfo/erp/<slug>`).
 *
 * Ordem de leitura: título e o que está valendo, filtros, o insumo (com a marca de referência como informação), uma tabela por
 * unidade (cartões no celular e no tablet) com o preço do item e o custo entregue lado a lado, as notas para ler os números e a
 * barra da planilha/impressão. Nada é lançado nem mudado aqui, e a tela nunca fala em "economia": diz a diferença por unidade.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ComparacaoDeFornecedoresDaTela } from '@/lib/erp/compras-comparacao';
import { FRASE_DO_MOTIVO, BASES_DE_DATA, fraseDoPeriodo, queryDoRelatorio, type FiltrosDoRelatorio } from '@/lib/erp/compras-relatorio-campos';
import { MEDIDAS, formatarPercentual, type FornecedorRanqueado, type TabelaDeUnidade } from '@/lib/erp/compras-comparacao-campos';
import { formatarData } from '@/lib/erp/compra-campos';
import { COR } from '@/lib/erp/modulos';
import { formatarCusto, formatarDinheiro, formatarQuantidade, formatarReaisDaFracao, UNIDADES, type Fracao, type Unidade } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso, Painel, Selo, Vazio } from '../../ui/superficies';
import { BotaoImprimir } from './botao-imprimir';
import { ChipsDosFornecedores, FormularioDosFornecedores } from './comparacao-filtros';
import { hrefDoRelatorio, NotaDaVisao } from './relatorio-filtros';
import { Cartao, pl, GRANDE } from './relatorio-partes';

const SIGLA = (u: Unidade) => UNIDADES[u].sigla;
const porUnidade = (f: Fracao, u: Unidade) => `${formatarReaisDaFracao(f.num, f.den)}/${SIGLA(u)}`;

/** "+R$ 0,50/kg (+5,0%) sobre o mais barato": a diferença para o mais barato, sempre por unidade, com a conta que a gente faz. */
function frase(dif: FornecedorRanqueado['difItem'], u: Unidade): string {
  return dif ? `+${porUnidade(dif.porUnidade, u)} (${formatarPercentual(dif.decimos)}) sobre o mais barato` : '';
}

function Frete({ x }: { x: FornecedorRanqueado }) {
  const frete = x.comparavel.freteCentavos;
  if (!x.custoEntregue) return null;
  if (frete === 0) return <span>sem frete</span>;
  return (
    <span>
      frete {formatarDinheiro(frete)}
      {x.fretePesaDecimos !== null ? ` (${formatarPercentual(x.fretePesaDecimos).replace('+', '')} do preço do item)` : ''}
    </span>
  );
}

function Selos({ x }: { x: FornecedorRanqueado }) {
  if (!x.maisBaratoNoItem && !x.maisBaratoEntregue) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1.5">
      {x.maisBaratoNoItem && <Selo tom="ok">Mais barato no preço do item</Selo>}
      {x.maisBaratoEntregue && <Selo tom="ok">Mais barato entregue</Selo>}
    </span>
  );
}

function UltimaCompra({ x, comprasBase, volta }: { x: FornecedorRanqueado; comprasBase: string; volta: string }) {
  if (!x.ultima) return <span className="text-suave">—</span>;
  const u = x.unidade as Unidade;
  const preco = x.ultima.valorCentavos > 0 ? formatarCusto({ centavos: x.ultima.valorCentavos, milesimos: x.ultima.quantidadeMilesimos }, u) : null;
  return (
    <>
      {formatarData(x.ultima.data)}
      <span className="block text-[12px] text-suave">
        <Link href={`${comprasBase}/${x.ultima.notaId}?volta=${encodeURIComponent(volta)}`} className="ff-toque ff-transicao rounded-[5px] underline decoration-linha-forte underline-offset-4 hover:text-texto hover:decoration-texto">
          nota {x.ultima.rotuloDaNota}
        </Link>
        {preco ? ` · ${preco}` : ''}
      </span>
    </>
  );
}

function SemBase({ x }: { x: FornecedorRanqueado }) {
  return (
    <>
      <Selo tom="alerta">Sem base</Selo>
      <span className="mt-1 block text-[12px] text-suave">
        {pl(x.linhasSemBase || x.linhas, 'linha sem valor ou sem unidade', 'linhas sem valor ou sem unidade')}: fora da comparação, para não mostrar R$ 0,00 como se fosse preço.
      </span>
    </>
  );
}

function Amostra({ x }: { x: FornecedorRanqueado }) {
  if (!x.custoEntregue || x.notas !== 1) return null;
  return <span className="block text-[12px] text-atencao">Só 1 compra: pode não ser o preço de sempre deste fornecedor.</span>;
}

function TabelaDaUnidade({
  t,
  f,
  caminho,
  comprasBase,
  insumoId,
}: {
  t: TabelaDeUnidade;
  f: FiltrosDoRelatorio;
  caminho: string;
  comprasBase: string;
  insumoId: string;
}) {
  const u = t.unidade;
  const volta = hrefDoRelatorio(caminho, f);
  const linhas = (x: FornecedorRanqueado) =>
    hrefDoRelatorio(`${comprasBase}/relatorios/periodo`, { ...f, insumoId, q: '', agrupar: 'fornecedor', grupo: x.fornecedorId, unidade: u, ver: 'linhas', so: '', volta, pagina: 1 }, {}, { semPagina: true });
  const titulo = `Fornecedores em ${SIGLA(u)}`;
  const subtitulo =
    t.comBase >= 2
      ? `Custo entregue é o preço do item mais o frete que coube a ele, por ${SIGLA(u)}. Do custo entregue mais barato ao mais caro; o frete pode inverter a ordem do preço do item.`
      : t.comBase === 0
        ? `Nenhum fornecedor tem preço comparável em ${SIGLA(u)} neste período: as linhas abaixo estão sem base.`
        : `Só um fornecedor tem preço neste insumo e período: não há com quem comparar. Custo entregue é o preço do item mais o frete que coube a ele, por ${SIGLA(u)}.`;
  return (
    <Painel titulo={titulo} subtitulo={subtitulo} semRespiro>
      <ul className="divide-y divide-linha lg:hidden">
        {t.fornecedores.map((x) => (
          <li key={`${x.fornecedorId}|${x.unidade}`} className="space-y-2 px-4 py-3">
            <div>
              <p className="font-medium text-texto">{x.fornecedor}</p>
              <Selos x={x} />
            </div>
            {x.custoEntregue && x.precoDoItem ? (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm tabular-nums">
                <div>
                  <dt className="text-[12px] text-suave">Preço do item</dt>
                  <dd className="font-semibold">{formatarCusto(x.precoDoItem, u)}</dd>
                  {x.difItem && <dd className="text-[12px] text-suave">{frase(x.difItem, u)}</dd>}
                </div>
                <div>
                  <dt className="text-[12px] text-suave">Custo entregue</dt>
                  <dd className="font-semibold">{formatarCusto(x.custoEntregue, u)}</dd>
                  {x.difEntregue && <dd className="text-[12px] text-suave">{frase(x.difEntregue, u)}</dd>}
                </div>
              </dl>
            ) : (
              <SemBase x={x} />
            )}
            <p className="text-[12px] tabular-nums text-suave">
              {pl(x.notas, 'compra', 'compras')} · {formatarQuantidade(x.comparavel.quantidadeMilesimos, u)} · <Frete x={x} />
            </p>
            {x.embalagens.length > 0 && <p className="text-[12px] text-suave">Embalagens: {x.embalagens.join(' · ')}</p>}
            <Amostra x={x} />
            <p className="text-[12px] tabular-nums text-suave">
              Última compra: <UltimaCompra x={x} comprasBase={comprasBase} volta={volta} />
            </p>
            <Link href={linhas(x)} className={`${LINK_DE_TEXTO} -mx-1 inline-flex min-h-11 items-center px-1 [@media(pointer:coarse)]:!mt-4`}>
              {x.linhas === 1 ? 'Ver a linha' : `Ver as ${pl(x.linhas, 'linha', 'linhas')}`}
            </Link>
          </li>
        ))}
      </ul>
      <table className="hidden w-full text-sm lg:table">
        <caption className="sr-only">
          {titulo}: compras e quantidade, preço do item, custo entregue, a diferença para o mais barato em cada um, e a última compra. Cada fornecedor abre as linhas dele.
        </caption>
        <thead>
          <tr className="bg-forte text-left text-[12px] text-suave">
            <th scope="col" className="h-10 pl-5 pr-3 font-semibold">
              Fornecedor
            </th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">
              Compras e quantidade
            </th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">
              Preço do item
            </th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">
              Custo entregue
            </th>
            <th scope="col" className="h-10 pl-3 pr-5 font-semibold">
              Última compra
            </th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {t.fornecedores.map((x) => (
            <tr key={`${x.fornecedorId}|${x.unidade}`} className="ff-transicao border-t border-linha align-top hover:bg-texto/[0.03]">
              <td className="py-2.5 pl-5 pr-3">
                <Link href={linhas(x)} className="ff-transicao rounded-[5px] font-medium text-texto underline-offset-4 hover:underline">
                  {x.fornecedor}
                </Link>
                <Selos x={x} />
                {x.embalagens.length > 0 && <span className="mt-1 block text-[12px] text-suave">{x.embalagens.join(' · ')}</span>}
                <Amostra x={x} />
              </td>
              <td className="px-3 py-2.5 text-right">
                {pl(x.notas, 'compra', 'compras')}
                <span className="block text-[12px] text-suave">{formatarQuantidade(x.comparavel.quantidadeMilesimos, u)}</span>
                <span className="block text-[12px] text-suave">
                  <Frete x={x} />
                </span>
              </td>
              {x.precoDoItem && x.custoEntregue ? (
                <>
                  <td className="px-3 py-2.5 text-right">
                    <span className="font-semibold">{formatarCusto(x.precoDoItem, u)}</span>
                    {x.difItem && <span className="block text-[12px] text-suave">{frase(x.difItem, u)}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="font-semibold">{formatarCusto(x.custoEntregue, u)}</span>
                    {x.difEntregue && <span className="block text-[12px] text-suave">{frase(x.difEntregue, u)}</span>}
                  </td>
                </>
              ) : (
                <td colSpan={2} className="px-3 py-2.5 text-right">
                  <SemBase x={x} />
                </td>
              )}
              <td className="py-2.5 pl-3 pr-5">
                <UltimaCompra x={x} comprasBase={comprasBase} volta={volta} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Painel>
  );
}

export function NotasDosFornecedores({ f, r, comprasBase }: { f: FiltrosDoRelatorio; r: ComparacaoDeFornecedoresDaTela; comprasBase: string }) {
  const itens: ReactNode[] = [];
  itens.push(
    <li key="medidas">
      <strong className="font-semibold text-texto">Preço do item e custo entregue.</strong> {MEDIDAS.item.explica} {MEDIDAS.entregue.explica} O frete é o que a nota cobrou, dividido entre os itens pelo valor de cada um, como ficou gravado no lançamento.
    </li>,
  );
  itens.push(
    <li key="unidade">
      Embalagens diferentes (peça, caixa, quilo solto) entram na mesma conta pela unidade base do insumo: kg, litro ou unidade. A diferença para o mais barato é por unidade, nunca uma promessa de economia: ela só vale para o que você de fato compra de cada um.
    </li>,
  );
  itens.push(
    <li key="marca">
      A nota guarda a embalagem e o fornecedor, mas não a marca que veio. A marca de referência é só uma informação do cadastro e nenhuma marca é barrada: se dois fornecedores entregam marcas diferentes, a diferença de preço pode ser também de marca.
    </li>,
  );
  itens.push(
    <li key="data">
      <strong className="font-semibold text-texto">Data usada: {BASES_DE_DATA[f.base].rotulo}.</strong> {BASES_DE_DATA[f.base].explica}
    </li>,
  );
  if (r.semEmissao) {
    itens.push(
      <li key="emissao">
        {pl(r.semEmissao, 'nota lançada neste período não tem', 'notas lançadas neste período não têm')} data de emissão (foram digitadas à mão) e por isso não entram. Para vê-las, use a data da entrada.
      </li>,
    );
  }
  const sem = r.totais ? Object.entries(r.totais.semBase).filter(([, n]) => n) : [];
  if (sem.length) {
    itens.push(
      <li key="base">
        Sem base (não entra no preço, para não enganar): {sem.map(([k, n]) => `${pl(n ?? 0, 'linha', 'linhas')}: ${FRASE_DO_MOTIVO[k as keyof typeof FRASE_DO_MOTIVO]}`).join('; ')}.
      </li>,
    );
  }
  if (r.canceladas && r.canceladas.notas > 0) {
    itens.push(
      <li key="canceladas">
        {pl(r.canceladas.notas, 'nota cancelada', 'notas canceladas')} ({formatarDinheiro(r.canceladas.valorCentavos + r.canceladas.freteCentavos)}) neste recorte ficou de fora de tudo.
      </li>,
    );
  }
  if (r.aguardando > 0) {
    itens.push(
      <li key="aguardando">
        {pl(r.aguardando, 'nota fiscal recebida (XML) aguarda', 'notas fiscais recebidas (XML) aguardam')} conferência e não {r.aguardando === 1 ? 'conta' : 'contam'} como compra até serem conciliadas.{' '}
        <Link href={`${comprasBase}/recebidas`} className={`${LINK_DE_TEXTO} ff-toque`}>
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
  return (
    <Painel titulo="Para ler os números" semRespiro>
      <ul className="space-y-2 px-4 py-3 text-[13px] leading-relaxed text-suave sm:px-5">{itens}</ul>
    </Painel>
  );
}

export function BarraDeSaidaDaComparacao({ exportar, imprimir, query, tela }: { exportar: string; imprimir: string; query: string; tela: 'fornecedores' | 'periodos' }) {
  const q = (extra: Record<string, string>) => {
    const p = new URLSearchParams(query);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return p.toString();
  };
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Levar a comparação">
      <a href={`${exportar}?${q({ tela })}`} className={classeDeBotao('secundario')}>
        Planilha da comparação
      </a>
      <Link href={`${imprimir}?${q({ imprimir: '1' })}`} className={classeDeBotao('secundario')}>
        Imprimir ou salvar em PDF
      </Link>
    </div>
  );
}

export function TelaDosFornecedores({
  caminho,
  comprasBase,
  contexto,
  f,
  r,
  hoje,
  insumosBase,
  visaoDaLoja,
  alemDaLoja,
}: {
  caminho: string;
  comprasBase: string;
  contexto: string;
  f: FiltrosDoRelatorio;
  r: ComparacaoDeFornecedoresDaTela;
  hoje: string;
  insumosBase?: string;
  visaoDaLoja?: string | null;
  /** A loja escolhida no topo quando o endereço pediu a rede e ela foi deixada de lado (decisão 478). */
  alemDaLoja?: string | null;
}) {
  const insumo = r.insumo;
  // Só conta quem tem preço comparável; "0 fornecedores" soaria a erro quando a compra existe e ficou sem base.
  const fraseDeFornecedores = (n: number) => (n === 0 ? 'nenhum fornecedor com preço comparável' : pl(n, 'fornecedor', 'fornecedores'));
  const nFornecedores = new Set(r.tabelas.flatMap((t) => t.fornecedores.map((x) => x.fornecedorId))).size;
  const subtitulo = [contexto, insumo?.nome, insumo && nFornecedores ? pl(nFornecedores, 'fornecedor', 'fornecedores') : null, fraseDoPeriodo(f)].filter(Boolean).join(' · ');
  const historico = insumo ? hrefDoRelatorio(`${comprasBase}/relatorios/insumo`, { ...f, insumoId: insumo.id, q: '', agrupar: 'insumo', grupo: '', unidade: '', so: '', ver: 'resumo' }, {}, { semPagina: true }) : null;
  const vazioDoRecorte = r.motivoVazio
    ? r.motivoVazio === 'periodo'
      ? { titulo: 'O período não faz sentido.', texto: f.periodoInvalido ?? '' }
      : { titulo: 'Nenhuma dessas lojas está no seu acesso.', texto: 'O relatório só mostra as lojas que você pode ver. Escolha entre as que aparecem em “Lojas”, ou deixe sem marcar para ver todas as suas.' }
    : null;
  return (
    <div className="space-y-6">
      <PageHeader icone="comparar" cor={COR.compras} titulo="Comparar fornecedores" subtitulo={subtitulo}>
        <FormularioDosFornecedores caminho={caminho} f={f} opcoes={r.opcoes} hoje={hoje} aberto={!insumo} />
        <NotaDaVisao soALoja={visaoDaLoja} alemDaLoja={alemDaLoja ? { nome: alemDaLoja, href: hrefDoRelatorio(caminho, f, { rede: false }, { semPagina: true }) } : null} />
        <ChipsDosFornecedores caminho={caminho} f={f} opcoes={r.opcoes} insumoNome={insumo?.nome} />
      </PageHeader>

      {vazioDoRecorte && (
        <Painel semRespiro>
          <Vazio titulo={vazioDoRecorte.titulo} acao={<Link href={caminho} className={classeDeBotao('secundario')}>Limpar e recomeçar</Link>}>
            {vazioDoRecorte.texto}
          </Vazio>
        </Painel>
      )}

      {!vazioDoRecorte && !insumo && (
        <Painel semRespiro>
          <Vazio titulo="Escolha um insumo para comparar quem vende por menos.">
            {f.q && r.opcoes.listaDeInsumos.length === 0
              ? `Nenhum insumo com compra tem “${f.q}” no nome ou na marca. Tente outro pedaço do nome.`
              : r.opcoes.listaDeInsumos.length === 0
                ? 'Ainda não há compra lançada nas suas lojas. Quando houver, os insumos comprados aparecem aqui.'
                : 'Só se compara o mesmo insumo: procure pelo nome (sem precisar de acento) ou escolha na lista.'}
          </Vazio>
        </Painel>
      )}

      {insumo && (
        <>
          <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 xl:grid-cols-3">
            <Cartao rotulo="Insumo comparado" ver={historico ? { href: historico, texto: 'Ver o histórico de compras dele' } : undefined}>
              <p className={`${GRANDE} !text-[22px] !leading-tight`}>{insumo.nome}</p>
              <p className="mt-1.5 text-[12px] text-suave">Unidade base: {SIGLA(insumo.unidade)}</p>
              {insumosBase && (
                <Link href={`${insumosBase}/${insumo.id}`} className={`${LINK_DE_TEXTO} ff-toque`}>
                  Abrir o cadastro
                </Link>
              )}
            </Cartao>
            <Cartao rotulo="Marca de referência">
              {insumo.marcaReferencia ? <p className="text-sm font-semibold text-texto">{insumo.marcaReferencia}</p> : <p className="text-sm text-suave">Não informada no cadastro.</p>}
              <p className="mt-1.5 text-[12px] text-suave">Só informação: a comparação não barra outras marcas. A nota não guarda a marca que veio.</p>
            </Cartao>
            <Cartao rotulo="No recorte">
              <p className="text-sm font-semibold tabular-nums text-texto">
                {r.totais ? `${pl(r.totais.notas, 'compra', 'compras')} · ${fraseDeFornecedores(nFornecedores)}` : '—'}
              </p>
              <p className="mt-1.5 text-[12px] text-suave">{fraseDoPeriodo(f)}</p>
            </Cartao>
          </div>

          {r.tabelas.length === 0 && r.semUnidade.length === 0 ? (
            <Painel semRespiro>
              <Vazio titulo="Nenhuma compra deste insumo neste recorte." acao={f.lojaIds.length > 0 ? <Link href={hrefDoRelatorio(caminho, { ...f, lojaIds: [] })} className={classeDeBotao('secundario')}>Tirar o filtro de lojas</Link> : undefined}>
                Confira o período e a data usada ({BASES_DE_DATA[f.base].curto}).
              </Vazio>
            </Painel>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <p className="text-[13px] text-suave">Levar o que está na tela, com o mesmo período, a mesma data usada e os mesmos números:</p>
                <BarraDeSaidaDaComparacao exportar={`${comprasBase}/relatorios/comparar/exportar`} imprimir={caminho} query={queryDoRelatorio(f, {}, { semPagina: true })} tela="fornecedores" />
              </div>
              {r.tabelas.every((t) => t.comBase === 0) && (
                <Painel semRespiro>
                  <Vazio titulo="Nenhum fornecedor com preço comparável neste período.">
                    As compras deste insumo estão sem base (sem unidade gravada ou com valor zero): abaixo, quais são e por quê. Sem base não entra preço, para não mostrar R$ 0,00 como se fosse preço.
                  </Vazio>
                </Painel>
              )}
              {r.tabelas.map((t) => (
                <TabelaDaUnidade key={t.unidade} t={t} f={f} caminho={caminho} comprasBase={comprasBase} insumoId={insumo.id} />
              ))}
              {r.semUnidade.length > 0 && (
                <Aviso tom="alerta" titulo="Linhas sem unidade gravada ficam fora da comparação.">
                  {r.semUnidade.map((x) => `${x.fornecedor} (${pl(x.linhas, 'linha', 'linhas')})`).join(', ')}. Sem unidade não há como saber o preço por kg, litro ou unidade.
                </Aviso>
              )}
            </>
          )}
          <NotasDosFornecedores f={f} r={r} comprasBase={comprasBase} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- impressão

const TH = 'border-b border-linha-forte px-2 py-1.5 text-left text-[11px] font-semibold text-suave print:text-black';
const TD = 'border-b border-linha px-2 py-1.5 align-top text-[12px] print:text-black';

/** A versão para imprimir ou salvar em PDF: o que a tela diz, sem menu e sem botão, com as tabelas inteiras. */
export function ImpressaoDosFornecedores({ caminho, contexto, f, r, geradoEm }: { caminho: string; contexto: string; f: FiltrosDoRelatorio; r: ComparacaoDeFornecedoresDaTela; geradoEm: string }) {
  const voltar = hrefDoRelatorio(caminho, f);
  const insumo = r.insumo;
  return (
    <div className="ff-relatorio-impressao mx-auto max-w-[1100px] space-y-5">
      <style>{'@media print{@page{size:A4 landscape;margin:12mm}}'}</style>
      <div className="ff-nao-imprime flex flex-wrap items-center gap-2 rounded-[14px] border border-linha bg-painel p-4">
        <BotaoImprimir />
        <Link href={voltar} className={classeDeBotao('secundario')}>
          Voltar para a comparação
        </Link>
        <p className="w-full text-[13px] text-suave">Na janela de impressão, escolha “Salvar como PDF”. O arquivo sai sem menu e sem botões, com o mesmo período, a mesma data usada e os mesmos números da tela.</p>
      </div>
      <article className="space-y-5 rounded-[14px] border border-linha bg-painel p-5 print:border-0 print:bg-white print:p-0 print:text-black">
        <header className="space-y-1 border-b border-linha-forte pb-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-suave print:text-black">{contexto} · FlowFoods ERP</p>
          <h1 className="font-display text-2xl font-bold">Comparação de fornecedores</h1>
          <dl className="grid gap-x-6 gap-y-0.5 text-[12px] sm:grid-cols-[auto_1fr]">
            <dt className="text-suave print:text-black">Insumo</dt>
            <dd>{insumo ? `${insumo.nome} (unidade base ${SIGLA(insumo.unidade)})` : '—'}</dd>
            <dt className="text-suave print:text-black">Marca de referência</dt>
            <dd>{insumo?.marcaReferencia ?? 'não informada (a nota não guarda a marca comprada)'}</dd>
            <dt className="text-suave print:text-black">Período e data usada</dt>
            <dd>{fraseDoPeriodo(f)}</dd>
            <dt className="text-suave print:text-black">Como a data é lida</dt>
            <dd>{BASES_DE_DATA[f.base].explica}</dd>
            <dt className="text-suave print:text-black">Lojas</dt>
            <dd>{r.lojasUsadas.map((l) => l.nome).join(', ')}</dd>
            <dt className="text-suave print:text-black">Como ler</dt>
            <dd>
              {MEDIDAS.item.explica} {MEDIDAS.entregue.explica}
            </dd>
            <dt className="text-suave print:text-black">Gerado em</dt>
            <dd>{geradoEm}</dd>
          </dl>
        </header>
        {r.tabelas.map((t) => (
          <section key={t.unidade} aria-label={`Fornecedores em ${SIGLA(t.unidade)}`}>
            <h2 className="mb-1 break-after-avoid text-sm font-semibold">Fornecedores em {SIGLA(t.unidade)}</h2>
            <div className="overflow-x-auto" role="region" aria-label={`Tabela dos fornecedores em ${SIGLA(t.unidade)}`} tabIndex={0}>
              <table className="w-full">
                <thead>
                  <tr>
                    <th scope="col" className={TH}>Fornecedor · embalagens</th>
                    <th scope="col" className={`${TH} text-right`}>Compras</th>
                    <th scope="col" className={`${TH} text-right`}>Quantidade</th>
                    <th scope="col" className={`${TH} text-right`}>Preço do item</th>
                    <th scope="col" className={`${TH} text-right`}>Custo entregue</th>
                    <th scope="col" className={`${TH} text-right`}>Frete</th>
                    <th scope="col" className={TH}>Mais barato</th>
                    <th scope="col" className={TH}>Última compra</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {t.fornecedores.map((x) => (
                    <tr key={x.fornecedorId} className="break-inside-avoid">
                      <td className={TD}>
                        {x.fornecedor}
                        {x.embalagens.length ? ` · ${x.embalagens.join(' · ')}` : ''}
                      </td>
                      <td className={`${TD} text-right`}>{x.notas}</td>
                      <td className={`${TD} text-right`}>{formatarQuantidade(x.comparavel.quantidadeMilesimos, t.unidade)}</td>
                      <td className={`${TD} text-right`}>{x.precoDoItem ? `${formatarCusto(x.precoDoItem, t.unidade)}${x.difItem ? ` (${frase(x.difItem, t.unidade)})` : ''}` : 'sem base'}</td>
                      <td className={`${TD} text-right`}>{x.custoEntregue ? `${formatarCusto(x.custoEntregue, t.unidade)}${x.difEntregue ? ` (${frase(x.difEntregue, t.unidade)})` : ''}` : 'sem base'}</td>
                      <td className={`${TD} text-right`}>{formatarDinheiro(x.comparavel.freteCentavos)}</td>
                      <td className={TD}>{[x.maisBaratoNoItem ? 'no preço do item' : '', x.maisBaratoEntregue ? 'entregue' : ''].filter(Boolean).join(' e ') || '—'}</td>
                      <td className={TD}>{x.ultima ? `${formatarData(x.ultima.data)} · nota ${x.ultima.rotuloDaNota}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
        {r.semUnidade.length > 0 && <p className="text-[12px]">Linhas sem unidade gravada (fora da comparação): {r.semUnidade.map((x) => `${x.fornecedor} (${x.linhas})`).join(', ')}.</p>}
        {r.canceladas && r.canceladas.notas > 0 && (
          <p className="text-[12px]">
            Fora de tudo: {r.canceladas.notas} {r.canceladas.notas === 1 ? 'nota cancelada' : 'notas canceladas'} ({formatarDinheiro(r.canceladas.valorCentavos + r.canceladas.freteCentavos)}).
          </p>
        )}
        {r.semEmissao ? <p className="text-[12px]">{r.semEmissao} {r.semEmissao === 1 ? 'nota digitada à mão não tem' : 'notas digitadas à mão não têm'} data de emissão e ficou de fora.</p> : null}
      </article>
    </div>
  );
}
