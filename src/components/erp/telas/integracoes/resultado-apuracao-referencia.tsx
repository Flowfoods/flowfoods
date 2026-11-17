import type { ApuracaoReferenciaFinancial } from '@/lib/integracoes/ifood/financial-v3-apuracao-referencia';
import { Painel, Selo } from '@/components/erp/ui/superficies';
import { diaAnalytics, dinheiroAnalytics, instanteAnalytics } from './formato-analytics';
import { formatarCompetenciaFinancial, MedidaFinancial } from './medidas-conferencia-financial';
import { SaldosConferenciaFinancial } from './saldos-conferencia-financial';

type Totais = ApuracaoReferenciaFinancial['arquivo']['totais'];
const estados: Record<string, string> = {
  SCHEDULED: 'Agendado (SCHEDULED)', SUCCEED: 'Concluído segundo o iFood (SUCCEED)',
  COMPENSATED: 'Compensado (COMPENSATED)', FAILED: 'Falhou (FAILED)', NAO_IDENTIFICADO: 'Estado não identificado',
};
const tipos: Record<string, string> = { REPASSE: 'Repasse', REPASSE_ANTECIPADO_SEMANAL: 'Repasse antecipado semanal', OUTROS: 'Demais tipos' };
function Composicao({ arquivo, eventos }: { arquivo: Totais; eventos: Totais }) {
  const linhas = [
    ['Créditos com impacto', 'creditos', 'creditosCentavos'],
    ['Débitos com impacto', 'debitos', 'debitosCentavos'],
    ['Sem impacto no repasse', 'semImpacto', 'semImpactoCentavos'],
  ] as const;
  return <table className="mt-3 w-full text-left text-[13px] tabular-nums">
    <caption className="sr-only">Quantidade e valor dos lançamentos por fonte</caption>
    <thead><tr className="border-b border-linha"><th scope="col" className="py-2">Lançamentos</th><th scope="col">Arquivo</th><th scope="col">Eventos</th></tr></thead>
    <tbody>{linhas.map(([rotulo, n, soma]) => <tr key={n} className="border-b border-linha">
      <th scope="row" className="py-2 pr-2 font-normal">{rotulo}</th>
      {[arquivo, eventos].map((fonte, i) => <td key={i} className="py-2 pr-2">{fonte[n]} · {dinheiroAnalytics(fonte[soma])}</td>)}
    </tr>)}
    {!!(arquivo.zeradosComImpacto || eventos.zeradosComImpacto) && <tr>
      <th scope="row" className="py-2 font-normal">Com impacto e valor zero</th><td>{arquivo.zeradosComImpacto}</td><td>{eventos.zeradosComImpacto}</td>
    </tr>}</tbody>
  </table>;
}

export function ResultadoApuracaoReferencia({ apuracao }: { apuracao: ApuracaoReferenciaFinancial }) {
  const { periodo, arquivo, eventos, liquidacao, saldosIguais, mesmaComposicao } = apuracao;
  const intervalo = `${diaAnalytics(periodo.inicio)} a ${diaAnalytics(periodo.fim)}`;
  const nomes: [string, string][] = [['Reconciliação CSV.gz', arquivo.sha256],
    ...eventos.paginasSha256.map((hash, i): [string, string] => [`Financial Events · página ${i + 1}`, hash]), ['Settlements', liquidacao.sha256]];
  return <div className="space-y-4">
    <Painel titulo="Visualização da apuração do parceiro" subtitulo={`${intervalo} · ${formatarCompetenciaFinancial(periodo.competencia)}`}
      acessorio={<Selo tom={saldosIguais && mesmaComposicao ? 'ok' : 'alerta'}>{saldosIguais && mesmaComposicao ? 'Valores conferem' : 'Divergência'}</Selo>}>
      <h3 className="text-sm font-semibold">Saldos com impacto no repasse desta apuração</h3>
      <SaldosConferenciaFinancial {...apuracao.somas} />
      <p className="mt-4 text-[13px]">{saldosIguais ? 'Os saldos das três fontes coincidem.' : 'Os saldos das três fontes divergem.'}
        {' '}{mesmaComposicao ? 'CSV e eventos têm as mesmas quantidades por valor assinado e impacto.' : 'As quantidades por valor assinado e impacto diferem entre CSV e eventos.'}</p>
      <p className="mt-1 text-[12px] text-suave">Valores em reais pelo contexto Financial Brasil. Quando a fonte informa moeda, a conferência verifica BRL.</p>
    </Painel>
    <Painel titulo="Composição dos lançamentos" subtitulo="Mesma loja de referência identificada no CSV, nos recebedores dos eventos e em Settlements.">
      <dl className="grid gap-3 sm:grid-cols-2">
        <MedidaFinancial rotulo="CSV da apuração" valor={`${arquivo.comImpacto} com impacto em ${arquivo.naApuracao} linhas`} />
        <MedidaFinancial rotulo="Eventos da apuração" valor={`${eventos.comImpacto} com impacto em ${eventos.naApuracao} eventos`} />
      </dl>
      <Composicao arquivo={arquivo.totais} eventos={eventos.totais} />
    </Painel>
    <Painel titulo="Situação do repasse" subtitulo="Saldo do envelope e títulos informados por Settlements.">
      <dl className="grid gap-3 sm:grid-cols-2">
        <MedidaFinancial rotulo="Títulos informados" valor={String(liquidacao.titulos)} />
        <MedidaFinancial rotulo="Previsão nos eventos com impacto" valor={eventos.previsoes.map(diaAnalytics).join(', ') || 'Sem data informada'} />
      </dl>
      <ul className="mt-3 divide-y divide-linha text-[13px]">{liquidacao.grupos.map(g =>
        <li key={JSON.stringify([g.tipo, g.estado, g.data])} className="flex flex-wrap justify-between gap-x-4 py-2">
          <span>{tipos[g.tipo]} · {estados[g.estado]} · {g.quantidade} {g.quantidade === 1 ? 'título' : 'títulos'}</span>
          <span>{g.estado === 'SCHEDULED' ? 'Previsão' : 'Data informada'} · {g.data ? diaAnalytics(g.data) : 'sem data'} · {g.centavos !== null ? dinheiroAnalytics(g.centavos) : 'sem valor'}</span>
        </li>)}</ul>
      <p className="mt-2 text-[13px] text-suave">Crédito bancário efetivado · sem comprovante bancário nestas fontes.</p>
    </Painel>
    <Painel titulo="Cobertura da competência" acessorio={<Selo tom="alerta">Conferência parcial do mês</Selo>}>
      <p className="text-sm">O CSV contém {arquivo.linhas} linhas da competência. A conferência com Events e Settlements cobre a apuração de {intervalo}.</p>
      <p className="mt-2 text-[13px] text-suave">Demais apurações do CSV · {arquivo.linhas - arquivo.naApuracao} linhas, {arquivo.outrosComImpacto} com impacto, saldo de {dinheiroAnalytics(arquivo.outrosCentavos)}. O fechamento mensal exige cobertura dessas fontes para todo o mês.</p>
    </Painel>
    <details className="rounded-cartao border border-linha bg-painel px-4">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">Registro da conferência e SHA-256 das fontes</summary>
      <p className="py-2 text-[13px]">Conferido em {instanteAnalytics(apuracao.conferidoEm)} (São Paulo). Cada SHA-256 identifica os bytes do arquivo apresentado pelo operador.</p>
      <dl className="space-y-2 pb-4">{nomes.map(([nome, hash]) => <div key={nome}><dt className="text-[12px] text-suave">{nome}</dt>
        <dd className="select-all break-all font-mono text-xs">{hash}</dd></div>)}</dl>
    </details>
  </div>;
}
