// Scanner avoid-ai-design, SD4d (P2) aceito: "Zebra (Browser Print) · 203 dpi · 23/10/2026 às 14:05" é a linha de apoio da lista densa, no padrão "A · B" das telas da 1.1–3.3.
/**
 * O histórico de impressões de uma loja (3.4): cada pedido (primeira impressão ou reimpressão) com as cópias, o caminho (Zebra,
 * arquivo, papel), o resultado sem fingir, quem pediu e quem fez ou abriu. Os totais separam PEDIDOS de ETIQUETAS (a soma das
 * cópias) e o que a Zebra recebeu do que só virou arquivo. Período e origem na URL. Tabela a partir de 1280 px; cartões abaixo.
 * Nenhum valor em R$.
 */

import Link from 'next/link';
import { PEDIDOS_POR_PAGINA, type HistoricoDeImpressoes } from '@/lib/erp/etiquetas';
import { FORMATOS, NOME_DO_PEDIDO, quandoNaTela, ROTULO_DO_TRANSPORTE, seloDoPedido } from '@/lib/erp/etiqueta-campos';
import { ATALHOS_DO_PERIODO } from '@/lib/erp/producao-equipe-campos';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '../../ui/cabecalho';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { FiltroEmLinks } from '../../ui/filtros';
import { PaginacaoNumerada } from '../../ui/paginacao-numerada';
import { Metrica, Painel, Selo, Vazio } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';

type Linha = HistoricoDeImpressoes['linhas'][number];

const CAMPO_DO_FILTRO = 'ff-transicao block min-h-11 w-full rounded-[7px] border border-linha-forte bg-campo px-3 text-base text-texto sm:min-h-10 sm:text-sm';

function consulta(params: Record<string, string | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
}

const pedido = (l: Linha) => `${NOME_DO_PEDIDO[l.transporte]} · ${l.copias === 1 ? '1 cópia' : `${l.copias} cópias`}`;
const como = (l: Linha) => `${ROTULO_DO_TRANSPORTE[l.transporte]}${l.transporte !== 'PAPEL' ? ` · ${l.resolucao} dpi` : ''}`;
const origem = (l: Linha) => (l.etiqueta.origem === 'LOTE' ? `lote ${l.etiqueta.lote ?? '—'}` : `aberta · lote forn. ${l.etiqueta.lote ?? 'não informado'}`);

function Resultado({ l }: { l: Linha }) {
  const selo = seloDoPedido(l);
  return (
    <>
      <Selo tom={selo.tom}>{selo.texto}</Selo>
      {l.confirmadaEm && <span className="mt-1 block text-[12px] tabular-nums text-suave">{l.confirmadaPorNome}, {quandoNaTela(l.confirmadaEm)}</span>}
      {l.erro && <span className="mt-1 block max-w-[18rem] text-[12px] text-erro [overflow-wrap:anywhere]">{l.erro}</span>}
    </>
  );
}

export function TelaHistoricoDeImpressoes({ h, base, contexto }: { h: HistoricoDeImpressoes; base: string; contexto?: string }) {
  const aqui = `${base}/historico/${h.loja.id}`;
  const daLoja = `${base}/${h.loja.id}`;
  const periodoNaUrl = h.periodo.atalho ? { periodo: h.periodo.atalho } : { de: h.periodo.de, ate: h.periodo.ate };
  const href = (p: number) => `${aqui}${consulta({ ...periodoNaUrl, origem: h.origem, pagina: p > 1 ? String(p) : null })}`;
  const t = h.totais;
  const de = h.total === 0 ? 0 : (h.pagina - 1) * PEDIDOS_POR_PAGINA + 1;
  const ate = Math.min(h.total, h.pagina * PEDIDOS_POR_PAGINA);
  const filtrado = !!h.origem || h.periodo.atalho !== '7';
  return (
    <div className="space-y-5">
      <TrilhaDaPagina itens={[{ rotulo: h.loja.nome }]} />
      <PageHeader icone="historico" cor={COR.etiquetas} titulo="Histórico de impressões" subtitulo={[contexto, h.loja.nome, h.rotuloDoPeriodo].filter(Boolean).join(' · ')}>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <FiltroEmLinks rotulo="Período" opcoes={ATALHOS_DO_PERIODO.map((a) => ({ href: `${aqui}${consulta({ periodo: a.chave, origem: h.origem })}`, rotulo: a.rotulo, ativo: h.periodo.atalho === a.chave }))} />
            <FiltroEmLinks
              rotulo="Origem da etiqueta"
              opcoes={[
                { href: `${aqui}${consulta({ ...periodoNaUrl })}`, rotulo: 'Tudo', ativo: !h.origem },
                { href: `${aqui}${consulta({ ...periodoNaUrl, origem: 'lote' })}`, rotulo: 'Lotes produzidos', ativo: h.origem === 'lote' },
                { href: `${aqui}${consulta({ ...periodoNaUrl, origem: 'aberta' })}`, rotulo: 'Embalagens abertas', ativo: h.origem === 'aberta' },
              ]}
            />
          </div>
          <form method="get" action={aqui} className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[repeat(2,minmax(0,12rem))_auto]">
            {h.origem && <input type="hidden" name="origem" value={h.origem} />}
            <div className="min-w-0">
              <label htmlFor="impressoes-de" className="mb-1 block text-[12px] font-medium text-suave">
                De
              </label>
              <input id="impressoes-de" type="date" name="de" defaultValue={h.periodo.de} className={CAMPO_DO_FILTRO} />
            </div>
            <div className="min-w-0">
              <label htmlFor="impressoes-ate" className="mb-1 block text-[12px] font-medium text-suave">
                Até
              </label>
              <input id="impressoes-ate" type="date" name="ate" defaultValue={h.periodo.ate} className={CAMPO_DO_FILTRO} />
            </div>
            <div className="col-span-2 flex items-center gap-3 sm:col-span-1">
              <button type="submit" className={classeDeBotao('secundario', 'min-h-11 sm:min-h-10')}>
                Filtrar
              </button>
              {filtrado && (
                <Link href={aqui} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center`}>
                  Limpar
                </Link>
              )}
            </div>
          </form>
          {h.periodo.aviso && <p className="text-[13px] text-atencao">{h.periodo.aviso.replace('produção', 'impressão')}</p>}
        </div>
      </PageHeader>

      <section aria-label="Totais do período" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metrica rotulo="Pedidos" valor={t.pedidos} detalhe="Zebra, arquivo e papel" />
        <Metrica rotulo="Etiquetas" valor={t.etiquetas} detalhe="a soma das cópias" />
        <Metrica rotulo="Enviadas à Zebra" valor={t.enviadas} detalhe="etiquetas recebidas" />
        <Metrica rotulo="Já imprimi" valor={t.confirmadas} detalhe="etiquetas que alguém disse que saíram" />
        <Metrica rotulo="Falharam" valor={t.falharam} detalhe={t.falharam === 1 ? 'pedido' : 'pedidos'} />
        <Metrica rotulo="Sem resultado" valor={t.semResultado} detalhe="a Zebra não respondeu ou a tela fechou" />
      </section>

      <Painel titulo="Pedidos de impressão" subtitulo={h.origem ? (h.origem === 'lote' ? 'Só de lotes produzidos' : 'Só de embalagens abertas') : 'Lotes produzidos e embalagens abertas'} semRespiro>
        {h.linhas.length === 0 ? (
          <Vazio titulo="Nenhuma impressão neste período.">{filtrado ? 'Tire o filtro ou escolha outro período.' : 'As impressões aparecem aqui a partir do primeiro pedido.'}</Vazio>
        ) : (
          <>
            <ul className="divide-y divide-linha xl:hidden">
              {h.linhas.map((l) => (
                <li key={l.id} className="space-y-2 px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                    <Link href={`${daLoja}/${l.etiqueta.id}`} className="ff-transicao -my-1 min-h-11 min-w-0 rounded-[7px] py-1 hover:bg-texto/[0.03]">
                      <span className="block text-[15px] font-semibold text-texto [overflow-wrap:anywhere]">{l.etiqueta.nome}</span>
                      <span className="block text-[12px] tabular-nums text-suave">
                        {l.etiqueta.codigo} · {FORMATOS[l.etiqueta.formato]?.rotulo ?? ''} · {origem(l)}
                      </span>
                    </Link>
                    <div className="shrink-0">
                      <Resultado l={l} />
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] tabular-nums sm:grid-cols-4">
                    <div>
                      <dt className="text-suave">Pedido</dt>
                      <dd>{pedido(l)}</dd>
                    </div>
                    <div>
                      <dt className="text-suave">Como</dt>
                      <dd>{como(l)}</dd>
                    </div>
                    <div>
                      <dt className="text-suave">Quando e quem pediu</dt>
                      <dd>
                        {quandoNaTela(l.solicitadaEm)} · {l.solicitadaPorNome}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-suave">{l.etiqueta.origem === 'LOTE' ? 'Quem fez' : 'Quem abriu'}</dt>
                      <dd>{l.etiqueta.quemFez ?? 'não registrado'}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
            <table className="hidden w-full text-sm xl:table">
              <caption className="sr-only">Pedidos de impressão no período: a etiqueta, o pedido, como, o resultado, quem pediu e quem fez ou abriu.</caption>
              <thead>
                <tr className="bg-forte text-left text-[12px] text-suave">
                  <th scope="col" className="h-10 pl-5 pr-3 font-semibold">
                    Quando
                  </th>
                  <th scope="col" className="h-10 px-3 font-semibold">
                    Etiqueta
                  </th>
                  <th scope="col" className="h-10 px-3 font-semibold">
                    Pedido
                  </th>
                  <th scope="col" className="h-10 px-3 font-semibold">
                    Como
                  </th>
                  <th scope="col" className="h-10 px-3 font-semibold">
                    Resultado
                  </th>
                  <th scope="col" className="h-10 px-3 pr-5 font-semibold">
                    Quem pediu · fez
                  </th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {h.linhas.map((l) => (
                  <tr key={l.id} className="border-t border-linha align-top">
                    <td className="whitespace-nowrap py-2.5 pl-5 pr-3">{quandoNaTela(l.solicitadaEm)}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`${daLoja}/${l.etiqueta.id}`} className={`${LINK_DE_TEXTO} text-sm font-semibold`}>
                        {l.etiqueta.nome}
                      </Link>
                      <span className="block text-[12px] text-suave">
                        {l.etiqueta.codigo} · {origem(l)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">{pedido(l)}</td>
                    <td className="px-3 py-2.5">{como(l)}</td>
                    <td className="px-3 py-2.5">
                      <Resultado l={l} />
                    </td>
                    <td className="px-3 py-2.5 pr-5">
                      {l.solicitadaPorNome}
                      <span className="block text-[12px] text-suave">
                        {l.etiqueta.origem === 'LOTE' ? 'fez' : 'abriu'}: {l.etiqueta.quemFez ?? 'não registrado'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <PaginacaoNumerada de={de} ate={ate} total={h.total} pagina={h.pagina} paginas={h.paginas} singular="pedido" plural="pedidos" href={href} />
          </>
        )}
      </Painel>
      <p className="text-[12px] text-suave">“Enviada à Zebra” é que o Browser Print recebeu, não que saiu no papel. “Sem resultado” é o pedido que a tela não chegou a confirmar (fechou ou caiu a conexão): pode ou não ter saído.</p>
    </div>
  );
}
