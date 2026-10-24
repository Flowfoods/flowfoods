/**
 * F4 — "Consumo imediato" na ficha: indicação de uso, não quinta conservação nem prazo inventado. Só convive com a validade
 * não informada (regra E banco). Na etiqueta do lote, o papel diz "CONSUMO IMEDIATO" em vez de "VALIDADE NÃO INFORMADA".
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff npx vitest run tests/erp-consumo-imediato.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarInsumoDeTeste as cadastrarInsumo, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';
import { cadastrarFicha, editarFicha, listarFichas, obterFicha } from '@/lib/erp/fichas';
import { lerFormFicha, MENSAGEM_CONSUMO_COM_VALIDADE } from '@/lib/erp/ficha-campos';
import { listarHistorico } from '@/lib/erp/historico';
import { linhasDoConteudo, type ConteudoDaEtiqueta } from '@/lib/erp/etiqueta-zpl';
import { situacaoDaValidade } from '@/lib/erp/etiqueta-campos';

const URL_TESTE = process.env.ERP_DB_TESTE;

describe('F4 · consumo imediato (regras puras)', () => {
  const doCadastro = new Map([['p1', { id: 'p1', nome: 'Pão', unidade: 'UN' as const, ativo: true }]]);
  const base = { nome: 'Açaí na tigela', tipo: 'PRATO', rendimento: '1', itens: [{ insumoId: 'p1', quantidade: '1', unidade: 'un' }] };

  it('marcado e sem lugar de guarda: passa; ausente ou desmarcado: não', () => {
    const r = lerFormFicha({ ...base, consumoImediato: 'sim', validade: { linhas: {} } }, doCadastro as never);
    expect(r.ok && r.dados.consumoImediato).toBe(true);
    const n = lerFormFicha({ ...base, consumoImediato: 'nao' }, doCadastro as never);
    expect(n.ok && n.dados.consumoImediato).toBe(false);
  });

  it('marcado E com lugar de guarda: recusa com a frase (não escolhe um dos dois sozinho)', () => {
    const r = lerFormFicha({ ...base, consumoImediato: 'sim', validade: { principal: 'REFRIGERADO', linhas: { REFRIGERADO: { marcada: true, quantidade: '2', em: 'dias' } } } }, doCadastro as never);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.consumoImediato).toBe(MENSAGEM_CONSUMO_COM_VALIDADE);
  });

  it('a etiqueta do lote de consumo imediato diz isso, em destaque; a situação do lote não é "alerta"', () => {
    const c: ConteudoDaEtiqueta = {
      origem: 'LOTE',
      produto: 'Açaí',
      conservacao: null,
      quantidade: null,
      manipuladoEm: new Date('2026-10-24T15:00:00Z'),
      abertoEm: null,
      validade: { tipo: 'consumo-imediato' },
      vencimentoLote: null,
      lote: '261024-01',
      marca: null,
      responsavel: null,
      loja: 'Vila da Penha',
      codigo: 'E261024-0001',
      mostrarHora: true,
    } as ConteudoDaEtiqueta;
    const linhas = linhasDoConteudo(c);
    expect(linhas.find((l) => l.campo === 'validade')).toMatchObject({ texto: 'CONSUMO IMEDIATO', destaque: true });
    expect(linhas.find((l) => l.campo === 'conservacao')!.texto).toBe('NÃO FICA GUARDADO');
    expect(linhasDoConteudo({ ...c, validade: { tipo: 'nao-informada' } }).find((l) => l.campo === 'validade')!.texto).toBe('VALIDADE NÃO INFORMADA');
    expect(situacaoDaValidade(null, new Date(), null, true)).toEqual({ texto: 'Consumo imediato', tom: 'neutro' });
    expect(situacaoDaValidade(null, new Date())).toEqual({ texto: 'Validade não informada', tom: 'alerta' });
  });
});

describe.skipIf(!URL_TESTE)('F4 · consumo imediato (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `c${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let P: { id: string };
  let a: ClienteDoParceiro;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    P = await db.parceiroFlow.create({ data: { nome: 'Consumo imediato (F4)', slug: `consumo-${sufixo}`, status: 'ATIVO' } });
    a = doParceiro(P.id, db);
    const acai = await cadastrarInsumo(a, { escala: 'base', tipo: 'INGREDIENTE', nome: 'Polpa de açaí', unidade: 'KG', conteudo: '1', preco: '30,00' });
    if (!acai.ok) throw new Error(JSON.stringify(acai));
    ids.acai = acai.id;
  });

  afterAll(async () => {
    if (db) {
      await limparParceiros(db, perfil, [P.id]);
      await db.$disconnect();
    }
  });

  const itens = () => [{ insumoId: ids.acai, quantidade: '300', unidade: 'g' }];

  it('cria marcada: grava, aparece no detalhe e na lista, e o histórico diz "consumo imediato"', async () => {
    const r = await cadastrarFicha(a, { nome: 'Açaí na tigela', tipo: 'PRATO', rendimento: '1', itens: itens(), consumoImediato: 'sim', validade: { linhas: {} } }, { tipo: 'manter' }, 'Marina');
    if (!r.ok) throw new Error(JSON.stringify(r));
    ids.ficha = r.id;
    const f = (await obterFicha(a, r.id))!;
    expect(f.consumoImediato).toBe(true);
    expect(f.validades).toBeNull();
    expect((await listarFichas(a, {})).linhas.find((l) => l.id === r.id)!.consumoImediato).toBe(true);
    const [h] = await listarHistorico(a, { de: [{ entidade: 'FichaTecnica', ids: [r.id] }], limite: 1, verPrecos: false });
    expect(h.mudancas.find((m) => m.campo === 'consumo imediato')?.depois).toBe('sim');
  });

  it('editar sem o bloco de validade (planilha) mantém; desmarcar grava e entra no histórico', async () => {
    const versao = () => obterFicha(a, ids.ficha).then((f) => f!.versao);
    const sem = await editarFicha(a, ids.ficha, { nome: 'Açaí na tigela', tipo: 'PRATO', rendimento: '1', itens: itens(), versao: await versao() } as never, { tipo: 'manter' }, 'Marina');
    expect(sem.ok).toBe(true);
    expect((await obterFicha(a, ids.ficha))!.consumoImediato).toBe(true);
    const tira = await editarFicha(a, ids.ficha, { nome: 'Açaí na tigela', tipo: 'PRATO', rendimento: '1', itens: itens(), versao: await versao(), consumoImediato: 'nao', validade: { linhas: {} } } as never, { tipo: 'manter' }, 'Marina');
    expect(tira.ok).toBe(true);
    expect((await obterFicha(a, ids.ficha))!.consumoImediato).toBe(false);
  });

  it('o banco recusa consumo imediato com lugar de guarda, mesmo por SQL direto', async () => {
    await expect(
      a.fichaTecnica.update({ where: { id: ids.ficha }, data: { consumoImediato: true, conservacao: 'REFRIGERADO', validadeRefrigeradoMin: 2880 } }),
    ).rejects.toThrow(/consumo_imediato_sem_validade|check/i);
    expect((await obterFicha(a, ids.ficha))!.consumoImediato).toBe(false);
  });
});
