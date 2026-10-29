/**
 * INT-1.2 (decisão 487) — a chave de cifragem do token só vai para o ambiente do serviço da integração (o worker, que define
 * SERVICO_DA_INTEGRACAO=1 no compose). Web e migrar carregam o mesmo `exportar-segredos.sh` e não recebem a chave.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const temSh = spawnSync('sh', ['-c', 'true']).status === 0;

function carregar(env: Record<string, string>): string {
  const r = spawnSync('sh', ['-c', '. ./scripts/exportar-segredos.sh; echo "chave=${INTEGRACAO_CHAVE_CIFRAGEM+definida}:${INTEGRACAO_CHAVE_CIFRAGEM:-}"'], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', ...env } as unknown as NodeJS.ProcessEnv,
  });
  return r.stdout.trim().split('\n').pop() ?? '';
}

describe.skipIf(!temSh)('INT-1.2 · a chave de cifragem só no worker', () => {
  it('sem SERVICO_DA_INTEGRACAO (web, migrar): a chave não entra no ambiente', () => {
    expect(carregar({})).toBe('chave=:');
  });

  it('no worker (SERVICO_DA_INTEGRACAO=1): a chave entra; o valor do painel vence o do volume', () => {
    expect(carregar({ SERVICO_DA_INTEGRACAO: '1' })).toMatch(/^chave=definida:/);
    expect(carregar({ SERVICO_DA_INTEGRACAO: '1', INTEGRACAO_CHAVE_CIFRAGEM: 'do-painel' })).toBe('chave=definida:do-painel');
  });

  it('o compose marca só o worker', () => {
    const compose = readFileSync('docker-compose.yml', 'utf8');
    expect(compose.match(/SERVICO_DA_INTEGRACAO: "1"/g)).toHaveLength(1);
    const worker = compose.slice(compose.indexOf('\n  worker:'));
    expect(worker.slice(0, worker.indexOf('\n  segredos:') > 0 ? worker.indexOf('\n  segredos:') : undefined)).toContain('SERVICO_DA_INTEGRACAO: "1"');
  });
});
