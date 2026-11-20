import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { consultarDeploy, PIN } from '../scripts/consultar-deploy.mjs';

const expectedPin = {
  deploymentId: '4EL-ASTRyGb91bC4CyVQW', composeId: 'JWsPI2ZLgUrh11MS_EwwB', createdAt: '2026-11-20T16:33:18.950Z',
  sha: '3fa3bbb76bc2f128dc124b2841d486f3f7a92961', runId: '44771930161', runAttempt: '1',
};
const config = { ...expectedPin, url: 'https://deploy.example.test', token: 'TOKEN_SINTETICO_CONSULTA', requestTimeoutMs: 100 };
const finishedAt = '2026-11-20T16:34:18.950Z';
const row = (status = 'done', extra = {}) => ({
  deploymentId: expectedPin.deploymentId, composeId: expectedPin.composeId, status,
  createdAt: expectedPin.createdAt, startedAt: expectedPin.createdAt,
  finishedAt: status === 'running' ? null : finishedAt,
  title: 'Título privado já substituído pelo provedor', ...extra,
});
const response = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', ...headers },
});
const allowed = new Set(['deploymentId', 'composeId', 'status', 'createdAt', 'startedAt', 'finishedAt', 'sourceRunId', 'sourceRunAttempt', 'expectedSha']);
const privateData = /TOKEN_SINTETICO|DADO_PRIVADO|RAZAO_PRIVADA|example\.test|192\.0\.2|Título privado|flowfoods-ci|SEGREDO_FRAGMENTO/;

function harness(reply = [row()]) {
  const calls = [], emitted = [];
  return {
    calls, emitted,
    run: (patch = {}) => consultarDeploy({ ...config, ...patch }, {
      fetch: async (url, options) => {
        calls.push({ url, options });
        assert.equal(calls.length, 1, 'A consulta não pode repetir, fazer polling nem iniciar deploy.');
        return typeof reply === 'function' ? await reply(url, options) : response(reply);
      },
      emit: value => emitted.push(value),
    }),
  };
}

function safeOutput(h, result) {
  assert.equal(h.emitted.length, 1, 'Cada execução emite uma única linha estruturada.');
  assert.ok(h.emitted.every(value => value && typeof value === 'object' && !Array.isArray(value)));
  assert.ok(h.emitted.every(value => Object.keys(value).every(key => allowed.has(key))));
  assert.equal(h.emitted[0].status, result.status);
  assert.deepEqual(Object.keys(result).sort(), ['exitCode', 'status']);
  assert.match(result.status, /^[a-z][a-z_]*$/);
  assert.doesNotMatch(JSON.stringify(h.emitted) + JSON.stringify(result), privateData);
}

async function rejected(reply, patch = {}, category) {
  const h = harness(reply);
  const result = await h.run(patch);
  assert.equal(result.exitCode, 1);
  assert.notEqual(result.status, 'done');
  assert.notEqual(result.status, 'running');
  if (category) assert.match(result.status, category);
  safeOutput(h, result);
  return h;
}

test('PIN é imutável e identifica exatamente a única execução autorizada', () => {
  assert.deepEqual(PIN, expectedPin);
  assert.ok(Object.isFrozen(PIN));
  assert.equal(Reflect.set(PIN, 'deploymentId', 'outro'), false);
  assert.deepEqual(PIN, expectedPin);
});

test('done faz apenas GET no endpoint exato, token no header e nenhuma mutação', async () => {
  const h = harness();
  const result = await h.run();
  assert.deepEqual(result, { exitCode: 0, status: 'done' });
  assert.equal(h.calls.length, 1);
  const call = h.calls[0];
  assert.equal(call.url, `${config.url}/api/deployment.allByCompose?composeId=${expectedPin.composeId}`);
  assert.equal(call.options.method, 'GET');
  assert.equal(call.options.body, undefined);
  assert.equal(call.options.redirect, 'error');
  assert.ok(call.options.signal instanceof AbortSignal);
  assert.equal(new Headers(call.options.headers).get('x-api-key'), config.token);
  assert.equal(call.options.dispatcher, undefined);
  assert.doesNotMatch(call.url, /TOKEN_SINTETICO|token=|apiKey=|secret=/i);
  safeOutput(h, result);
  assert.deepEqual(h.emitted[0], {
    deploymentId: expectedPin.deploymentId, composeId: expectedPin.composeId, status: 'done',
    createdAt: expectedPin.createdAt, startedAt: expectedPin.createdAt, finishedAt,
    sourceRunId: expectedPin.runId, sourceRunAttempt: expectedPin.runAttempt, expectedSha: expectedPin.sha,
  });
});

test('origem HTTP/HTTPS configurada preserva protocolo e porta, descartando caminho/query/fragmento', async () => {
  for (const origin of [config.url, 'http://192.0.2.24:3000']) {
    const h = harness();
    const result = await h.run({ url: `${origin}/dashboard/project?token=DADO_PRIVADO#SEGREDO_FRAGMENTO` });
    assert.equal(result.status, 'done');
    assert.equal(h.calls[0].url, `${origin}/api/deployment.allByCompose?composeId=${expectedPin.composeId}`);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].options.redirect, 'error');
    safeOutput(h, result);
  }
});

for (const [status, exitCode] of [['running', 2], ['error', 1], ['cancelled', 1]]) {
  test(`${status} permanece explícito, sem polling, retry ou sucesso presumido`, async () => {
    const h = harness([row(status, { finishedAt: null, errorMessage: 'RAZAO_PRIVADA' })]);
    const result = await h.run();
    assert.deepEqual(result, { exitCode, status });
    assert.equal(h.calls.length, 1);
    safeOutput(h, result);
  });
}

test('metadados privados e título modificado não substituem o vínculo fixo nem escapam na saída', async () => {
  const h = harness([row('done', { title: 'DADO_PRIVADO', description: 'DADO_PRIVADO', env: 'DADO_PRIVADO', errorMessage: 'DADO_PRIVADO', logPath: 'DADO_PRIVADO', token: config.token })]);
  const result = await h.run();
  assert.equal(result.status, 'done');
  safeOutput(h, result);
});

test('done alheio ou último da lista não substitui deployment ausente', async () => {
  for (const rows of [[], [row('done', { deploymentId: 'outro-deployment' })]]) {
    const h = await rejected(rows, {}, /missing$/);
    assert.equal(h.calls.length, 1);
  }
});

test('ID fixado duplicado é ambíguo mesmo com títulos e estados distintos', async () => {
  await rejected([row(), row('running', { title: 'DADO_PRIVADO' })], {}, /ambiguous$/);
});

test('outros deployments não impedem a correlação exata do alvo único', async () => {
  const h = harness([row('error', { deploymentId: 'outro-antigo' }), row(), row('running', { deploymentId: 'outro-novo' })]);
  const result = await h.run();
  assert.equal(result.status, 'done');
  assert.equal(h.emitted[0].deploymentId, expectedPin.deploymentId);
  safeOutput(h, result);
});

test('mesmo ID com compose ou criação divergente nunca confirma o deployment autorizado', async () => {
  await rejected([row('done', { composeId: 'outro-compose' })]);
  await rejected([row('done', { createdAt: '2026-11-20T16:33:18.951Z' })], {}, /mismatch$/);
});

test('data equivalente com offset explícito normaliza para o instante autorizado', async () => {
  const h = harness([row('done', { createdAt: '2026-11-20T13:33:18.950-03:00' })]);
  const result = await h.run();
  assert.equal(result.status, 'done');
  assert.equal(h.emitted[0].createdAt, expectedPin.createdAt);
  safeOutput(h, result);
});

test('retorno malformado, status desconhecido e done sem término não viram sucesso', async () => {
  for (const value of [null, {}, { rows: [row()] }, 'DADO_PRIVADO',
    [row('unknown')], [row('done', { finishedAt: null })], [row('done', { finishedAt: undefined })],
    [row('done', { createdAt: 'DADO_PRIVADO' })], [row('done', { startedAt: '2026-02-30T00:00:00Z' })],
  ]) await rejected(value);
});

test('pins ausentes ou alterados bloqueiam antes de qualquer requisição', async () => {
  for (const key of Object.keys(expectedPin)) {
    for (const value of [undefined, null, `${expectedPin[key]}-alterado`]) {
      const h = await rejected([], { [key]: value }, /^invalid_config/);
      assert.equal(h.calls.length, 0, key);
    }
  }
});

test('URL e token inválidos ou ausentes não acionam canal alternativo', async () => {
  for (const patch of [
    { url: undefined }, { url: '' }, { url: 'arquivo' }, { url: 'ftp://deploy.example.test' },
    { url: 'https://u:p@deploy.example.test' }, { url: 'http://u:p@192.0.2.24:3000' },
    { url: 'file:///fixture' }, { url: 'data:text/plain,DADO_PRIVADO' },
    { token: undefined }, { token: '' }, { token: '   ' }, { token: null }, { token: 123 },
    { token: 'DADO_PRIVADO\r\nheader' }, { token: 'DADO_PRIVADO\nheader' },
  ]) {
    const h = await rejected([], patch, /^invalid_config/);
    assert.equal(h.calls.length, 0);
  }
});

test('prazo deve ser inteiro de 1 a 60000 ms; inválidos falham antes do GET', async () => {
  for (const requestTimeoutMs of [0, -1, 0.5, 60_001, Infinity, NaN, '100']) {
    const h = await rejected([], { requestTimeoutMs }, /^invalid_config/);
    assert.equal(h.calls.length, 0);
  }
  for (const requestTimeoutMs of [1, 60_000]) {
    const h = harness();
    const result = await h.run({ requestTimeoutMs });
    assert.equal(result.status, 'done');
    safeOutput(h, result);
  }
});

test('HTTP malsucedido e redirecionamento falham sem seguir Location ou revelar o corpo', async () => {
  for (const status of [301, 302, 401, 403, 500]) {
    const h = await rejected(() => new Response('DADO_PRIVADO', { status, headers: { Location: 'https://outro.example.test/SEGREDO_FRAGMENTO' } }), {}, /http$/);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].options.redirect, 'error');
  }
});

test('erro de rede ou certificado não expõe mensagem e não provoca nova consulta', async () => {
  const h = await rejected(() => { throw new Error(`DADO_PRIVADO ${config.token} ${config.url}`); }, {}, /http$/);
  assert.equal(h.calls.length, 1);
});

test('exige Content-Type JSON e JSON válido sem serializar resposta bruta', async () => {
  for (const reply of [
    () => new Response('DADO_PRIVADO', { headers: { 'Content-Type': 'application/json' } }),
    () => new Response(JSON.stringify([row()]), { headers: { 'Content-Type': 'text/plain' } }),
    () => new Response(new TextEncoder().encode(JSON.stringify([row()]))),
    () => new Response(null, { status: 204, headers: { 'Content-Type': 'application/json' } }),
    () => new Response(new Uint8Array([0xff, 0xfe]), { headers: { 'Content-Type': 'application/json' } }),
  ]) await rejected(reply, {}, /response$/);
  const h = harness(() => response([row()], 200, { 'Content-Type': 'application/json; charset=utf-8' }));
  assert.equal((await h.run()).status, 'done');
});

test('limite é 1 MiB de bytes recebidos, inclusive em vários chunks UTF-8', async () => {
  for (const bytes of [new TextEncoder().encode(' '.repeat(1_048_577)), new TextEncoder().encode('é'.repeat(524_289))]) {
    let cancelled = false;
    const h = await rejected(() => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.subarray(0, 524_288));
        controller.enqueue(bytes.subarray(524_288));
      },
      cancel() { cancelled = true; },
    }), { headers: { 'Content-Type': 'application/json' } }), {}, /response$/);
    assert.equal(h.calls.length, 1);
    assert.equal(cancelled, true);
  }
  const json = JSON.stringify([row()]);
  const exato = json + ' '.repeat(1_048_576 - Buffer.byteLength(json));
  const h = harness(() => new Response(exato, { headers: { 'Content-Type': 'application/json' } }));
  const result = await h.run();
  assert.equal(result.status, 'done');
  safeOutput(h, result);
});

test('timeout cobre GET pendurado e aborta sem nova tentativa', { timeout: 2_000 }, async () => {
  const h = await rejected(() => new Promise(() => {}), { requestTimeoutMs: 5 }, /timeout$/);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].options.signal.aborted, true);
});

test('timeout cobre corpo pendurado após headers, aborta e não transforma parcial em sucesso', { timeout: 2_000 }, async () => {
  const h = await rejected((_url, options) => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('[{"deploymentId":"DADO_PRIVADO"'));
      options.signal.addEventListener('abort', () => controller.error(new Error('DADO_PRIVADO')), { once: true });
    },
  }), { headers: { 'Content-Type': 'application/json' } }), { requestTimeoutMs: 5 }, /timeout$/);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].options.signal.aborted, true);
});

test('importar consulta e disparador reutilizado não executa CLI, fetch, POST ou emite dados', () => {
  const consulta = new URL('../scripts/consultar-deploy.mjs', import.meta.url).href;
  const disparador = new URL('../scripts/disparar-deploy.mjs', import.meta.url).href;
  const script = `
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error('NETWORK_SENTINEL'); };
    const before = process.exitCode;
    await import(${JSON.stringify(consulta)});
    await import(${JSON.stringify(disparador)});
    if (calls !== 0 || process.exitCode !== before) process.exit(9);
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    encoding: 'utf8', timeout: 2_000,
    env: { DOKPLOY_URL: config.url, DOKPLOY_API_TOKEN: config.token, COMPOSE_ID: expectedPin.composeId },
  });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0);
  assert.equal(child.stdout, '');
  assert.equal(child.stderr, '');
});

const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const diagnosticRef = 'refs/heads/codex/deploy-consulta-20261120';

function job(id) {
  const heading = `  ${id}:\n`;
  const start = workflow.indexOf(heading);
  assert.ok(start >= 0, `Job ${id} precisa existir.`);
  const remainder = workflow.slice(start + heading.length);
  const end = remainder.search(/^  [a-z][a-z\d_]*:\n/m);
  return end < 0 ? remainder : remainder.slice(0, end);
}

function enabled(block, { event, ref, mode }) {
  const match = /^    if: (.+)$/m.exec(block);
  assert.ok(match, 'Cada job da matriz deve declarar sua condição.');
  let expression = match[1].replace(/^\$\{\{\s*/, '').replace(/\s*\}\}$/, '');
  for (const [symbol, value] of [['github.event_name', event], ['github.ref', ref], ['inputs.modo', mode ?? '']]) {
    expression = expression.replaceAll(symbol, JSON.stringify(value));
  }
  // Avalia somente strings, comparação e operadores booleanos da expressão real.
  // Um identificador/chamada nova exige ampliar conscientemente a matriz.
  assert.equal(expression.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\s+|===|!==|==|!=|&&|\|\||!|\(|\)/g, ''), '');
  return Boolean(Function(`"use strict"; return (${expression});`)());
}

test('matriz usa condições reais: consulta nunca aciona portão/deploy e modo desconhecido nunca publica', () => {
  const gate = job('portao'), deploy = job('deploy'), query = job('consulta_deploy');
  assert.match(deploy, /^    needs: portao$/m);
  const events = [
    { event: 'push' }, { event: 'pull_request' },
    ...['normal', undefined, '', 'consultar_deploy', 'erro'].map(mode => ({ event: 'workflow_dispatch', mode })),
  ];
  for (const ref of ['refs/heads/master', diagnosticRef, 'refs/heads/outra-branch']) {
    for (const context of events) {
      const scenario = { ...context, ref };
      const querying = context.event === 'workflow_dispatch' && context.mode === 'consultar_deploy';
      const normal = context.event !== 'workflow_dispatch' || !context.mode || context.mode === 'normal';
      assert.equal(enabled(gate, scenario), !querying, JSON.stringify(scenario));
      assert.equal(enabled(deploy, scenario), ref === 'refs/heads/master' && context.event !== 'pull_request' && normal, JSON.stringify(scenario));
      assert.equal(enabled(query, scenario), querying, JSON.stringify(scenario));
      // O job pode iniciar em master, mas a guarda abaixo falha antes dos secrets/GET.
      assert.equal(enabled(query, scenario) && ref === diagnosticRef, querying && ref === diagnosticRef);
    }
  }
});

test('dispatch oferece só modo normal/consulta e o deployment fixo, com normal como default', () => {
  const inputs = workflow.slice(workflow.indexOf('  workflow_dispatch:'), workflow.indexOf('\njobs:'));
  assert.match(inputs, /modo:\n(?:        .+\n)*?        type: choice\n        default: normal\n        options: \[normal, consultar_deploy\]/);
  assert.match(inputs, new RegExp(`deployment_id:\\n(?:        .+\\n)*?        type: choice\\n        default: ${expectedPin.deploymentId}\\n        options: \\[${expectedPin.deploymentId}\\]`));
});

test('job de consulta é independente e guarda branch/testes antes do único step com secrets', () => {
  const query = job('consulta_deploy');
  assert.doesNotMatch(query, /^    (?:needs|services|env):/m);
  assert.doesNotMatch(query, /npm\s+(?:ci|install|run)|prisma|compose\.deploy|disparar-deploy\.mjs|DOKPLOY_DEPLOY_WEBHOOK|continue-on-error|if: always\(/);
  assert.match(query, /^    permissions:\n      contents: read$/m);
  assert.match(query, /uses: actions\/checkout@v4/);
  assert.match(query, /uses: actions\/setup-node@v4\n        with:\n          node-version: '22'/);
  const steps = query.split(/\n      - /).slice(1);
  assert.equal(steps.length, 5);
  const guard = steps.findIndex(step => step.includes('run: test "$GITHUB_REF"'));
  const contract = steps.findIndex(step => step.includes('run: node --test tests/deploy-consulta.node.mjs tests/deploy-confirmacao.node.mjs'));
  const consultation = steps.findIndex(step => step.includes('run: node scripts/consultar-deploy.mjs'));
  assert.ok(guard >= 0 && guard < contract && contract < consultation);
  assert.ok(steps[guard].includes(`run: test "$GITHUB_REF" = '${diagnosticRef}'`));
  assert.equal(steps.filter(step => /secrets\./.test(step)).length, 1);
  assert.match(steps[consultation], /DOKPLOY_URL: \$\{\{ secrets\.DOKPLOY_URL \}\}/);
  assert.match(steps[consultation], /DOKPLOY_API_TOKEN: \$\{\{ secrets\.DOKPLOY_API_TOKEN \}\}/);
  assert.match(steps[consultation], /CONSULTA_DEPLOYMENT_ID: \$\{\{ inputs\.deployment_id \}\}/);
  for (const [key, value] of Object.entries({
    CONSULTA_COMPOSE_ID: expectedPin.composeId, CONSULTA_CREATED_AT: expectedPin.createdAt,
    CONSULTA_SHA: expectedPin.sha, CONSULTA_RUN_ID: expectedPin.runId, CONSULTA_RUN_ATTEMPT: expectedPin.runAttempt,
  })) assert.match(steps[consultation], new RegExp(`^          ${key}: ['"]?${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]?$`, 'm'));
  assert.doesNotMatch(steps.slice(guard + 1).join('\n'), /^        if:|continue-on-error/m);
  assert.equal((query.match(/run:/g) ?? []).length, 3);
});
