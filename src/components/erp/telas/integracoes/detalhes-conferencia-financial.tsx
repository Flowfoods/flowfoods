import type { ReactNode } from 'react';
import type { ExemploConferenciaFinancial } from '@/lib/integracoes/ifood/financial-v3-exemplo-conferencia';
import { Painel } from '@/components/erp/ui/superficies';
import { diaAnalytics, instanteAnalytics } from './formato-analytics';
import { dinheiroFinancial as dinheiro, MedidaFinancial as Medida } from './medidas-conferencia-financial';

export function rotuloDoPagamento(estado: string | null) {
  if (estado === 'SUCCEED') return 'Pago';
  if (estado === 'FAILED') return 'Falhou';
  return estado ?? '—';
}

const ROTULOS: Readonly<Record<string, string>> = {
  ORDER_PAYMENT: 'Pagamento do pedido', ORDER_COMMISSION: 'Comissão do iFood', PAYMENT_TRANSACTION_FEE: 'Taxa de pagamento',
  AJUSTE_SIMULADO: 'Ajuste simulado', SALE_CONCLUDED: 'Venda concluída', CONCLUDED: 'Concluído',
  IFOOD: 'iFood', CREDIT: 'Cartão de crédito', CREDIT_CARD: 'Cartão de crédito', REPASSE: 'Repasse',
};
const rotulo = (valor: string | null) => valor ? ROTULOS[valor] ?? valor : '—';
const comSinal = (valor: bigint | null) => valor !== null && valor > 0n ? `+${dinheiro(valor)}` : dinheiro(valor);

function Fonte({ titulo, children }: { titulo: string; children: ReactNode }) {
  return <details className="min-w-0">
    <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-texto sm:px-5">{titulo}</summary>
    <div className="px-4 pb-4 text-[13px] sm:px-5">{children}</div>
  </details>;
}

export function DetalhesDasFontes({ exemplo }: { exemplo: ExemploConferenciaFinancial }) {
  const { vendas, eventos, titulosLiquidacao } = exemplo;
  return <Painel titulo="Detalhes das fontes simuladas" semRespiro>
    <div className="divide-y divide-linha">
      <Fonte titulo="Venda e recebimento do pedido">
        {vendas === null ? <p className="text-suave">Fonte de vendas ausente neste cenário.</p> : vendas.map(v =>
          <div key={v.id} className="space-y-3">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              <Medida rotulo="Número do pedido" valor={v.numeroCurto ?? '—'} />
              <Medida rotulo="Pedido em São Paulo" valor={v.criadaEm ? instanteAnalytics(v.criadaEm) : '—'} />
              <Medida rotulo="Situação da venda" valor={rotulo(v.estado)} />
              <Medida rotulo="Valor bruto dos itens" valor={dinheiro(v.valorBruto?.itensCentavos ?? null)} />
              <Medida rotulo="Entrega" valor={dinheiro(v.valorBruto?.entregaCentavos ?? null)} />
              <Medida rotulo="Serviço" valor={dinheiro(v.valorBruto?.servicoCentavos ?? null)} />
              <Medida rotulo="Saldo líquido da venda" valor={dinheiro(v.faturamento?.saldoVendaCentavos ?? null)} />
            </dl>
            {v.metodosPagamento?.map((m, i) => <dl key={i} className="grid grid-cols-2 gap-3 border-t border-linha pt-3 sm:grid-cols-3">
              <Medida rotulo="Forma de pagamento" valor={rotulo(m.metodo)} />
              <Medida rotulo="Recebedor" valor={rotulo(m.responsabilidade)} />
              <Medida rotulo="Valor pago" valor={dinheiro(m.valorCentavos)} />
            </dl>)}
            {v.faturamento?.lancamentos && <ul aria-label="Lançamentos do pedido" className="space-y-1 border-t border-linha pt-3">
              {v.faturamento.lancamentos.map((l, i) => <li key={i} className="flex flex-wrap justify-between gap-x-3"><span>{rotulo(l.nome)}</span><span className="font-semibold tabular-nums">{comSinal(l.valorCentavos)}</span></li>)}
            </ul>}
          </div>)}
      </Fonte>
      <Fonte titulo="Lançamentos dos eventos financeiros">
        {eventos === null ? <p className="text-suave">Fonte de eventos ausente neste cenário.</p> : <>
          <ul className="divide-y divide-linha">
            {eventos.map((e, i) => <li key={i} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2 first:pt-0">
              <div className="min-w-0">
                <div className="font-semibold">{rotulo(e.nome)}</div>
                <div className="text-suave">Gatilho · {rotulo(e.gatilho)} · {e.impactoNoRepasse === null ? 'Impacto não informado' : e.impactoNoRepasse ? 'Afeta o repasse' : 'Sem impacto no repasse'}</div>
                {e.periodo?.inicio && e.periodo.fim && <div className="text-suave">Apuração de {diaAnalytics(e.periodo.inicio)} a {diaAnalytics(e.periodo.fim)}</div>}
                <div className="text-suave">Data da referência · {e.referenciaEm ? instanteAnalytics(e.referenciaEm) : 'Não informada'}</div>
                <div className="text-suave">Previsão de repasse · {e.repassePrevistoEm ? diaAnalytics(e.repassePrevistoEm) : 'Não informada'}</div>
              </div>
              <span className="font-semibold tabular-nums">{comSinal(e.valorCentavos)}</span>
            </li>)}
          </ul>
        </>}
      </Fonte>
      <Fonte titulo="Títulos e datas da liquidação">
        {titulosLiquidacao === null ? <p className="text-suave">Fonte de liquidações ausente neste cenário.</p> : <>
          {titulosLiquidacao.map((t, i) => <dl key={i} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Medida rotulo="Título" valor={rotulo(t.tipo)} />
            <Medida rotulo="Situação do pagamento" valor={rotuloDoPagamento(t.estado)} />
            <Medida rotulo="Data de pagamento" valor={t.pagamentoEm ? diaAnalytics(t.pagamentoEm) : '—'} />
            <Medida rotulo="Valor do título" valor={dinheiro(t.valorCentavos)} />
          </dl>)}
          <p className="mt-3 text-[12px] text-suave">Dados bancários indisponíveis no exemplo.</p>
        </>}
      </Fonte>
    </div>
  </Painel>;
}
