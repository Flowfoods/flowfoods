import { diasDoMes, totalizar, type CanalVenda, type GraoLido } from '@/lib/erp/faturamento-campos';
import type { MesDoFaturamento } from '@/lib/erp/faturamento';
import type { ContextoHomeLoja } from '@/lib/erp/home-analitico';

export const contextoCanaisHome: ContextoHomeLoja = {
  alcance: { nivel: 'LOJA', lojas: ['lojab'], permissoes: new Set(['faturamento.ver']) },
  loja: { id: 'lojab', nome: 'Loja B sintética' }, raiz: '/erp', hoje: '2026-10-30', consultadoEm: '2026-10-30T15:00:00Z',
};

/** Fixtures de leitura, sempre montadas pelos totalizadores canônicos. */
export function mesDosCanaisHome(
  valores: Partial<Record<CanalVenda, number>> = { LOJA: 10000, DELIVERY_PROPRIO: 0, IFOOD: 30000 },
  configurados: CanalVenda[] = ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'],
): MesDoFaturamento {
  const dias = diasDoMes('2026-10');
  const canais = Object.fromEntries(Object.entries(valores).map(([canal, valorCentavos]) => [canal, {
    valorCentavos, pedidos: valorCentavos ? 1 : 0, clientes: valorCentavos ? 1 : 0, fonte: 'HUMANO', conferencia: null,
  }])) as Partial<Record<CanalVenda, GraoLido>>;
  const total = totalizar(Object.values(canais));
  const porCanal = {
    LOJA: totalizar(canais.LOJA ? [canais.LOJA] : []),
    DELIVERY_PROPRIO: totalizar(canais.DELIVERY_PROPRIO ? [canais.DELIVERY_PROPRIO] : []),
    IFOOD: totalizar(canais.IFOOD ? [canais.IFOOD] : []),
  };
  return {
    mes: '2026-10', hoje: contextoCanaisHome.hoje, dias, total, porCanal, faltas: 0, temIntegracao: false,
    lojas: [{
      loja: { id: contextoCanaisHome.loja.id, nome: contextoCanaisHome.loja.nome, ativa: true, canais: configurados },
      primeiraData: Object.keys(canais).length ? contextoCanaisHome.hoje : null, total, porCanal, faltas: 0,
      faltasPorCanal: { LOJA: 0, DELIVERY_PROPRIO: 0, IFOOD: 0 },
      dias: dias.map(data => ({ data, canais: data === contextoCanaisHome.hoje ? canais : {},
        total: data === contextoCanaisHome.hoje && Object.keys(canais).length ? total : null,
        faltam: [], emAberto: data === contextoCanaisHome.hoje, futuro: data > contextoCanaisHome.hoje })),
    }],
  };
}
