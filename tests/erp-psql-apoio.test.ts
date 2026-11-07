import { beforeEach, describe, expect, it, vi } from 'vitest';

const spawn = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ spawnSync: spawn }));

import { executarPsqlDeTeste, prepararPsqlDeTeste } from './erp-psql-apoio';

const URL = 'postgresql://teste@localhost/banco_descartavel';

describe('psql dos testes em Windows e Unix', () => {
  beforeEach(() => spawn.mockReset());

  it('Unix mantém o comando como um argumento e coloca a URL depois de todas as opções', () => {
    const sql = "SELECT 'Integração!'; SELECT 'a;b'";
    expect(prepararPsqlDeTeste(URL, ['-c', sql], 'linux')).toEqual({ args: ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-c', sql, URL] });
  });

  it('Windows transporta o SQL inteiro por ASCII sem alterar acentos, aspas ou transações explícitas', () => {
    const sql = "BEGIN; SELECT 'Integração!', 'a;b', 'd''água'; -- comentário\nSELECT '😀'; COMMIT;";
    const r = prepararPsqlDeTeste(URL, ['-c', sql], 'win32');
    expect(r.args).toEqual(['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-f', '-', URL]);
    expect(r.input).toMatch(/^[\x00-\x7f]+$/);
    const hex = r.input!.match(/decode\('([0-9a-f]+)', 'hex'\)/)![1];
    expect(Buffer.from(hex, 'hex').toString('utf8')).toBe(sql);
    expect(r.input!.match(/\\gexec/g)).toHaveLength(1);
    expect(r.input).not.toMatch(/\bBEGIN\b|\bCOMMIT\b/);
  });

  it('Windows preserva o arquivo de migration e força UTF-8 sem usar stdin', () => {
    spawn.mockReturnValue({ status: 0, stdout: '1\r\n', stderr: '' });
    const arquivo = 'C:\\projeto com espaço\\migration.sql';
    expect(executarPsqlDeTeste(URL, ['-f', arquivo], 'win32')).toEqual({ ok: true, saida: '1', aviso: '' });
    const [, args, options] = spawn.mock.calls[0];
    expect(args).toEqual(['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-f', arquivo, URL]);
    expect(options.input).toBeUndefined();
    expect(options.encoding).toBe('utf8');
    expect(options.env.PGCLIENTENCODING).toBe('UTF8');
  });

  it.each(['\n', '\r\n'])('a saída com quebra %j conserva os valores exatos de todas as linhas', (quebra) => {
    spawn.mockReturnValue({ status: 0, stdout: `invalido=false${quebra}valido=true${quebra}`, stderr: '' });
    const r = executarPsqlDeTeste(URL, ['-c', 'SELECT conname, convalidated FROM pg_constraint'], 'win32');
    expect(r.saida).toBe('invalido=false\nvalido=true');
    expect(Object.fromEntries(r.saida.split('\n').map((linha) => linha.split('=')))).toEqual({ invalido: 'false', valido: 'true' });
  });

  it('normalizar a quebra não remove espaços dos valores, linhas vazias ou retorno de carro isolado', () => {
    spawn.mockReturnValue({ status: 0, stdout: 'a=  nome  \r\n\r\nb=parte\rparte\r\n', stderr: '' });
    const r = executarPsqlDeTeste(URL, ['-c', 'SELECT valor FROM dados'], 'win32');
    expect(r.saida).toBe('a=  nome  \n\nb=parte\rparte');
  });

  it('erros SQL e falhas de processo continuam sendo falhas e preservam o diagnóstico', () => {
    spawn.mockReturnValueOnce({ status: 3, stdout: '', stderr: 'psql:<stdin>:1: ERROR: divisão por zero\n' });
    expect(executarPsqlDeTeste(URL, ['-c', 'SELECT 1/0'], 'win32')).toEqual({ ok: false, saida: '', aviso: 'psql:<stdin>:1: ERROR: divisão por zero\n' });
    spawn.mockReturnValueOnce({ status: null });
    expect(executarPsqlDeTeste(URL, ['-c', 'SELECT 1'], 'win32').ok).toBe(false);
  });

  it('não mistura silenciosamente vários comandos -c e arquivos em um único stdin', () => {
    expect(() => prepararPsqlDeTeste(URL, ['-c', 'SELECT 1', '-f', 'outro.sql'], 'win32')).toThrow('um comando -c por chamada');
  });
});
