import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cadastrarFichaUnificada, editarFichaUnificada, lerEdicaoDaFicha } from '@/lib/erp/fichas';
import { obterFichaParaImpressao, lerImpressaoFinanceira, lerImpressaoOperacional, FICHA_MUDOU_NA_IMPRESSAO } from '@/lib/erp/ficha-impressao';
import { compararFracoes } from '@/lib/erp/unidades';
import { salvarEmbalagens } from '@/lib/erp/canais';
import { catalogo3c, observarTransacao3c, receita3c, retrato3c } from './erp-ficha-3c-apoio';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const json = (v: unknown) => JSON.stringify(v, (_k, x) => typeof x === 'bigint' ? x.toString() : x);
describe.skipIf(!URL_TESTE)('3C · DTO de edição e papel com materiais da mesma versão', { timeout: 120_000 }, () => {
  let db: PrismaClient, perfil: PerfilDoBanco;
  const parceiros: string[] = [], consultas: string[] = [];
  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('Banco local obrigatório.');
    const cliente = new PrismaClient({ datasources: { db: { url: URL_TESTE } }, log: [{ emit: 'event', level: 'query' }] });
    cliente.$on('query', e => consultas.push(e.query)); db = cliente; perfil = await perfilDoBanco(db);
  });
  afterAll(async () => { if (db) { await limparParceiros(db, perfil, parceiros); await db.$disconnect(); } }, 120_000);
  async function nova() {
    const c = await catalogo3c(db, parceiros);
    const linhas = [{ canal: 'DELIVERY_PROPRIO', insumoId: c.ids.caixa, quantidade: '1', unidade: 'un' }, { canal: 'IFOOD', insumoId: c.ids.sacola, quantidade: '1', unidade: 'un' }];
    const r = await cadastrarFichaUnificada(c.a, { ...receita3c(c), chaveEnvio: crypto.randomUUID(), materiais: { versao: '', linhas } }, { tipo: 'manter' }, 'Pessoa sintética', 'pessoa-a');
    if (!r.ok || r.repetido) throw new Error(json(r)); return { ...c, r, linhas };
  }

  it('edição sem precos.ver e papel operacional não consultam finanças, compras ou configurações', async () => {
    const c = await nova(), antes = await retrato3c(c.a);
    consultas.length = 0;
    const edicao = (await lerEdicaoDaFicha(c.a, c.r.id, { verPrecos: false }))!, consultasEdicao = [...consultas]; consultas.length = 0;
    const papel = (await obterFichaParaImpressao(c.a, c.r.id))!;
    expect(edicao.materiais).toBeNull(); expect(edicao.ficha?.verCustos).toBe(false);
    expect(edicao.opcoes.every(o => o.custo === null)).toBe(true); expect(edicao.preparos.every(p => p.custo === null && p.incompleto === null)).toBe(true);
    expect(papel.verCustos).toBe(false); expect(papel.custo).toBeNull(); expect(papel.itens.every(i => i.custo === null)).toBe(true);
    expect(papel.versao).toBe(c.r.versao); expect(papel.versaoOperacional).toMatch(/^[0-9a-f]{64}$/);
    expect(papel.materiais).toEqual([
      { canal: 'DELIVERY_PROPRIO', nome: 'Caixa de dois reais', unidade: 'UN', quantidadeMilesimos: 1000 },
      { canal: 'IFOOD', nome: 'Sacola de três reais', unidade: 'UN', quantidadeMilesimos: 1000 },
    ]);
    expect(json(papel)).not.toMatch(/insumoId|produtoId|hashEnvio|chaveEnvio|historico|autorNome|metaBp|precoCentavos|taxaBp|farol/);
    expect(consultas.join('\n')).toContain('REPEATABLE READ');
    expect(consultas.join('\n')).not.toMatch(/precoEmbalagemCentavos|ProdutoCanal|CanalConfig|NotaCompra|NotaItem|HistoricoAlteracao/);
    expect(consultasEdicao.join('\n')).not.toMatch(/precoEmbalagemCentavos|taxaEntregaCentavos|ProdutoCanal|CanalConfig|NotaCompra|NotaItem/);
    expect(await retrato3c(c.a)).toEqual(antes);
  });

  it('leitura financeira inclui custo de materiais e configuração apenas com autorização explícita, isolada por tenant', async () => {
    const c = await nova(), outra = await nova();
    const e = (await lerEdicaoDaFicha(c.a, c.r.id, { verPrecos: true }))!;
    expect(e.ficha?.verCustos).toBe(true); expect(e.materiais?.versao).toBe(c.r.versaoMateriais);
    expect(e.materiais?.linhas).toEqual(c.linhas); expect(e.materiais?.opcoes.map(o => o.id)).not.toContain(c.ids.material);
    const sacola = e.materiais!.opcoes.find(o => o.id === c.ids.sacola)!; expect(sacola.custo).not.toBeNull();
    expect(await lerEdicaoDaFicha(outra.a, c.r.id, { verPrecos: true })).toBeNull(); expect(await obterFichaParaImpressao(outra.a, c.r.id)).toBeNull();
    const p = (await obterFichaParaImpressao(c.a, c.r.id))!;
    const f = await lerImpressaoFinanceira(c.a, c.r.id, p.versaoOperacional); if (!f.ok) throw new Error(f.erro);
    expect(f.ficha.materiais).toEqual(p.materiais); expect(f.ficha.versaoOperacional).toBe(p.versaoOperacional);
    for (const canal of f.canais!) expect(compararFracoes(canal.fisico.valor, { num: { LOJA: 1000n, DELIVERY_PROPRIO: 1200n, IFOOD: 1300n }[canal.canal], den: 1n })).toBe(0);
    expect(await lerImpressaoFinanceira(c.a, c.r.id, p.versao)).toEqual({ ok: false, erro: FICHA_MUDOU_NA_IMPRESSAO });
  });

  for (const alterar of ['quantidade', 'nome', 'unidade'] as const) it(`${alterar} do material torna os dois pedidos de impressão antigos, inclusive sem editar a receita`, async () => {
    const c = await nova(), p = (await obterFichaParaImpressao(c.a, c.r.id))!;
    if (alterar === 'quantidade') expect(await salvarEmbalagens(c.a, c.r.id, { impressao: c.r.versaoMateriais, linhas: c.linhas.map(l => ({ ...l, quantidade: '2' })) })).toMatchObject({ ok: true });
    else await c.a.insumo.update({ where: { id: c.ids.sacola }, data: alterar === 'nome' ? { nome: 'Sacola renomeada' } : { unidade: 'KG' } });
    const atual = (await obterFichaParaImpressao(c.a, c.r.id))!;
    expect(atual.versaoOperacional).not.toBe(p.versaoOperacional);
    if (alterar !== 'quantidade') expect(atual.versao).toBe(p.versao);
    expect(await lerImpressaoOperacional(c.a, c.r.id, p.versaoOperacional)).toEqual({ ok: false, erro: FICHA_MUDOU_NA_IMPRESSAO });
    expect(await lerImpressaoFinanceira(c.a, c.r.id, p.versaoOperacional)).toEqual({ ok: false, erro: FICHA_MUDOU_NA_IMPRESSAO });
  });

  it('A→B→A dos materiais mantém impressão antiga recusada; mudar só custo não envelhece o papel operacional', async () => {
    const c = await nova(), p = (await obterFichaParaImpressao(c.a, c.r.id))!;
    await c.a.insumo.update({ where: { id: c.ids.sacola }, data: { precoEmbalagemCentavos: 400 } });
    expect((await obterFichaParaImpressao(c.a, c.r.id))!.versaoOperacional).toBe(p.versaoOperacional);
    expect(await lerImpressaoOperacional(c.a, c.r.id, p.versaoOperacional)).toMatchObject({ ok: true });
    const financeiro = await lerImpressaoFinanceira(c.a, c.r.id, p.versaoOperacional); if (!financeiro.ok) throw new Error(financeiro.erro);
    expect(compararFracoes(financeiro.canais!.find(c => c.canal === 'IFOOD')!.fisico.valor, { num: 1400n, den: 1n })).toBe(0);
    expect(await salvarEmbalagens(c.a, c.r.id, { impressao: c.r.versaoMateriais, linhas: c.linhas.map(l => ({ ...l, quantidade: '2' })) })).toMatchObject({ ok: true });
    const atual = (await lerEdicaoDaFicha(c.a, c.r.id, { verPrecos: true }))!;
    expect(await salvarEmbalagens(c.a, c.r.id, { impressao: atual.materiais!.versao, linhas: c.linhas })).toMatchObject({ ok: true });
    expect((await obterFichaParaImpressao(c.a, c.r.id))!.materiais).toEqual(p.materiais);
    expect(await lerImpressaoOperacional(c.a, c.r.id, p.versaoOperacional)).toEqual({ ok: false, erro: FICHA_MUDOU_NA_IMPRESSAO });
  });

  for (const modo of ['edição', 'operacional', 'financeira'] as const) it(`${modo}: escrita concorrente entre receita e materiais não mistura versões da leitura`, async () => {
    const c = await nova(), antes = (await obterFichaParaImpressao(c.a, c.r.id))!; let mudou = false;
    const durante = observarTransacao3c(c.a, tx => ({ ...tx, produtoVenda: new Proxy({ ...tx.produtoVenda }, { get(alvo, prop, receptor) {
      if (prop !== 'findFirst') return Reflect.get(alvo, prop, receptor);
      return async (...args: Parameters<typeof alvo.findFirst>) => {
        if (!mudou) {
          mudou = true;
          const r = await editarFichaUnificada(c.a, c.r.id, { ...receita3c(c, { descricao: 'Outra versão', itens: [{ insumoId: c.ids.ingrediente, quantidade: '20', unidade: 'un' }] }), versao: c.r.versao,
            materiais: { versao: c.r.versaoMateriais, linhas: c.linhas.map(l => ({ ...l, quantidade: '2' })) } }, { tipo: 'manter' }, 'Outra pessoa');
          expect(r).toMatchObject({ ok: true });
        }
        return alvo.findFirst(...args);
      };
    } }) }));
    consultas.length = 0;
    if (modo === 'edição') {
      const e = (await lerEdicaoDaFicha(durante, c.r.id, { verPrecos: true }))!;
      expect(e.ficha!.versao).toBe(c.r.versao); expect(e.ficha!.descricao).toBe('Receita de teste'); expect(e.materiais!.linhas).toEqual(c.linhas);
    } else if (modo === 'operacional') expect(await obterFichaParaImpressao(durante, c.r.id)).toEqual(antes);
    else {
      const f = await lerImpressaoFinanceira(durante, c.r.id, antes.versaoOperacional); if (!f.ok) throw new Error(f.erro);
      expect(f.ficha.versao).toBe(c.r.versao); expect(f.ficha.materiais).toEqual(antes.materiais);
      for (const canal of f.canais!) expect(compararFracoes(canal.fisico.valor, { num: { LOJA: 1000n, DELIVERY_PROPRIO: 1200n, IFOOD: 1300n }[canal.canal], den: 1n })).toBe(0);
    }
    expect(mudou).toBe(true); expect(consultas.join('\n')).toContain('REPEATABLE READ');
    const atual = (await obterFichaParaImpressao(c.a, c.r.id))!; expect(atual.descricao).toBe('Outra versão'); expect(atual.materiais.every(m => m.quantidadeMilesimos === 2000)).toBe(true);
    expect(await lerImpressaoFinanceira(c.a, c.r.id, antes.versaoOperacional)).toEqual({ ok: false, erro: FICHA_MUDOU_NA_IMPRESSAO });
  });
});
