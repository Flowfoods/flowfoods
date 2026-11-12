import Link from 'next/link';
import { CENARIOS_EXEMPLO_FINANCIAL, type ExemploConferenciaFinancial } from '@/lib/integracoes/ifood/financial-v3-exemplo-conferencia';
import { classeDeBotao } from '@/components/erp/ui/estilos';
import { Aviso, Painel, Selo, type Tom } from '@/components/erp/ui/superficies';
import { diaAnalytics, dinheiroAnalytics, percentualAnalytics } from './formato-analytics';

const CENARIOS = { conforme: 'Valores compatíveis', divergente: 'Com divergência', incompleto: 'Fontes incompletas' } as const;
const ESTADOS = {
  COINCIDENTE: ['Coincidente', 'ok'], COMPATIVEL: ['Compatível', 'ok'],
  DIVERGENTE: ['Divergente', 'erro'], PENDENTE: ['Pendente', 'alerta'],
} as const satisfies Record<string, readonly [string, Tom]>;

export function formatarCompetenciaFinancial(mes: string) {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${mes}-01T00:00:00Z`));
}

function Situacao({ estado }: { estado: keyof typeof ESTADOS }) {
  const [rotulo, tom] = ESTADOS[estado];
  return <Selo tom={tom}>{rotulo}</Selo>;
}

const dinheiro = (valor: bigint | null) => valor === null ? '—' : dinheiroAnalytics(valor.toString());
const percentual = (valor: string | null) => valor === null ? '—' : `${valor.replace('.', ',')}%`;

function Medida({ rotulo, valor }: { rotulo: string; valor: string }) {
  return <div className="min-w-0">
    <dt className="text-[12px] text-suave">{rotulo}</dt>
    <dd className="mt-1 font-semibold tabular-nums text-texto">{valor}</dd>
  </div>;
}

function Taxa({ titulo, taxa }: { titulo: string; taxa: ExemploConferenciaFinancial['taxas']['porTipo']['ORDER_COMMISSION'] }) {
  // A simulação usa uma cobrança por tipo. Cada percentual pertence à sua própria ocorrência.
  const ocorrencia = taxa.ocorrencias[0];
  const configurada = ocorrencia?.configuradaBp;
  return <section className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-baseline gap-2">
      <h3 className="text-sm font-semibold">{titulo}</h3><Situacao estado={taxa.estado} />
    </div>
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
      <Medida rotulo="Taxa configurada" valor={configurada == null ? '—' : `${(configurada / 100).toLocaleString('pt-BR')}%`} />
      <Medida rotulo="Taxa cobrada" valor={percentual(ocorrencia?.percentualCobrado ?? null)} />
      <Medida rotulo="Valor previsto" valor={dinheiro(taxa.previstoCentavos)} />
      <Medida rotulo="Valor cobrado" valor={dinheiro(taxa.cobradoCentavos)} />
      <Medida rotulo="Cobrado menos previsto" valor={dinheiro(taxa.diferencaCentavos)} />
    </dl>
  </section>;
}

export function ExemploDeConferencia({ exemplo, retorno }: { exemplo: ExemploConferenciaFinancial; retorno: string }) {
  const { arquivoEventos, liquidacao, taxas, antecipacao, download } = exemplo;
  const razao = antecipacao.percentual.efetivoPonderado;
  const titulo = antecipacao.titulos[0];
  return <>
    <Aviso tom="alerta" titulo="Dados simulados.">O exemplo usa um pedido fictício. Os valores servem apenas para esta conferência.</Aviso>
    <nav aria-label="Cenários do exemplo" className="flex flex-wrap gap-2">
      {CENARIOS_EXEMPLO_FINANCIAL.map(c => <Link key={c} prefetch={false} aria-current={c === exemplo.cenario ? 'page' : undefined}
        className={classeDeBotao(c === exemplo.cenario ? 'primario' : 'secundario')}
        href={`${retorno}${retorno.includes('?') ? '&' : '?'}exemplo=${c}`}>{CENARIOS[c]}</Link>)}
    </nav>
    {exemplo.cenario === 'incompleto' && <Aviso tom="alerta" titulo="Apenas o arquivo mensal está disponível.">Faltam os eventos, as liquidações e os títulos de antecipação. O traço indica um valor que ainda não pode ser conferido.</Aviso>}
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <Painel titulo="Arquivo mensal e eventos" acessorio={<Situacao estado={arquivoEventos.estado} />}>
        <dl className="grid grid-cols-2 gap-3">
          <Medida rotulo="Arquivo com impacto no repasse" valor={dinheiro(arquivoEventos.arquivoComImpactoCentavos)} />
          <Medida rotulo="Eventos com impacto no repasse" valor={dinheiro(arquivoEventos.eventosComImpactoCentavos)} />
          <Medida rotulo="Eventos menos arquivo" valor={dinheiro(arquivoEventos.diferencaCentavos)} />
        </dl>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
          <a href={download.href} download={download.nomeArquivo} className={classeDeBotao('secundario')}>Baixar CSV.gz simulado</a>
          <span className="text-[12px] text-suave">{download.linhas} linhas · {download.pedidosDistintos} pedido</span>
        </div>
      </Painel>
      <Painel titulo="Liquidação e eventos" acessorio={<Situacao estado={liquidacao.estado} />}>
        <dl className="grid grid-cols-2 gap-3">
          <Medida rotulo="Saldo da liquidação" valor={dinheiro(liquidacao.saldoLiquidacaoCentavos)} />
          <Medida rotulo="Eventos com impacto no repasse" valor={dinheiro(liquidacao.eventosComImpactoCentavos)} />
          <Medida rotulo="Eventos menos liquidação" valor={dinheiro(liquidacao.diferencaCentavos)} />
        </dl>
      </Painel>
    </div>
    <Painel titulo="Taxas configuradas e cobradas">
      <div className="space-y-4 divide-y divide-linha">
        <Taxa titulo="Comissão do iFood" taxa={taxas.porTipo.ORDER_COMMISSION} />
        <div className="pt-4"><Taxa titulo="Taxa de pagamento" taxa={taxas.porTipo.PAYMENT_TRANSACTION_FEE} /></div>
      </div>
    </Painel>
    <Painel titulo="Custo da antecipação" acessorio={<Situacao estado={antecipacao.estado} />}>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 xl:grid-cols-4">
        <Medida rotulo="Valor original" valor={dinheiro(titulo?.valorOriginalCentavos ?? null)} />
        <Medida rotulo="Valor antecipado" valor={dinheiro(titulo?.valorAntecipadoCentavos ?? null)} />
        <Medida rotulo="Taxa informada" valor={dinheiro(antecipacao.monetario.taxaInformadaCentavos)} />
        <Medida rotulo="Desconto apurado" valor={dinheiro(antecipacao.monetario.diferencaBrutoLiquidoCentavos)} />
        <Medida rotulo="Pagamento previsto" valor={titulo?.pagamentoOriginalEm ? diaAnalytics(titulo.pagamentoOriginalEm) : '—'} />
        <Medida rotulo="Pagamento antecipado" valor={titulo?.pagamentoAntecipadoEm ? diaAnalytics(titulo.pagamentoAntecipadoEm) : '—'} />
        <Medida rotulo="Percentual informado" valor={percentual(titulo?.taxaPercentual ?? null)} />
        <Medida rotulo="Percentual efetivo" valor={razao ? percentualAnalytics({ numerador: razao.taxaCentavos.toString(), denominador: razao.baseCentavos.toString() }) : '—'} />
      </dl>
    </Painel>
  </>;
}
