/** Painel de snapshots publicados. Não lê banco, não refaz somas nem aplica valores no faturamento. */
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { MedidaAnalytics, ParcelaAnalytics, ResultadoDoPainelAnalytics } from '@/lib/integracoes/ifood/painel-campos';
import { ontemDoPainelAnalytics } from '@/lib/integracoes/ifood/painel-campos';
import { Aviso, Painel, Selo, Vazio } from '@/components/erp/ui/superficies';
import { LINK_DE_TEXTO } from '@/components/erp/ui/estilos';
import { diaAnalytics, dinheiroAnalytics, percentualAnalytics, quantidadeAnalytics, ticketAnalytics } from './formato-analytics';
import { FiltrosPainelAnalytics } from './painel-filtros';
import { AUSENCIA_ANALYTICS, MedidaDoPainel } from './painel-medidas';
import { SerieDoPainelAnalytics } from './painel-serie';
import { PagamentosDoPainel } from './painel-pagamentos';
import { ComplementaresDoPainel } from './painel-complementares';

export interface PropsPainelAnalytics {
  resultado: ResultadoDoPainelAnalytics;
  /** Rotas literais do caller autorizado, nunca recebidas do provedor. */
  base: string;
  baseSituacao?: string;
  /** Contexto autenticado: mantém TEST visível mesmo sem DTO por erro. */
  teste?: boolean;
}

function Cartao({ titulo, detalhe, children }: { titulo: string; detalhe: string; children: ReactNode }) {
  return <div className="min-w-0 space-y-3 rounded-[14px] border border-linha bg-painel px-4 py-4 sm:px-5">
    <dt className="text-[13px] font-medium text-texto">{titulo}</dt>
    <dd className="min-w-0 space-y-2">{children}<p className="text-[12px] leading-relaxed text-suave">{detalhe}</p></dd>
  </div>;
}

const ROTULOS = {
  canal: { IFOOD: 'iFood', POS: 'Ponto de venda', DIGITAL_CATALOG: 'Catálogo digital' },
  status: { CONCLUDED: 'Concluídos', CANCELLED: 'Cancelados' },
  logistica: { IFOOD_DELIVERY: 'Entrega iFood', MERCHANT_DELIVERY: 'Entrega da loja' },
} satisfies Record<string, Record<string, string>>;

function Distribuicao({ titulo, dimensao, medida }: { titulo: string; dimensao: keyof typeof ROTULOS; medida: MedidaAnalytics<ParcelaAnalytics[]> }) {
  const rotulos: Readonly<Record<string, string>> = ROTULOS[dimensao];
  return <Painel titulo={titulo}>
    {medida.estado === 'sem-dado' ? <p className="text-[13px] leading-relaxed text-suave"><span className="font-medium">Sem dado.</span> {AUSENCIA_ANALYTICS[medida.motivo]}</p>
      : medida.valor.length === 0 ? <p className="text-[13px] text-suave">Nenhum pedido no conjunto publicado.</p>
        : <div className="max-h-96 overflow-auto rounded" tabIndex={0} role="region" aria-label={`Tabela de pedidos por ${titulo.toLowerCase()}`}>
          <table className="w-full table-fixed text-left">
            <caption className="sr-only">Pedidos por {titulo.toLowerCase()}, todos os status do recorte</caption>
            <thead className="border-b border-linha text-[12px] text-suave"><tr><th scope="col" className="w-[58%] pb-2 pr-3 font-medium">{titulo}</th><th scope="col" className="pb-2 text-right font-medium">Pedidos</th></tr></thead>
            <tbody className="divide-y divide-linha">{medida.valor.map((p, index) => <tr key={`${p.valor ?? 'nao-informado'}:${index}`} className="align-top text-[13px]">
              <th scope="row" className="break-words py-3 pr-3 font-normal text-texto [overflow-wrap:anywhere]">{p.valor === null ? 'Não informado' : Object.hasOwn(rotulos, p.valor) ? rotulos[p.valor] : p.valor}</th>
              <td className="py-3 text-right tabular-nums text-texto [overflow-wrap:anywhere]">{quantidadeAnalytics(p.pedidos)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
  </Painel>;
}

export function PainelAnalytics({ resultado, base, baseSituacao, teste = false }: PropsPainelAnalytics) {
  const emTeste = teste || (resultado.ok && resultado.ambiente === 'TEST');
  const avisoTeste = emTeste ? <Aviso tom="alerta" titulo="Ambiente TEST — somente homologação.">Os indicadores são de teste e não entram no faturamento.</Aviso> : null;
  if (!resultado.ok) return <div className="space-y-3">
    {avisoTeste}
    <Aviso tom="alerta" titulo="Não foi possível consultar o painel.">{resultado.mensagem}</Aviso>
    <Link href={base} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center`}>Voltar à consulta do painel</Link>
  </div>;
  const p = resultado.painel, i = p?.resumo.indicadores;
  const temNegativo = i && [i.gmv, i.gmvSemEntrega, i.gmvConcluido, i.gmvCancelado].some(m => m.estado === 'disponivel' && m.valor.startsWith('-'));
  return <div className="min-w-0 space-y-5">
    {avisoTeste}
    <Painel titulo="Loja e período" subtitulo="Dados até ontem. Datas do recorte em São Paulo.">
      {resultado.lojas.length ? <FiltrosPainelAnalytics base={base} filtros={resultado.filtros} lojas={resultado.lojas} fontes={p?.fontes ?? []} ontem={p?.periodo.ateOntem ?? ontemDoPainelAnalytics()} />
        : <Vazio titulo="Nenhuma loja disponível para este painel.">O acesso às lojas precisa ser conferido pela FlowFoods.</Vazio>}
    </Painel>
    {p && i && <>
      <div className="min-w-0 space-y-2 text-[13px] text-suave">
        <p className="break-words text-sm font-semibold text-texto">{p.loja.nome} · {diaAnalytics(p.periodo.inicio)} a {diaAnalytics(p.periodo.fim)}</p>
        <p>Todos os canais, status e logísticas das fontes selecionadas. {emTeste ? 'Ambiente TEST.' : 'Produção.'}</p>
        <p className="[overflow-wrap:anywhere]">Fontes: {p.fontes.filter(f => f.selecionada).map(f => f.nome).join(' · ') || 'nenhuma disponível'}.</p>
        <p>Analytics mostra vendas observadas pelo provedor. GMV de todos os status inclui cancelados; não representa faturamento realizado, repasse nem lucro.</p>
      </div>
      <Painel titulo="Cobertura do período">
        <div className="space-y-3">
          <Selo tom={p.cobertura.completa ? 'ok' : 'alerta'}>{p.cobertura.completa ? 'Cobertura completa' : 'Cobertura incompleta'}</Selo>
          <p className="text-[13px] text-texto">{p.cobertura.diasCompletos} de {p.cobertura.diasEsperados} dias completos · {p.cobertura.paresCobertos} de {p.cobertura.paresEsperados} leituras por fonte e dia.</p>
          <p className="text-[12px] leading-relaxed text-suave">{p.cobertura.completa ? 'Cada fonte selecionada possui leitura utilizável em cada dia. Valores não informados pelo provedor continuam sem dado na medida correspondente.' : 'Falta leitura utilizável de uma ou mais fontes. Os totais do período ficam sem dado; consulte abaixo os dias que têm cobertura completa.'}</p>
          <p className="text-[12px] leading-relaxed text-suave">Sem leitura não significa que a loja não vendeu. Uma revisão pendente não substitui a versão publicada anterior; as datas de publicação aparecem nas fontes de cada dia.</p>
        </div>
      </Painel>
      <section aria-label="Indicadores do período" className="min-w-0 space-y-3">
        <dl className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Cartao titulo="GMV · todos os status" detalhe="Soma do GMV no conjunto publicado, incluindo cancelados."><MedidaDoPainel medida={i.gmv} formatar={dinheiroAnalytics} destaque /></Cartao>
          <Cartao titulo="GMV sem entrega · todos os status" detalhe="Valor sem entrega informado pelo provedor, no mesmo recorte."><MedidaDoPainel medida={i.gmvSemEntrega} formatar={dinheiroAnalytics} destaque /></Cartao>
          <Cartao titulo="Pedidos observados" detalhe="Todos os status do conjunto, inclusive não informados ou novos."><MedidaDoPainel medida={i.pedidos} formatar={quantidadeAnalytics} destaque /></Cartao>
          <Cartao titulo="GMV concluído" detalhe="GMV somente dos pedidos com status concluído."><MedidaDoPainel medida={i.gmvConcluido} formatar={dinheiroAnalytics} destaque /></Cartao>
          <Cartao titulo="Pedidos concluídos" detalhe="Quantidade de pedidos com status concluído."><MedidaDoPainel medida={i.concluidos} formatar={quantidadeAnalytics} destaque /></Cartao>
          <Cartao titulo="Ticket médio dos concluídos" detalhe="GMV concluído dividido pelos pedidos concluídos."><MedidaDoPainel medida={i.ticketConcluidos} formatar={ticketAnalytics} destaque /></Cartao>
          <Cartao titulo="GMV cancelado" detalhe="GMV dos pedidos cancelados; este valor não entra no faturamento."><MedidaDoPainel medida={i.gmvCancelado} formatar={dinheiroAnalytics} destaque /></Cartao>
          <Cartao titulo="Pedidos cancelados" detalhe="Quantidade de pedidos com status cancelado."><MedidaDoPainel medida={i.cancelados} formatar={quantidadeAnalytics} destaque /></Cartao>
          <Cartao titulo="Taxa de cancelamento" detalhe="Cancelados divididos pelo total observado. Status não classificados deixam esta taxa sem dado."><MedidaDoPainel medida={i.taxaCancelamento} formatar={percentualAnalytics} destaque /></Cartao>
        </dl>
        <p className="text-[12px] leading-relaxed text-suave">Ticket exibido em reais e centavos; taxa com uma casa decimal. As contagens exibidas permanecem exatas.</p>
        {temNegativo && <p className="text-[12px] text-suave">Há valores negativos no conjunto publicado; o sinal foi preservado.</p>}
      </section>
      <Painel titulo="Série diária" subtitulo="Indicadores do mesmo período, com lacunas explícitas nos dias incompletos.">
        <SerieDoPainelAnalytics key={`${p.loja.id}:${p.periodo.inicio}:${p.periodo.fim}:${p.fontes.filter(f => f.selecionada).map(f => f.chave).join(',')}`} serie={p.serie} cobertura={p.cobertura} fontes={p.fontes} />
      </Painel>
      <section aria-label="Distribuições de pedidos" className="min-w-0 space-y-3">
        <h2 className="text-sm font-semibold text-texto">Distribuições de pedidos</h2>
        <p className="text-[12px] leading-relaxed text-suave">Canal, status e logística são leituras separadas dos mesmos pedidos. Não some as três tabelas entre si. Categorias novas e não informadas permanecem identificadas.</p>
        <div className="grid min-w-0 gap-4 xl:grid-cols-3">
          <Distribuicao titulo="Canal" dimensao="canal" medida={p.resumo.distribuicoes.canal} />
          <Distribuicao titulo="Status" dimensao="status" medida={p.resumo.distribuicoes.status} />
          <Distribuicao titulo="Logística" dimensao="logistica" medida={p.resumo.distribuicoes.logistica} />
        </div>
      </section>
      <PagamentosDoPainel key={`${p.loja.id}:${p.periodo.inicio}:${p.periodo.fim}:${p.fontes.filter(f => f.selecionada).map(f => f.chave).join(',')}`} dados={p.pagamentos} fontes={p.fontes} />
      <ComplementaresDoPainel key={`complementares:${p.loja.id}:${p.periodo.inicio}:${p.periodo.fim}:${p.fontes.filter(f => f.selecionada).map(f => f.chave).join(',')}`} dados={p.complementares} fontes={p.fontes} />
      {baseSituacao && <Link href={`${baseSituacao}?${new URLSearchParams({ loja: p.loja.id, dia: p.periodo.fim }).toString()}`} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center`}>Conferir a situação da integração no último dia do período</Link>}
    </>}
  </div>;
}
