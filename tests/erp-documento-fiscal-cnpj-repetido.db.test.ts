/**
 * ERP F.1b · dois cadastros de fornecedor ativos com o MESMO CNPJ (só existe onde o índice único da F.1a não pôde nascer) no
 * Postgres de verdade, num banco DESCARTÁVEL: o cenário exige derrubar o índice `Fornecedor_parceiroId_documento_key`, e um índice
 * derrubado no banco compartilhado quebraria os outros arquivos de teste que rodam ao mesmo tempo. Aqui o banco nasce das migrations
 * (como superusuário), perde o índice e some no fim.
 *
 *  - a nota fiscal desse emitente fica SEM fornecedor: a conferência lista os dois e conciliar sem escolher é recusado;
 *  - escolhendo um dos dois, concilia;
 *  - uma nota lançada à mão para UM dos dois cadastros liga ao documento do mesmo CNPJ (compara o CNPJ, não o cadastro).
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-documento-fiscal-cnpj-repetido.db.test.ts
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));

import { lancarNota } from '@/lib/erp/compras';
import { conciliarDocumento, ligarDocumento, obterDocumento, receberXml, type EntradaDaConferencia } from '@/lib/erp/documentos-fiscais';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { resolverAlcance } from '@/lib/erp/permissoes';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { bytes, montarCenario, xmlDe } from './erp-documento-fiscal-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const MIGRACOES = join(process.cwd(), 'prisma', 'migrations');
const temPsql = spawnSync('psql', ['--version']).status === 0;

function urlDe(banco: string): string {
  const u = new URL(URL_TESTE!);
  u.pathname = `/${banco}`;
  u.search = '';
  return u.toString();
}
const psql = (url: string, args: string[]) => {
  const r = spawnSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', ...args], { encoding: 'utf8' });
  return { ok: r.status === 0, saida: (r.stdout ?? '').trim(), aviso: r.stderr ?? '' };
};
const ehSuper = !!URL_TESTE && temPsql && psql(urlDe('postgres'), ['-c', 'select rolsuper from pg_roles where rolname = current_user']).saida === 't';

describe.skipIf(!URL_TESTE || !temPsql || !ehSuper)('ERP F.1b · dois cadastros com o mesmo CNPJ (banco descartável)', { timeout: 300_000 }, () => {
  const banco = `ff_f1bdup_${globalThis.crypto.randomUUID().slice(0, 8).replace(/-/g, '')}`;
  let db: PrismaClient;
  let a: ClienteDoParceiro;
  const ids: Record<string, string> = {};
  const hoje = hojeNoRio();
  const dataBr = hoje.split('-').reverse().join('/');
  const DONA = () => resolverAlcance({ perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
  const escolhas = (): EntradaDaConferencia['itens'] => [
    { nItem: 1, insumoId: ids.mucarela, embalagem: `v:${ids.peca}`, fator: '1' },
    { nItem: 2, insumoId: ids.bacon, embalagem: `v:${ids.pacote}`, fator: '10' },
    { nItem: 3, insumoId: ids.guardanapo, embalagem: `v:${ids.fardo}`, fator: '1' },
  ];
  const idDe = (r: { ok: boolean }) => {
    if (!r.ok) throw new Error(JSON.stringify(r));
    return (r as unknown as { id: string }).id;
  };

  beforeAll(async () => {
    expect(psql(urlDe('postgres'), ['-c', `CREATE DATABASE ${banco}`]).ok).toBe(true);
    for (const m of readdirSync(MIGRACOES).filter((n) => /^\d{14}_/.test(n)).sort()) {
      const r = psql(urlDe(banco), ['-f', join(MIGRACOES, m, 'migration.sql')]);
      expect(r.ok, `${m}: ${r.aviso.slice(0, 300)}`).toBe(true);
    }
    expect(psql(urlDe(banco), ['-c', 'DROP INDEX "Fornecedor_parceiroId_documento_key"']).ok).toBe(true);
    db = new PrismaClient({ datasources: { db: { url: urlDe(banco) } } });
    const c = await montarCenario(db, 'dup', globalThis.crypto.randomUUID().slice(0, 8));
    a = doParceiro(c.A.id, db);
    Object.assign(ids, c.ids);
    // O primeiro XML cria o fornecedor provisório; o segundo cadastro, com o mesmo CNPJ, só existe porque o índice não está aqui.
    const primeiro = await receberXml(a, DONA(), bytes(xmlDe([], '4520')), 'Marina');
    expect(primeiro.ok).toBe(true);
    await db.$executeRawUnsafe(`INSERT INTO "Fornecedor"(id,"parceiroId",nome,documento,"atualizadoEm") VALUES ('fdup1','${c.A.id}','Laticínios Exemplo - Penha','11222333000181',now())`);
  });

  afterAll(async () => {
    await db?.$disconnect();
    psql(urlDe('postgres'), ['-c', `DROP DATABASE IF EXISTS ${banco} WITH (FORCE)`]);
  });

  it('a nota fiscal fica sem fornecedor, lista os dois, não concilia sem escolher e concilia escolhendo', async () => {
    const id = idDe(await receberXml(a, DONA(), bytes(xmlDe([], '4630')), 'Marina'));
    const d = (await obterDocumento(a, DONA(), id))!;
    expect(d.fornecedor).toBeNull();
    expect(d.fornecedoresCandidatos.map((x) => x.nome).sort()).toEqual(['Laticínios Exemplo', 'Laticínios Exemplo - Penha']);
    const base = { versao: d.versao, data: dataBr, itens: escolhas() };
    expect(await conciliarDocumento(a, DONA(), id, base, 'Marina')).toMatchObject({ ok: false, erros: { fornecedorId: expect.stringMatching(/Escolha o fornecedor/) } });
    expect(await a.notaEntrada.count({ where: { numero: '4630' } })).toBe(0);
    expect(await conciliarDocumento(a, DONA(), id, { ...base, fornecedorId: 'fdup1' }, 'Marina')).toMatchObject({ ok: true });
    expect(await a.notaEntrada.count({ where: { numero: '4630', status: 'LANCADA' } })).toBe(1);
  });

  it('a nota lançada à mão para um dos dois cadastros liga ao documento do mesmo CNPJ, escolhendo o outro cadastro', async () => {
    const original = (await a.fornecedor.findFirst({ where: { nome: 'Laticínios Exemplo' } }))!;
    const manual = await lancarNota(a, DONA(), { lojaId: ids.vp, fornecedorId: original.id, numero: '4640', serie: '1', data: dataBr, frete: '', total: '580,00', itens: [{ insumoId: ids.mucarela, embalagem: 'padrao', quantidade: '2', valor: '580,00' }] }, 'Marina');
    if (!manual.ok) throw new Error(JSON.stringify(manual));
    const id = idDe(await receberXml(a, DONA(), bytes(xmlDe([], '4640')), 'Marina'));
    const d = (await obterDocumento(a, DONA(), id))!;
    // A nota é do cadastro "Laticínios Exemplo"; o CNPJ é o do emitente: é a mesma nota, sem dúvida (mesmo total: sem confirmação).
    expect(d.notaParaLigar).toHaveLength(1);
    expect(d.notaParaLigar[0]).toMatchObject({ id: manual.id, mesmoFornecedor: true, diferencaCentavos: 0 });
    const movs = await a.movimentoEstoque.count();
    const notas = await a.notaEntrada.count();
    expect(await ligarDocumento(a, DONA(), id, manual.id, d.versao, { fornecedorId: 'fdup1' }, 'Marina')).toMatchObject({ ok: true, notaId: manual.id });
    expect(await a.notaEntrada.count()).toBe(notas);
    expect(await a.movimentoEstoque.count()).toBe(movs);
    expect((await obterDocumento(a, DONA(), id))!.situacao).toBe('CONCILIADO');
  });
});
