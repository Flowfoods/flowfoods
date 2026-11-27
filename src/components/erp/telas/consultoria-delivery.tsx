import Link from 'next/link';
import { Voltar } from '@/components/erp/telas/cadastro/partes';
import { diaAnalytics, dinheiroAnalytics, instanteAnalytics, quantidadeAnalytics, ticketAnalytics } from '@/components/erp/telas/integracoes/formato-analytics';
import { MedidaDoPainel } from '@/components/erp/telas/integracoes/painel-medidas';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { Aviso, Painel, Selo } from '@/components/erp/ui/superficies';
import { COR } from '@/lib/erp/modulos';
import type { ResultadoConsultoriaDelivery, VisaoGeralConsultoria } from '@/lib/integracoes/core/consultoria-delivery';
import { FUSO_DO_PAINEL, type IndicadoresAnalytics, type MedidaAnalytics } from '@/lib/integracoes/ifood/painel-campos';
import type { ReactNode } from 'react';

const ESTADOS = {
  disponivel: { rotulo: 'Disponível', tom: 'ok' },
  demonstracao: { rotulo: 'Demonstração · TEST', tom: 'neutro' },
  parcial: { rotulo: 'Parcial', tom: 'alerta' },
  'sem-dados': { rotulo: 'Sem dados', tom: 'neutro' },
  atraso: { rotulo: 'Leitura em atraso', tom: 'alerta' },
  falha: { rotulo: 'Falha na leitura', tom: 'erro' },
  pausado: { rotulo: 'Pausado', tom: 'alerta' },
} as const;

const CAPACIDADES_PREVISTAS = [
  { nome: 'Produtos × CMV', dependencia: 'Linhas de pedido vinculadas às fichas técnicas.' },
  { nome: 'Repasses', dependencia: 'Repasses e recebíveis conciliados no Financial.' },
  { nome: 'Voz do Cliente', dependencia: 'Avaliações da loja com cobertura confirmada no Review.' },
];

function Indicador<T>({ rotulo, medida, formatar }: { rotulo: string; medida: MedidaAnalytics<T>; formatar: (valor: T) => string }) {
  return (
    <div className="min-w-0 rounded-lg border border-linha p-3">
      <dt className="mb-1 text-sm font-medium text-suave">{rotulo}</dt>
      <dd><MedidaDoPainel medida={medida} formatar={formatar} destaque /></dd>
    </div>
  );
}

function IndicadoresDoDia({ indicadores }: { indicadores: IndicadoresAnalytics }) {
  return (
    <dl className="grid gap-3 min-[360px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
      <Indicador rotulo="GMV de pedidos concluídos" medida={indicadores.gmvConcluido} formatar={dinheiroAnalytics} />
      <Indicador rotulo="Pedidos" medida={indicadores.pedidos} formatar={quantidadeAnalytics} />
      <Indicador rotulo="Concluídos" medida={indicadores.concluidos} formatar={quantidadeAnalytics} />
      <Indicador rotulo="Cancelados" medida={indicadores.cancelados} formatar={quantidadeAnalytics} />
      <Indicador rotulo="Ticket dos concluídos" medida={indicadores.ticketConcluidos} formatar={ticketAnalytics} />
    </dl>
  );
}

function Informacao({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-sm text-suave">{rotulo}</dt><dd className="break-words font-medium text-texto">{children}</dd></div>;
}

function VisaoGeral({ resultado }: { resultado: Extract<ResultadoConsultoriaDelivery, { ok: true }> }) {
  const { dia, loja, fonte, visaoGeral, ambiente } = resultado;
  const estado = ESTADOS[visaoGeral.estado];
  return (
    <Painel titulo="Visão geral" acessorio={<Selo tom={estado.tom}>{estado.rotulo}</Selo>}>
      <div className="space-y-5">
        <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
          <Informacao rotulo="Loja">{loja.nome}</Informacao>
          <Informacao rotulo="Marca">{fonte.marca ?? fonte.nome}</Informacao>
          <Informacao rotulo="Dia fechado">{diaAnalytics(dia)}</Informacao>
          <Informacao rotulo="Fuso">{FUSO_DO_PAINEL}</Informacao>
          <Informacao rotulo="Canal e fonte">iFood · Analytics{ambiente === 'TEST' ? ' · TEST' : ''}</Informacao>
          <Informacao rotulo="Última publicação do dia">{visaoGeral.publicadaEm ? instanteAnalytics(visaoGeral.publicadaEm) : 'Sem publicação confirmada'}</Informacao>
          <Informacao rotulo="Cobertura">{visaoGeral.cobertura
            ? `${visaoGeral.cobertura.fontesCobertas}/${visaoGeral.cobertura.fontesEsperadas} fontes com leitura no dia`
            : 'Sem cobertura confirmada'}</Informacao>
        </dl>
        <p className="text-sm leading-relaxed text-suave">{visaoGeral.mensagem}</p>
        {visaoGeral.revisaoPendente && visaoGeral.indicadores && <p className="text-sm text-suave">
          Os indicadores abaixo são da última publicação confirmada deste dia.
        </p>}
        {visaoGeral.ultimaLeituraAnterior && <p className="text-sm text-suave">
          Última leitura anterior em {diaAnalytics(visaoGeral.ultimaLeituraAnterior.dia)}, publicada em {instanteAnalytics(visaoGeral.ultimaLeituraAnterior.publicadaEm)}.
        </p>}
        {visaoGeral.indicadores && <IndicadoresDoDia indicadores={visaoGeral.indicadores} />}
      </div>
    </Painel>
  );
}

export function TelaConsultoriaDelivery({ resultado, base, inicio, teste, administracao }: {
  resultado: ResultadoConsultoriaDelivery; base: string; inicio: string; teste: boolean; administracao?: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <Voltar href={inicio}>Voltar para Áreas da Rede</Voltar>
      <PageHeader icone="consultoria" cor={COR.consultoria} titulo="Consultoria de Delivery" subtitulo={teste ? 'Prévia por loja · TEST' : 'Prévia por loja'} />
      {administracao}
      {resultado.ok ? <VisaoGeral resultado={resultado} /> : (
        <Aviso titulo={resultado.motivo === 'bloqueada' ? 'Prévia bloqueada' : 'Visão geral indisponível'}>
          {resultado.mensagem}
          {resultado.motivo === 'consulta' && <Link href={base} className="ml-2 underline underline-offset-4">Voltar à seleção inicial</Link>}
        </Aviso>
      )}
      {resultado.ok && <div className="grid gap-4 md:grid-cols-3">
        {CAPACIDADES_PREVISTAS.map(({ nome, dependencia }) => (
          <Painel key={nome} titulo={nome} acessorio={<Selo>Previsto</Selo>}>
            <p className="text-sm leading-relaxed text-suave">{dependencia}</p>
          </Painel>
        ))}
      </div>}
    </div>
  );
}
