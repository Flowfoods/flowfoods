/** Evolução da mesma leitura mensal: reaproveita gráfico, estados e tabela do kit. */
import Link from 'next/link';
import type { FaturamentoDiarioHome } from '@/lib/erp/home-analitico';
import { CANAIS } from '@/lib/erp/canal-campos';
import { formatarData } from '@/lib/erp/compra-campos';
import { rotuloDoMes, type CanalVenda } from '@/lib/erp/faturamento-campos';
import { FRASE_DO_ESTADO } from '@/lib/erp/grafico';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { GraficoDeColunas, type PontoDoGrafico } from '../ui/grafico-colunas';
import { LINK_DE_TEXTO } from '../ui/estilos';
import { Painel, Selo } from '../ui/superficies';

const COR_DO_CANAL: Record<CanalVenda, number> = { LOJA: 1, DELIVERY_PROPRIO: 2, IFOOD: 3 };

export function EvolucaoFaturamentoHome({ leitura, loja }: { leitura: FaturamentoDiarioHome; loja: string }) {
  const serie = leitura.serie;
  const titulo = `Faturamento por dia em ${rotuloDoMes(leitura.mes)} · ${loja}`;
  const pontos: PontoDoGrafico[] = serie?.dias.map((dia) => ({
    chave: dia.data, rotulo: formatarData(dia.data), rotuloEixo: String(Number(dia.data.slice(8, 10))),
    valores: dia.valores, total: dia.total,
    nota: dia.estado === 'falta' ? `Falta lançar: ${dia.faltam.map((c) => CANAIS[c].rotulo).join(', ')}.`
      : dia.total === null ? FRASE_DO_ESTADO[dia.estado] : undefined,
    marca: dia.estado === 'falta' ? 'falta' : undefined,
  })) ?? [];
  const temLancamentos = Boolean(serie?.diasLancados);
  const semLeitura = leitura.estado === 'erro' || leitura.estado === 'indisponivel' || leitura.estado === 'sem_base';
  const valorAusente = leitura.estado === 'sem_dados' ? 'sem lançamentos' : 'valor não disponível';
  const mensagem = leitura.estado === 'erro' ? 'Não foi possível carregar a evolução do faturamento.'
    : leitura.estado === 'indisponivel' ? 'A evolução do faturamento está indisponível neste recorte.'
      : leitura.estado === 'sem_base' ? 'A evolução está sem base neste recorte.' : 'Ainda não há lançamentos para esta evolução.';
  return (
    <section aria-label="Evolução do faturamento" className="min-w-0">
      <Painel titulo="Faturamento por dia" subtitulo={`${loja} · ${rotuloDoMes(leitura.mes)} · mês civil`}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] text-suave">Total informado no mês: <strong className="font-semibold tabular-nums text-texto">{semLeitura ? 'valor não disponível' : leitura.totalCentavos === null ? valorAusente : formatarDinheiro(leitura.totalCentavos)}</strong></p>
            {leitura.estado === 'parcial' && <Selo tom="alerta">Parcial</Selo>}
          </div>
          {!semLeitura && temLancamentos && serie ? (
            <>
              <GraficoDeColunas titulo={titulo} series={serie.canais.map((canal) => ({ chave: canal, rotulo: CANAIS[canal].rotulo, cor: COR_DO_CANAL[canal] }))} pontos={pontos} />
              <p className="text-[12px] leading-relaxed text-suave">Os espaços em branco indicam dias sem valor lançado. A tabela informa os zeros declarados e as pendências de cada dia. Hoje: {formatarData(leitura.hoje)}.</p>
            </>
          ) : (
            <div className="rounded-[10px] border border-linha bg-texto/[0.02] px-4 py-6">
              <p className="text-[14px] font-semibold text-texto">{mensagem}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-suave">{semLeitura ? 'Atualize o resumo ou abra o faturamento para conferir este recorte.' : 'Os dias ganham valor conforme os lançamentos do mês são informados.'}</p>
            </div>
          )}
          <Link href={leitura.detalhe.href} className={LINK_DE_TEXTO + ' inline-flex min-h-11 items-center'}>{leitura.detalhe.rotulo}</Link>
        </div>
      </Painel>
    </section>
  );
}
