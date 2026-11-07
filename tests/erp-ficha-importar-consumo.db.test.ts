/** Regressão do importador real: uma planilha sem consumo imediato não desmarca a ficha. */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarFicha, obterFicha } from '@/lib/erp/fichas';
import { importarFichas, previaDaImportacao } from '@/lib/erp/ficha-importar';
import { listarHistorico } from '@/lib/erp/historico';
import { cadastrarInsumoDeTeste, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;

describe.skipIf(!URL_TESTE)('reimportação de ficha de consumo imediato (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  let parceiro: { id: string };
  let cliente: ClienteDoParceiro;
  let insumoId: string;

  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    parceiro = await db.parceiroFlow.create({ data: { nome: 'Importação sintética', slug: `importacao-consumo-${crypto.randomUUID()}`, status: 'ATIVO' } });
    cliente = doParceiro(parceiro.id, db);
    const insumo = await cadastrarInsumoDeTeste(cliente, { nome: 'Polpa sintética', tipo: 'INGREDIENTE', unidade: 'KG', escala: 'base', conteudo: '1', preco: '30,00' });
    if (!insumo.ok) throw new Error(JSON.stringify(insumo));
    insumoId = insumo.id;
  });

  afterAll(async () => {
    if (db) {
      if (parceiro) await limparParceiros(db, perfil, [parceiro.id]);
      await db.$disconnect();
    }
  });

  async function criar(nome: string) {
    const ficha = await cadastrarFicha(cliente, {
      nome, tipo: 'PRATO', rendimento: '1', consumoImediato: 'sim', validade: { linhas: {} },
      itens: [{ insumoId, quantidade: '300', unidade: 'g' }],
      passos: ['Montar na hora.'], descricao: 'Descrição preservada.', modoPreparo: 'Texto anterior.',
    });
    if (!ficha.ok) throw new Error(JSON.stringify(ficha));
    return ficha.id;
  }

  const csv = (nome: string, quantidade: number, colunas = '', valores = '') =>
    `ficha;tipo;rende;insumo;quantidade;unidade${colunas}\n${nome};prato;1;Polpa sintética;${quantidade};g${valores}`;

  it('prévia idêntica fica igual e não grava versão ou histórico por desmarcação indevida', async () => {
    const id = await criar('Tigela igual');
    const antes = (await obterFicha(cliente, id))!;
    const previa = await previaDaImportacao(cliente, csv('Tigela igual', 300));
    expect.soft(previa.contagem).toEqual({ nova: 0, muda: 0, igual: 1, erro: 0 });
    expect.soft(previa.fichas[0].mudancas).toEqual([]);
    expect.soft(await importarFichas(cliente, csv('Tigela igual', 300))).toMatchObject({ ok: false, erro: expect.stringContaining('Nada mudou') });
    const depois = (await obterFicha(cliente, id))!;
    expect(depois.consumoImediato).toBe(true);
    expect(depois.versao).toBe(antes.versao);
  });

  it.each([
    { caso: 'colunas de validade ausentes', colunas: '', valores: '' },
    { caso: 'colunas de validade vazias', colunas: ';conservacao;validade_refrigerado', valores: ';;' },
  ])('alteração de quantidade preserva a marca: $caso', async ({ caso, colunas, valores }) => {
    const nome = `Tigela ${caso}`;
    const id = await criar(nome);
    const planilha = csv(nome, 400, colunas, valores);
    const previa = await previaDaImportacao(cliente, planilha);
    expect.soft(previa.fichas[0]).toMatchObject({ situacao: 'muda', mudancas: ['insumos e quantidades'] });
    expect(await importarFichas(cliente, planilha, 'Operador sintético')).toMatchObject({ ok: true, alteradas: 1 });
    const depois = (await obterFicha(cliente, id))!;
    expect(depois).toMatchObject({ consumoImediato: true, validades: null, passosPreparo: ['Montar na hora.'], descricao: 'Descrição preservada.', modoPreparo: 'Texto anterior.' });
    expect(depois.itens[0].quantidadeMilesimos).toBe(400);
    const historico = await listarHistorico(cliente, { de: [{ entidade: 'FichaTecnica', ids: [id] }], limite: 1, verPrecos: false });
    expect(historico[0].mudancas.some(m => m.campo === 'consumo imediato')).toBe(false);
    expect((await previaDaImportacao(cliente, planilha)).contagem.igual).toBe(1);
  });

  it('validade preenchida usa a regra existente de guarda e registra a retirada do consumo imediato', async () => {
    const id = await criar('Tigela guardada');
    const planilha = csv('Tigela guardada', 300, ';conservacao;validade_refrigerado', ';refrigerado;2 dias');
    const previa = await previaDaImportacao(cliente, planilha);
    expect(previa.fichas[0].situacao).toBe('muda');
    expect(previa.fichas[0].mudancas).toContain('consumo imediato');
    expect(await importarFichas(cliente, planilha, 'Operador sintético')).toMatchObject({ ok: true, alteradas: 1 });
    expect(await obterFicha(cliente, id)).toMatchObject({ consumoImediato: false, validades: { principal: 'REFRIGERADO', minutos: { REFRIGERADO: 2880 } } });
    const historico = await listarHistorico(cliente, { de: [{ entidade: 'FichaTecnica', ids: [id] }], limite: 1, verPrecos: false });
    expect(historico[0].mudancas).toContainEqual(expect.objectContaining({ campo: 'consumo imediato', antes: 'sim', depois: '—' }));
  });

  it('ficha nova sem indicação continua sem consumo imediato e sem prazo inventado', async () => {
    expect(await importarFichas(cliente, csv('Tigela nova', 300))).toMatchObject({ ok: true, criadas: 1 });
    expect(await cliente.fichaTecnica.findUnique({ where: { parceiroId_nome: { parceiroId: parceiro.id, nome: 'Tigela nova' } } })).toMatchObject({ consumoImediato: false, conservacao: null });
  });
});
