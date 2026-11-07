/** Mapper puro de snapshots persistidos; nenhuma consulta, autorização ou escrita. */
import { LIMITES_DO_FATURAMENTO } from '@/lib/erp/faturamento-campos';
import { diaSeguinte } from './datas';
import {
  VERSAO_MAPA_FATURAMENTO_ANALYTICS,
  type MapaFaturamentoAnalytics, type MotivoMapaFaturamento, type SnapshotFinanceiro,
} from './faturamento-tipos';

export { VERSAO_MAPA_FATURAMENTO_ANALYTICS } from './faturamento-tipos';
export type { SnapshotFinanceiro, MapaFaturamentoAnalytics, MotivoMapaFaturamento } from './faturamento-tipos';

const pendente = (motivo: MotivoMapaFaturamento): MapaFaturamentoAnalytics => ({ estado: 'pendente', motivo });
const MAXIMO_SEGURO = BigInt(Number.MAX_SAFE_INTEGER);
const inteiro = (n: unknown): n is bigint => typeof n === 'bigint' && n >= 0n && n <= MAXIMO_SEGURO;
const texto = (s: unknown): s is string => typeof s === 'string' && s.length > 0 && s.length <= 200;

/**
 * Receita provisória aprovada: gmvWithoutDelivery dos concluídos iFood.
 * FOOD/IFOOD_DELIVERY constam nos exemplos V1GroupByKeys da documentação;
 * a homologação também explicita MERCHANT_DELIVERY:
 * https://developer.ifood.com.br/en-US/docs/food/guides/modules/analytics/endpoints
 * https://developer.ifood.com.br/en-US/docs/food/guides/modules/analytics/homologation
 * Outros recortes permanecem pendentes; não são inferidos da fixture TEST.
 */
export function mapearSnapshotParaFaturamento(s: SnapshotFinanceiro): MapaFaturamentoAnalytics {
  if (!s || !texto(s.id) || !texto(s.parceiroId) || !texto(s.lojaId) || !texto(s.merchantId)
    || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(s.merchantId)
    || s.provedor !== 'IFOOD' || s.ambiente !== 'PRODUCAO' || s.perfil !== 'diario'
    || s.origem !== 'IFOOD_ANALYTICS_V1' || s.fuso !== 'America/Sao_Paulo'
    || !/^[a-f0-9]{64}$/.test(s.hash) || !diaSeguinte(s.dia) || s.dia < LIMITES_DO_FATURAMENTO.dataMinima) {
    return pendente('IDENTIDADE');
  }
  if (s.situacao !== 'PUBLICADO') return pendente('SNAPSHOT_NAO_PUBLICADO');
  if (!Array.isArray(s.linhas) || !Number.isSafeInteger(s.numeroGrupos) || s.numeroGrupos < 0
    || s.numeroGrupos !== s.linhas.length || s.vazioOficial !== (s.linhas.length === 0)
    || !inteiro(s.pedidos)) return pendente('SNAPSHOT_INCOMPLETO');

  let contagemCompleta = 0n;
  const chaves = new Set<string>();
  for (const l of s.linhas) {
    if (!l || !/^[a-f0-9]{64}$/.test(l.chaveGrupo) || chaves.has(l.chaveGrupo)) return pendente('SNAPSHOT_INCOMPLETO');
    chaves.add(l.chaveGrupo);
    if (!inteiro(l.pedidos)) return pendente('NUMEROS_INVALIDOS');
    contagemCompleta += l.pedidos;
  }
  if (contagemCompleta !== s.pedidos) return pendente('SNAPSHOT_INCOMPLETO');

  let valor = 0n, pedidos = 0n;
  for (const l of s.linhas) {
    // Exclusões comprovadas, sem inferir o significado de um enum desconhecido.
    if (l.orderStatus === 'CANCELLED' || l.salesChannel === 'DIGITAL_CATALOG' || l.salesChannel === 'POS') continue;
    if (l.orderStatus !== 'CONCLUDED' || l.salesChannel !== 'IFOOD' || l.category !== 'FOOD'
      || (l.deliveredBy !== 'IFOOD_DELIVERY' && l.deliveredBy !== 'MERCHANT_DELIVERY')) {
      return pendente('RECORTE_NAO_MAPEADO');
    }
    if (l.gmvWithoutDelivery === null) return pendente('VALOR_AUSENTE');
    if (!inteiro(l.gmvWithoutDelivery) || (l.gmvWithoutDelivery > 0n && l.pedidos === 0n)) return pendente('NUMEROS_INVALIDOS');
    valor += l.gmvWithoutDelivery;
    pedidos += l.pedidos;
  }
  if (valor > BigInt(LIMITES_DO_FATURAMENTO.valorCentavos) || pedidos > BigInt(LIMITES_DO_FATURAMENTO.quantidade)) {
    return pendente('LIMITE_FATURAMENTO');
  }
  // Zero com pedidos positivos é permitido pelo destino integrado; não usa o parser humano.
  return { estado: 'apto', valorCentavos: Number(valor), pedidos: Number(pedidos), clientes: null, versaoMapa: VERSAO_MAPA_FATURAMENTO_ANALYTICS };
}
