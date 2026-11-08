/** Registro humano do parecer externo. Validar o formulário não homologa o app no iFood. */
export const ESTADOS_DO_PARECER = ['PENDENTE', 'EM_ANDAMENTO', 'HOMOLOGADO', 'RECUSADO'] as const;
export type EstadoDoParecer = typeof ESTADOS_DO_PARECER[number];
export interface ParecerDoApp {
  estado: EstadoDoParecer;
  validacaoEm: string | null;
  liberacaoEm: string | null;
  referencia: string;
}

function diaValido(x: string, hoje: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(x) && x >= '2020-01-01' && x <= hoje
    && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x;
}

export function lerParecer(entrada: Record<string, unknown>, hoje: string):
  { ok: true; dados: ParecerDoApp } | { ok: false; erros: Record<string, string> } {
  const erros: Record<string, string> = {};
  const estado = entrada.estado as EstadoDoParecer;
  if (!ESTADOS_DO_PARECER.includes(estado)) erros.estado = 'Escolha a situação informada pelo iFood.';
  const validacaoEm = typeof entrada.validacaoEm === 'string' ? entrada.validacaoEm.trim() : '';
  const liberacaoEm = typeof entrada.liberacaoEm === 'string' ? entrada.liberacaoEm.trim() : '';
  if (validacaoEm && !diaValido(validacaoEm, hoje)) erros.validacaoEm = 'Informe uma data válida, até hoje.';
  if (liberacaoEm && !diaValido(liberacaoEm, hoje)) erros.liberacaoEm = 'Informe uma data válida, até hoje.';
  if (estado === 'HOMOLOGADO') {
    if (!validacaoEm) erros.validacaoEm = 'Informe quando a validação técnica foi aprovada.';
    if (!liberacaoEm) erros.liberacaoEm = 'Informe quando o iFood liberou o app.';
    if (validacaoEm && liberacaoEm && liberacaoEm < validacaoEm) erros.liberacaoEm = 'A liberação não pode ser anterior à validação técnica.';
  } else if (liberacaoEm) erros.liberacaoEm = 'A data de liberação pertence apenas ao parecer Homologado. O histórico anterior permanece guardado.';
  // Só um endereço de consulta do Developer, sem credenciais, links assinados ou query string.
  const referencia = typeof entrada.referencia === 'string' ? entrada.referencia.trim() : '';
  try {
    const url = new URL(referencia);
    if (referencia.length > 300 || url.protocol !== 'https:' || url.hostname !== 'developer.ifood.com.br'
      || url.port || url.username || url.password || url.search || url.hash
      || !/^\/(pt-BR|en-US)\/developer\/[a-zA-Z0-9/_-]+$/.test(url.pathname)) throw new Error();
  } catch { erros.referencia = 'Use o endereço HTTPS da página no iFood Developer, sem parâmetros ou fragmentos. Não cole segredo nem o link temporário do PDF.'; }
  if (entrada.conferido !== 'sim') erros.conferido = 'Confira o parecer no iFood antes de registrar.';
  return Object.keys(erros).length ? { ok: false, erros } : { ok: true, dados: { estado, validacaoEm: validacaoEm || null, liberacaoEm: liberacaoEm || null, referencia } };
}
