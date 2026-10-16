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
import { MODELOS_DE_CREDENCIAL, RELACOES_DE_CREDENCIAL } from '@/lib/erp/modelos';

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
  // Exceção explícita e justificada: as credenciais (0.3), lidas antes de
  // saber o parceiro — travadas em `credenciais.ts` (bloco abaixo).
  const modelos = Prisma.dmmf.datamodel.models;
  const delegate = (nome: string) => nome[0].toLowerCase() + nome.slice(1);
  const credenciais = new Set<string>(MODELOS_DE_CREDENCIAL);
  const deTenant = modelos.filter(
    (m) => m.fields.some((f) => f.name === 'parceiroId') && !credenciais.has(delegate(m.name)),
  );
  const nomesDeTenant = new Set(deTenant.map((m) => m.name));

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

describe('ERP 0.3 · credenciais só em credenciais.ts', () => {
  const MODULO = join('src', 'lib', 'erp', 'credenciais.ts');
  const PORTAO = join('src', 'lib', 'erp', 'tenant.ts');
  const modelos = Prisma.dmmf.datamodel.models;
  const delegate = (nome: string) => nome[0].toLowerCase() + nome.slice(1);
  const nomesDeCredencial = new Set<string>(MODELOS_DE_CREDENCIAL.map((m) => m[0].toUpperCase() + m.slice(1)));

  it('a lista de credenciais existe no esquema e só quatro delas carregam parceiroId (vínculo, link, sessão, perfil próprio)', () => {
    const nomes = new Set(modelos.map((m) => delegate(m.name)));
    expect(MODELOS_DE_CREDENCIAL.filter((m) => !nomes.has(m))).toEqual([]);
    const comParceiro = modelos
      .filter((m) => nomesDeCredencial.has(m.name) && m.fields.some((f) => f.name === 'parceiroId'))
      .map((m) => m.name)
      .sort();
    expect(comParceiro).toEqual(['AcessoParceiro', 'ConviteAcesso', 'PerfilAcesso', 'SessaoErp']);
  });

  it('credencial nunca aponta para modelo de tenant (só para ParceiroFlow e entre si)', () => {
    const fora: string[] = [];
    for (const m of modelos) {
      if (!nomesDeCredencial.has(m.name)) continue;
      for (const f of m.fields) {
        if (f.kind === 'object' && f.type !== 'ParceiroFlow' && !nomesDeCredencial.has(f.type)) fora.push(`${m.name}.${f.name}`);
      }
    }
    expect(fora).toEqual([]);
  });

  it('RELACOES_DE_CREDENCIAL é exatamente o conjunto de relações do ParceiroFlow para credenciais', () => {
    const pf = modelos.find((m) => m.name === 'ParceiroFlow')!;
    const rel = pf.fields.filter((f) => f.kind === 'object' && nomesDeCredencial.has(f.type)).map((f) => f.name);
    expect(rel.sort()).toEqual([...RELACOES_DE_CREDENCIAL].sort());
  });

  it('nenhum arquivo fora de credenciais.ts toca nos modelos de credencial (nem por SQL cru, nem pela relação)', () => {
    const furos: string[] = [];
    for (const raiz of RAIZES) {
      for (const f of arquivos(raiz)) {
        if (f === MODULO) continue;
        const txt = readFileSync(f, 'utf8');
        for (const m of MODELOS_DE_CREDENCIAL) {
          const tabela = m[0].toUpperCase() + m.slice(1);
          if (new RegExp(`\\.\\s*${m}\\s*\\.`).test(txt)) furos.push(`${f}: .${m}.`);
          if (new RegExp(`\\$(queryRaw|executeRaw)[\\s\\S]{0,400}"${tabela}"`).test(txt)) furos.push(`${f}: SQL cru em "${tabela}"`);
        }
        for (const r of RELACOES_DE_CREDENCIAL) if (new RegExp(`\\b${r}\\s*:`).test(txt)) furos.push(`${f}: relação ${r}`);
      }
    }
    expect(furos).toEqual([]);
  });

  it('o cliente base sem trava (base.ts) e o fecharComHistorico só aparecem no portão e em credenciais.ts', () => {
    const furos: string[] = [];
    for (const raiz of RAIZES) {
      for (const f of arquivos(raiz)) {
        if (f === MODULO || f === PORTAO || f === join('src', 'lib', 'erp', 'base.ts')) continue;
        const txt = readFileSync(f, 'utf8');
        if (/from\s+['"](\.\/base|@\/lib\/erp\/base)['"]/.test(txt)) furos.push(`${f}: importa base.ts`);
        if (/\bfecharComHistorico\b/.test(txt)) furos.push(`${f}: fecharComHistorico`);
        if (/\bbaseDoErp\b/.test(txt)) furos.push(`${f}: baseDoErp`);
      }
    }
    expect(furos).toEqual([]);
  });
});
