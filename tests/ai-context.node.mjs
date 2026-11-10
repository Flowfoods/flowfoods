import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { run } from '../scripts/ai-context.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/ai-context.mjs', import.meta.url));
const MANIFEST = 'docs/ai/manifest.json';
const DELIVERY = 'docs/work/FT-FILTROS-UX.md';
const CURRENT = 'docs/ai/CURRENT.md';
const SOURCE = '.agents/skills/flow-contexto/SKILL.md';
const MIRROR = '.claude/skills/flow-contexto/SKILL.md';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flowfoods-eng1-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).trim();
  const write = (file, content) => {
    const absolute = path.join(root, file);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  };
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
  git('init', '--initial-branch=master');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'ENG-1 fixture');
  git('remote', 'add', 'origin', 'https://github.com/Flowfoods/flowfoods.git');
  write('README.md', '# Fixture sintética\n');
  git('add', 'README.md');
  git('commit', '-m', 'fixture baseline');
  const baseline = git('rev-parse', 'HEAD');
  const approvedScope = 'Somente resumo técnico sintético publicável.';
  const manifest = {
    schema_version: 1, project_id: 'flowfoods-erp', repository: 'Flowfoods/flowfoods',
    current_delivery: 'FT-FILTROS-UX', module: 'fichas', baseline_commit: baseline,
    source_revisions: { notion_ft: { revision: '2026-11-10T00:00:00.000Z', authority: 'notion',
      fingerprint: `sha256:${createHash('sha256').update(approvedScope).digest('hex')}`,
      classification: 'publicable_technical_excerpt', approved_scope: approvedScope } },
    allowed_context: ['README.md', 'AGENTS.md', 'CLAUDE.md', 'docs/ai/INDEX.md', CURRENT, MANIFEST,
      'docs/modules/fichas.md', DELIVERY, SOURCE, MIRROR],
    public_files: ['AGENTS.md', 'CLAUDE.md', 'docs/ai/INDEX.md', CURRENT, MANIFEST, 'docs/modules/fichas.md', DELIVERY, SOURCE, MIRROR],
    deliveries: { 'FT-FILTROS-UX': { path: DELIVERY, module: 'fichas' } },
  };
  const saveManifest = () => write(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  saveManifest();
  write('AGENTS.md', '# FlowFoods\n\n[Índice](docs/ai/INDEX.md)\n');
  write('CLAUDE.md', '# FlowFoods\n\n[Regras](AGENTS.md)\n');
  write('docs/ai/INDEX.md', '# Índice\n\n[Delivery](../work/FT-FILTROS-UX.md)\n\n[Atual](CURRENT.md)\n');
  write('docs/modules/fichas.md', '# Fichas\n\nResumo sintético.\n');
  write(SOURCE, '---\nname: flow-contexto\ndescription: Contexto local FlowFoods\n---\n\n# Skill\n\nConsultar a lista autorizada.\n');
  write(DELIVERY, `---\nid: FT-FILTROS-UX\nproject_id: flowfoods-erp\nmodule: fichas\nexecution_state: planned\nsource_revision: notion_ft\nbaseline_commit: ${baseline}\nauthorization_ref: user_eng1_fixture\nassignee: executor_fixture\nreviewer: reviewer_fixture\nbranch: feat/eng1-fixture\nimplementation_status: pending\nlocal_tests_status: pending\nindependent_review_status: pending\nuser_validation_status: pending\nmerge_status: pending\ndeploy_status: pending\noperational_status: pending\n---\n\n# FT-FILTROS-UX\n\n## Próximo passo\n\nReconfirmar escopo no Notion e revisar a evidência antes da implementação.\n`);
  const setFields = (values) => {
    let content = read(DELIVERY);
    for (const [key, value] of Object.entries(values)) content = content.replace(new RegExp(`^${key}:.*$`, 'm'), `${key}: ${value}`);
    write(DELIVERY, content);
  };
  run('generate', { root });
  return { root, git, manifest, baseline, write, read, saveManifest, setFields,
    run: (command, options = {}) => run(command, { root, ...options }) };
}

test('gera CURRENT pelo delivery e espelho idêntico à fonte com marcador/hash', (t) => {
  const f = fixture(t);
  const mirror = f.read(MIRROR);
  assert.ok(mirror.startsWith('---\nname: flow-contexto\n'));
  assert.equal(mirror.replace(/<!-- GERADO de .*? -->\n/, ''), f.read(SOURCE));
  assert.match(mirror, /sha256:[a-f0-9]{64}/);
  assert.match(f.read(CURRENT), /Estado registrado: `planned`/);
  f.setFields({ execution_state: 'in_progress', implementation_status: 'in_progress' });
  f.run('generate');
  assert.match(f.read(CURRENT), /Estado registrado: `in_progress`/);
  assert.equal(f.run('check').execution_state, 'in_progress');
});

test('context informa baseline, HEAD e Git sujo sem modificar arquivos', (t) => {
  const f = fixture(t);
  f.git('add', '.');
  f.git('commit', '-m', 'fixture context');
  const clean = f.run('context', { task: 'FT-FILTROS-UX' });
  assert.equal(clean.git.dirty, false);
  assert.equal(clean.git.baseline, f.baseline);
  assert.notEqual(clean.git.head, f.baseline);
  assert.equal(clean.git.baseline_status, 'ancestor');
  f.write('README.md', '# Fixture alterada\n');
  const before = f.manifest.allowed_context.map((file) => [file, f.read(file), fs.statSync(path.join(f.root, file)).mtimeMs]);
  const dirty = f.run('context');
  assert.equal(dirty.git.dirty, true);
  assert.equal(dirty.git.dirty_count, 1);
  assert.deepEqual(dirty.allowed_context, f.manifest.allowed_context);
  f.run('check');
  for (const [file, content, mtime] of before) {
    assert.equal(f.read(file), content);
    assert.equal(fs.statSync(path.join(f.root, file)).mtimeMs, mtime);
  }
  assert.equal(fs.existsSync(path.join(f.root, '.git/index.lock')), false);
});

test('recusa projeto e repositório errados', (t) => {
  const f = fixture(t);
  f.manifest.project_id = 'bibi';
  f.saveManifest();
  assert.throws(() => f.run('context'), /projeto\/repositório incorreto/);
  f.manifest.project_id = 'flowfoods-erp';
  f.saveManifest();
  f.git('remote', 'set-url', 'origin', 'https://github.com/Other/flowfoods.git');
  assert.throws(() => f.run('check'), /Repositório incorreto/);
});

test('recusa delivery de outro projeto e baseline divergente', (t) => {
  const f = fixture(t);
  f.setFields({ project_id: 'mi-ozorio' });
  assert.throws(() => f.run('generate'), /projeto ou módulo/);
  f.setFields({ project_id: 'flowfoods-erp', baseline_commit: 'f'.repeat(40) });
  assert.throws(() => f.run('generate'), /baseline_commit divergente/);
});

test('recusa baseline existente que não pertence à história de HEAD', (t) => {
  const f = fixture(t);
  const tree = f.git('rev-parse', 'HEAD^{tree}');
  const unrelated = f.git('commit-tree', tree, '-m', 'unrelated baseline');
  f.manifest.baseline_commit = unrelated;
  f.saveManifest();
  f.setFields({ baseline_commit: unrelated });
  assert.throws(() => f.run('generate'), /Baseline obsoleto/);
});

test('delivery concluído orienta não reimplementar e não alega aprovação externa', (t) => {
  const f = fixture(t);
  f.setFields({ execution_state: 'completed', implementation_status: 'completed', local_tests_status: 'passed',
    independent_review_status: 'passed', user_validation_status: 'passed', merge_status: 'completed',
    deploy_status: 'completed', operational_status: 'passed' });
  f.run('generate');
  const result = f.run('context');
  assert.match(result.next_action, /Não reimplementar/);
  assert.match(f.read(CURRENT), /## Próximo passo\n\nNão reimplementar/);
  assert.doesNotMatch(f.read(CURRENT), /antes da implementação/);
  assert.match(result.validation, /não comprova/);
  assert.match(result.notion, /Não revalidado/);
});

test('Notion offline permanece não revalidado mesmo com fingerprint válido', (t) => {
  const f = fixture(t);
  const result = f.run('context');
  assert.match(result.notion, /sem acesso ao Notion/);
  assert.match(result.notion, /fingerprint não prova consulta ao vivo nem aprovação/);
  assert.match(f.read(CURRENT), /Reconfirmar o escopo na fonte privada/);
  assert.equal(result.recorded_stages.independent_review_status, 'pending');
  assert.equal(result.recorded_stages.user_validation_status, 'pending');
});

test('conclusão técnica preserva validação do usuário e adoção pendentes', (t) => {
  const f = fixture(t);
  f.setFields({ execution_state: 'completed', implementation_status: 'completed', local_tests_status: 'passed',
    independent_review_status: 'passed', merge_status: 'completed', deploy_status: 'completed' });
  f.run('generate');
  const result = f.run('context');
  assert.equal(result.execution_state, 'completed');
  assert.equal(result.recorded_stages.user_validation_status, 'pending');
  assert.equal(result.recorded_stages.operational_status, 'pending');
  assert.match(result.next_action, /pendências de validação\/adoção/);
  assert.match(f.read(CURRENT), /user_validation_status: `pending`/);
  assert.match(f.read(CURRENT), /operational_status: `pending`/);
  assert.match(f.read(CURRENT), /pendências de validação\/adoção/);
  f.setFields({ deploy_status: 'not_applicable' });
  f.run('generate');
  assert.equal(f.run('check').recorded_stages.deploy_status, 'not_applicable');
  assert.equal(f.run('context').recorded_stages.user_validation_status, 'pending');
  assert.equal(f.run('context').recorded_stages.operational_status, 'pending');
  for (const mergeStatus of ['not_applicable', 'pending']) {
    f.setFields({ merge_status: mergeStatus });
    assert.throws(() => f.run('generate'), /conclusão não comprovada/);
  }
});

for (const status of ['pending', 'skipped', 'failed', 'not_applicable']) {
  test(`testes ${status} nunca aparecem como aprovados ou permitem completed`, (t) => {
    const f = fixture(t);
    f.setFields({ local_tests_status: status });
    f.run('generate');
    assert.equal(f.run('context').recorded_stages.local_tests_status, status);
    f.setFields({ execution_state: 'completed', implementation_status: 'completed', independent_review_status: 'passed',
      user_validation_status: 'passed', merge_status: 'completed', deploy_status: 'completed', operational_status: 'passed' });
    assert.throws(() => f.run('generate'), /conclusão não comprovada/);
  });
}

test('executor não pode registrar revisão independente de si próprio', (t) => {
  const f = fixture(t);
  f.setFields({ reviewer: 'executor_fixture', independent_review_status: 'passed' });
  assert.throws(() => f.run('generate'), /mesmo executor/);
});

test('revisão aprovada exige executor e revisor identificados', (t) => {
  const f = fixture(t);
  for (const missing of ['pending', 'null', 'desconhecido', 'Não definido', 'unassigned']) {
    f.setFields({ reviewer: missing, assignee: 'executor_fixture', independent_review_status: 'passed' });
    assert.throws(() => f.run('generate'), /executor e revisor identificados/);
    f.setFields({ reviewer: 'reviewer_fixture', assignee: missing });
    assert.throws(() => f.run('generate'), /executor e revisor identificados/);
  }
});

test('não usa symlink interno como atalho para ler arquivo não autorizado', (t) => {
  const f = fixture(t);
  f.write('private/context.md', '# Conteúdo que não pode ser lido\n');
  fs.symlinkSync(path.join(f.root, 'private'), path.join(f.root, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
  f.manifest.allowed_context.push('alias/context.md');
  f.saveManifest();
  assert.throws(() => f.run('context'), /Symlink altera caminho autorizado/);
});

test('detecta adulteração no espelho e CURRENT sem sobrescrever no check', (t) => {
  const f = fixture(t);
  f.write(MIRROR, f.read(MIRROR) + '\nAlteração indevida\n');
  assert.throws(() => f.run('check'), /Arquivo gerado divergente/);
  assert.match(f.read(MIRROR), /Alteração indevida/);
  f.run('generate');
  f.write(CURRENT, f.read(CURRENT).replace('`planned`', '`completed`'));
  assert.throws(() => f.run('context'), /Arquivo gerado divergente/);
});

test('detecta alterações da fonte canônica e fingerprint de revisão', (t) => {
  const f = fixture(t);
  f.write(SOURCE, f.read(SOURCE) + '\nNova regra.\n');
  assert.throws(() => f.run('check'), /Arquivo gerado divergente/);
  f.run('generate');
  assert.match(f.read(MIRROR), /Nova regra/);
  f.manifest.source_revisions.notion_ft.approved_scope = 'Escopo alterado sem novo fingerprint';
  f.saveManifest();
  assert.throws(() => f.run('check'), /Fingerprint da fonte divergente/);
});

test('recusa link local quebrado e link para arquivo fora do contexto', (t) => {
  const f = fixture(t);
  f.write('docs/modules/fichas.md', '# Fichas\n\n[Ausente](ausente.md)\n');
  assert.throws(() => f.run('check'), /fora do contexto autorizado/);
  f.manifest.allowed_context.push('docs/modules/ausente.md');
  f.saveManifest();
  assert.throws(() => f.run('check'), /Arquivo ausente/);
});

test('recusa tarefa arbitrária, traversal, diretórios e fontes privadas', (t) => {
  const f = fixture(t);
  for (const task of ['../FT-FILTROS-UX', '/tmp/secret', 'FT-OUTRA', '__proto__']) {
    assert.throws(() => f.run('context', { task }), /Tarefa desconhecida/);
  }
  for (const entry of ['../outside.md', 'docs', '.env', 'docs/ERP.md', 'clientes/pessoa.md']) {
    f.manifest.allowed_context.push(entry);
    f.saveManifest();
    assert.throws(() => f.run('check'), /Caminho relativo inválido|Esperado arquivo explícito|Fonte fora do contexto público/);
    f.manifest.allowed_context.pop();
  }
  f.manifest.public_files.push('private/context.md');
  f.saveManifest();
  assert.throws(() => f.run('check'), /Arquivo público fora do contexto autorizado/);
});

test('não segue symlink/junction para fora nem para gerar espelho', (t) => {
  const f = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'flowfoods-eng1-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, 'private.md'), 'SENTINELA PRIVADA');
  fs.symlinkSync(outside, path.join(f.root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  f.manifest.allowed_context.push('escape/private.md');
  f.saveManifest();
  assert.throws(() => f.run('context'), /Symlink fora do repositório/);
  f.manifest.allowed_context.pop();
  f.saveManifest();
  fs.rmSync(path.join(f.root, '.claude'), { recursive: true, force: true });
  fs.symlinkSync(outside, path.join(f.root, '.claude'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => f.run('generate'), /Symlink fora do repositório/);
  assert.deepEqual(fs.readdirSync(outside), ['private.md']);
});

test('campos editoriais obrigatórios, IDs e próximo passo são verificados', (t) => {
  const f = fixture(t);
  f.setFields({ authorization_ref: 'TODO' });
  assert.throws(() => f.run('generate'), /authorization_ref/);
  f.setFields({ authorization_ref: 'fixture', id: 'FT-OUTRA' });
  assert.throws(() => f.run('generate'), /ID, projeto ou módulo/);
  f.setFields({ id: 'FT-FILTROS-UX' });
  f.write(DELIVERY, f.read(DELIVERY).replace(/## Próximo passo[\s\S]*/, '## Próximo passo\n'));
  assert.throws(() => f.run('generate'), /Próximo passo/);
});

test('CLI falha com código não zero e não aceita opções de arquivos arbitrários', (t) => {
  const f = fixture(t);
  const invalid = spawnSync(process.execPath, [SCRIPT, 'context', '--task', '../secret'], { cwd: f.root, encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Tarefa desconhecida/);
  const arbitrary = spawnSync(process.execPath, [SCRIPT, 'check', '--file', 'README.md'], { cwd: f.root, encoding: 'utf8' });
  assert.equal(arbitrary.status, 1);
  assert.match(arbitrary.stderr, /Argumentos inválidos/);
});
