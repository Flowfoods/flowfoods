import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import { fileURLToPath } from 'node:url';

// O Next inicia o TypeScript por spawn sem execArgv. NODE_OPTIONS leva o limite
// também a esse processo; a última opção prevalece sem apagar as demais.
const child = spawn(process.execPath, [
  fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url)),
  'build', '--webpack', ...process.argv.slice(2),
], {
  stdio: 'inherit',
  shell: false,
  windowsHide: true,
  env: {
    ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --max-old-space-size=6144`.trim(),
  },
});

const handlers = new Map();
let requestedSignal;
let spawnFailed = false;
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  const handler = () => {
    requestedSignal ||= signal;
    child.kill(signal);
  };
  handlers.set(signal, handler);
  process.on(signal, handler);
}
const terminateChild = () => { if (child.exitCode === null && child.signalCode === null) child.kill(); };
process.once('exit', terminateChild);
function cleanup() {
  process.off('exit', terminateChild);
  for (const [signal, handler] of handlers) process.off(signal, handler);
}
child.once('error', () => {
  spawnFailed = true;
  cleanup();
  console.error('Não foi possível iniciar o build do Next.js.');
  process.exitCode = 1;
});
child.once('close', (code, signal) => {
  cleanup();
  const stoppedBy = requestedSignal || signal;
  process.exitCode = spawnFailed ? 1 : stoppedBy ? 128 + (constants.signals[stoppedBy] || 1) : code ?? 1;
});
