'use client';

import { useRef, useState } from 'react';
import type { EstadoCoberturaAnalytics, FonteDoPainelAnalytics } from '@/lib/integracoes/ifood/painel-campos';
import { horaComplementarConhecida, type ComplementaresDoPainelAnalytics, type DistribuicaoComplementarDoPainel } from '@/lib/integracoes/ifood/painel-complementares';
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

function rotuloDoTermo(termo: string, horario: boolean): string {
  if (horario) {
    const hora = horaComplementarConhecida(termo);
    return hora === null ? `Horário não reconhecido: ${termo}` : `${String(hora).padStart(2, '0')}h`;
  }
  if (termo === 'true') return 'Primeiro pedido no estabelecimento de origem';
  if (termo === 'false') return 'Demais pedidos informados';
  return `Indicador não reconhecido: ${termo}`;
}

function DistribuicaoComplementar({ dados, horario }: { dados: DistribuicaoComplementarDoPainel; horario: boolean }) {
  const titulo = horario ? 'Horário informado pela origem' : 'Primeiro pedido por estabelecimento de origem';
  const { distribuicao, total } = dados;
  const denominador = total.estado === 'disponivel' && BigInt(total.valor) > 0n ? total.valor : null;
  return <section aria-label={titulo} className="min-w-0 space-y-4 rounded-[14px] border border-linha p-3 sm:p-4">
    <h3 className="text-sm font-semibold text-texto">{titulo}</h3>
    <p className="text-[12px] leading-relaxed text-suave">{horario
      ? 'As horas são as informadas pela origem; não há conversão de fuso neste painel. Horas não informadas permanecem ausentes.'
      : 'Cada estabelecimento de origem informa seu próprio indicador de primeiro pedido. Uma pessoa pode aparecer em mais de uma origem.'}</p>
    <dl><dt className="mb-1 text-[13px] font-medium text-texto">Total de ocorrências desta distribuição</dt><dd><MedidaDoPainel medida={total} formatar={quantidadeAnalytics} destaque /></dd></dl>
    {distribuicao.estado === 'sem-dado'
      ? <p className="text-[13px] leading-relaxed text-suave"><span className="font-medium">Distribuição sem dado.</span> {AUSENCIA_ANALYTICS[distribuicao.motivo]}</p>
      : distribuicao.valor.length === 0
        ? <p className="text-[13px] leading-relaxed text-suave">Nenhuma ocorrência informada nesta distribuição publicada. Isso não significa que não houve pedidos.</p>
        : <div className="max-h-96 overflow-auto rounded" tabIndex={0} role="region" aria-label={`Tabela de ${titulo.toLowerCase()}`}>
          <table className="w-full table-fixed text-left">
            <caption className="sr-only">{titulo}, ocorrências e participação no total desta distribuição</caption>
            <thead className="border-b border-linha text-[12px] text-suave"><tr>
              <th scope="col" className="w-[46%] pb-2 pr-3 font-medium">{horario ? 'Hora informada' : 'Indicador informado'}</th>
              <th scope="col" aria-label="Ocorrências" className="w-[30%] break-words pb-2 pr-3 text-right font-medium"><span className="sm:hidden" aria-hidden="true">Ocorr.</span><span className="hidden sm:inline">Ocorrências</span></th>
              <th scope="col" aria-label="Participação no total desta distribuição" className="break-words pb-2 text-right font-medium"><span className="sm:hidden" aria-hidden="true">% do total</span><span className="hidden sm:inline">Participação</span></th>
            </tr></thead>
            <tbody className="divide-y divide-linha">{distribuicao.valor.map(p => <tr key={p.termo} className="align-top text-[13px]">
              <th scope="row" className="break-words py-3 pr-3 font-normal text-texto [overflow-wrap:anywhere]">{rotuloDoTermo(p.termo, horario)}</th>
              <td className="py-3 pr-3 text-right tabular-nums text-texto [overflow-wrap:anywhere]">{quantidadeAnalytics(p.ocorrencias)}</td>
              <td className="py-3 text-right tabular-nums text-texto [overflow-wrap:anywhere]">{denominador ? percentualAnalytics({ numerador: p.ocorrencias, denominador }) : 'Sem base'}</td>
            </tr>)}</tbody>
          </table>
        </div>}
    {distribuicao.estado === 'disponivel' && distribuicao.valor.length > 0 && <p className="text-[12px] leading-relaxed text-suave">Participação sobre o total desta distribuição, incluindo termos não reconhecidos, com uma casa decimal.</p>}
  </section>;
}

/** Dois mapas marginais, cada um com seu denominador; a cobertura pertence à leitura complementar. */
export function ComplementaresDoPainel({ dados, fontes }: { dados: ComplementaresDoPainelAnalytics; fontes: FonteDoPainelAnalytics[] }) {
  const { cobertura } = dados;
  const [pagina, setPagina] = useState(1);
  const titulo = useRef<HTMLHeadingElement>(null);
  const paginas = Math.max(1, Math.ceil(cobertura.dias.length / 31)), atual = Math.min(pagina, paginas);
  const dias = cobertura.dias.slice((atual - 1) * 31, atual * 31);
  const porChave = new Map(fontes.map(f => [f.chave, f]));
  const mudarPagina = (proxima: number) => { setPagina(proxima); requestAnimationFrame(() => titulo.current?.focus()); };
  return <section aria-label="Horário e primeiro pedido" className="min-w-0">
    <Painel titulo="Horário e primeiro pedido" subtitulo="Distribuições da origem, no mesmo período e nas mesmas fontes selecionadas.">
      <div className="min-w-0 space-y-4">
        <div className="space-y-2">
          <Selo tom={cobertura.completa ? 'ok' : 'alerta'}>{cobertura.completa ? 'Cobertura complementar completa' : 'Cobertura complementar incompleta'}</Selo>
          <p className="text-[13px] text-texto">{cobertura.diasCompletos} de {cobertura.diasEsperados} dias completos · {cobertura.paresCobertos} de {cobertura.paresEsperados} leituras por fonte e dia.</p>
          <p className="text-[12px] leading-relaxed text-suave">{cobertura.completa
            ? 'Esta cobertura é conferida separadamente dos indicadores diários e dos pagamentos. Um valor ausente em uma distribuição mantém apenas ela sem dado.'
            : 'Falta leitura complementar utilizável. Os totais e as distribuições do período ficam sem dado, mesmo que os indicadores diários ou os pagamentos estejam completos.'}</p>
          <p className="text-[12px] leading-relaxed text-suave">Cada tabela tem seu próprio total. As duas distribuições não identificam primeiro pedido por hora.</p>
        </div>
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          <DistribuicaoComplementar dados={dados.horarios} horario />
          <DistribuicaoComplementar dados={dados.primeirosPedidos} horario={false} />
        </div>
        <details className="min-w-0 border-t border-linha">
          <summary className="min-h-11 cursor-pointer py-3 text-[13px] font-medium text-texto">Conferir cobertura de horário e primeiro pedido por dia e fonte</summary>
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
            {paginas > 1 && <nav aria-label="Páginas da cobertura complementar" className="flex flex-wrap items-center justify-between gap-3">
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
