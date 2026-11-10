#!/usr/bin/env node
// ENG-1: contexto local e verificações estruturais. Não consulta Notion ou rede.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PROJECT = 'flowfoods-erp';
const REPOSITORY = 'Flowfoods/flowfoods';
const MANIFEST = 'docs/ai/manifest.json';
const CURRENT = 'docs/ai/CURRENT.md';
const SKILL = '.agents/skills/flow-contexto/SKILL.md';
const MIRROR = '.claude/skills/flow-contexto/SKILL.md';
const STAGES = ['implementation_status', 'local_tests_status', 'independent_review_status',
  'user_validation_status', 'merge_status', 'deploy_status', 'operational_status'];
const TECHNICAL_STAGES = ['implementation_status', 'local_tests_status', 'independent_review_status', 'merge_status', 'deploy_status'];
const STATES = new Set(['planned', 'in_progress', 'blocked', 'completed']);
const STAGE_STATES = new Set(['pending', 'in_progress', 'passed', 'failed', 'skipped', 'not_applicable', 'completed']);
const NOTION = 'Não revalidado: comando local sem acesso ao Notion. Reconfirmar o escopo na fonte privada antes de executar; fingerprint não prova consulta ao vivo nem aprovação.';
const fail = (message) => { throw new Error(message); };
const hash = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const normalized = (text) => text.replace(/\r\n/g, '\n');
const canonicalCase = (value) => process.platform === 'win32' ? value.toLowerCase() : value;
const inside = (root, candidate) => canonicalCase(candidate) === canonicalCase(root) ||
  canonicalCase(candidate).startsWith(canonicalCase(root) + path.sep);

function relativeFile(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') || value.includes(':') ||
      path.posix.isAbsolute(value) || /^[a-z]:/i.test(value) ||
      value.split('/').some((part) => !part || part === '.' || part === '..')) {
    fail(`Caminho relativo inválido: ${String(value)}`);
  }
  // Este contexto é público. Não abrir fontes operacionais ou credenciais.
  if (/(^|\/)(\.env(?:\..*)?|\.git|segredos|secrets|credentials|ERP\.md|DECISOES\.md)(\/|$)/i.test(value) ||
      /^clientes\/(?!README\.md$)/i.test(value)) fail(`Fonte fora do contexto público: ${value}`);
  return value;
}

function safeFile(root, relative, { missing = false } = {}) {
  relativeFile(relative);
  const absolute = path.resolve(root, ...relative.split('/'));
  if (!inside(root, absolute)) fail(`Caminho fora do repositório: ${relative}`);
  let ancestor = absolute;
  while (!fs.existsSync(ancestor)) {
    if (!missing) fail(`Arquivo ausente: ${relative}`);
    const parent = path.dirname(ancestor);
    if (parent === ancestor) fail(`Destino inválido: ${relative}`);
    ancestor = parent;
  }
  const resolved = fs.realpathSync.native(ancestor);
  if (!inside(root, resolved)) fail(`Symlink fora do repositório: ${relative}`);
  if (canonicalCase(resolved) !== canonicalCase(ancestor)) fail(`Symlink altera caminho autorizado: ${relative}`);
  if (fs.existsSync(absolute) && !fs.statSync(absolute).isFile()) fail(`Esperado arquivo explícito: ${relative}`);
  return absolute;
}

function read(root, relative) {
  return normalized(fs.readFileSync(safeFile(root, relative), 'utf8'));
}

function git(root, args) {
  try {
    return execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', root, ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
    }).trim();
  } catch { fail(`Verificação Git falhou: ${args[0]}`); }
}

function repositoryState(root, baseline) {
  const top = fs.realpathSync.native(git(root, ['rev-parse', '--show-toplevel']));
  if (canonicalCase(top) !== canonicalCase(root)) fail('Execute na raiz do repositório FlowFoods.');
  const origin = git(root, ['remote', 'get-url', 'origin']);
  if (!/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)Flowfoods\/flowfoods(?:\.git)?\/?$/i.test(origin)) {
    fail(`Repositório incorreto: esperado ${REPOSITORY}.`);
  }
  if (!/^[a-f0-9]{40}$/.test(baseline ?? '')) fail('baseline_commit deve ser um SHA Git completo.');
  if (git(root, ['cat-file', '-t', baseline]) !== 'commit') fail('Baseline não é um commit.');
  const head = git(root, ['rev-parse', 'HEAD']);
  try { git(root, ['merge-base', '--is-ancestor', baseline, head]); }
  catch { fail('Baseline obsoleto: não é ancestral de HEAD. Reconciliar o delivery antes de executar.'); }
  const status = git(root, ['status', '--porcelain=v1', '--untracked-files=all']);
  return { baseline, head, baseline_status: head === baseline ? 'match' : 'ancestor',
    branch: git(root, ['branch', '--show-current']) || '(detached)', dirty: Boolean(status),
    dirty_count: status ? status.split('\n').length : 0 };
}

function frontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text);
  if (!match) fail('Delivery sem frontmatter YAML simples.');
  const fields = {};
  for (const line of match[1].split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const item = /^([a-z][a-z0-9_]*):\s*(.*?)\s*$/.exec(line);
    if (!item || !item[2] || Object.hasOwn(fields, item[1])) fail(`Campo YAML inválido ou duplicado: ${line}`);
    let value = item[2];
    if (/^["']/.test(value)) {
      if (value.at(-1) !== value[0]) fail(`Aspas inválidas: ${item[1]}`);
      value = value.slice(1, -1);
    }
    fields[item[1]] = value;
  }
  return { fields, body: text.slice(match[0].length) };
}

function nextStep(body) {
  const match = /^## Próximo passo\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(body);
  if (!match || !match[1].trim()) fail('Delivery precisa de seção preenchida "## Próximo passo".');
  return match[1].trim();
}

function validateDelivery(manifest, delivery, id) {
  const { fields, body } = frontmatter(delivery);
  for (const key of ['id', 'project_id', 'module', 'execution_state', 'source_revision', 'baseline_commit',
    'authorization_ref', 'assignee', 'reviewer', 'branch', ...STAGES]) {
    if (!fields[key]?.trim() || /^(TODO|TBD|<.*>)$/i.test(fields[key])) fail(`Campo obrigatório ausente: ${key}`);
  }
  if (fields.id !== id || fields.project_id !== PROJECT || fields.module !== manifest.deliveries[id].module ||
      fields.module !== manifest.module) fail('ID, projeto ou módulo do delivery divergente.');
  if (fields.baseline_commit !== manifest.baseline_commit) fail('baseline_commit divergente entre manifest e delivery.');
  if (!Object.hasOwn(manifest.source_revisions, fields.source_revision)) fail('source_revision não é um alias conhecido.');
  if (!STATES.has(fields.execution_state)) fail('execution_state inválido.');
  for (const stage of STAGES) {
    if (!STAGE_STATES.has(fields[stage])) fail(`Estado inválido: ${stage}`);
  }
  // Conclusão técnica exige as etapas técnicas; validação do usuário e adoção conservam estado próprio.
  // O comando valida coerência; não executa testes, revisão humana, deploy ou integração.
  if (fields.execution_state === 'completed' && TECHNICAL_STAGES.some((stage) =>
    !['passed', 'completed', 'not_applicable'].includes(fields[stage]))) {
    fail('Delivery completed com etapa técnica pendente, falha ou skipped; conclusão não comprovada.');
  }
  if (fields.execution_state === 'completed' &&
      (!['passed', 'completed'].includes(fields.implementation_status) ||
       fields.local_tests_status !== 'passed' || fields.independent_review_status !== 'passed' ||
       !['passed', 'completed'].includes(fields.merge_status))) {
    fail('Delivery completed exige implementação e integração concluídas, testes passed e revisão independente passed; conclusão não comprovada.');
  }
  if (['passed', 'completed'].includes(fields.independent_review_status)) {
    const unknown = /^(pending|null|none|unknown|desconhecid[oa]|pendente|not_applicable|unassigned|n[aã]o (definid[oa]|informad[oa]))$/i;
    if (unknown.test(fields.assignee.trim()) || unknown.test(fields.reviewer.trim())) {
      fail('Revisão independente aprovada exige executor e revisor identificados.');
    }
    if (fields.assignee.trim().toLowerCase() === fields.reviewer.trim().toLowerCase()) {
      fail('Revisão independente não pode ser atribuída ao mesmo executor.');
    }
  }
  return { fields, body, next: nextStep(body) };
}

function nextAction(delivery) {
  return delivery.fields.execution_state === 'completed'
    ? 'Não reimplementar. Conferir evidências e pendências de validação/adoção antes de selecionar novo escopo autorizado.'
    : delivery.next;
}

function expectedCurrent(manifest, delivery) {
  const f = delivery.fields;
  return `<!-- GERADO por npm run ai:generate; editar ${manifest.deliveries[f.id].path}. -->\n` +
    `# Contexto atual — ${f.id}\n\n` +
    `- Projeto: \`${PROJECT}\`\n- Repositório: \`${REPOSITORY}\`\n` +
    `- Delivery: [${f.id}](../work/${f.id}.md)\n- Módulo: \`${f.module}\`\n` +
    `- Estado registrado: \`${f.execution_state}\`\n- Baseline: \`${f.baseline_commit}\`\n` +
    `- Revisão da fonte: \`${f.source_revision}\`\n- Responsável: ${f.assignee}\n` +
    `- Revisor: ${f.reviewer}\n- Branch registrada: \`${f.branch}\`\n\n` +
    `## Etapas registradas\n\n${STAGES.map((stage) => `- ${stage}: \`${f[stage]}\``).join('\n')}\n\n` +
    `Esses campos são declarações do delivery; este comando não confirma evidência externa.\n\n` +
    `## Fonte privada\n\n${NOTION}\n\n` +
    `## Próximo passo\n\n${nextAction(delivery)}\n`;
}

function expectedMirror(source) {
  const marker = `<!-- GERADO de ${SKILL}; NÃO EDITAR. sha256:${hash(source)} -->`;
  // Preservar o frontmatter no início para os dois consumidores de skills.
  const front = /^---\n[\s\S]*?\n---\n/.exec(source);
  return front ? `${front[0]}${marker}\n${source.slice(front[0].length)}` : `${marker}\n${source}`;
}

function checkLinks(root, file, content, allowed, generated = {}) {
  const plain = content.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
  const links = /!?\[[^\]\n]*\]\(([^\s)]+)(?:\s+"[^"\n]*")?\)/g;
  for (const match of plain.matchAll(links)) {
    let target = match[1];
    if (/^(?:https?:|mailto:)/i.test(target)) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) fail(`Link local inválido em ${file}.`);
    try { target = decodeURIComponent(target.split('#')[0].split('?')[0]); }
    catch { fail(`Link malformado em ${file}.`); }
    if (!target) continue;
    if (target.startsWith('/') || target.includes('\\')) fail(`Link absoluto em ${file}: ${target}`);
    const relative = path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
    relativeFile(relative);
    if (!allowed.has(relative)) fail(`Link fora do contexto autorizado em ${file}: ${relative}`);
    safeFile(root, relative, { missing: Object.hasOwn(generated, relative) });
  }
}

function load(root, task, generating) {
  const manifest = JSON.parse(read(root, MANIFEST));
  if (manifest.schema_version !== 1 || manifest.project_id !== PROJECT || manifest.repository !== REPOSITORY) {
    fail('Manifest de projeto/repositório incorreto ou schema_version não suportado.');
  }
  if (!/^[a-z][a-z0-9-]*$/.test(manifest.module ?? '')) fail('Módulo inválido.');
  if (!manifest.deliveries || typeof manifest.deliveries !== 'object' || Array.isArray(manifest.deliveries)) fail('deliveries inválido.');
  const id = task ?? manifest.current_delivery;
  if (typeof id !== 'string' || !/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/.test(id) || !Object.hasOwn(manifest.deliveries, id)) {
    fail('Tarefa desconhecida ou fora do contexto autorizado.');
  }
  if (!Object.hasOwn(manifest.deliveries, manifest.current_delivery)) fail('current_delivery desconhecido.');
  const allowed = new Set();
  for (const name of ['allowed_context', 'public_files']) {
    if (!Array.isArray(manifest[name]) || !manifest[name].length) fail(`${name} deve listar arquivos explícitos.`);
    if (new Set(manifest[name]).size !== manifest[name].length) fail(`${name} contém duplicatas.`);
    for (const entry of manifest[name]) {
      relativeFile(entry);
      if (name === 'public_files' && !allowed.has(entry)) fail(`Arquivo público fora do contexto autorizado: ${entry}`);
      allowed.add(entry);
    }
  }
  for (const file of [MANIFEST, CURRENT, SKILL, MIRROR, ...Object.values(manifest.deliveries).map((entry) => entry.path)]) {
    relativeFile(file);
    if (!allowed.has(file)) fail(`Arquivo de controle fora do contexto autorizado: ${file}`);
  }
  for (const file of allowed) safeFile(root, file, { missing: generating && [CURRENT, MIRROR].includes(file) });
  if (!manifest.source_revisions || typeof manifest.source_revisions !== 'object' || Array.isArray(manifest.source_revisions)) fail('source_revisions inválido.');
  for (const [alias, source] of Object.entries(manifest.source_revisions)) {
    if (!/^[a-z][a-z0-9_]*$/.test(alias) || typeof source?.revision !== 'string' || !source.revision.trim() ||
        typeof source.approved_scope !== 'string' || !source.approved_scope.trim() ||
        source.classification !== 'publicable_technical_excerpt' ||
        !['notion', 'local'].includes(source.authority)) fail(`Revisão da fonte inválida: ${alias}`);
    if (source.fingerprint !== `sha256:${hash(source.approved_scope)}`) fail(`Fingerprint da fonte divergente: ${alias}`);
  }
  const gitState = repositoryState(root, manifest.baseline_commit);
  const deliveries = {};
  for (const [deliveryId, entry] of Object.entries(manifest.deliveries)) {
    if (!/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/.test(deliveryId)) fail(`ID de delivery inválido: ${deliveryId}`);
    if (entry.path !== `docs/work/${deliveryId}.md`) fail(`Caminho de delivery inválido: ${deliveryId}`);
    deliveries[deliveryId] = validateDelivery(manifest, read(root, entry.path), deliveryId);
  }
  const generated = {
    [CURRENT]: expectedCurrent(manifest, deliveries[manifest.current_delivery]),
    [MIRROR]: expectedMirror(read(root, SKILL)),
  };
  if (!generating) {
    for (const [file, expected] of Object.entries(generated)) {
      if (read(root, file) !== expected) fail(`Arquivo gerado divergente: ${file}. Execute npm run ai:generate.`);
    }
  }
  for (const file of allowed) {
    if (!file.endsWith('.md')) continue;
    checkLinks(root, file, generating && Object.hasOwn(generated, file) ? generated[file] : read(root, file),
      allowed, generating ? generated : {});
  }
  return { manifest, id, gitState, delivery: deliveries[id], generated };
}

export function run(command, { root = process.cwd(), task } = {}) {
  if (!['generate', 'check', 'context'].includes(command)) fail('Comando inválido. Use generate, check ou context.');
  if (task !== undefined && command !== 'context') fail('--task só é permitido em context.');
  root = fs.realpathSync.native(root);
  const state = load(root, task, command === 'generate');
  if (command === 'generate') {
    for (const [file, content] of Object.entries(state.generated)) {
      const absolute = safeFile(root, file, { missing: true });
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      safeFile(root, file, { missing: true });
      if (!fs.existsSync(absolute) || read(root, file) !== content) fs.writeFileSync(absolute, content, 'utf8');
    }
    return { command, generated: Object.keys(state.generated), notion: NOTION };
  }
  const f = state.delivery.fields;
  return { command, project_id: PROJECT, repository: REPOSITORY, task: state.id,
    module: f.module, git: state.gitState, execution_state: f.execution_state,
    next_action: nextAction(state.delivery),
    recorded_stages: Object.fromEntries(STAGES.map((stage) => [stage, f[stage]])),
    validation: 'Coerência estrutural local; não comprova testes, revisão independente, merge, deploy, adoção ou aprovação externa.',
    notion: NOTION, allowed_context: state.manifest.allowed_context };
}

export function cli(args = process.argv.slice(2)) {
  try {
    const [command, ...options] = args;
    if (options.length && !(options.length === 2 && options[0] === '--task')) fail('Argumentos inválidos. Uso: ai:context -- --task FT-FILTROS-UX');
    const result = run(command, { task: options[1] });
    console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (error) {
    console.error(`ai-context: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = cli();
