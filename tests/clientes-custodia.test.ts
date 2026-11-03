/**
 * LGPD (conselho de Segurança, 02/11/2026): dado pessoal de terceiros — base de
 * clientes finais, fidelidade, funcionários com contato — nunca entra no
 * repositório; só o agregado. Planilha e compactado em `clientes/` reprovam
 * aqui, rastreados pelo git ou só no disco: o `.gitignore` não segura quem
 * força `git add -f`. Sem git (ex.: cópia sem `.git`), vale a varredura do disco.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PASTA = 'clientes';
// A mesma lista do `.gitignore`. Extensão em maiúscula também conta.
const EXTENSOES = [
  'csv', 'tsv', 'xlsx', 'xls', 'xlsm', 'xlsb', 'ods', 'numbers',
  'zip', '7z', 'rar', 'gz', 'tgz', 'tar', 'sql',
];
const PROIBIDA = new RegExp(`\\.(${EXTENSOES.join('|')})$`, 'i');

const MOTIVO =
  'LGPD — planilha e compactado não entram em clientes/: podem carregar dado pessoal de terceiros ' +
  '(base de clientes finais, fidelidade, funcionários com contato, CPF, telefone). Tire o arquivo do ' +
  'repositório (git rm --cached <arquivo>) e guarde o bruto pela "Regra de custódia de dados pessoais ' +
  'de terceiros". Aqui entra só o número agregado ou pseudonimizado, em .md. Arquivo(s) barrado(s)';

/** Dos caminhos dados, os que são planilha ou compactado dentro de `clientes/`. */
function proibidosEmClientes(caminhos: string[]): string[] {
  return caminhos
    .map((c) => c.replace(/\\/g, '/').replace(/^\.\//, ''))
    .filter((c) => c.startsWith(`${PASTA}/`) && PROIBIDA.test(c));
}

/** O que o git rastreia em `clientes/` — `null` se não há git ou repositório. */
function rastreados(): string[] | null {
  const r = spawnSync('git', ['ls-files', '-z', '--', PASTA], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  return r.stdout.split('\0').filter(Boolean);
}

function noDisco(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = `${dir}/${e.name}`;
    return e.isDirectory() ? noDisco(p) : [p];
  });
}

describe('clientes/ · dado pessoal de terceiros não entra no repositório', () => {
  it('a régua barra planilha e compactado em clientes/, em qualquer caixa e profundidade, e deixa o .md', () => {
    const permitidos = [
      'clientes/README.md',
      'clientes/valentins/README.md',
      'clientes/valentins/contexto-valentins-2026-09-25.md',
      'clientes/valentins/diagnostico-2026-10-01.md',
      'clientes/valentins/base.csv.md',
      // Fora de clientes/ não é desta guarda (os modelos públicos do ERP são .csv).
      'public/modelos/faturamento.csv',
      'clientesantigos/base.csv',
    ];
    const barrados = [
      'clientes/valentins/base.CSV',
      'clientes/valentins/base.csv',
      './clientes/valentins/fidelidade.xlsx',
      'clientes\\valentins\\funcionarios.Xls',
      'clientes/valentins/vendas.xlsm',
      'clientes/valentins/clube.tsv',
      'clientes/valentins/equipe.ods',
      'clientes/valentins/export/2026-11/ifood.ZIP',
      'clientes/valentins/backup.7z',
      'clientes/base.rar',
    ];
    expect(proibidosEmClientes(permitidos)).toEqual([]);
    expect(proibidosEmClientes(barrados)).toHaveLength(barrados.length);
    expect(proibidosEmClientes(['clientes/valentins/base.CSV'])).toEqual(['clientes/valentins/base.CSV']);
  });

  it('nenhuma planilha ou compactado em clientes/, nem rastreado pelo git nem no disco', () => {
    const git = rastreados();
    const achados = [
      ...proibidosEmClientes(git ?? []).map((c) => `${c} (rastreado pelo git)`),
      ...proibidosEmClientes(noDisco(PASTA)).map((c) => `${c} (no disco)`),
    ];
    expect(achados, MOTIVO).toEqual([]);
  });

  // O `.gitignore` e esta guarda falam da mesma lista: extensão nova entra nos dois.
  it.skipIf(rastreados() === null)('o .gitignore ignora cada extensão barrada e não ignora o .md', () => {
    const ignorado = (c: string) => spawnSync('git', ['check-ignore', '-q', '--no-index', c]).status === 0;
    const fora = EXTENSOES.flatMap((ext) => [ext, ext.toUpperCase()])
      .map((ext) => `${PASTA}/valentins/sub/exemplo.${ext}`)
      .filter((c) => !ignorado(c));
    expect(fora, 'extensão barrada pelo teste e esquecida no .gitignore').toEqual([]);
    expect(ignorado(`${PASTA}/valentins/contexto-valentins-2026-09-25.md`)).toBe(false);
  });
});
