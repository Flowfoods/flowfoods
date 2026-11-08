import { afterEach, describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

const raiz = process.cwd();
const temporarios: string[] = [];
const memoria = `const v8 = require('node:v8');
const medida = () => ({ heap: v8.getHeapStatistics().heap_size_limit,
  semAvisos: /(?:^|\\s)--no-warnings(?:\\s|$)/.test(process.env.NODE_OPTIONS || '') });`;

function preparar(corpo: string) {
  const pasta = mkdtempSync(join(tmpdir(), 'flowfoods-build-'));
  temporarios.push(pasta);
  mkdirSync(join(pasta, 'scripts'));
  mkdirSync(join(pasta, 'node_modules/next/dist/bin'), { recursive: true });
  copyFileSync(join(raiz, 'scripts/build.mjs'), join(pasta, 'scripts/build.mjs'));
  writeFileSync(join(pasta, 'node_modules/next/dist/bin/next'), corpo);
  return pasta;
}
function executar(pasta: string, opcoes = '', argumentos: string[] = []) {
  return spawnSync(process.execPath, [join(pasta, 'scripts/build.mjs'), ...argumentos], {
    cwd: pasta, encoding: 'utf8', timeout: 15_000, windowsHide: true,
    env: { ...process.env, NODE_OPTIONS: opcoes },
  });
}
afterEach(() => {
  for (const pasta of temporarios.splice(0)) {
    // Apagar somente os diretórios temporários exclusivos criados neste teste.
    if (dirname(resolve(pasta)) !== resolve(tmpdir()) || !basename(pasta).startsWith('flowfoods-build-')) {
      throw new Error('Diretório temporário fora do escopo');
    }
    rmSync(pasta, { recursive: true, force: true });
  }
});

describe('limite de memória do build e seus filhos', () => {
  it.each(['--no-warnings', '--no-warnings --max_old_space_size=1024'])('leva 6 GiB ao Next e ao CLI real do TypeScript preservando %s', (opcoes) => {
    const cli = join(raiz, 'node_modules/next/dist/lib/typescript/runTypeScriptCli.js');
    const pasta = preparar(`${memoria}
const path = require('node:path');
const { runTypeScriptCli } = require(${JSON.stringify(cli)});
(async () => {
  const r = await runTypeScriptCli({ cwd: process.cwd(), tscPath: path.join(process.cwd(), 'tsc.cjs'), args: [], captureOutput: true });
  if (r.exitCode !== 0 || r.stderr) process.exit(2);
  process.stdout.write(JSON.stringify({ next: medida(), tsc: JSON.parse(r.stdout) }));
})();`);
    writeFileSync(join(pasta, 'tsc.cjs'), `${memoria}\nprocess.stdout.write(JSON.stringify(medida()));`);
    const esperado = spawnSync(process.execPath, ['--max-old-space-size=6144', '-p', "require('node:v8').getHeapStatistics().heap_size_limit"], {
      encoding: 'utf8', timeout: 10_000, windowsHide: true, env: { ...process.env, NODE_OPTIONS: '' },
    });
    expect(esperado.status).toBe(0);
    const resultado = executar(pasta, opcoes);
    expect(resultado.error).toBeUndefined();
    expect(resultado.status).toBe(0);
    expect(resultado.stderr).toBe('');
    expect(JSON.parse(resultado.stdout)).toEqual({
      next: { heap: Number(esperado.stdout.trim()), semAvisos: true },
      tsc: { heap: Number(esperado.stdout.trim()), semAvisos: true },
    });
  });

  it('preserva argumentos com espaços e caracteres de shell como argumentos literais', () => {
    const pasta = preparar('process.stdout.write(JSON.stringify(process.argv.slice(2)));');
    const extras = ['--debug-build-paths', 'src/app/com espaço/page.tsx', '$(comando-inexistente);&'];
    const resultado = executar(pasta, '', extras);
    expect(resultado.status).toBe(0);
    expect(JSON.parse(resultado.stdout)).toEqual(['build', '--webpack', ...extras]);
  });

  it('propaga código de saída não zero do filho', () => {
    expect(executar(preparar('process.exitCode = 37;')).status).toBe(37);
  });

  // Windows encerra o processo à força em kill(SIGTERM), sem permitir handler
  // no filho. O cenário de tratamento POSIX é executado no CI Linux.
  it.skipIf(process.platform === 'win32')('interrupção continua falha quando o filho trata SIGTERM e sai zero', async () => {
    const pasta = preparar(`process.on('SIGTERM', () => process.exit(0));
process.stdout.write('pronto\\n');
setTimeout(() => process.exit(98), 4000);`);
    const code = await new Promise<number | null>((resolveExit, reject) => {
      const child = spawn(process.execPath, [join(pasta, 'scripts/build.mjs')], {
        cwd: pasta, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_OPTIONS: '' },
      });
      let saida = '';
      let enviado = false;
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (texto: string) => {
        saida += texto;
        if (!enviado && saida.includes('pronto\n')) { enviado = true; child.kill('SIGTERM'); }
      });
      child.once('error', reject);
      child.once('close', (resultado) => resolveExit(resultado));
    });
    expect(code).toBe(143);
  }, 10_000);

  it('preserva opções com um caminho entre aspas sem reinterpretá-las', () => {
    const pasta = preparar("process.stdout.write(JSON.stringify({carregado: process.env.FF_TESTE_BUILD_PRELOAD === 'sim'}));");
    const preload = join(pasta, 'preload com espaço.cjs');
    writeFileSync(preload, "process.env.FF_TESTE_BUILD_PRELOAD = 'sim';");
    const resultado = executar(pasta, `--require ${JSON.stringify(preload.replaceAll('\\', '/'))} --no-warnings`);
    expect(resultado.status).toBe(0);
    expect(JSON.parse(resultado.stdout)).toEqual({ carregado: true });
  });

  it('o comando de produção mantém Prisma e usa o launcher testado', () => {
    const pkg = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'));
    expect(pkg.scripts.build).toBe('prisma generate && node scripts/build.mjs');
    expect(pkg.scripts.start).toBe('next start');
  });
});
