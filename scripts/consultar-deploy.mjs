import { pathToFileURL } from 'node:url';
import { correlate, deploymentTitle, dokployOrigin } from './disparar-deploy.mjs';

// Diagnóstico de UMA tentativa já aceita. Não descobre outro alvo nem dispara implantação.
export const PIN = Object.freeze({
  deploymentId: '4EL-ASTRyGb91bC4CyVQW', composeId: 'JWsPI2ZLgUrh11MS_EwwB',
  createdAt: '2026-11-20T16:33:18.950Z', sha: '3fa3bbb76bc2f128dc124b2841d486f3f7a92961',
  runId: '44771930161', runAttempt: '1',
});
const MAX_BODY_BYTES = 1_048_576;
const CONFIG_KEYS = new Set([...Object.keys(PIN), 'url', 'token', 'requestTimeoutMs']);
const ERRORS = new Set(['confirmation_missing', 'confirmation_ambiguous', 'confirmation_response', 'confirmation_mismatch', 'confirmation_http', 'confirmation_timeout']);

async function jsonLimited(response) {
  if (!response.body || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
    void response.body?.cancel().catch(() => {});
    throw new Error('confirmation_response');
  }
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
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
    void reader.cancel().catch(() => {});
    throw new Error('confirmation_response');
  } finally { reader.releaseLock(); }
}

/** Uma GET, sem retry/polling, POST, logs remotos ou leitura de configurações.
 * expectedSha identifica o disparo original; não prova o SHA da imagem/aplicativo em execução.
 */
export async function consultarDeploy(config, deps = {}) {
  const emit = deps.emit ?? (() => {});
  const finish = (status, exitCode, row) => {
    emit({ deploymentId: PIN.deploymentId, composeId: PIN.composeId, status, createdAt: PIN.createdAt,
      ...(row ? { startedAt: row.startedAt, finishedAt: row.finishedAt } : {}),
      sourceRunId: PIN.runId, sourceRunAttempt: PIN.runAttempt, expectedSha: PIN.sha });
    return { exitCode, status };
  };
  let origin, timeoutMs;
  try {
    if (!config || typeof config !== 'object' || Object.keys(config).some((k) => !CONFIG_KEYS.has(k))
      || Object.entries(PIN).some(([k, v]) => config[k] !== v)) throw new Error('invalid_config');
    origin = dokployOrigin(config.url);
    if (typeof config.token !== 'string' || !config.token.trim() || /[\r\n]/.test(config.token)) throw new Error('invalid_config');
    timeoutMs = config.requestTimeoutMs ?? 15_000;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new Error('invalid_config');
  } catch { return finish('invalid_config', 1); }

  const query = new URL(`${origin}/api/deployment.allByCompose`);
  query.searchParams.set('composeId', PIN.composeId);
  const controller = new AbortController();
  let timer, timedOut = false;
  try {
    const rows = await Promise.race([
      (async () => {
        let response;
        try {
          response = await (deps.fetch ?? globalThis.fetch)(query.href, {
            method: 'GET', headers: { 'x-api-key': config.token }, redirect: 'error', signal: controller.signal,
          });
        } catch { throw new Error('confirmation_http'); }
        if (!response.ok || response.redirected) {
          void response.body?.cancel().catch(() => {});
          throw new Error('confirmation_http');
        }
        return jsonLimited(response);
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => {
        timedOut = true; controller.abort(); reject(new Error('confirmation_timeout'));
      }, timeoutMs); }),
    ]);
    const row = correlate(rows, deploymentTitle(PIN), PIN.composeId, PIN.deploymentId);
    if (row.createdAt !== PIN.createdAt) throw new Error('confirmation_mismatch');
    return finish(row.status, row.status === 'done' ? 0 : row.status === 'running' ? 2 : 1, row);
  } catch (error) {
    return finish(timedOut ? 'confirmation_timeout' : ERRORS.has(error?.message) ? error.message : 'confirmation_response', 1);
  } finally { clearTimeout(timer); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await consultarDeploy({
    url: process.env.DOKPLOY_URL, token: process.env.DOKPLOY_API_TOKEN,
    deploymentId: process.env.CONSULTA_DEPLOYMENT_ID, composeId: process.env.CONSULTA_COMPOSE_ID,
    createdAt: process.env.CONSULTA_CREATED_AT, sha: process.env.CONSULTA_SHA,
    runId: process.env.CONSULTA_RUN_ID, runAttempt: process.env.CONSULTA_RUN_ATTEMPT,
  }, { emit: (row) => process.stdout.write(`${JSON.stringify(row)}\n`) });
  process.exitCode = result.exitCode;
}
