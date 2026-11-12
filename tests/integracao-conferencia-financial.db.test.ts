import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mudarLiberacao } from '@/lib/erp/liberacao';
import type { Alcance } from '@/lib/erp/permissoes';
import { doParceiro } from '@/lib/erp/tenant';
import { lerConferenciaFinancial } from '@/lib/integracoes/core/conferencia-financial';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const url = process.env.ERP_DB_TESTE;
const autor = 'QA conferência mensal';
const rede: Alcance = { nivel: 'REDE', lojas: 'todas', permissoes: new Set(['integracao.ver', 'faturamento.ver']) };

describe.skipIf(!url)('conferência Financial · isolamento entre parceiros e lojas no PostgreSQL descartável', () => {
  let db: PrismaClient, perfil: PerfilDoBanco;
  const parceiros: string[] = [];

  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(url!).hostname)) throw new Error('Somente banco local descartável.');
    db = new PrismaClient({ datasources: { db: { url: url! } } });
    perfil = await perfilDoBanco(db);
  });
  afterAll(async () => {
    if (!db) return;
    try {
      if (parceiros.length) await limparParceiros(db, perfil, parceiros);
    } finally {
      await db.$disconnect();
    }
  }, 60_000);

  async function criarParceiro(homologacaoDeIntegracao: boolean) {
    const p = await db.parceiroFlow.create({
      data: { nome: 'Parceiro sintético', slug: 'conf-' + randomUUID(), status: 'ATIVO', homologacaoDeIntegracao },
    });
    parceiros.push(p.id);
    const cliente = doParceiro(p.id, db);
    const loja = await cliente.loja.create({
      data: { parceiroId: p.id, nome: 'Loja sintética', slug: 'conferencia' }, select: { id: true, nome: true },
    });
    const vinculo = await cliente.integracaoConexao.create({
      data: { parceiroId: p.id, lojaId: loja.id, provedor: 'IFOOD', ambiente: homologacaoDeIntegracao ? 'TEST' : 'PRODUCAO',
        idExterno: randomUUID(), nomeExterno: 'Vínculo sintético', criadoPorNome: autor },
      select: { id: true },
    });
    return { cliente, loja, vinculo, contexto: { parceiroId: p.id, homologacaoDeIntegracao } };
  }

  it('rede e acesso por loja só alcançam os cadastros autorizados, mesmo quando a loja pedida existe em outro parceiro', async () => {
    const a = await criarParceiro(false), b = await criarParceiro(true);
    const outraLoja = await a.cliente.loja.create({
      data: { parceiroId: a.cliente.parceiroId, nome: 'Segunda loja sintética', slug: 'segunda' }, select: { id: true },
    });
    const acesso: Alcance = { ...rede, nivel: 'LOJA', lojas: [a.loja.id] };
    const consultar = (lojaId: string, alcance = acesso) =>
      lerConferenciaFinancial(a.cliente, alcance, a.contexto, { lojaId, competencia: '2026-02' });
    expect(await consultar(a.loja.id)).toMatchObject({ ok: false, motivo: 'nao-liberado' });
    await mudarLiberacao(a.cliente, 'integracao', true, autor);
    await mudarLiberacao(b.cliente, 'integracao', true, autor);
    const resultado = await consultar(a.loja.id);
    expect(resultado).toEqual({
      ok: true, lojas: [a.loja], loja: a.loja, competencia: '2026-02', ambiente: 'PRODUCAO',
      conexoes: [{ id: a.vinculo.id, nome: 'Vínculo sintético', estado: 'ATIVA', estadoFinancial: null }], fonteMensal: 'SEM_DADOS',
      recibos: { total: 0, pagina: 1, paginas: 0, itens: [] },
    });
    const negativa = await consultar(outraLoja.id);
    expect(negativa).toMatchObject({ ok: false, motivo: 'sem-permissao' });
    expect(await consultar(b.loja.id, rede)).toEqual(negativa);
    expect(await lerConferenciaFinancial(a.cliente, rede, b.contexto)).toMatchObject({ ok: false, motivo: 'contexto-invalido' });
    expect(await lerConferenciaFinancial(b.cliente, rede, b.contexto)).toMatchObject({
      ok: true, lojas: [b.loja], ambiente: 'TEST', conexoes: [{ id: b.vinculo.id }], fonteMensal: 'SEM_DADOS',
    });
  }, 60_000);
});
