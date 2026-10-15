/**
 * Guarda estrutural: modelo de tenant só se acessa pelo `doParceiro`. Se alguém
 * escrever `prisma.insumo...` (ou `$queryRaw` citando a tabela) fora do portão,
 * este teste reprova — antes do deploy, não depois do vazamento.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODELOS_DE_TENANT, RELACOES_DE_TENANT } from '@/lib/erp/tenant';

const RAIZES = ['src', 'scripts', 'worker'];
const PORTAO = join('src', 'lib', 'erp', 'tenant.ts');

function arquivos(dir: string): string[] {
  let out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out = out.concat(arquivos(p));
    else if (/\.(ts|tsx|mjs|js)$/.test(n)) out.push(p);
  }
  return out;
}

describe('ERP · ninguém fura o portão de tenant', () => {
  it('nenhum arquivo usa o prisma cru nos modelos de tenant', () => {
    const furos: string[] = [];
    for (const raiz of RAIZES) {
      for (const f of arquivos(raiz)) {
        if (f === PORTAO) continue;
        const txt = readFileSync(f, 'utf8');
        for (const m of MODELOS_DE_TENANT) {
          const tabela = m[0].toUpperCase() + m.slice(1);
          if (new RegExp(`prisma\\s*\\.\\s*${m}\\b`).test(txt)) furos.push(`${f}: prisma.${m}`);
          if (new RegExp(`\\$(queryRaw|executeRaw)[\\s\\S]{0,400}"${tabela}"`).test(txt)) {
            furos.push(`${f}: SQL cru em "${tabela}"`);
          }
        }
        for (const r of RELACOES_DE_TENANT) {
          // include/select/_count/nested write pela relação do parceiro.
          if (new RegExp(`\\b${r}\\s*:`).test(txt)) furos.push(`${f}: relação ${r}`);
        }
      }
    }
    expect(furos).toEqual([]);
  });
});
