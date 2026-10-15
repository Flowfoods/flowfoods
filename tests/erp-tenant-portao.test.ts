/**
 * Guarda estrutural: modelo de tenant só se acessa pelo `doParceiro`. Se alguém
 * escrever `prisma.insumo...` (ou `$queryRaw` citando a tabela) fora do portão,
 * este teste reprova — antes do deploy, não depois do vazamento.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
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

  // As listas do portão não podem ficar para trás do esquema: tabela nova com
  // `parceiroId` que ninguém pôs na lista seria acessível pelo prisma cru.
  const modelos = Prisma.dmmf.datamodel.models;
  const deTenant = modelos.filter((m) => m.fields.some((f) => f.name === 'parceiroId'));
  const nomesDeTenant = new Set(deTenant.map((m) => m.name));
  const delegate = (nome: string) => nome[0].toLowerCase() + nome.slice(1);

  it('MODELOS_DE_TENANT é exatamente o conjunto de modelos com parceiroId', () => {
    expect(deTenant.map((m) => delegate(m.name)).sort()).toEqual([...MODELOS_DE_TENANT].sort());
  });

  it('RELACOES_DE_TENANT cobre toda relação de fora do tenant que chega num modelo de tenant', () => {
    const portas: string[] = [];
    for (const m of modelos) {
      if (nomesDeTenant.has(m.name)) continue;
      for (const f of m.fields) if (f.kind === 'object' && nomesDeTenant.has(f.type)) portas.push(`${m.name}.${f.name}`);
    }
    expect(portas.sort()).toEqual(RELACOES_DE_TENANT.map((r) => `ParceiroFlow.${r}`).sort());
  });

  it('toda FK entre modelos de tenant é composta com parceiroId (o banco barra referência cruzada)', () => {
    const simples: string[] = [];
    for (const m of deTenant) {
      for (const f of m.fields) {
        if (f.kind !== 'object' || !f.relationFromFields?.length) continue;
        if (f.type === 'ParceiroFlow') continue;
        const de = f.relationFromFields;
        const para = f.relationToFields ?? [];
        if (de[0] !== 'parceiroId' || para[0] !== 'parceiroId') simples.push(`${m.name}.${f.name}`);
      }
    }
    expect(simples).toEqual([]);
  });

  it('todo unique de tabela de tenant começa por parceiroId', () => {
    const fora: string[] = [];
    for (const m of deTenant) {
      for (const u of m.uniqueFields) if (u[0] !== 'parceiroId') fora.push(`${m.name} @@unique(${u.join(',')})`);
      for (const f of m.fields) if (f.isUnique && !f.isId) fora.push(`${m.name}.${f.name} @unique`);
    }
    expect(fora).toEqual([]);
  });
});
