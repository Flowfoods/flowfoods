'use client';

import { Fragment, useRef, useState } from 'react';
import type { DiaDeCoberturaAnalytics, EstadoCoberturaAnalytics, IndicadoresAnalytics, PainelAnalytics } from '@/lib/integracoes/ifood/painel-campos';
import { classeDeBotao } from '@/components/erp/ui/estilos';
import { Selo, type Tom } from '@/components/erp/ui/superficies';
import { diaAnalytics, dinheiroAnalytics, instanteAnalytics, percentualAnalytics, quantidadeAnalytics, ticketAnalytics } from './formato-analytics';
import { MedidaDoPainel } from './painel-medidas';

const COBERTURA: Record<EstadoCoberturaAnalytics, { texto: string; tom: Tom }> = {
  publicado: { texto: 'Leitura publicada', tom: 'ok' },
  'vazio-oficial': { texto: 'Vazio oficial publicado', tom: 'ok' },
  ausente: { texto: 'Sem leitura publicada', tom: 'neutro' },
  'vinculo-ambiguo': { texto: 'Vínculo a conferir', tom: 'alerta' },
  'identidade-incompativel': { texto: 'Identidade da leitura a conferir', tom: 'alerta' },
  'versao-pendente': { texto: 'Revisão ainda não publicada', tom: 'alerta' },
};

function DetalhesDoDia({ cobertura, fontes, indicadores }: { cobertura?: DiaDeCoberturaAnalytics; fontes: PainelAnalytics['fontes']; indicadores: IndicadoresAnalytics }) {
  return <details className="min-w-0">
    <summary className="min-h-11 cursor-pointer py-3 text-[13px] font-medium text-texto">Detalhes dos indicadores e da cobertura</summary>
    <div className="space-y-4 pb-4 pt-3">
      <dl className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="min-w-0"><dt className="mb-1 text-[12px] text-suave">GMV sem entrega · todos os status</dt><dd><MedidaDoPainel medida={indicadores.gmvSemEntrega} formatar={dinheiroAnalytics} /></dd></div>
        <div className="min-w-0"><dt className="mb-1 text-[12px] text-suave">GMV concluído</dt><dd><MedidaDoPainel medida={indicadores.gmvConcluido} formatar={dinheiroAnalytics} /></dd></div>
        <div className="min-w-0"><dt className="mb-1 text-[12px] text-suave">GMV cancelado</dt><dd><MedidaDoPainel medida={indicadores.gmvCancelado} formatar={dinheiroAnalytics} /></dd></div>
        <div className="min-w-0"><dt className="mb-1 text-[12px] text-suave">Pedidos observados · todos os status</dt><dd><MedidaDoPainel medida={indicadores.pedidos} formatar={quantidadeAnalytics} /></dd></div>
        <div className="min-w-0"><dt className="mb-1 text-[12px] text-suave">Taxa de cancelamento</dt><dd><MedidaDoPainel medida={indicadores.taxaCancelamento} formatar={percentualAnalytics} /></dd></div>
      </dl>
      {cobertura?.fontes.length ? <ul className="space-y-3 border-t border-linha pt-3">
        {cobertura.fontes.map(f => {
          const fonte = fontes.find(s => s.chave === f.chave), estado = COBERTURA[f.estado];
          return <li key={f.chave} className="min-w-0 space-y-1.5 text-[12px] text-suave">
            <p className="break-words font-medium text-texto">{fonte?.nome ?? 'Fonte da loja'}{fonte?.marca ? ` · ${fonte.marca}` : ''}{fonte && !fonte.ativa ? ' · vínculo desligado' : ''}</p>
            <Selo tom={estado.tom}><span className="whitespace-normal">{estado.texto}</span></Selo>
            {f.publicadaEm && <p>Versão publicada em <time dateTime={f.publicadaEm}>{instanteAnalytics(f.publicadaEm)}</time>.</p>}
            {f.revisaoPendente && <p>Há uma revisão pendente. Ela ainda não substitui a versão publicada.</p>}
          </li>;
        })}
      </ul> : <p className="text-[12px] text-suave">Nenhuma fonte disponível para conferir este dia.</p>}
    </div>
  </details>;
}

/** Paginação apenas da apresentação. Totais/recorte e todos os dias vêm intactos do leitor. */
export function SerieDoPainelAnalytics({ serie, cobertura, fontes }: Pick<PainelAnalytics, 'serie' | 'cobertura' | 'fontes'>) {
  const [pagina, setPagina] = useState(1);
  const titulo = useRef<HTMLHeadingElement>(null);
  const paginas = Math.max(1, Math.ceil(serie.length / 31));
  const atual = Math.min(pagina, paginas), linhas = serie.slice((atual - 1) * 31, atual * 31);
  const mudarPagina = (proxima: number) => { setPagina(proxima); requestAnimationFrame(() => titulo.current?.focus()); };
  const coberturaDoDia = new Map(cobertura.dias.map(d => [d.dia, d]));
  const selo = (completo: boolean) => <Selo tom={completo ? 'ok' : 'alerta'}>{completo ? 'Dia completo' : 'Dia sem cobertura completa'}</Selo>;
  return <div className="min-w-0 space-y-4">
    <h3 ref={titulo} tabIndex={-1} className="rounded text-[13px] font-medium text-texto">{linhas.length ? `${diaAnalytics(linhas[0].dia)} a ${diaAnalytics(linhas[linhas.length - 1].dia)}` : 'Nenhum dia para apresentar'} · página {atual} de {paginas}</h3>
    <p className="text-[12px] leading-relaxed text-suave">Cada linha representa o mesmo conjunto de fontes. Dias incompletos permanecem sem dado; os dias completos não formam um total parcial do período.</p>
    <table className="hidden w-full table-fixed text-left xl:table">
      <caption className="sr-only">Indicadores diários do Analytics com cobertura e detalhes de cada fonte</caption>
      <thead className="border-b border-linha text-[12px] text-suave"><tr>
        <th scope="col" className="w-[22%] py-3 pr-3 font-medium">Dia e cobertura</th>
        <th scope="col" className="px-2 py-3 font-medium">GMV · todos os status</th>
        <th scope="col" className="px-2 py-3 font-medium">Pedidos concluídos</th>
        <th scope="col" className="px-2 py-3 font-medium">Pedidos cancelados</th>
        <th scope="col" className="py-3 pl-2 font-medium">Ticket dos concluídos</th>
      </tr></thead>
      <tbody>{linhas.map(d => <Fragment key={d.dia}>
        <tr className="align-top">
          <th scope="row" className="space-y-2 pb-1 pr-3 pt-4 font-normal"><span className="block text-sm font-medium text-texto">{diaAnalytics(d.dia)}</span><span className="block">{selo(d.completo)}</span></th>
          <td className="px-2 pt-4"><MedidaDoPainel medida={d.indicadores.gmv} formatar={dinheiroAnalytics} /></td>
          <td className="px-2 pt-4"><MedidaDoPainel medida={d.indicadores.concluidos} formatar={quantidadeAnalytics} /></td>
          <td className="px-2 pt-4"><MedidaDoPainel medida={d.indicadores.cancelados} formatar={quantidadeAnalytics} /></td>
          <td className="pl-2 pt-4"><MedidaDoPainel medida={d.indicadores.ticketConcluidos} formatar={ticketAnalytics} /></td>
        </tr>
        <tr className="border-b border-linha"><td colSpan={5}><DetalhesDoDia cobertura={coberturaDoDia.get(d.dia)} fontes={fontes} indicadores={d.indicadores} /></td></tr>
      </Fragment>)}</tbody>
    </table>
    <ul className="divide-y divide-linha xl:hidden">{linhas.map(d => <li key={d.dia} className="min-w-0 py-4 first:pt-0">
      <div className="mb-4 flex flex-wrap items-center gap-2"><h4 className="text-sm font-semibold text-texto">{diaAnalytics(d.dia)}</h4>{selo(d.completo)}</div>
      <dl className="grid min-w-0 grid-cols-2 gap-4">
        <div className="min-w-0"><dt className="mb-1 text-[12px] text-suave">GMV · todos os status</dt><dd><MedidaDoPainel medida={d.indicadores.gmv} formatar={dinheiroAnalytics} /></dd></div>
        <div className="min-w-0"><dt className="mb-1 text-[12px] text-suave">Ticket dos concluídos</dt><dd><MedidaDoPainel medida={d.indicadores.ticketConcluidos} formatar={ticketAnalytics} /></dd></div>
        <div className="min-w-0"><dt className="mb-1 text-[12px] text-suave">Pedidos concluídos</dt><dd><MedidaDoPainel medida={d.indicadores.concluidos} formatar={quantidadeAnalytics} /></dd></div>
        <div className="min-w-0"><dt className="mb-1 text-[12px] text-suave">Pedidos cancelados</dt><dd><MedidaDoPainel medida={d.indicadores.cancelados} formatar={quantidadeAnalytics} /></dd></div>
      </dl>
      <DetalhesDoDia cobertura={coberturaDoDia.get(d.dia)} fontes={fontes} indicadores={d.indicadores} />
    </li>)}</ul>
    {paginas > 1 && <nav aria-label="Páginas da série diária" className="flex flex-wrap items-center justify-between gap-3">
      <button type="button" disabled={atual === 1} onClick={() => mudarPagina(atual - 1)} className={classeDeBotao('secundario')}>Dias anteriores</button>
      <p className="text-[12px] text-suave">{serie.length} dias no período · até 31 por página</p>
      <button type="button" disabled={atual === paginas} onClick={() => mudarPagina(atual + 1)} className={classeDeBotao('secundario')}>Próximos dias</button>
    </nav>}
  </div>;
}
