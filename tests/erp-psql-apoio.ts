import { spawnSync } from 'node:child_process';

const OPCOES = ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A'];

/** O psql do Windows recebe `-c` pela página ANSI, mesmo quando a conexão é UTF-8. */
export function prepararPsqlDeTeste(url: string, args: string[], plataforma: NodeJS.Platform = process.platform): { args: string[]; input?: string } {
  if (plataforma === 'win32' && args.includes('-c')) {
    if (args.length !== 2 || args[0] !== '-c') throw new Error('O harness Windows aceita um comando -c por chamada.');
    // Uma célula e um \gexec enviam o SQL inteiro como uma consulta, como -c. Não dividir por
    // ponto e vírgula nem abrir outra transação: há CREATE DATABASE e BEGIN/COMMIT explícitos.
    const hex = Buffer.from(args[1], 'utf8').toString('hex');
    return { args: [...OPCOES, '-f', '-', url], input: `SELECT convert_from(decode('${hex}', 'hex'), 'UTF8') \\gexec\n` };
  }
  return { args: [...OPCOES, ...args, url] };
}

export function executarPsqlDeTeste(url: string, args: string[], plataforma: NodeJS.Platform = process.platform) {
  const comando = prepararPsqlDeTeste(url, args, plataforma);
  const r = spawnSync('psql', comando.args, {
    encoding: 'utf8',
    ...(comando.input === undefined ? {} : { input: comando.input }),
    // Os arquivos de migration e a saída também são UTF-8; não trocar tudo para WIN1252.
    ...(plataforma === 'win32' ? { env: { ...process.env, PGCLIENTENCODING: 'UTF8' } } : {}),
  });
  return { ok: r.status === 0, saida: (r.stdout ?? '').replace(/\r\n/g, '\n').trim(), aviso: r.stderr ?? '' };
}
