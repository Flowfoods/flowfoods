import { lerIdDaLojaIfood } from '../core/campos';
import { lerJsonFinancialV3, NumeroJsonFinancial } from './financial-v3-json';
import { diaDoPainelValido } from './painel-campos';

type EscopoConciliacaoV3 = Readonly<{ merchantId: string; competencia: string }>;
export type ProtocoloConciliacaoV3 = EscopoConciliacaoV3 & { readonly requestId: string };
export type ConsultaConciliacaoV3 = {
  readonly estado: 'PROCESSANDO' | 'DISPONIVEL' | 'SEM_LANCAMENTOS';
};

export class ErroRespostaConciliacaoV3 extends Error {
  constructor(readonly codigo: 'PEDIDO' | 'ESTRUTURA' | 'ESCOPO_DIVERGENTE' | 'PROTOCOLO_DIVERGENTE' | 'FALHA_GERACAO') {
    super(codigo === 'FALHA_GERACAO' ? 'O provedor informou uma falha na geração do relatório.'
      : 'Pedido ou resposta de conciliação incompatível com o contrato suportado.');
    this.name = 'ErroRespostaConciliacaoV3';
  }
}

export function conferirEscopoConciliacaoV3(escopo: EscopoConciliacaoV3): EscopoConciliacaoV3 {
  const merchantId = lerIdDaLojaIfood(escopo?.merchantId);
  const competencia = escopo?.competencia;
  if (!merchantId || typeof competencia !== 'string' || !diaDoPainelValido(competencia + '-01')) {
    throw new ErroRespostaConciliacaoV3('PEDIDO');
  }
  return { merchantId, competencia };
}

/** String opaca em um segmento de URL. Limite local de 1 a 128 caracteres não reservados, exceto "." e "..". */
export function requestIdConciliacaoValido(valor: unknown): valor is string {
  return typeof valor === 'string' && valor !== '.' && valor !== '..' && /^[A-Za-z0-9._~-]{1,128}$/.test(valor);
}

function objetoDaResposta(corpo: string): Record<string, unknown> {
  const valor = lerJsonFinancialV3(corpo);
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor) || valor instanceof NumeroJsonFinancial) {
    throw new ErroRespostaConciliacaoV3('ESTRUTURA');
  }
  return valor as Record<string, unknown>;
}

function conferirEcosDeEscopo(objeto: Record<string, unknown>, escopo: EscopoConciliacaoV3): void {
  if (Object.hasOwn(objeto, 'merchantId') &&
      (typeof objeto.merchantId !== 'string' || objeto.merchantId.toLowerCase() !== escopo.merchantId)) {
    throw new ErroRespostaConciliacaoV3('ESCOPO_DIVERGENTE');
  }
  for (const campo of ['competence', 'competencia']) {
    if (Object.hasOwn(objeto, campo) && objeto[campo] !== escopo.competencia) {
      throw new ErroRespostaConciliacaoV3('ESCOPO_DIVERGENTE');
    }
  }
}

function conferirEcosDeId(objeto: Record<string, unknown>, requestId: string): void {
  for (const campo of ['id', 'requestId']) {
    if (Object.hasOwn(objeto, campo) && objeto[campo] !== requestId) {
      throw new ErroRespostaConciliacaoV3('PROTOCOLO_DIVERGENTE');
    }
  }
}

/** Vincula o identificador retornado pelo POST ao merchant e à competência solicitados. */
export function lerProtocoloConciliacaoV3(corpo: string, escopo: EscopoConciliacaoV3): ProtocoloConciliacaoV3 {
  const pedido = conferirEscopoConciliacaoV3(escopo);
  const objeto = objetoDaResposta(corpo);
  conferirEcosDeEscopo(objeto, pedido);
  if (!requestIdConciliacaoValido(objeto.requestId)) throw new ErroRespostaConciliacaoV3('ESTRUTURA');
  conferirEcosDeId(objeto, objeto.requestId);
  return { ...pedido, requestId: objeto.requestId };
}

/** O guia pode informar o protocolo anterior no 409. O exemplo da referência omite esse identificador. */
export function ultimoRequestIdConciliacaoV3(corpo: string, escopo: EscopoConciliacaoV3): string | null {
  const pedido = conferirEscopoConciliacaoV3(escopo);
  if (corpo === '') return null;
  const objeto = objetoDaResposta(corpo);
  conferirEcosDeEscopo(objeto, pedido);
  if (!Object.hasOwn(objeto, 'lastRequestId')) return null;
  if (!requestIdConciliacaoValido(objeto.lastRequestId)) throw new ErroRespostaConciliacaoV3('ESTRUTURA');
  return objeto.lastRequestId;
}

function linkHttps(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !/^https:\/\//i.test(valor) || /[\s\\]/.test(valor)) return false;
  try {
    const url = new URL(valor);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** A referência usa downloadPath nos exemplos e filePath no schema. O guia usa downloadUrl. */
function arquivoInformado(objeto: Record<string, unknown>): boolean {
  let link: string | undefined;
  for (const campo of ['downloadPath', 'filePath', 'downloadUrl']) {
    const valor = objeto[campo];
    if (valor == null) continue;
    if (!linkHttps(valor) || (link !== undefined && valor !== link)) {
      throw new ErroRespostaConciliacaoV3('ESTRUTURA');
    }
    link = valor;
  }
  return link !== undefined;
}

const semLancamentos = 'No financial entries found for the specified merchant and competence.';
const prefixoSemLancamentos = 'File generation failed: No financial entries exist for merchant ';
const sufixoSemLancamentos = ' in the requested time frame.';

function mensagemSemLancamentos(valor: unknown, merchantId: string): boolean {
  if (valor === semLancamentos) return true;
  if (typeof valor !== 'string' || !valor.startsWith(prefixoSemLancamentos) || !valor.endsWith(sufixoSemLancamentos)) return false;
  const merchantInformado = valor.slice(prefixoSemLancamentos.length, -sufixoSemLancamentos.length);
  return merchantInformado.toLowerCase() === merchantId;
}

/** Uma leitura do estado da geração. O link temporário fica restrito à validação do corpo. */
export function lerConsultaConciliacaoV3(
  status: 200 | 202, corpo: string, protocolo: ProtocoloConciliacaoV3,
): ConsultaConciliacaoV3 {
  const escopo = conferirEscopoConciliacaoV3(protocolo);
  if ((status !== 200 && status !== 202) || !requestIdConciliacaoValido(protocolo.requestId)) {
    throw new ErroRespostaConciliacaoV3('PEDIDO');
  }
  if (status === 202 && corpo === '') return { estado: 'PROCESSANDO' };
  const objeto = objetoDaResposta(corpo);
  conferirEcosDeEscopo(objeto, escopo);
  conferirEcosDeId(objeto, protocolo.requestId);
  const temArquivo = arquivoInformado(objeto);
  const mensagens = [objeto.message, objeto.errorMessage].filter(valor => valor != null);
  const estado = objeto.status;
  const intermediario = estado === 'created' || estado === 'enqueue';
  // O guia usa o HTTP 202 como sinal de espera. Uma mensagem informativa pode acompanhar a resposta.
  if (status === 202 && !temArquivo && (estado === undefined || intermediario) && objeto.errorMessage == null
      && (objeto.message == null || (typeof objeto.message === 'string' && !mensagemSemLancamentos(objeto.message, escopo.merchantId)))) {
    return { estado: 'PROCESSANDO' };
  }
  if (estado === 'error' && status === 200 && !temArquivo && mensagens.every(valor => typeof valor === 'string')) {
    if (mensagens.length && mensagens.every(valor => mensagemSemLancamentos(valor, escopo.merchantId))) {
      return { estado: 'SEM_LANCAMENTOS' };
    }
    throw new ErroRespostaConciliacaoV3('FALHA_GERACAO');
  }
  if (mensagens.length === 0) {
    if (!temArquivo && intermediario) {
      return { estado: 'PROCESSANDO' };
    }
    if (status === 200 && temArquivo && (estado === 'processed' || (estado === undefined && objeto.downloadUrl != null))) {
      return { estado: 'DISPONIVEL' };
    }
  }
  throw new ErroRespostaConciliacaoV3('ESTRUTURA');
}
