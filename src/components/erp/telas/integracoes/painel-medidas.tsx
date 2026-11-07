import type { MedidaAnalytics, MotivoSemDadoAnalytics } from '@/lib/integracoes/ifood/painel-campos';

export const AUSENCIA_ANALYTICS: Record<MotivoSemDadoAnalytics, string> = {
  'cobertura-parcial': 'Falta cobertura de uma ou mais fontes no período.',
  'sem-fontes': 'Nenhuma fonte disponível para esta seleção.',
  'valor-nao-informado': 'O provedor não informou todos os valores necessários.',
  'sem-pedidos': 'Não há pedidos no denominador desta medida.',
  'status-nao-classificado': 'Há pedidos com status não informado ou ainda não classificado.',
  'contrato-indisponivel': 'Esta distribuição ainda não está disponível.',
};

export function MedidaDoPainel<T>({ medida, formatar, destaque = false }: { medida: MedidaAnalytics<T>; formatar: (valor: T) => string; destaque?: boolean }) {
  return medida.estado === 'disponivel'
    ? <span className={`block min-w-0 whitespace-normal tabular-nums [overflow-wrap:anywhere] ${destaque ? 'font-display text-[24px] font-bold leading-tight text-texto' : 'text-sm font-medium text-texto'}`}>{formatar(medida.valor)}</span>
    : <span className="block space-y-1"><span className={destaque ? 'block text-lg font-medium text-suave' : 'block text-sm text-suave'}>Sem dado</span><span className="block text-[12px] font-normal leading-relaxed text-suave">{AUSENCIA_ANALYTICS[medida.motivo]}</span></span>;
}
