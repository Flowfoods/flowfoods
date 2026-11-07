import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cadastrarFicha, cadastrarFichaUnificada, editarFichaUnificada, lerEdicaoDaFicha, obterFichaComCanais } from '@/lib/erp/fichas';
import { previaDaReceita, type EscolhidoNaReceita } from '@/components/erp/telas/fichas/previa-da-receita';
import { PREFIXO_DO_PREPARO } from '@/components/erp/telas/fichas/prefixo';
import { contaDasEmbalagensNaTela } from '@/components/erp/telas/fichas/conta-das-embalagens';
import { compararFracoes, lerQuantidadeNa } from '@/lib/erp/unidades';
import { catalogo3c, receita3c, retrato3c } from './erp-ficha-3c-apoio';
import { cadastrarInsumoDeTeste, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
type Edicao = NonNullable<Awaited<ReturnType<typeof lerEdicaoDaFicha>>>;
function escolhas(e: Edicao) {
  const m = new Map<string, EscolhidoNaReceita>();
  for (const i of e.opcoes) m.set(i.id, { ...i, porUnidade: null, preparo: false, incompleto: false });
  for (const p of e.preparos) m.set(`${PREFIXO_DO_PREPARO}${p.id}`, { nome: p.nome, unidade: p.unidade, ativo: p.ativo, custo: null,
    porUnidade: p.custo ? { num: BigInt(p.custo.num), den: BigInt(p.custo.den) } : null, preparo: true, incompleto: p.incompleto === true });
  return m;
}
describe.skipIf(!URL_TESTE)('3C · prévia corrente comparada ao domínio gravado', { timeout: 120_000 }, () => {
  let db: PrismaClient, perfil: PerfilDoBanco;
  const parceiros: string[] = [];
  beforeAll(async () => { if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('Banco local obrigatório.'); db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } }); perfil = await perfilDoBanco(db); });
  afterAll(async () => { if (db) { await limparParceiros(db, perfil, parceiros); await db.$disconnect(); } }, 120_000);

  it('receita/rendimento/materiais correntes produzem 10/12/13, 20/22/23 e 10/12/16 antes e depois do save', async () => {
    const c = await catalogo3c(db, parceiros);
    const linhas = [{ canal: 'DELIVERY_PROPRIO', insumoId: c.ids.caixa, quantidade: '1', unidade: 'un' }, { canal: 'IFOOD', insumoId: c.ids.sacola, quantidade: '1', unidade: 'un' }];
    const r = await cadastrarFichaUnificada(c.a, { ...receita3c(c), chaveEnvio: crypto.randomUUID(), materiais: { versao: '', linhas } }, { tipo: 'manter' }, 'Pessoa sintética', 'pessoa-a');
    if (!r.ok || r.repetido) throw new Error(JSON.stringify(r));
    const produto = await c.a.produtoVenda.findFirstOrThrow({ where: { fichaId: r.id } });
    await c.a.produtoCanal.createMany({ data: (['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'] as const).map((canal, n) => ({ parceiroId: c.parceiro.id, produtoId: produto.id, canal, precoManualCentavos: [5000, 6000, 6500][n] })) });
    await c.a.canalConfig.createMany({ data: (['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'] as const).map(canal => ({ parceiroId: c.parceiro.id, canal, metaCmvPadraoBp: 2500, taxaConfigurada: true, taxaBp: canal === 'IFOOD' ? 2000 : 0, taxaPagamentoBp: 0, farolABp: 1000, farolBBp: 1500, farolCBp: 2500, farolDBp: 3000 })) });
    for (const [quantidade, rendimento, sacolas, esperado] of [['10', '10', '1', [1000n, 1200n, 1300n]], ['20', '10', '1', [2000n, 2200n, 2300n]], ['20', '20', '2', [1000n, 1200n, 1600n]]] as const) {
      const e = (await lerEdicaoDaFicha(c.a, r.id, { verPrecos: true }))!, antes = await retrato3c(c.a);
      const previa = previaDaReceita([{ chave: 1, escolha: c.ids.ingrediente, quantidade, unidade: 'un', fator: '1' }], escolhas(e), 'PRATO', rendimento, 'un');
      expect(previa.pendencia).toBeNull(); expect(compararFracoes(previa.porRende!, { num: esperado[0], den: 1n })).toBe(0);
      const digitadas = linhas.map(l => ({ ...l, quantidade: l.canal === 'IFOOD' ? sacolas : '1' }));
      const contas = (['DELIVERY_PROPRIO', 'IFOOD'] as const).map((canal, n) => {
        const l = digitadas.find(l => l.canal === canal)!, o = e.materiais!.opcoes.find(o => o.id === l.insumoId)!;
        const conta = contaDasEmbalagensNaTela({ canal, porcao: previa.porRende!, faltaPreco: [], preco: e.materiais!.precos[canal], embalagens: [{ nome: o.nome, unidade: o.unidade, quantidadeMilesimos: lerQuantidadeNa(l.quantidade, o.unidade, 'base')!, custo: o.custo }] });
        if (quantidade === '10') { expect(compararFracoes(conta.cmvBp!, { num: 2000n, den: 1n })).toBe(0); expect(conta.sugerido).toMatchObject({ tipo: 'ok', centavos: [4800, 5200][n] }); }
        expect(compararFracoes(conta.fisico.valor, { num: esperado[n + 1], den: 1n })).toBe(0); return conta;
      });
      expect(await retrato3c(c.a)).toEqual(antes);
      expect(await editarFichaUnificada(c.a, r.id, { ...receita3c(c, { rendimento, itens: [{ insumoId: c.ids.ingrediente, quantidade, unidade: 'un', fator: '1' }] }), versao: e.ficha!.versao,
        materiais: { versao: e.materiais!.versao, linhas: digitadas } }, { tipo: 'manter' }, 'Pessoa sintética')).toMatchObject({ ok: true });
      const gravada = (await obterFichaComCanais(c.a, r.id, { verPrecos: true }))!;
      expect(compararFracoes(gravada.ficha.custo.porRendimento, previa.porRende!)).toBe(0);
      for (const conta of contas) {
        const salvo = gravada.canais!.cmv.find(c => c.canal === conta.canal)!;
        expect(compararFracoes(salvo.fisico.valor, conta.fisico.valor)).toBe(0); expect(compararFracoes(salvo.cmvBp!, conta.cmvBp!)).toBe(0); expect(salvo.farol).toEqual(conta.farol); expect(salvo.sugerido).toEqual(conta.sugerido);
      }
      expect((await retrato3c(c.a)).precos).toEqual(antes.precos);
      const resultado = gravada.canais!.cmv.find(c => c.canal === 'IFOOD')!.resultado; expect(resultado.tipo).toBe('ok');
      if (resultado.tipo === 'ok') expect(compararFracoes(resultado.taxa, { num: 1300n, den: 1n })).toBe(0);
    }
  });

  for (const caso of ['duplicidade', 'quantidade', 'rendimento', 'unidade'] as const) it(`${caso} inválida interrompe a prévia e é recusada no banco, preservando origem`, async () => {
    const c = await catalogo3c(db, parceiros), e = (await lerEdicaoDaFicha(c.a, null, { verPrecos: true }))!;
    const item = { insumoId: c.ids.ingrediente, quantidade: caso === 'quantidade' ? 'texto' : '10', unidade: caso === 'unidade' ? 'kg' : 'un', fator: '1' };
    const itens = caso === 'duplicidade' ? [item, item] : [item], rendimento = caso === 'rendimento' ? '0' : '10';
    const previa = previaDaReceita(itens.map((i, n) => ({ chave: n, escolha: i.insumoId, ...i })), escolhas(e), 'PRATO', rendimento, 'un');
    expect(previa.pendencia).toBeTruthy(); expect(previa.porRende).toBeNull();
    const antes = await retrato3c(c.a);
    expect(await cadastrarFichaUnificada(c.a, { ...receita3c(c, { itens, rendimento }), chaveEnvio: crypto.randomUUID() }, { tipo: 'manter' }, 'Pessoa sintética', 'pessoa-a')).toMatchObject({ ok: false });
    expect(await retrato3c(c.a)).toEqual(antes);
  });

  it('pré-preparo incompleto transmite pendência à prévia e ao CMV persistido sem tratar parte conhecida como total', async () => {
    const c = await catalogo3c(db, parceiros), i = await cadastrarInsumoDeTeste(c.a, { nome: 'Ingrediente sem custo', tipo: 'INGREDIENTE', unidade: 'UN', escala: 'base', conteudo: '1', preco: '', semPreco: 'on' });
    if (!i.ok) throw new Error(JSON.stringify(i));
    const p = await cadastrarFicha(c.a, receita3c(c, { nome: 'Preparo incompleto', tipo: 'PRE_PREPARO', rendimento: '1', rendimentoUnidade: 'un', itens: [{ insumoId: i.id, quantidade: '1', unidade: 'un' }] }));
    if (!p.ok) throw new Error(JSON.stringify(p));
    const e = (await lerEdicaoDaFicha(c.a, null, { verPrecos: true }))!, previa = previaDaReceita([{ chave: 1, escolha: `${PREFIXO_DO_PREPARO}${p.id}`, quantidade: '1', unidade: 'un', fator: '1' }], escolhas(e), 'PRATO', '1', 'un');
    expect(previa.incompletos).toContain('Preparo incompleto');
    const r = await cadastrarFichaUnificada(c.a, { ...receita3c(c, { rendimento: '1', itens: [{ subfichaId: p.id, quantidade: '1', unidade: 'un' }] }), chaveEnvio: crypto.randomUUID() }, { tipo: 'manter' }, 'Pessoa sintética', 'pessoa-a');
    if (!r.ok) throw new Error(JSON.stringify(r));
    const gravada = (await obterFichaComCanais(c.a, r.id, { verPrecos: true }))!;
    expect(compararFracoes(gravada.ficha.custo.porRendimento, previa.porRende!)).toBe(0);
    for (const canal of gravada.canais!.cmv) { expect(canal.fisico.completo).toBe(false); expect(canal.cmvBp).toBeNull(); expect(canal.farol.faixa).toBe('semDados'); }
  });
});
