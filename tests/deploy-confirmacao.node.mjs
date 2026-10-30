import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { correlate, deploymentTitle, dokployOrigin, runDeploy } from '../scripts/disparar-deploy.mjs';

const config = {
  url: 'https://deploy.example.test', token: 'TOKEN_SINTETICO_TESTE', webhook: 'https://hooks.example.test/deploy/fixture',
  composeId: 'compose-fixture', runId: '123', runAttempt: '2', sha: 'a'.repeat(40),
  maxWaitMs: 60, pollMs: 10, requestTimeoutMs: 100,
};
const stamp = '2026-10-30T03:00:00.000Z';
const title = deploymentTitle(config);
const row = (status = 'running', extra = {}) => ({
  deploymentId: 'deployment-fixture', composeId: config.composeId, title, status,
  createdAt: stamp, startedAt: stamp, finishedAt: status === 'running' ? null : '2026-10-30T03:01:00.000Z', ...extra,
});
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function harness(replies, overrides = {}) {
  let time = 0;
  const calls = [], emitted = [], reports = [], sleeps = [];
  const deps = {
    fetch: async (url, options) => {
      calls.push({ url, options });
      const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
      return typeof reply === 'function' ? await reply(url, options) : response(reply);
    },
    now: () => time,
    sleep: async (ms) => { sleeps.push(ms); time += ms; },
    wallNow: () => stamp,
    emit: (value) => emitted.push(value), report: (code) => reports.push(code), ...overrides,
  };
  return { calls, emitted, reports, sleeps, run: (patch = {}) => runDeploy({ ...config, ...patch }, deps) };
}

test('HTTPS somente na origem existente; normaliza URL do painel sem transmitir path/query/hash', () => {
  assert.equal(dokployOrigin(config.url), config.url);
  assert.equal(dokployOrigin(config.url + '/dashboard/project?token=DADO_PRIVADO#ambiente'), config.url);
  for (const value of ['http://deploy.example.test', 'https://u:p@deploy.example.test', 'arquivo']) {
    assert.throws(() => dokployOrigin(value));
  }
});

test('marcador inclui run/attempt/SHA, é único por tentativa e rejeita entrada arbitrária', () => {
  assert.equal(title, `flowfoods-ci:123:2:${'a'.repeat(40)}`);
  assert.notEqual(title, deploymentTitle({ ...config, runAttempt: '3' }));
  assert.throws(() => deploymentTitle({ ...config, runId: '123\nsegredo' }));
  assert.throws(() => deploymentTitle({ ...config, sha: 'branch-master' }));
});

test('API tem prioridade; POST único com marcador e GET fixo, sem redirects nem enfraquecer TLS', async () => {
  const h = harness([{}, [row()], [row('done')]]);
  assert.deepEqual(await h.run(), { exitCode: 0, status: 'done' });
  assert.equal(h.calls.filter((c) => c.options.method === 'POST').length, 1);
  assert.equal(h.calls[0].url, config.url + '/api/compose.deploy');
  assert.deepEqual(JSON.parse(h.calls[0].options.body), { composeId: config.composeId, title });
  for (const call of h.calls) {
    assert.equal(call.options.redirect, 'error');
    assert.ok(call.options.signal instanceof AbortSignal);
    assert.equal(call.options.headers['x-api-key'], config.token);
    assert.equal(call.options.dispatcher, undefined);
  }
  assert.ok(h.calls.slice(1).every((c) => c.url === config.url + '/api/deployment.allByCompose?composeId=' + config.composeId));
  assert.equal(h.emitted.at(-1).deploymentId, 'deployment-fixture');
  assert.ok(h.sleeps.every((ms) => ms <= config.pollMs));
});

test('URL legada com caminho/query/hash usa só a origem; metadados descartados não chegam ao request ou saída', async () => {
  const h = harness([{}, [row('done')]]);
  assert.equal((await h.run({ url: config.url + '/dashboard?private=DADO_PRIVADO#secreto' })).status, 'done');
  assert.equal(h.calls[0].url, config.url + '/api/compose.deploy');
  assert.equal(h.calls[1].url, config.url + '/api/deployment.allByCompose?composeId=' + config.composeId);
  assert.doesNotMatch(JSON.stringify(h.calls) + JSON.stringify(h.emitted) + h.reports.join(), /DADO_PRIVADO|dashboard|secreto/);
});

test('done alheio nunca confirma; registro esperado pode surgir depois da fila', async () => {
  const other = row('done', { deploymentId: 'manual', title: 'outro deploy' });
  const h = harness([{}, [other], [other, row()], [other, row('done')]]);
  assert.equal((await h.run()).status, 'done');
  assert.ok(h.emitted.every((r) => r.deploymentId !== 'manual'));
  assert.equal(h.emitted.filter((r) => r.status === 'done').length, 1);
});

test('saída usa apenas IDs/status/datas; título, token, description, erro e corpo bruto não saem', async () => {
  const h = harness([{}, [row('done', { description: 'DADO_PRIVADO', errorMessage: 'DADO_PRIVADO', env: 'DADO_PRIVADO', logPath: 'DADO_PRIVADO' })]]);
  await h.run();
  const allowed = new Set(['deploymentId', 'composeId', 'status', 'createdAt', 'startedAt', 'finishedAt']);
  assert.ok(h.emitted.every((r) => Object.keys(r).every((key) => allowed.has(key))));
  assert.doesNotMatch(JSON.stringify(h.emitted) + h.reports.join(), /DADO_PRIVADO|TOKEN_SINTETICO|flowfoods-ci|example\.test/);
});

test('IDs coincidentes de outra tentativa não substituem o deployment fixado', async () => {
  const h = harness([{}, [row()], [row('done', { deploymentId: 'outro-id' })]]);
  assert.deepEqual(await h.run(), { exitCode: 1, status: 'confirmation_ambiguous' });
  assert.equal(h.emitted.at(-1).deploymentId, 'deployment-fixture');
  assert.ok(h.emitted.every((r) => r.status !== 'done'));
});

test('mais de um registro com mesmo marcador é inconclusivo, mesmo se um está done', async () => {
  const h = harness([{}, [row('done'), row('done', { deploymentId: 'outro-id' })]]);
  assert.deepEqual(await h.run(), { exitCode: 1, status: 'confirmation_ambiguous' });
});

test('registro já observado desaparecido não troca para latest', async () => {
  const h = harness([{}, [row()], [row('done', { title: 'outro marcador' })]]);
  assert.deepEqual(await h.run(), { exitCode: 1, status: 'confirmation_missing' });
});

for (const status of ['error', 'cancelled']) test(`terminal ${status} reprova sem expor a razão`, async () => {
  const h = harness([{}, [row(status, { errorMessage: 'PRIVADO', ...(status === 'cancelled' ? { finishedAt: null } : {}) })]]);
  assert.deepEqual(await h.run(), { exitCode: 1, status });
  assert.equal(h.emitted.at(-1).status, status);
  assert.doesNotMatch(JSON.stringify(h.emitted) + h.reports.join(), /PRIVADO/);
});

for (const extra of [{ status: 'unknown' }, { createdAt: 'data inválida' }, { finishedAt: null }, { composeId: 'outra-loja' }, { deploymentId: 'id\nprivado' }]) {
  test('schema desconhecido ou timestamp terminal inválido não vira sucesso: ' + Object.keys(extra).join(), async () => {
    const h = harness([{}, [row('done', extra)]]);
    assert.deepEqual(await h.run(), { exitCode: 1, status: 'confirmation_response' });
  });
}

test('não pressupõe startedAt >= createdAt: relógios/ordem da criação não são contrato da API', () => {
  const out = correlate([row('done', { startedAt: '2026-10-30T02:59:59.999Z' })], title, config.composeId);
  assert.equal(out.status, 'done');
});

test('done aceita RFC3339 com Z, offsets e frações maiores e normaliza todas as datas para ISO UTC', async () => {
  for (const [received, expected] of [
    ['2026-10-30T03:00:00Z', stamp],
    ['2026-10-30T03:00:00+00:00', stamp],
    ['2026-10-30T00:00:00-03:00', stamp],
    ['2026-10-30T04:30:00+01:30', stamp],
    ['2026-10-30T03:00:00.123456Z', '2026-10-30T03:00:00.123Z'],
    ['2026-10-30T00:00:00.123456789-03:00', '2026-10-30T03:00:00.123Z'],
    ['2026-10-30T03:00:00.1+00:00', '2026-10-30T03:00:00.100Z'],
    ['2026-10-30t03:00:00.123456z', '2026-10-30T03:00:00.123Z'],
    ['2024-02-29T00:00:00-03:00', '2024-02-29T03:00:00.000Z'],
  ]) {
    const h = harness([{}, [row('done', { createdAt: received, startedAt: received, finishedAt: received })]]);
    assert.deepEqual(await h.run(), { exitCode: 0, status: 'done' });
    const emitted = h.emitted.at(-1);
    assert.equal(emitted.createdAt, expected);
    assert.equal(emitted.startedAt, expected);
    assert.equal(emitted.finishedAt, expected);
  }
});

test('recusa datas sem timezone, calendário/horário/offset inválido e fração vazia sem normalizar erro', async () => {
  for (const received of [
    '2026-10-30T03:00:00', '2026-10-30', '2026-02-29T03:00:00Z', '2026-02-30T03:00:00+00:00',
    '2026-13-01T03:00:00Z', '2026-10-00T03:00:00Z', '2026-10-30T24:00:00Z', '2026-10-30T03:60:00Z',
    '2026-10-30T03:00:00+24:00', '2026-10-30T03:00:00-03:60', '2026-10-30T03:00:00.Z', 'INVÁLIDA',
  ]) {
    const h = harness([{}, [row('done', { finishedAt: received })]]);
    assert.deepEqual(await h.run(), { exitCode: 1, status: 'confirmation_response' });
    assert.ok(h.emitted.every((r) => r.status !== 'done'));
    assert.doesNotMatch(JSON.stringify(h.emitted), /INVÁLIDA/);
  }
});

test('sem candidato, prazo finito não repete POST e não aproveita done antigo', async () => {
  const h = harness([{}, [row('done', { title: 'antigo' })]]);
  assert.deepEqual(await h.run(), { exitCode: 1, status: 'confirmation_timeout' });
  assert.equal(h.calls.filter((c) => c.options.method === 'POST').length, 1);
  assert.equal(h.sleeps.reduce((n, ms) => n + ms, 0), config.maxWaitMs);
  assert.ok(h.calls.length <= 1 + config.maxWaitMs / config.pollMs);
});

test('POST com erro de rede não é repetido e não inicia consulta', async () => {
  const h = harness([() => { throw new Error('TOKEN_SINTETICO_TESTE PRIVADO'); }]);
  assert.deepEqual(await h.run(), { exitCode: 1, status: 'post_failed' });
  assert.equal(h.calls.length, 1);
  assert.doesNotMatch(JSON.stringify(h.emitted) + h.reports.join(), /TOKEN_SINTETICO|PRIVADO/);
});

test('POST não-2xx não é repetido nem imprime corpo', async () => {
  const h = harness([() => new Response('PRIVADO', { status: 503 })]);
  assert.deepEqual(await h.run(), { exitCode: 1, status: 'post_failed' });
  assert.equal(h.calls.length, 1);
});

test('POST pendurado tem timeout curto no mock; não repete nem consulta', async () => {
  const h = harness([() => new Promise(() => {})]);
  assert.deepEqual(await h.run({ requestTimeoutMs: 5 }), { exitCode: 1, status: 'post_failed' });
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].options.signal.aborted, true);
});

test('GET não-2xx, redirect recusado ou rede com falha não confirma', async () => {
  for (const failure of [() => new Response('PRIVADO', { status: 401 }), () => { throw new Error('redirect TOKEN_SINTETICO_TESTE'); }]) {
    const h = harness([{}, failure]);
    assert.deepEqual(await h.run(), { exitCode: 1, status: 'confirmation_http' });
    assert.equal(h.calls.length, 2);
    assert.doesNotMatch(JSON.stringify(h.emitted) + h.reports.join(), /PRIVADO|TOKEN_SINTETICO/);
  }
});

test('GET pendurado é abortado e não faz outro POST', async () => {
  const h = harness([{}, () => new Promise(() => {})]);
  assert.deepEqual(await h.run({ requestTimeoutMs: 5 }), { exitCode: 1, status: 'confirmation_http' });
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].options.signal.aborted, true);
});

test('GET limitado pelo prazo global informa timeout da confirmação, sem confundir com falha HTTP', async () => {
  const h = harness([{}, () => new Promise(() => {})]);
  assert.deepEqual(await h.run({ maxWaitMs: 5 }), { exitCode: 1, status: 'confirmation_timeout' });
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].options.signal.aborted, true);
});

test('JSON inválido/objeto em vez de array ou corpo excessivo não é serializado', async () => {
  for (const reply of [() => new Response('PRIVADO invalid json'), () => response({ message: 'PRIVADO' }), () => new Response('x'.repeat(1_048_577))]) {
    const h = harness([{}, reply]);
    assert.deepEqual(await h.run(), { exitCode: 1, status: 'confirmation_response' });
    assert.doesNotMatch(JSON.stringify(h.emitted) + h.reports.join(), /PRIVADO|invalid json/);
  }
});

test('webhook-only registra aceitação sem conclusão e não envia header do token', async () => {
  const h = harness([{}]);
  assert.deepEqual(await h.run({ url: undefined }), { exitCode: 0, status: 'accepted_unconfirmed' });
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, config.webhook);
  assert.equal(h.calls[0].options.headers, undefined);
  assert.deepEqual(h.emitted, [{ composeId: config.composeId, status: 'accepted_unconfirmed', createdAt: stamp }]);
});

test('nenhum canal configurado não dispara e é explícito, sem inventar publicação', async () => {
  const h = harness([]);
  assert.deepEqual(await h.run({ url: undefined, token: undefined, webhook: undefined }), { exitCode: 0, status: 'not_configured' });
  assert.equal(h.calls.length, 0);
});

test('configuração insegura/faltante falha antes de qualquer POST; não cai em webhook silenciosamente', async () => {
  for (const patch of [{ url: 'http://deploy.example.test' }, { composeId: 'TOKEN PRIVADO' }, { runId: '' }, { sha: 'master' }, { token: 'bad\nheader' }, { maxWaitMs: 1_200_001 }, { pollMs: 0 }, { requestTimeoutMs: 60_001 }, { url: undefined, webhook: 'http://hooks.example.test/a' }]) {
    const h = harness([]);
    assert.deepEqual(await h.run(patch), { exitCode: 1, status: 'invalid_config' });
    assert.equal(h.calls.length, 0);
    assert.doesNotMatch(JSON.stringify(h.emitted), /TOKEN PRIVADO|bad/);
  }
});

test('workflow isola concorrência por compose, não cancela ativo e tem prazo maior que o acompanhamento', () => {
  const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  const deploy = workflow.slice(workflow.indexOf('  deploy:'));
  assert.match(deploy, /timeout-minutes: 25/);
  assert.match(deploy, /group: flowfoods-compose-JWsPI2ZLgUrh11MS_EwwB/);
  assert.match(deploy, /cancel-in-progress: false/);
  assert.match(deploy, /node-version: '22'/);
  assert.match(deploy, /node scripts\/disparar-deploy\.mjs/);
  assert.match(workflow, /node --test tests\/deploy-confirmacao\.node\.mjs/);
  assert.doesNotMatch(deploy, /head -c|curl .*-[^\n ]*k|NODE_TLS_REJECT_UNAUTHORIZED/);
});
