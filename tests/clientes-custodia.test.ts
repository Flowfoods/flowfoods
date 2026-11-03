/**
 * LGPD (conselho de Segurança, 02/11/2026; revisão de 03/11/2026): em
 * `clientes/` só entra `.md`. Planilha, compactado, dump, imagem ou PDF podem
 * carregar dado pessoal de terceiros (base de clientes finais, fidelidade,
 * funcionários com contato) e reprovam aqui, rastreados pelo git ou só no
 * disco: o `.gitignore` não segura quem força `git add -f`. Sem git (ex.: cópia
 * sem `.git`), vale a varredura do disco.
 *
 * Limite: a guarda olha a árvore atual e o tipo de arquivo, não o conteúdo nem
 * o histórico. Num repositório público, o push já publica antes do CI: a trava
 * que resolve é o repositório privado.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PASTA = 'clientes';
const PERMITIDO = /\.md$/i;

const MOTIVO =
  'LGPD — em clientes/ só entra .md: planilha, compactado, dump, imagem ou PDF podem carregar dado ' +
  'pessoal de terceiros (base de clientes finais, fidelidade, funcionários com contato, CPF, telefone). ' +
  'Tire o arquivo do repositório (git rm --cached <arquivo>) e guarde o bruto pela "Regra de custódia de ' +
  'dados pessoais de terceiros". Fora do local único só sai o agregado. Arquivo(s) barrado(s)';

/** Dos caminhos dados, os que estão dentro de `clientes/` e não são `.md`. */
function proibidosEmClientes(caminhos: string[]): string[] {
  return caminhos
    .map((c) => c.replace(/\\/g, '/').replace(/^\.\//, ''))
    .filter((c) => c.startsWith(`${PASTA}/`) && !PERMITIDO.test(c));
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

describe('clientes/ · só .md, dado pessoal de terceiros não entra no repositório', () => {
  it('a régua deixa o .md e barra qualquer outro arquivo em clientes/, em qualquer caixa e profundidade', () => {
    const permitidos = [
      'clientes/README.md',
      'clientes/valentins/README.md',
      'clientes/valentins/contexto-valentins-2026-09-25.md',
      'clientes/valentins/sub/diagnostico-2026-10-01.MD',
      // Fora de clientes/ não é desta guarda (os modelos públicos do ERP são .csv).
      'public/modelos/faturamento.csv',
      'clientesantigos/base.csv',
    ];
    const barrados = [
      'clientes/valentins/base.CSV',
      './clientes/valentins/fidelidade.xlsx',
      'clientes\\valentins\\funcionarios.Xls',
      'clientes/valentins/export/2026-11/ifood.ZIP',
      'clientes/valentins/backup.sql',
      'clientes/valentins/print-anota-ai.png',
      'clientes/valentins/relatorio.pdf',
      'clientes/valentins/base.json',
      'clientes/valentins/base.csv.md.bak',
      'clientes/valentins/sem-extensao',
    ];
    expect(proibidosEmClientes(permitidos)).toEqual([]);
    expect(proibidosEmClientes(barrados)).toHaveLength(barrados.length);
  });

  it('nenhum arquivo além de .md em clientes/, nem rastreado pelo git nem no disco', () => {
    const git = rastreados();
    const achados = [
      ...proibidosEmClientes(git ?? []).map((c) => `${c} (rastreado pelo git)`),
      ...proibidosEmClientes(noDisco(PASTA)).map((c) => `${c} (no disco)`),
    ];
    expect(achados, MOTIVO).toEqual([]);
  });

  // O `.gitignore` e esta guarda falam da mesma regra: só .md passa.
  it.skipIf(rastreados() === null)('o .gitignore ignora o que não é .md em clientes/ e não ignora o .md', () => {
    const ignorado = (c: string) => spawnSync('git', ['check-ignore', '-q', '--no-index', c]).status === 0;
    const exemplos = ['csv', 'XLSX', 'zip', 'sql', 'png', 'pdf', 'json'].map(
      (ext) => `${PASTA}/valentins/sub/exemplo.${ext}`,
    );
    expect(exemplos.filter((c) => !ignorado(c)), 'arquivo que não é .md e o .gitignore deixa passar').toEqual([]);
    expect(ignorado(`${PASTA}/README.md`)).toBe(false);
    expect(ignorado(`${PASTA}/valentins/sub/contexto-valentins-2026-09-25.md`)).toBe(false);
  });
});
