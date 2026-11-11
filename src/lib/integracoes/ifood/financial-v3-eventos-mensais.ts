import { lerIdDaLojaIfood } from '../core/campos';
import { conferirEscopoConciliacaoV3, type ProtocoloConciliacaoV3 } from './financial-v3-conciliacao-resposta';
import type { consultarEventosFinancialV3 } from './financial-v3-consultas';
import { diaDoPainelValido } from './painel-campos';

export type EventosConsultados = Awaited<ReturnType<typeof consultarEventosFinancialV3>>;
type Consulta = EventosConsultados['consulta'];

export type MotivoEventosMensaisV3 =
  | 'EVENTOS_AUSENTES' | 'LOJA_DIVERGENTE' | 'JANELA_EVENTOS_DIVERGENTE' | 'RECEBEDOR_FORA_DA_LOJA'
  | 'COMPETENCIA_EVENTO_INCOMPATIVEL' | 'PRODUTO_INCOMPATIVEL' | 'IMPACTO_EVENTO_DESCONHECIDO' | 'VALOR_EVENTO_DESCONHECIDO';

export function janelaDaCompetencia(consulta: Consulta, competencia: string | undefined): boolean {
  const inicio = competencia + '-01';
  if (!diaDoPainelValido(inicio)) return false;
  const ultimoDia = new Date(inicio + 'T00:00:00Z');
  ultimoDia.setUTCMonth(ultimoDia.getUTCMonth() + 1, 0);
  return consulta.inicio === inicio && consulta.fim === ultimoDia.toISOString().slice(0, 10);
}

export function mesmaLoja(a: string | undefined, b: string | undefined): boolean {
  const id = lerIdDaLojaIfood(a);
  return id !== null && id === lerIdDaLojaIfood(b);
}

export function mesmoIntervalo(a?: Consulta | null, b?: Consulta | null): boolean {
  return !!a && !!b && mesmaLoja(a.merchantId, b.merchantId) && a.inicio === b.inicio && a.fim === b.fim;
}

export function somarEventosMensaisV3(
  fonte: EventosConsultados | null,
  escopoEsperado: Pick<ProtocoloConciliacaoV3, 'merchantId' | 'competencia'> | undefined,
  produto: string | null | undefined,
  motivos: { add(motivo: MotivoEventosMensaisV3): void },
): bigint {
  if (fonte == null) {
    motivos.add('EVENTOS_AUSENTES');
    return 0n;
  }
  const { consulta, eventos, paginasLidas } = fonte;
  if (!Number.isSafeInteger(paginasLidas) || paginasLidas < 1 || !Array.isArray(eventos) || !lerIdDaLojaIfood(consulta?.merchantId)
      || !diaDoPainelValido(consulta.inicio) || !diaDoPainelValido(consulta.fim) || consulta.fim < consulta.inicio) {
    throw new Error('Resultado de consulta de eventos Financial v3 inválido.');
  }
  if (escopoEsperado) {
    const escopo = conferirEscopoConciliacaoV3(escopoEsperado);
    if (!mesmaLoja(consulta.merchantId, escopo.merchantId)) motivos.add('LOJA_DIVERGENTE');
    if (!janelaDaCompetencia(consulta, escopo.competencia)) motivos.add('JANELA_EVENTOS_DIVERGENTE');
  }
  let soma = 0n;
  for (const evento of eventos) {
    if (!evento || (evento.impactoNoRepasse !== null && typeof evento.impactoNoRepasse !== 'boolean')
        || (evento.valorCentavos !== null && typeof evento.valorCentavos !== 'bigint')
        || (evento.produto !== null && typeof evento.produto !== 'string')
        || (evento.competencia !== null && !diaDoPainelValido(evento.competencia + '-01'))) {
      throw new Error('Ocorrência de eventos Financial v3 inválida.');
    }
    if (evento.recebedorForaDaLoja) motivos.add('RECEBEDOR_FORA_DA_LOJA');
    if (evento.competencia === null || evento.competencia !== escopoEsperado?.competencia) motivos.add('COMPETENCIA_EVENTO_INCOMPATIVEL');
    if (!evento.produto || evento.produto !== produto) motivos.add('PRODUTO_INCOMPATIVEL');
    if (evento.impactoNoRepasse === null) motivos.add('IMPACTO_EVENTO_DESCONHECIDO');
    if (evento.impactoNoRepasse === true) {
      if (evento.valorCentavos === null) motivos.add('VALOR_EVENTO_DESCONHECIDO');
      else soma += evento.valorCentavos;
    }
  }
  return soma;
}
