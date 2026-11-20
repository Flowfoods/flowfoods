/** INT-3.2: páginas abstratas de fixtures; nenhum payload, cursor ou transporte do provedor. */
import { z } from 'zod';

const id = z.string().min(1).max(120).refine(v => v.trim() === v && v.length > 0);
const instante = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const identidade = z.object({ parceiro: id, loja: id }).strict();
const intervalo = z.object({ inicio: instante, fim: instante }).strict().refine(v => v.inicio < v.fim);
const registro = z.object({
  id, versao: id, criadoEm: instante, conteudoSintetico: z.string().max(10000),
  elegibilidade: z.enum(['ELEGIVEL', 'INELEGIVEL', 'DESCONHECIDA']),
}).strict();
const contexto = {
  consultaId: id, execucaoId: id, identidade, intervalo,
};
const basePagina = { ...contexto, id, observadaEm: instante };
const pagina = z.discriminatedUnion('tipo', [
  z.object({ ...basePagina, tipo: z.literal('OK'), snapshotId: id.nullable(), validaAte: instante.nullable(),
    proxima: z.discriminatedUnion('tipo', [
      z.object({ tipo: z.literal('PAGINA'), id }).strict(),
      z.object({ tipo: z.literal('FIM') }).strict(),
      z.object({ tipo: z.literal('DESCONHECIDA') }).strict(),
    ]), registros: z.array(registro).max(1000),
  }).strict(),
  z.object({ ...basePagina, tipo: z.literal('ERRO') }).strict(),
  z.object({ ...basePagina, tipo: z.literal('SEM_ACESSO') }).strict(),
]);
const entrada = z.object({
  origem: z.literal('LOCAL_SIMULATION'), ...contexto, snapshotId: id.nullable(),
  iniciadaEm: instante, agora: instante, primeiraPagina: id, paginas: z.array(pagina).max(1000),
}).strict().refine(v => v.iniciadaEm <= v.agora);

export type EntradaCoberturaReviewSimulada = z.infer<typeof entrada>;
export type PaginaReviewSimulada = z.infer<typeof pagina>;
export type RegistroReviewSimulado = z.infer<typeof registro>;
type Problema =
  | 'SEM_PAGINAS' | 'PAGINA_AUSENTE' | 'PAGINA_ORFA' | 'CICLO' | 'TERMINACAO_DESCONHECIDA'
  | 'ERRO_COLETA' | 'SEM_ACESSO' | 'FRESCOR_DESCONHECIDO' | 'OBSERVACAO_VENCIDA'
  | 'CONTEXTO_DIVERGENTE' | 'SNAPSHOT_DIVERGENTE' | 'SNAPSHOT_DESCONHECIDO'
  | 'RELOGIO_INCONSISTENTE' | 'PAGINA_REPETIDA_DIVERGENTE' | 'REGISTRO_REPETIDO_DIVERGENTE'
  | 'REGISTRO_FORA_INTERVALO' | 'INTERVALO_AINDA_ABERTO';
type Imutavel<T> = T extends object ? { readonly [K in keyof T]: Imutavel<T[K]> } : T;
function congelar<T>(valor: T): Imutavel<T> {
  if (valor && typeof valor === 'object') {
    Object.values(valor).forEach(congelar);
    Object.freeze(valor);
  }
  return valor as Imutavel<T>;
}
function igual(a: unknown, b: unknown) { return JSON.stringify(a) === JSON.stringify(b); }

export class ErroCoberturaReviewSimulada extends Error {
  constructor() { super('ENTRADA_SIMULADA_INVALIDA'); this.name = 'ErroCoberturaReviewSimulada'; }
}

export function conferirCoberturaReviewSimulada(valor: unknown) {
  const parse = entrada.safeParse(valor);
  if (!parse.success) throw new ErroCoberturaReviewSimulada();
  const e = parse.data;
  const problemas = new Set<Problema>();
  let inconsistente = false;
  function problema(codigo: Problema, invalida = false) { problemas.add(codigo); inconsistente ||= invalida; }
  const paginas = new Map<string, PaginaReviewSimulada>();
  const snapshots = new Set<string>();
  let paginasRepetidas = 0;
  if (!e.paginas.length) problema('SEM_PAGINAS');
  if (e.snapshotId === null) problema('SNAPSHOT_DESCONHECIDO');
  if (e.intervalo.fim > e.iniciadaEm) problema('INTERVALO_AINDA_ABERTO');
  for (const p of e.paginas) {
    if (p.consultaId !== e.consultaId || p.execucaoId !== e.execucaoId || !igual(p.identidade, e.identidade) || !igual(p.intervalo, e.intervalo)) problema('CONTEXTO_DIVERGENTE', true);
    if (p.observadaEm < e.iniciadaEm || p.observadaEm > e.agora) problema('RELOGIO_INCONSISTENTE', true);
    const anterior = paginas.get(p.id);
    if (anterior) {
      if (!igual(anterior, p)) problema('PAGINA_REPETIDA_DIVERGENTE', true);
      else paginasRepetidas++;
    } else paginas.set(p.id, p);
    if (p.tipo !== 'OK') { problema(p.tipo === 'ERRO' ? 'ERRO_COLETA' : 'SEM_ACESSO'); continue; }
    if (p.snapshotId === null) problema('SNAPSHOT_DESCONHECIDO');
    else {
      snapshots.add(p.snapshotId);
      if ((e.snapshotId !== null && p.snapshotId !== e.snapshotId) || snapshots.size > 1) problema('SNAPSHOT_DIVERGENTE', true);
    }
    if (p.validaAte === null) problema('FRESCOR_DESCONHECIDO');
    else if (p.validaAte <= p.observadaEm) problema('RELOGIO_INCONSISTENTE', true);
    else if (e.agora >= p.validaAte) problema('OBSERVACAO_VENCIDA');
  }

  const visitadas = new Set<string>();
  let atual = e.primeiraPagina;
  let terminou = false;
  while (true) {
    if (visitadas.has(atual)) { problema('CICLO'); break; }
    const p = paginas.get(atual);
    if (!p) { problema('PAGINA_AUSENTE'); break; }
    visitadas.add(atual);
    if (p.tipo !== 'OK') break;
    if (p.proxima.tipo === 'FIM') { terminou = true; break; }
    if (p.proxima.tipo === 'DESCONHECIDA') { problema('TERMINACAO_DESCONHECIDA'); break; }
    atual = p.proxima.id;
  }
  if ([...paginas.keys()].some(chave => !visitadas.has(chave))) problema('PAGINA_ORFA');

  const unicos = new Map<string, RegistroReviewSimulado>();
  let recebidos = 0;
  let repetidos = 0;
  for (const p of paginas.values()) {
    if (p.tipo !== 'OK') continue;
    for (const r of p.registros) {
      recebidos++;
      if (r.criadoEm < e.intervalo.inicio || r.criadoEm >= e.intervalo.fim) problema('REGISTRO_FORA_INTERVALO', true);
      const anterior = unicos.get(r.id);
      if (anterior) {
        if (igual(anterior, r)) repetidos++;
        else problema('REGISTRO_REPETIDO_DIVERGENTE', true);
      } else unicos.set(r.id, r);
    }
  }
  const registros = [...unicos.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const temPaginaOk = [...paginas.values()].some(p => p.tipo === 'OK');
  const observado = inconsistente || !temPaginaOk ? null : {
    recebidos, repetidos, unicos: registros.length,
    elegiveisConfirmados: registros.filter(r => r.elegibilidade === 'ELEGIVEL').length,
    inelegiveisConfirmados: registros.filter(r => r.elegibilidade === 'INELEGIVEL').length,
    pendentesDeClassificacao: registros.filter(r => r.elegibilidade === 'DESCONHECIDA').length,
  };
  const completa = terminou && problemas.size === 0;
  const totais = completa && observado ? {
    avaliacoes: observado.unicos,
    elegiveis: observado.pendentesDeClassificacao ? null : observado.elegiveisConfirmados,
    inelegiveis: observado.pendentesDeClassificacao ? null : observado.inelegiveisConfirmados,
    pendentesDeClassificacao: observado.pendentesDeClassificacao,
  } : null;
  const instantes = e.paginas.map(p => p.observadaEm);
  return congelar({
    origem: e.origem, consultaId: e.consultaId, execucaoId: e.execucaoId, identidade: e.identidade,
    snapshotId: e.snapshotId, intervaloSolicitado: e.intervalo,
    intervaloCoberto: completa ? e.intervalo : null,
    cobertura: inconsistente ? 'INCONSISTENTE' as const : completa ? 'COMPLETA' as const : 'INCOMPLETA' as const,
    problemas: [...problemas].sort(),
    ultimaConsultaEm: inconsistente || !instantes.length ? null : Math.max(...instantes),
    paginasRecebidas: e.paginas.length, paginasDistintas: paginas.size, paginasRepetidas,
    observado, totais, vaziaConfirmada: totais ? totais.avaliacoes === 0 : null,
    registrosObservados: observado ? registros : null,
  });
}
