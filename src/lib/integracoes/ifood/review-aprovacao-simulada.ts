/** INT-3.3: transições puras de um ensaio sintético. Nenhum transporte ou armazenamento. */
import { z } from 'zod';

const id = z.string().trim().min(1).max(120);
const instante = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const identidadeSchema = z.object({ parceiro: id, loja: id, avaliacao: id }).strict();
const visibilidadeSchema = z.enum(['PUBLICA', 'PRIVADA']);
const fatosSchema = z.object({ versao: id, comentario: z.string().max(10000) }).strict();
const politicaSchema = z.object({ id, versao: id, orientacao: z.string().max(10000) }).strict();
const redacaoSchema = z.object({
  fatos: fatosSchema, politica: politicaSchema, texto: z.string().min(1).max(10000).refine(valor => valor.trim().length > 0),
  visibilidade: visibilidadeSchema, editor: id,
}).strict();
const respostaSchema = z.object({ id, from: z.enum(['MERCHANT', 'CUSTOMER', 'DESCONHECIDO']), texto: z.string().max(10000) }).strict();
const observacaoSchema = z.object({
  identidade: identidadeSchema, observadoEm: instante, validoAte: instante,
  cobertura: z.enum(['COMPLETA', 'PARCIAL', 'DESCONHECIDA']),
  status: z.string().nullable(), versaoDaAvaliacao: id.nullable(),
  respostas: z.array(respostaSchema).max(1000).nullable(),
}).strict();
const preflightSchema = observacaoSchema.extend({
  elegivel: z.boolean().nullable(), prazoResponderAte: instante.nullable(),
  visibilidadePermitida: visibilidadeSchema.nullable(), politicaAtual: z.object({ id, versao: id }).strict().nullable(),
  limitesConfirmados: z.object({ minimo: z.number().int().positive(), maximo: z.number().int().positive() }).strict().nullable(),
}).strict();

export type IdentidadeReviewSimulada = z.infer<typeof identidadeSchema>;
export type RedacaoReviewSimulada = z.infer<typeof redacaoSchema>;
export type ObservacaoReviewSimulada = z.infer<typeof observacaoSchema>;
export type PreflightReviewSimulado = z.infer<typeof preflightSchema>;
type Estado = 'RASCUNHO' | 'APROVADA' | 'EM_ENVIO' | 'CONFIRMADA' | 'FALHOU' | 'INCERTA' | 'ENCERRADA_EXTERNAMENTE';
type Aprovacao = RedacaoReviewSimulada & { identidade: IdentidadeReviewSimulada; revisao: number; responsavel: string; aprovadaEm: number };
type Resultado =
  | { tipo: 'INCERTA'; motivo: 'TIMEOUT' | 'RESPOSTA_PERDIDA' }
  | { tipo: 'CONFIRMADA'; respostaId: string; prova: 'RECIBO_CORRELACIONADO_SIMULADO' }
  | { tipo: 'FALHOU'; prova: 'NAO_APLICADO_CONFIRMADO_SIMULADO' }
  | { tipo: 'ENCERRADA_EXTERNAMENTE'; respostaId: string; motivo: 'RESPOSTA_EXISTENTE_SEM_ATRIBUICAO' };
type Tentativa = {
  id: string; correlacao: string; criadaEm: number; aprovacao: Aprovacao;
  preflight: PreflightReviewSimulado; resultado: Resultado | null; historico: Resultado[];
};
type Modelo = {
  origem: 'LOCAL_SIMULATION'; identidade: IdentidadeReviewSimulada; estado: Estado; revisao: number;
  redacao: RedacaoReviewSimulada; aprovacao: Aprovacao | null; aprovacoes: Aprovacao[]; tentativas: Tentativa[];
  encerramento: {
    motivo: 'RESPOSTA_EXISTENTE_SEM_ATRIBUICAO'; respostaId: string; registradoEm: number;
    observacao: ObservacaoReviewSimulada;
  } | null;
};
type Imutavel<T> = T extends object ? { readonly [K in keyof T]: Imutavel<T[K]> } : T;
export type ReviewSimulada = Imutavel<Modelo>;

export class ErroReviewSimulada extends Error {
  constructor(public readonly codigo: string) { super(codigo); this.name = 'ErroReviewSimulada'; }
}
function exigir(ok: unknown, codigo: string): asserts ok { if (!ok) throw new ErroReviewSimulada(codigo); }
function ler<S extends z.ZodType>(schema: S, valor: unknown): z.output<S> {
  const r = schema.safeParse(valor);
  exigir(r.success, 'ENTRADA_INVALIDA');
  return r.data;
}
function congelar<T>(valor: T): Imutavel<T> {
  if (valor && typeof valor === 'object') {
    for (const parte of Object.values(valor)) congelar(parte);
    Object.freeze(valor);
  }
  return valor as Imutavel<T>;
}
function mesmaIdentidade(a: IdentidadeReviewSimulada, b: IdentidadeReviewSimulada) {
  return a.parceiro === b.parceiro && a.loja === b.loja && a.avaliacao === b.avaliacao;
}
function conferir(m: ReviewSimulada, identidade: unknown) {
  exigir(m.origem === 'LOCAL_SIMULATION', 'ORIGEM_NAO_SIMULADA');
  exigir(mesmaIdentidade(m.identidade, ler(identidadeSchema, identidade)), 'IDENTIDADE_DIVERGENTE');
}
function copiar(m: ReviewSimulada): Modelo { return structuredClone(m) as Modelo; }
function estadoPermitido(m: ReviewSimulada, estados: Estado[]) { exigir(estados.includes(m.estado), 'TRANSICAO_RECUSADA'); }
function observar(m: ReviewSimulada, entrada: unknown, agora: number): ObservacaoReviewSimulada {
  const o = ler(observacaoSchema, entrada);
  conferir(m, o.identidade);
  ler(instante, agora);
  exigir(o.observadoEm <= agora && agora < o.validoAte && o.observadoEm < o.validoAte, 'FRESCOR_NAO_CONFIRMADO');
  exigir(o.cobertura === 'COMPLETA' && o.respostas !== null && o.respostas.every(r => r.from !== 'DESCONHECIDO'), 'COBERTURA_NAO_CONFIRMADA');
  return o;
}
function ultima(m: ReviewSimulada, correlacao: unknown): Imutavel<Tentativa> {
  const t = m.tentativas.at(-1);
  exigir(t && t.correlacao === ler(id, correlacao), 'CORRELACAO_DIVERGENTE');
  return t;
}
function concluir(m: ReviewSimulada, resultado: Resultado): ReviewSimulada {
  const novo = copiar(m);
  const tentativa = novo.tentativas.at(-1);
  exigir(tentativa, 'INTENCAO_AUSENTE');
  tentativa.resultado = resultado;
  tentativa.historico.push(resultado);
  novo.estado = resultado.tipo;
  return congelar(novo);
}
function encerrar(m: ReviewSimulada, observacao: ObservacaoReviewSimulada, agora: number): ReviewSimulada {
  const resposta = observacao.respostas?.find(r => r.from === 'MERCHANT');
  exigir(resposta, 'RESPOSTA_MERCHANT_NAO_OBSERVADA');
  return congelar({ ...copiar(m), estado: 'ENCERRADA_EXTERNAMENTE', encerramento: {
    motivo: 'RESPOSTA_EXISTENTE_SEM_ATRIBUICAO', respostaId: resposta.id, registradoEm: agora, observacao,
  } });
}

export function criarReviewSimulada(entrada: unknown): ReviewSimulada {
  const e = ler(z.object({ origem: z.literal('LOCAL_SIMULATION'), identidade: identidadeSchema, redacao: redacaoSchema }).strict(), entrada);
  return congelar({ ...e, estado: 'RASCUNHO', revisao: 1, aprovacao: null, aprovacoes: [], tentativas: [], encerramento: null });
}

/** Encerra uma pendência sem fabricar intenção para uma tentativa que não ocorreu. */
export function encerrarPorRespostaExistenteReviewSimulada(m: ReviewSimulada, identidade: unknown, entrada: unknown): ReviewSimulada {
  conferir(m, identidade);
  estadoPermitido(m, ['RASCUNHO', 'APROVADA', 'FALHOU']);
  const e = ler(z.object({ agora: instante, observacao: observacaoSchema }).strict(), entrada);
  const o = observar(m, e.observacao, e.agora);
  const minimo = Math.max(m.aprovacoes.at(-1)?.aprovadaEm ?? 0, m.tentativas.at(-1)?.criadaEm ?? 0);
  exigir(o.observadoEm >= minimo, 'OBSERVACAO_ANTERIOR_A_PENDENCIA');
  return encerrar(m, o, e.agora);
}

export function editarReviewSimulada(m: ReviewSimulada, identidade: unknown, entrada: unknown): ReviewSimulada {
  conferir(m, identidade);
  estadoPermitido(m, ['RASCUNHO', 'APROVADA', 'FALHOU']);
  const redacao = ler(redacaoSchema, entrada);
  const anterior = m.redacao;
  for (const conhecida of [anterior, ...m.aprovacoes]) {
    exigir(redacao.politica.id !== conhecida.politica.id || redacao.politica.versao !== conhecida.politica.versao || redacao.politica.orientacao === conhecida.politica.orientacao, 'POLITICA_VERSAO_REUTILIZADA');
    exigir(redacao.fatos.versao !== conhecida.fatos.versao || redacao.fatos.comentario === conhecida.fatos.comentario, 'FONTE_VERSAO_REUTILIZADA');
  }
  // Até a troca do editor exige revisão: nenhuma aprovação é transferida por inferência.
  if (JSON.stringify(redacao) === JSON.stringify(anterior)) return m;
  return congelar({ ...copiar(m), redacao, revisao: m.revisao + 1, aprovacao: null, estado: 'RASCUNHO' });
}

export function aprovarReviewSimulada(m: ReviewSimulada, identidade: unknown, entrada: unknown): ReviewSimulada {
  conferir(m, identidade);
  estadoPermitido(m, ['RASCUNHO', 'FALHOU']);
  const e = ler(z.object({ papel: z.literal('HUMANO_SIMULADO'), responsavel: id, revisao: z.number().int().positive(), agora: instante }).strict(), entrada);
  exigir(e.revisao === m.revisao, 'REVISAO_DIVERGENTE');
  exigir(e.agora >= (m.tentativas.at(-1)?.criadaEm ?? 0), 'RELOGIO_ANTERIOR_A_TENTATIVA');
  const aprovacao = { ...structuredClone(m.redacao), identidade: structuredClone(m.identidade), revisao: m.revisao, responsavel: e.responsavel, aprovadaEm: e.agora };
  return congelar({ ...copiar(m), estado: 'APROVADA', aprovacao, aprovacoes: [...structuredClone(m.aprovacoes), aprovacao] });
}

export function iniciarTentativaReviewSimulada(m: ReviewSimulada, identidade: unknown, entrada: unknown): ReviewSimulada {
  conferir(m, identidade);
  estadoPermitido(m, ['APROVADA']);
  const e = ler(z.object({ id, correlacao: id, agora: instante, preflight: preflightSchema }).strict(), entrada);
  const p = e.preflight;
  const { elegivel, prazoResponderAte, visibilidadePermitida, politicaAtual, limitesConfirmados, ...observacao } = p;
  const o = observar(m, observacao, e.agora);
  const a = m.aprovacao;
  exigir(a && a.revisao === m.revisao && a.aprovadaEm <= e.agora && o.observadoEm >= a.aprovadaEm, 'APROVACAO_NAO_VIGENTE');
  if (o.respostas?.some(r => r.from === 'MERCHANT')) {
    return encerrarPorRespostaExistenteReviewSimulada(m, identidade, { agora: e.agora, observacao: o });
  }
  exigir(o.status === 'NOT_REPLIED', 'RESPOSTA_EXISTENTE_OU_STATUS');
  exigir(o.versaoDaAvaliacao === a.fatos.versao && politicaAtual?.id === a.politica.id && politicaAtual?.versao === a.politica.versao, 'VERSAO_DIVERGENTE');
  exigir(elegivel === true && prazoResponderAte !== null && e.agora < prazoResponderAte, 'ELEGIBILIDADE_NAO_CONFIRMADA');
  exigir(visibilidadePermitida === a.visibilidade, 'VISIBILIDADE_NAO_CONFIRMADA');
  const tamanho = Array.from(a.texto).length;
  exigir(limitesConfirmados && limitesConfirmados.minimo <= limitesConfirmados.maximo && tamanho >= limitesConfirmados.minimo && tamanho <= limitesConfirmados.maximo, 'LIMITE_TEXTO_NAO_CONFIRMADO');
  exigir(!m.tentativas.some(t => t.id === e.id || t.correlacao === e.correlacao), 'INTENCAO_REUTILIZADA');
  const tentativa = { id: e.id, correlacao: e.correlacao, criadaEm: e.agora, aprovacao: structuredClone(a), preflight: p, resultado: null, historico: [] };
  return congelar({ ...copiar(m), estado: 'EM_ENVIO', tentativas: [...structuredClone(m.tentativas), tentativa] });
}

export function registrarResultadoReviewSimulada(m: ReviewSimulada, identidade: unknown, entrada: unknown): ReviewSimulada {
  conferir(m, identidade);
  estadoPermitido(m, ['EM_ENVIO']);
  const e = ler(z.discriminatedUnion('tipo', [
    z.object({ tipo: z.literal('INCERTA'), correlacao: id, motivo: z.enum(['TIMEOUT', 'RESPOSTA_PERDIDA']) }).strict(),
    z.object({ tipo: z.literal('CONFIRMADA'), correlacao: id, respostaId: id, prova: z.literal('RECIBO_CORRELACIONADO_SIMULADO') }).strict(),
    z.object({ tipo: z.literal('FALHOU'), correlacao: id, prova: z.literal('NAO_APLICADO_CONFIRMADO_SIMULADO') }).strict(),
  ]), entrada);
  ultima(m, e.correlacao);
  if (e.tipo === 'INCERTA') return concluir(m, { tipo: e.tipo, motivo: e.motivo });
  if (e.tipo === 'FALHOU') return concluir(m, { tipo: e.tipo, prova: e.prova });
  return concluir(m, { tipo: e.tipo, respostaId: e.respostaId, prova: e.prova });
}

export function reconciliarReviewSimulada(m: ReviewSimulada, identidade: unknown, entrada: unknown): ReviewSimulada {
  conferir(m, identidade);
  estadoPermitido(m, ['INCERTA']);
  const e = ler(z.object({
    correlacao: id, agora: instante, observacao: observacaoSchema,
    prova: z.discriminatedUnion('tipo', [
      z.object({ tipo: z.literal('SEM_PROVA_CONCLUSIVA') }).strict(),
      z.object({ tipo: z.literal('RECIBO_CORRELACIONADO_SIMULADO'), correlacao: id, respostaId: id }).strict(),
      z.object({ tipo: z.literal('NAO_APLICADO_CONFIRMADO_SIMULADO'), correlacao: id }).strict(),
    ]),
  }).strict(), entrada);
  const t = ultima(m, e.correlacao);
  const o = observar(m, e.observacao, e.agora);
  exigir(o.observadoEm >= t.criadaEm, 'OBSERVACAO_ANTERIOR_A_TENTATIVA');
  const respostas = o.respostas!.filter(r => r.from === 'MERCHANT');
  if (e.prova.tipo !== 'SEM_PROVA_CONCLUSIVA') exigir(e.prova.correlacao === t.correlacao, 'CORRELACAO_DIVERGENTE');
  if (e.prova.tipo === 'RECIBO_CORRELACIONADO_SIMULADO') {
    const prova = e.prova;
    exigir(respostas.some(r => r.id === prova.respostaId), 'RECIBO_NAO_RECONCILIADO');
    return concluir(m, { tipo: 'CONFIRMADA', respostaId: prova.respostaId, prova: prova.tipo });
  }
  // Texto igual, nota e NOT_REPLIED não atribuem autoria ao envio simulado.
  if (respostas.length) {
    const concluida = concluir(m, { tipo: 'ENCERRADA_EXTERNAMENTE', respostaId: respostas[0].id, motivo: 'RESPOSTA_EXISTENTE_SEM_ATRIBUICAO' });
    return encerrar(concluida, o, e.agora);
  }
  if (e.prova.tipo === 'NAO_APLICADO_CONFIRMADO_SIMULADO') {
    exigir(o.status === 'NOT_REPLIED', 'PROVA_CONTRADITORIA');
    return concluir(m, { tipo: 'FALHOU', prova: e.prova.tipo });
  }
  // Uma leitura vazia, mesmo completa/fresca, pode preceder a propagação da escrita.
  return m;
}
