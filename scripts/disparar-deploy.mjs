import { pathToFileURL } from 'node:url';

const MAX_WAIT_MS = 20 * 60_000;
const MAX_BODY_BYTES = 1_048_576;
const MESSAGES = {
  invalid_config: 'Configuração de deploy inválida; nenhuma tentativa foi iniciada.',
  invalid_config_url: 'URL de deploy inválida: use a origem HTTP ou HTTPS configurada, sem credenciais na URL.',
  invalid_config_identifier: 'Identificador do compose inválido; nenhuma tentativa foi iniciada.',
  invalid_config_marker: 'Identificação da execução do CI inválida; nenhuma tentativa foi iniciada.',
  invalid_config_limits: 'Limites de acompanhamento inválidos; nenhuma tentativa foi iniciada.',
  invalid_config_token: 'Formato da credencial do canal inválido; nenhuma tentativa foi iniciada.',
  post_failed: 'Não foi possível confirmar a aceitação do disparo. O POST não foi repetido.',
  accepted_unconfirmed: 'Publicação aceita pelo webhook; confirmação indisponível neste canal.',
  not_configured: 'Deploy não disparado: nenhum canal configurado.',
  confirmation_timeout: 'Prazo de confirmação esgotado. O deploy pode continuar no servidor.',
  confirmation_http: 'Consulta de confirmação recusada ou indisponível.',
  confirmation_response: 'Resposta de confirmação incompatível com o contrato esperado.',
  confirmation_ambiguous: 'Mais de um deployment corresponde à tentativa; confirmação inconclusiva.',
  confirmation_missing: 'O deployment acompanhado deixou de aparecer; confirmação inconclusiva.',
  error: 'O deployment correlacionado terminou com erro; consulte o painel autorizado.',
  cancelled: 'O deployment correlacionado foi cancelado.',
};

function configuredUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('invalid_config_url'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('invalid_config_url');
  return url;
}

/** Preserva HTTP/HTTPS da origem configurada; não descobre host nem troca protocolo. */
export function dokployOrigin(value) {
  const url = configuredUrl(value);
  // A configuração anterior já aceitava URLs coladas do painel. Descartar o
  // restante preserva essa compatibilidade sem enviar caminho/query/fragmento.
  return url.origin;
}

function webhookUrl(value) {
  const url = configuredUrl(value);
  // Fragmento não faz parte da requisição HTTP; o fluxo anterior o ignorava.
  url.hash = '';
  return url.href;
}

export function deploymentTitle({ runId, runAttempt, sha }) {
  if (!/^\d{1,30}$/.test(runId ?? '') || !/^\d{1,10}$/.test(runAttempt ?? '') || !/^[a-f\d]{40}$/i.test(sha ?? '')) throw new Error('invalid_config_marker');
  return `flowfoods-ci:${runId}:${runAttempt}:${sha.toLowerCase()}`;
}

function timestamp(value, optional = false) {
  if (optional && value == null) return null;
  // RFC3339 com fuso explícito; frações maiores são normalizadas à precisão
  // de milissegundos do Date. Date.parse sozinho normaliza 30/fev para março,
  // portanto também validamos os componentes do calendário recebido.
  const parts = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/i.exec(value);
  if (!parts) throw new Error('confirmation_response');
  const [, year, month, day, hour, minute, second, , offsetHour = '00', offsetMinute = '00'] = parts;
  const leap = Number(year) % 4 === 0 && (Number(year) % 100 !== 0 || Number(year) % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > days[Number(month) - 1]
    || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 || Number(offsetHour) > 23 || Number(offsetMinute) > 59
    || !Number.isFinite(Date.parse(value))) throw new Error('confirmation_response');
  return new Date(value).toISOString();
}

/** Recebe metadados, usa só o marcador criado pelo runner e devolve uma allowlist. */
export function correlate(rows, title, composeId, pinnedId) {
  if (!Array.isArray(rows)) throw new Error('confirmation_response');
  const matches = rows.filter((row) => row && typeof row === 'object' && row.title === title);
  if (matches.length > 1) throw new Error('confirmation_ambiguous');
  if (!matches.length) {
    if (pinnedId) throw new Error('confirmation_missing');
    return null;
  }
  const row = matches[0];
  if (row.composeId !== composeId || typeof row.deploymentId !== 'string' || !/^[a-z\d_-]{1,128}$/i.test(row.deploymentId)
    || !['running', 'done', 'error', 'cancelled'].includes(row.status)) throw new Error('confirmation_response');
  if (pinnedId && row.deploymentId !== pinnedId) throw new Error('confirmation_ambiguous');
  const out = {
    deploymentId: row.deploymentId, composeId, status: row.status,
    createdAt: timestamp(row.createdAt), startedAt: timestamp(row.startedAt, true), finishedAt: timestamp(row.finishedAt, true),
  };
  // O schema cria startedAt e createdAt em momentos distintos; a API não
  // promete ordem entre eles. Cancelamento também pode não ter finishedAt.
  if (out.status === 'done' && !out.finishedAt) throw new Error('confirmation_response');
  return out;
}

async function jsonLimited(response) {
  if (!response.body) throw new Error('confirmation_response');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) throw new Error('confirmation_response');
      chunks.push(value);
    }
    const content = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { content.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content));
  } catch {
    await reader.cancel().catch(() => {});
    throw new Error('confirmation_response');
  } finally { reader.releaseLock(); }
}

/** Limita o pedido inteiro, incluindo leitura do corpo; nunca registra URL, header ou erro bruto. */
async function request(fetcher, url, options, timeoutMs, consume) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetcher(url, { ...options, redirect: 'error', signal: controller.signal });
        if (!response.ok) {
          await response.body?.cancel().catch(() => {});
          throw new Error('http');
        }
        if (consume) return await jsonLimited(response);
        await response.body?.cancel().catch(() => {});
        return null;
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}

/** Sem polling infinito, retry de POST, cancelamento remoto ou leitura de configurações/logs. */
export async function runDeploy(config, deps = {}) {
  const fetcher = deps.fetch ?? globalThis.fetch;
  const sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = deps.now ?? (() => performance.now());
  const wallNow = deps.wallNow ?? (() => new Date().toISOString());
  const emit = deps.emit ?? (() => {});
  const report = deps.report ?? (() => {});
  let composeId;
  let pinnedId;
  const finish = (status, exitCode, row) => {
    emit(row ?? { ...(pinnedId ? { deploymentId: pinnedId } : {}), ...(composeId ? { composeId } : {}), status, createdAt: wallNow() });
    if (MESSAGES[status]) report(status);
    return { exitCode, status };
  };
  let origin, webhook, title, maxWaitMs, pollMs, requestTimeoutMs;
  try {
    if (typeof config.composeId !== 'string' || !/^[a-z\d_-]{1,128}$/i.test(config.composeId)) throw new Error('invalid_config_identifier');
    composeId = config.composeId;
    maxWaitMs = config.maxWaitMs ?? MAX_WAIT_MS;
    pollMs = config.pollMs ?? 15_000;
    requestTimeoutMs = config.requestTimeoutMs ?? 15_000;
    if (![maxWaitMs, pollMs, requestTimeoutMs].every((n) => Number.isInteger(n) && n > 0)
      || maxWaitMs > MAX_WAIT_MS || pollMs > 60_000 || requestTimeoutMs > 60_000) throw new Error('invalid_config_limits');
    if (config.url && config.token) {
      origin = dokployOrigin(config.url);
      if (typeof config.token !== 'string' || !config.token.trim() || /[\r\n]/.test(config.token)) throw new Error('invalid_config_token');
      title = deploymentTitle(config);
    } else if (config.webhook) webhook = webhookUrl(config.webhook);
    else return finish('not_configured', 0);
  } catch (error) {
    const codes = ['invalid_config_url', 'invalid_config_identifier', 'invalid_config_marker', 'invalid_config_limits', 'invalid_config_token'];
    return finish(codes.includes(error.message) ? error.message : 'invalid_config', 1);
  }

  try {
    await request(fetcher, origin ? `${origin}/api/compose.deploy` : webhook, {
      method: 'POST', ...(origin ? { headers: { 'x-api-key': config.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ composeId, title }) } : {}),
    }, config.requestTimeoutMs ?? 60_000, false);
  } catch { return finish('post_failed', 1); }
  if (!origin) return finish('accepted_unconfirmed', 0);
  emit({ composeId, status: 'accepted', createdAt: wallNow() });
  const deadline = now() + maxWaitMs;
  const query = new URL(`${origin}/api/deployment.allByCompose`);
  query.searchParams.set('composeId', composeId);
  let lastOutput;
  while (now() < deadline) {
    let rows;
    const available = deadline - now();
    if (available <= 0) break;
    try {
      rows = await request(fetcher, query.href, { method: 'GET', headers: { 'x-api-key': config.token } }, Math.min(requestTimeoutMs, available), true);
    } catch (error) {
      if (now() >= deadline || (available <= requestTimeoutMs && error.message === 'timeout')) return finish('confirmation_timeout', 1);
      return finish(error.message === 'confirmation_response' ? 'confirmation_response' : 'confirmation_http', 1);
    }
    if (now() >= deadline) return finish('confirmation_timeout', 1);
    let row;
    try { row = correlate(rows, title, composeId, pinnedId); }
    catch (error) { return finish(MESSAGES[error.message] ? error.message : 'confirmation_response', 1); }
    if (row) {
      pinnedId = row.deploymentId;
      if (row.status !== 'running') return finish(row.status, row.status === 'done' ? 0 : 1, row);
      const serialized = JSON.stringify(row);
      if (serialized !== lastOutput) { emit(row); lastOutput = serialized; }
    }
    const remaining = deadline - now();
    if (remaining > 0) await sleep(Math.min(pollMs, remaining));
  }
  return finish('confirmation_timeout', 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runDeploy({
    url: process.env.DOKPLOY_URL, token: process.env.DOKPLOY_API_TOKEN, webhook: process.env.DOKPLOY_DEPLOY_WEBHOOK,
    composeId: process.env.COMPOSE_ID, runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT, sha: process.env.GITHUB_SHA,
  }, {
    emit: (row) => process.stdout.write(`${JSON.stringify(row)}\n`),
    report: (code) => process.stderr.write(`${MESSAGES[code]}\n`),
  });
  process.exitCode = result.exitCode;
}
