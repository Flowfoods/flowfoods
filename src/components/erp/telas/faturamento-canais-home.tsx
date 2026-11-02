/** Valores da composição canônica; falha neste bloco preserva KPI, evolução e complementos. */
import type { FaturamentoDiarioHome, WidgetFaturamentoHome } from '@/lib/erp/home-analitico';
import { inteiroNaoNegativo, percentualDoInformado, type ComposicaoFaturamentoHome } from '@/lib/erp/home-faturamento-canais';
import { CANAIS } from '@/lib/erp/canal-campos';
import { ehCanal } from '@/lib/erp/faturamento-campos';
import { formatarDinheiro, formatarPontosBase } from '@/lib/erp/unidades';
import { BarrasHorizontais } from '../ui/barras-horizontais';
import { Selo } from '../ui/superficies';
import { mesmoRecorteDoFaturamento } from './faturamento-complementos-home';
import { ValorMonetarioHome } from './valor-monetario-home';

const indisponivel = (): ComposicaoFaturamentoHome => ({ estado: 'indisponivel', totalCentavos: null, canais: [], aviso: 'A composição por canal está indisponível nesta leitura.' });

function paraExibir(widget: WidgetFaturamentoHome, leitura: FaturamentoDiarioHome): ComposicaoFaturamentoHome | null {
  try {
    const c = widget.composicaoPorCanal;
    if (c == null) return null;
    const { estado, totalCentavos, canais, aviso } = c;
    if (!['ok', 'parcial', 'sem_dados', 'erro', 'indisponivel'].includes(estado) || typeof aviso !== 'string') return indisponivel();
    if (estado !== 'ok' && estado !== 'parcial') return { estado, totalCentavos: null, canais: [], aviso };
    if (widget.familia !== 'faturamento' || widget.escopo.tipo !== 'loja' || widget.origem?.fonte !== 'faturamento'
      || !mesmoRecorteDoFaturamento(widget, leitura) || estado !== widget.estado
      || totalCentavos !== widget.valor.valor || !inteiroNaoNegativo(totalCentavos)
      || !Array.isArray(canais) || !canais.length || canais.length > 3) return indisponivel();
    const presentes = leitura.serie?.canais;
    if (!Array.isArray(presentes) || !presentes.length || !presentes.every(ehCanal) || new Set(presentes).size !== presentes.length) return indisponivel();
    const vistos = new Set<string>();
    const linhas: ComposicaoFaturamentoHome['canais'] = [];
    let soma = 0n, faltas = 0;
    for (const linha of canais) {
      if (!linha) return indisponivel();
      const { canal, centavos, faltas: ausentes, percentualBp } = linha;
      if (!ehCanal(canal) || vistos.has(canal)
        || (centavos !== null && !inteiroNaoNegativo(centavos))
        || (centavos !== null) !== presentes.includes(canal)
        || !inteiroNaoNegativo(ausentes) || ausentes > 31
        || percentualBp !== percentualDoInformado(centavos, totalCentavos)) return indisponivel();
      vistos.add(canal); soma += BigInt(centavos ?? 0); faltas += ausentes;
      linhas.push({ canal, centavos, faltas: ausentes, percentualBp });
    }
    if (presentes.some(c => !vistos.has(c)) || soma !== BigInt(totalCentavos) || faltas !== widget.cobertura?.faltasDeFaturamento
      || (estado === 'parcial') !== (faltas > 0)) return indisponivel();
    return { estado, totalCentavos, canais: linhas, aviso };
  } catch {
    return indisponivel();
  }
}

export function FaturamentoCanaisHome({ widget, leitura }: { widget: WidgetFaturamentoHome; leitura: FaturamentoDiarioHome }) {
  const c = paraExibir(widget, leitura);
  if (!c) return null;
  const disponivel = c.estado === 'ok' || c.estado === 'parcial';
  const barras = disponivel ? c.canais.flatMap(l => l.centavos === null ? [] : [{ chave: l.canal, rotulo: CANAIS[l.canal].rotulo, valor: l.centavos, valorTexto: formatarDinheiro(l.centavos) }]) : [];
  return (
    <div role="group" aria-label="Faturamento por canal" className="min-w-0 space-y-3 border-t border-linha pt-4">
      <div className="flex flex-wrap items-center gap-2"><h3 className="text-[14px] font-semibold text-texto">Por canal</h3>{c.estado === 'parcial' && <Selo tom="alerta">Parcial</Selo>}</div>
      <p className="text-[12px] leading-relaxed text-suave">{c.aviso}</p>
      {disponivel ? (
        <>
          {c.totalCentavos! > 0 && <BarrasHorizontais titulo="Comparação dos valores informados por canal" barras={barras} />}
          <table className="w-full table-fixed border-collapse text-[13px]">
            <caption className="mb-2 text-left font-semibold text-texto">Valores informados por canal</caption>
            <thead><tr className="border-b border-linha text-suave"><th scope="col" className="w-2/5 px-1 py-2 text-left font-medium">Canal</th><th scope="col" className="w-2/5 px-1 py-2 text-right font-medium">Faturamento</th><th scope="col" className="px-1 py-2 text-right font-medium">% do informado</th></tr></thead>
            <tbody>{c.canais.map(l => <tr key={l.canal} className="border-b border-linha">
              <th scope="row" className="break-words px-1 py-3 text-left align-top font-medium text-texto">{CANAIS[l.canal].rotulo}{l.faltas > 0 && <span className="mt-1 block text-[12px] font-normal text-suave">{l.faltas} {l.faltas === 1 ? 'dia sem lançamento' : 'dias sem lançamento'}</span>}</th>
              <td className="px-1 py-3 text-right align-top font-semibold tabular-nums text-texto">{l.centavos === null ? <span className="font-normal text-suave">Sem lançamento</span> : <ValorMonetarioHome centavos={l.centavos} />}</td>
              <td className="px-1 py-3 text-right align-top tabular-nums text-texto">{l.percentualBp === null ? <span aria-label="Percentual não disponível">—</span> : formatarPontosBase(l.percentualBp)}</td>
            </tr>)}</tbody>
            <tfoot><tr><th scope="row" className="px-1 py-3 text-left font-semibold">Total informado</th><td className="px-1 py-3 text-right font-semibold tabular-nums"><ValorMonetarioHome centavos={c.totalCentavos!} /></td><td /></tr></tfoot>
          </table>
          {c.totalCentavos! > 0
            ? <p className="text-[12px] leading-relaxed text-suave">Percentuais arredondados sobre o total informado. As barras comparam os valores entre canais.</p>
            : <p className="text-[12px] leading-relaxed text-suave">O total informado é zero; não há distribuição percentual.</p>}
        </>
      ) : <p className="text-[13px] text-suave">{c.estado === 'sem_dados' ? 'Sem lançamentos para compor os canais.' : 'Confira os lançamentos no módulo Faturamento.'}</p>}
    </div>
  );
}
