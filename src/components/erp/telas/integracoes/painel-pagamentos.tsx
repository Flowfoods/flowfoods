'use client';

import { useRef, useState } from 'react';
import type { EstadoCoberturaAnalytics, FonteDoPainelAnalytics } from '@/lib/integracoes/ifood/painel-campos';
import type { PagamentosDoPainelAnalytics } from '@/lib/integracoes/ifood/painel-pagamentos';
import { classeDeBotao } from '@/components/erp/ui/estilos';
import { Painel, Selo, type Tom } from '@/components/erp/ui/superficies';
import { diaAnalytics, instanteAnalytics, percentualAnalytics, quantidadeAnalytics } from './formato-analytics';
import { AUSENCIA_ANALYTICS, MedidaDoPainel } from './painel-medidas';

const ESTADOS: Record<EstadoCoberturaAnalytics, { texto: string; tom: Tom }> = {
  publicado: { texto: 'Leitura publicada', tom: 'ok' },
  'vazio-oficial': { texto: 'Vazio oficial publicado', tom: 'ok' },
  ausente: { texto: 'Sem leitura publicada', tom: 'neutro' },
  'vinculo-ambiguo': { texto: 'Vínculo a conferir', tom: 'alerta' },
  'identidade-incompativel': { texto: 'Identidade da leitura a conferir', tom: 'alerta' },
  'versao-pendente': { texto: 'Revisão ainda não publicada', tom: 'alerta' },
};

/** Contagens e denominador pertencem à marginal de pagamentos, nunca aos pedidos diários. */
export function PagamentosDoPainel({ dados, fontes }: { dados: PagamentosDoPainelAnalytics; fontes: FonteDoPainelAnalytics[] }) {
  const { cobertura, distribuicao, total } = dados;
  const [pagina, setPagina] = useState(1);
  const titulo = useRef<HTMLHeadingElement>(null);
  const paginas = Math.max(1, Math.ceil(cobertura.dias.length / 31)), atual = Math.min(pagina, paginas);
  const dias = cobertura.dias.slice((atual - 1) * 31, atual * 31);
  const porChave = new Map(fontes.map(f => [f.chave, f]));
  const denominador = total.estado === 'disponivel' && BigInt(total.valor) > 0n ? total.valor : null;
  const mudarPagina = (proxima: number) => { setPagina(proxima); requestAnimationFrame(() => titulo.current?.focus()); };
  return <section aria-label="Formas de pagamento" className="min-w-0">
    <Painel titulo="Formas de pagamento" subtitulo="Ocorrências de métodos informadas pelo provedor, no mesmo período e nas mesmas fontes selecionadas.">
      <div className="min-w-0 space-y-4">
        <p className="text-[12px] leading-relaxed text-suave">Um pedido pode ter mais de uma forma de pagamento. Estas ocorrências não são pedidos únicos nem valores pagos.</p>
        <div className="space-y-2">
          <Selo tom={cobertura.completa ? 'ok' : 'alerta'}>{cobertura.completa ? 'Cobertura de pagamentos completa' : 'Cobertura de pagamentos incompleta'}</Selo>
          <p className="text-[13px] text-texto">{cobertura.diasCompletos} de {cobertura.diasEsperados} dias completos · {cobertura.paresCobertos} de {cobertura.paresEsperados} leituras por fonte e dia.</p>
          <p className="text-[12px] leading-relaxed text-suave">{cobertura.completa ? 'A cobertura dos pagamentos é conferida separadamente da leitura diária. Valores não informados continuam sem dado.' : 'Falta leitura utilizável de pagamentos. A distribuição e o total do período ficam sem dado, mesmo que os indicadores diários estejam completos.'}</p>
        </div>
        <dl><dt className="mb-1 text-[13px] font-medium text-texto">Total de ocorrências de pagamento</dt><dd><MedidaDoPainel medida={total} formatar={quantidadeAnalytics} destaque /></dd></dl>
        {distribuicao.estado === 'sem-dado'
          ? <p className="text-[13px] leading-relaxed text-suave"><span className="font-medium">Distribuição sem dado.</span> {AUSENCIA_ANALYTICS[distribuicao.motivo]}</p>
          : distribuicao.valor.length === 0
            ? <p className="text-[13px] leading-relaxed text-suave">Nenhuma ocorrência de pagamento informada no conjunto publicado. Isso não significa que não houve pedidos.</p>
            : <div className="max-h-96 overflow-auto rounded" tabIndex={0} role="region" aria-label="Tabela de ocorrências por forma de pagamento">
              <table className="w-full table-fixed text-left">
                <caption className="sr-only">Formas de pagamento, ocorrências e participação no total de ocorrências de pagamento</caption>
                <thead className="border-b border-linha text-[12px] text-suave"><tr>
                  <th scope="col" className="w-[43%] pb-2 pr-3 font-medium">Método</th>
                  <th scope="col" className="w-[30%] break-words pb-2 pr-3 text-right font-medium">Ocorrências</th>
                  <th scope="col" className="break-words pb-2 text-right font-medium">Participação</th>
                </tr></thead>
                <tbody className="divide-y divide-linha">{distribuicao.valor.map(p => <tr key={p.metodo} className="align-top text-[13px]">
                  <th scope="row" className="break-words py-3 pr-3 font-normal text-texto [overflow-wrap:anywhere]">{p.metodo}</th>
                  <td className="py-3 pr-3 text-right tabular-nums text-texto [overflow-wrap:anywhere]">{quantidadeAnalytics(p.ocorrencias)}</td>
                  <td className="py-3 text-right tabular-nums text-texto [overflow-wrap:anywhere]">{denominador ? percentualAnalytics({ numerador: p.ocorrencias, denominador }) : 'Sem base'}</td>
                </tr>)}</tbody>
              </table>
            </div>}
        {distribuicao.estado === 'disponivel' && distribuicao.valor.length > 0 && <p className="text-[12px] leading-relaxed text-suave">Participação calculada sobre o total de ocorrências de pagamento, com uma casa decimal. Os nomes dos métodos são os informados pelo provedor.</p>}
        <details className="min-w-0 border-t border-linha">
          <summary className="min-h-11 cursor-pointer py-3 text-[13px] font-medium text-texto">Conferir cobertura dos pagamentos por dia e fonte</summary>
          <div className="min-w-0 space-y-4 pb-4 pt-3">
            <h3 ref={titulo} tabIndex={-1} className="rounded text-[13px] font-medium text-texto">{dias.length ? `${diaAnalytics(dias[0].dia)} a ${diaAnalytics(dias[dias.length - 1].dia)}` : 'Nenhum dia para apresentar'} · página {atual} de {paginas}</h3>
            <ul className="divide-y divide-linha">{dias.map(d => <li key={d.dia} className="min-w-0 space-y-3 py-4 first:pt-0">
              <div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-semibold text-texto">{diaAnalytics(d.dia)}</h4><Selo tom={d.completo ? 'ok' : 'alerta'}>{d.completo ? 'Dia completo' : 'Dia sem cobertura completa'}</Selo></div>
              {d.fontes.length ? <ul className="space-y-3">{d.fontes.map(f => {
                const fonte = porChave.get(f.chave), estado = ESTADOS[f.estado];
                return <li key={f.chave} className="min-w-0 space-y-1.5 text-[12px] text-suave">
                  <p className="break-words font-medium text-texto [overflow-wrap:anywhere]">{fonte?.nome ?? 'Fonte da loja'}{fonte?.marca ? ` · ${fonte.marca}` : ''}{fonte && !fonte.ativa ? ' · vínculo desligado' : ''}</p>
                  <Selo tom={estado.tom}><span className="whitespace-normal">{estado.texto}</span></Selo>
                  {f.publicadaEm && <p>Versão publicada em <time dateTime={f.publicadaEm}>{instanteAnalytics(f.publicadaEm)}</time>.</p>}
                  {f.revisaoPendente && <p>Há uma revisão pendente. Ela ainda não substitui a versão publicada.</p>}
                </li>;
              })}</ul> : <p className="text-[12px] text-suave">Nenhuma fonte disponível para conferir este dia.</p>}
            </li>)}</ul>
            {paginas > 1 && <nav aria-label="Páginas da cobertura de pagamentos" className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" disabled={atual === 1} onClick={() => mudarPagina(atual - 1)} className={classeDeBotao('secundario')}>Dias anteriores</button>
              <p className="text-[12px] text-suave">{cobertura.dias.length} dias no período · até 31 por página</p>
              <button type="button" disabled={atual === paginas} onClick={() => mudarPagina(atual + 1)} className={classeDeBotao('secundario')}>Próximos dias</button>
            </nav>}
          </div>
        </details>
      </div>
    </Painel>
  </section>;
}
