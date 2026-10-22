/**
 * ERP I.2a · metas por categoria e CMV gerencial por categoria — a CONTA pura (sem banco).
 *
 * O cenário é o da análise: Casa Alfa, Vila da Penha, outubro, receita bruta R$ 100.000,00, modelo de 32 % aplicado, compras de
 * R$ 33.300,00 (Proteína 12.000, Hortifruti 2.500, Mercearias 5.200, Laticínios 4.000, Congelados 1.800, Panificação 2.100,
 * Bebidas 3.300, Descartáveis 1.400, Limpeza 700, Outros 300). O desvio tem o sinal do DRE (realizado menos meta).
 */
import { describe, expect, it } from 'vitest';
import { CATEGORIAS_PADRAO } from '@/lib/erp/categoria-campos';
import {
  aplicarModelo32,
  avisoDaSoma,
  categoriasLidasDaFotografia,
  categoriasParaGravar,
  campoDaCategoria,
  lerMetasDoFormulario,
  LIMIAR_A_CLASSIFICAR_BP,
  metasDoModelo32,
  montarPainelDeCategorias,
  motivoQueTiraACor,
  NOME_DA_VARIACAO,
  NOME_DOS_PREPARADOS,
  PERCENTUAIS_DO_MODELO_32,
  somaDasMetas,
  TOTAL_DO_MODELO_32_BP,
  type CategoriaDoPainel,
  type EntradaDoPainel,
  type LojaNoPainel,
} from '@/lib/erp/cmv-categorias-campos';
import { FAIXAS_DO_FAROL } from '@/lib/erp/farol-campos';
import { farolDoDre } from '@/lib/erp/farol-dre-campos';
import type { ComparacaoComMeta } from '@/lib/erp/dre-metas-campos';
import type { LinhaDoDre } from '@/lib/erp/dre-campos';

const sp = (s: string | null | undefined) => (s ?? '').replace(/ /g, ' ');
const R = (reais: number) => Math.round(reais * 100);

const CATEGORIAS: CategoriaDoPainel[] = CATEGORIAS_PADRAO.map((c) => ({ id: `c-${c.chave}`, chave: c.chave, nome: c.nome, ordem: c.ordem, ativa: true, sistema: c.chave === 'OUTROS' }));
const id = (chave: string) => `c-${chave}`;
const modelo = (cats = CATEGORIAS) => metasDoModelo32(cats);

const COMPRAS_DA_ANALISE: [string, number][] = [
  ['PROTEINA', 12_000],
  ['HORTIFRUTI', 2_500],
  ['MERCEARIA', 5_200],
  ['LATICINIOS', 4_000],
  ['CONGELADOS', 1_800],
  ['PANIFICACAO', 2_100],
  ['BEBIDAS', 3_300],
  ['DESCARTAVEIS', 1_400],
  ['LIMPEZA', 700],
  ['OUTROS', 300],
];

function loja(p: Omit<Partial<LojaNoPainel>, 'compras'> & { compras?: [string | null, number][] } = {}): LojaNoPainel {
  const compras = new Map<string | null, number>((p.compras ?? COMPRAS_DA_ANALISE.map(([c, v]) => [id(c), v] as [string | null, number])).map(([c, v]) => [c, R(v)]));
  return {
    lojaId: 'vp',
    nome: 'Vila da Penha',
    receitaBrutaCentavos: R(100_000),
    naoUsa: new Set(),
    metas: modelo(),
    metaVemDe: 'rede',
    ...p,
    // `compras` do parâmetro vira Map acima; o resto do Partial prevalece.
    compras,
  };
}

function entrada(p: Partial<EntradaDoPainel> = {}): EntradaDoPainel {
  const lojas = p.lojas ?? [loja()];
  const total = lojas.reduce((s, l) => s + Array.from(l.compras.values()).reduce((a, b) => a + b, 0), 0);
  return {
    categorias: CATEGORIAS,
    lojas,
    totalCentavos: total,
    receitaBrutaCentavos: lojas.reduce((s, l) => s + l.receitaBrutaCentavos, 0),
    notaDoCmv: 'pelas compras · parcial',
    semContarDoCmv: [],
    motivoGeral: null,
    faixas: FAIXAS_DO_FAROL,
    encerrado: false,
    insumosAClassificar: null,
    ...p,
  };
}

const linhaDe = (painel: ReturnType<typeof montarPainelDeCategorias>, chave: string) => painel.linhas.find((l) => l.categoriaId === id(chave))!;

describe('I.2a · o modelo de 32 %', () => {
  it('soma 32,00 e preenche as dez pela chave', () => {
    expect(Object.values(PERCENTUAIS_DO_MODELO_32).reduce((s, v) => s + v, 0)).toBe(TOTAL_DO_MODELO_32_BP);
    const m = aplicarModelo32(CATEGORIAS);
    expect(Object.values(m.campos).filter((c) => c !== '')).toHaveLength(10);
    expect(m.campos[id('PROTEINA')]).toBe('11');
    expect(m.campos[id('DESCARTAVEIS')]).toBe('1,5');
    expect(m.campos[id('LIMPEZA')]).toBe('0,5');
    expect(m.campos[id('OUTROS')]).toBe('0');
    expect(m.total).toBe('32');
    expect(m.ausentes).toEqual([]);
    expect(m.frase).toContain('Referência ilustrativa, não limite');
    expect(m.frase).toContain('Nada foi gravado');
  });

  it('Bebidas excluída: não entra, a frase diz, e a soma é 29,00 contra o total 32,00 (diferença −3,00 pp)', () => {
    const semBebidas = CATEGORIAS.filter((c) => c.chave !== 'BEBIDAS');
    const m = aplicarModelo32(semBebidas);
    expect(m.aplicadas).toBe(9);
    expect(m.ausentes).toEqual([{ nome: 'Bebidas', bp: 300 }]);
    expect(m.frase).toContain('Bebidas (3%) não existe nesta casa');
    const soma = somaDasMetas(metasDoModelo32(semBebidas));
    expect(soma).toBe(2900);
    expect(sp(avisoDaSoma(soma, TOTAL_DO_MODELO_32_BP))).toBe('Soma 29,00% · total 32,00% · diferença −3,00 pp');
  });

  it('renomeada mantém, a da casa sem chave fica vazia e a desativada não entra', () => {
    const casa: CategoriaDoPainel[] = [
      { ...CATEGORIAS[0], nome: 'Carnes e aves' },
      { id: 'propria', chave: null, nome: 'Sorvetes', ordem: 55, ativa: true, sistema: false },
      { ...CATEGORIAS[6], ativa: false },
      CATEGORIAS[9],
    ];
    const m = aplicarModelo32(casa);
    expect(m.campos[CATEGORIAS[0].id]).toBe('11');
    expect(m.campos.propria).toBe('');
    expect(m.campos[CATEGORIAS[6].id]).toBe('');
    expect(m.frase).toContain('Bebidas (3%) não existe nesta casa');
    expect(m.frase).toContain('Hortifruti (3%) não existe nesta casa');
  });
});

describe('I.2a · aviso de soma e leitura do formulário', () => {
  it('aviso só com total e só quando a soma é diferente; não bloqueia', () => {
    expect(avisoDaSoma(3300, 3200) && sp(avisoDaSoma(3300, 3200))).toBe('Soma 33,00% · total 32,00% · diferença +1,00 pp');
    expect(avisoDaSoma(3200, 3200)).toBeNull();
    expect(avisoDaSoma(3300, null)).toBeNull();
  });

  const permitidas = new Set(['a', 'b', 'c']);
  const ler = (campos: Record<string, string>, total: unknown = '') => lerMetasDoFormulario({ total, campos }, permitidas);

  it('aceita vírgula, ponto, 0, vazio e 100; vazio é sem meta', () => {
    const r = ler({ a: '11,5', b: '0', c: '' }, '32');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lidas.totalBp).toBe(3200);
      expect(Array.from(r.lidas.metas)).toEqual([['a', 1150], ['b', 0]]);
    }
    expect(ler({ a: '100' }).ok).toBe(true);
  });

  it.each([['100,01'], ['-1'], ['3,155'], ['1e2'], ['abc'], ['12,5,5']])('recusa %s no campo, com a frase, e nada passa', (texto) => {
    const r = ler({ a: texto });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erros[campoDaCategoria('a')]).toBeTruthy();
      expect(r.erros.geral).toContain('nada foi gravado');
    }
  });

  it('o total tem a mesma régua e categoria forjada recusa o formulário inteiro', () => {
    const t = ler({ a: '1' }, '100,01');
    expect(t.ok).toBe(false);
    if (!t.ok) expect(t.erros.total).toBeTruthy();
    const f = ler({ a: '1', intrusa: '2' });
    expect(f.ok).toBe(false);
    if (!f.ok) expect(f.erros.geral).toContain('não existe mais');
  });

  it('soma de 120 % passa (aviso, não bloqueio)', () => {
    const r = ler({ a: '60', b: '60' }, '32');
    expect(r.ok).toBe(true);
    if (r.ok) expect(sp(avisoDaSoma(somaDasMetas(r.lidas.metas), r.lidas.totalBp))).toBe('Soma 120,00% · total 32,00% · diferença +88,00 pp');
  });
});

describe('I.2a · o painel (critérios 1 a 3 da análise)', () => {
  it('total R$ 33.300,00 e a soma das categorias é o total, ao centavo, sem variação', () => {
    const e = entrada();
    const p = montarPainelDeCategorias(e);
    expect(e.totalCentavos).toBe(R(33_300));
    expect(p.somaDasComprasCentavos).toBe(R(33_300));
    expect(p.variacaoCentavos).toBe(0);
    expect(p.linhas.find((l) => l.tipo === 'variacao')).toBeUndefined();
    expect(p.semCor).toBeNull();
  });

  it('Proteína: meta R$ 11.000, realizado 12,00 %, desvio +1,00 pp e +R$ 1.000, amarelo, 1ª em maiores desvios', () => {
    const p = montarPainelDeCategorias(entrada());
    const l = linhaDe(p, 'PROTEINA');
    expect(l.metaBp).toBe(1100);
    expect(l.metaCentavos).toBe(R(11_000));
    expect(l.realizadoBp).toBe(1200);
    expect(sp(l.desvioTexto)).toBe('+1,00 pp');
    expect(l.desvioCentavos).toBe(R(1_000));
    expect(l.farol).toMatchObject({ tipo: 'cor', cor: 'AMARELO' });
    expect(p.maioresDesvios[0].categoriaId).toBe(id('PROTEINA'));
    expect(p.maioresDesvios).toHaveLength(3);
  });

  it('Hortifruti: 2,50 % contra 3,00 % é melhor que a meta (verde)', () => {
    const l = linhaDe(montarPainelDeCategorias(entrada()), 'HORTIFRUTI');
    expect(sp(l.desvioTexto)).toBe('−0,50 pp');
    expect(l.farol).toMatchObject({ tipo: 'cor', cor: 'VERDE' });
  });

  it('Outros R$ 300,00 (0,90 % do CMV): sem farol, a classificar, e as outras mantêm a cor', () => {
    const p = montarPainelDeCategorias(entrada());
    const o = linhaDe(p, 'OUTROS');
    expect(o.aClassificar).toBe(true);
    expect(o.farol).toBeNull();
    expect(o.desvioTexto).toBeNull();
    expect(p.aClassificarCentavos).toBe(R(300));
    expect(p.aClassificarBp).toBe(90);
    expect(p.semCor).toBeNull();
    expect(linhaDe(p, 'PROTEINA').farol?.tipo).toBe('cor');
  });

  it('Outros R$ 900,00 (2,65 % do CMV): nenhuma categoria tem cor, o motivo diz quanto, e o desvio segue em texto', () => {
    const compras = COMPRAS_DA_ANALISE.map(([c, v]) => [id(c), c === 'OUTROS' ? 900 : v] as [string, number]);
    const p = montarPainelDeCategorias(entrada({ lojas: [loja({ compras })] }));
    expect(p.aClassificarBp).toBe(265);
    expect(sp(p.semCor)).toBe('R$ 900,00 ainda a classificar (2,65% do CMV)');
    for (const l of p.linhas.filter((x) => x.tipo === 'categoria' && x.farol)) expect(l.farol?.tipo, l.nome).toBe('sem');
    expect(sp(linhaDe(p, 'PROTEINA').desvioTexto)).toBe('+1,00 pp');
    expect(p.maioresDesvios).toEqual([]);
  });

  it('o limiar é 2,0 % e é estrito: 2,00 % ainda tem cor, 2,01 % tira', () => {
    expect(LIMIAR_A_CLASSIFICAR_BP).toBe(200);
    const comOutros = (v: number) => COMPRAS_DA_ANALISE.map(([c]) => [id(c), c === 'OUTROS' ? v : 0] as [string, number]);
    const caso = (v: number) => {
      const l = loja({ compras: [...comOutros(v), [id('PROTEINA'), 100_000 - v]], receitaBrutaCentavos: R(500_000) });
      return montarPainelDeCategorias(entrada({ lojas: [l] }));
    };
    expect(caso(2_000).semCor).toBeNull();
    expect(caso(2_001).semCor).toContain('ainda a classificar');
    // 1,9 % volta as cores
    expect(caso(1_900).semCor).toBeNull();
  });

  it('Sem categoria também é fila: somada em "a classificar", sem farol', () => {
    const compras: [string | null, number][] = [...COMPRAS_DA_ANALISE.map(([c, v]) => [id(c), c === 'OUTROS' ? 0 : v] as [string | null, number]), [null, 300]];
    const p = montarPainelDeCategorias(entrada({ lojas: [loja({ compras })] }));
    const s = p.linhas.find((l) => l.tipo === 'sem-categoria')!;
    expect(s.realizadoCentavos).toBe(R(300));
    expect(s.farol).toBeNull();
    expect(p.aClassificarCentavos).toBe(R(300));
    expect(p.somaDasComprasCentavos).toBe(R(33_300));
  });

  it('sem receita não compara e não pinta; sem compra no período a categoria não é "perfeita"', () => {
    const sem = montarPainelDeCategorias(entrada({ lojas: [loja({ receitaBrutaCentavos: 0 })], receitaBrutaCentavos: 0 }));
    expect(linhaDe(sem, 'PROTEINA').farol).toMatchObject({ tipo: 'sem', motivo: 'sem faturamento' });
    expect(linhaDe(sem, 'PROTEINA').realizadoBp).toBeNull();
    const compras = COMPRAS_DA_ANALISE.map(([c, v]) => [id(c), c === 'PROTEINA' ? 0 : v] as [string, number]);
    const zero = montarPainelDeCategorias(entrada({ lojas: [loja({ compras })] }));
    expect(linhaDe(zero, 'PROTEINA').farol).toMatchObject({ tipo: 'sem', motivo: 'sem compra no período' });
  });

  it('as regras da 2.4 tiram a cor: faltam lançamentos, falta o CMV de uma loja, sem contar', () => {
    const com = (p: Partial<EntradaDoPainel>) => montarPainelDeCategorias(entrada(p));
    expect(com({ motivoGeral: 'faltam lançamentos de faturamento' }).semCor).toBe('faltam lançamentos de faturamento');
    expect(com({ notaDoCmv: 'misto: real em Penha; sem o CMV de Centro' }).semCor).toBe('sem o CMV de Centro');
    expect(com({ semContarDoCmv: ['o CMV de Centro'] }).semCor).toBe('sem contar o CMV de Centro');
    expect(com({ faixas: null }).semCor).toContain('versão que este sistema não conhece');
  });

  it('é a MESMA regra do farol do DRE para o CMV (cruzamento com farolDoDre)', () => {
    const cmv = { chave: 'cmv', tipo: 'cmv', nome: 'CMV', nota: 'misto: real em Penha; sem o CMV de Centro', semContar: [] as string[], valorCentavos: 1, percentualBp: 1, nivel: 0, grupo: 'CMV', sentido: 'MENOR_MELHOR' } as unknown as LinhaDoDre;
    const comp: ComparacaoComMeta = { metaBp: 3200, tipo: 'percentual', metaCentavos: 1, desvioBp: 130, desvioTexto: '+1,3 pp', variacaoBp: null, faixa: { cor: 'AMARELO', posicao: 3, palavra: 'um pouco pior', confira: null }, semComparacao: null };
    const f = farolDoDre({ linhas: [cmv], metas: { cmv: comp }, faltasDeFaturamento: 0, recorrentes: [], receitaNaoApurada: false });
    const dre = f.porLinha.cmv.tipo === 'sem' ? f.porLinha.cmv.motivo : null;
    expect(motivoQueTiraACor({ faixas: FAIXAS_DO_FAROL, motivoGeral: null, notaDoCmv: cmv.nota, semContarDoCmv: [], aClassificarCentavos: 0, totalCentavos: 1 })).toBe(dre);
    const f2 = farolDoDre({ linhas: [cmv], metas: { cmv: comp }, faltasDeFaturamento: 2, recorrentes: [], receitaNaoApurada: false });
    expect(motivoQueTiraACor({ faixas: FAIXAS_DO_FAROL, motivoGeral: f2.motivoGeral, notaDoCmv: cmv.nota, semContarDoCmv: [], aClassificarCentavos: 0, totalCentavos: 1 })).toBe(f2.porLinha.cmv.tipo === 'sem' ? f2.porLinha.cmv.motivo : null);
  });
});

describe('I.2a · reclassificar, período encerrado e o que não é categoria', () => {
  it('reclassificar o Bacon (R$ 600,00) de Laticínios para Proteína: as categorias mudam, o total não', () => {
    const antes = montarPainelDeCategorias(entrada());
    const compras = COMPRAS_DA_ANALISE.map(([c, v]) => [id(c), c === 'PROTEINA' ? v + 600 : c === 'LATICINIOS' ? v - 600 : v] as [string, number]);
    const depois = montarPainelDeCategorias(entrada({ lojas: [loja({ compras })] }));
    expect(linhaDe(depois, 'PROTEINA').realizadoCentavos).toBe(R(12_600));
    expect(linhaDe(depois, 'LATICINIOS').realizadoCentavos).toBe(R(3_400));
    expect(depois.somaDasComprasCentavos).toBe(antes.somaDasComprasCentavos);
    expect(depois.somaDasComprasCentavos).toBe(R(33_300));
  });

  it('encerrado sem o real aberto: as categorias pelas compras e a linha de variação fecham no CMV real do DRE', () => {
    const e = entrada({ encerrado: true, totalCentavos: R(36_000) });
    const p = montarPainelDeCategorias(e);
    const v = p.linhas.find((l) => l.tipo === 'variacao')!;
    expect(v.nome).toBe(NOME_DA_VARIACAO);
    expect(v.realizadoCentavos).toBe(R(2_700));
    expect(p.somaDasComprasCentavos + v.realizadoCentavos!).toBe(R(36_000));
    // O real menor que as compras (o estoque subiu): a variação é negativa.
    const menor = montarPainelDeCategorias(entrada({ encerrado: true, totalCentavos: R(31_000) }));
    expect(menor.linhas.find((l) => l.tipo === 'variacao')!.realizadoCentavos).toBe(R(-2_300));
  });

  it('no período em curso uma diferença não é "estoque": o painel a mostra como o defeito que é', () => {
    const p = montarPainelDeCategorias(entrada({ encerrado: false, totalCentavos: R(33_400) }));
    const v = p.linhas.find((l) => l.tipo === 'variacao')!;
    expect(v.nome).toBe('Diferença que o painel não explica');
  });

  it('pré-preparos: linha própria, sem meta e sem farol', () => {
    const p = montarPainelDeCategorias(entrada());
    const l = p.linhas.find((x) => x.tipo === 'preparos')!;
    expect(l.nome).toBe(NOME_DOS_PREPARADOS);
    expect(l.metaBp).toBeNull();
    expect(l.farol).toBeNull();
    expect(l.realizadoCentavos).toBeNull();
    expect(p.linhas[p.linhas.length - 1]).toBe(l);
  });

  it('categoria que a loja não usa: some se não tem valor; aparece "não usada" se teve valor; categoria criada no meio do período não tem meta', () => {
    const l1 = loja({ naoUsa: new Set([id('BEBIDAS')]), compras: COMPRAS_DA_ANALISE.map(([c, v]) => [id(c), c === 'BEBIDAS' ? 0 : v] as [string, number]) });
    const p1 = montarPainelDeCategorias(entrada({ lojas: [l1] }));
    expect(p1.linhas.find((l) => l.categoriaId === id('BEBIDAS'))).toBeUndefined();
    const l2 = loja({ naoUsa: new Set([id('BEBIDAS')]) });
    const p2 = montarPainelDeCategorias(entrada({ lojas: [l2] }));
    const b = linhaDe(p2, 'BEBIDAS');
    expect(b.naoUsada).toBe(true);
    expect(b.realizadoCentavos).toBe(R(3_300));
    const nova: CategoriaDoPainel = { id: 'nova', chave: null, nome: 'Sorvetes', ordem: 55, ativa: true, sistema: false };
    const p3 = montarPainelDeCategorias(entrada({ categorias: [...CATEGORIAS, nova], lojas: [loja({ compras: [...COMPRAS_DA_ANALISE.map(([c, v]) => [id(c), v] as [string, number]), ['nova', 100]] })] }));
    const n = p3.linhas.find((l) => l.categoriaId === 'nova')!;
    expect(n.metaBp).toBeNull();
    expect(n.farol).toBeNull();
    expect(n.realizadoCentavos).toBe(R(100));
  });

  it('categoria desativada com meta segue no painel; sem valor nem meta, some', () => {
    const cats = CATEGORIAS.map((c) => (c.chave === 'BEBIDAS' ? { ...c, ativa: false } : c));
    const comMeta = montarPainelDeCategorias(entrada({ categorias: cats }));
    expect(linhaDe(comMeta, 'BEBIDAS').desativada).toBe(true);
    expect(linhaDe(comMeta, 'BEBIDAS').metaBp).toBe(300);
    const l = loja({ metas: new Map(), compras: COMPRAS_DA_ANALISE.filter(([c]) => c !== 'BEBIDAS').map(([c, v]) => [id(c), v] as [string, number]) });
    const sem = montarPainelDeCategorias(entrada({ categorias: cats, lojas: [l] }));
    expect(sem.linhas.find((x) => x.categoriaId === id('BEBIDAS'))).toBeUndefined();
  });
});

describe('I.2a · rede: soma das lojas, meta própria e meta parcial (critério 7)', () => {
  const delivery = (metas: ReadonlyMap<string, number> | null, vem: 'rede' | 'loja' | null): LojaNoPainel =>
    loja({ lojaId: 'dl', nome: 'Delivery', receitaBrutaCentavos: R(50_000), compras: COMPRAS_DA_ANALISE.map(([c, v]) => [id(c), v / 2] as [string, number]), metas, metaVemDe: vem });

  it('as duas lojas na meta da rede: uma meta só, soma de R$ e % sobre a receita da rede', () => {
    const p = montarPainelDeCategorias(entrada({ lojas: [loja(), delivery(modelo(), 'rede')] }));
    const l = linhaDe(p, 'PROTEINA');
    expect(l.metaBp).toBe(1100);
    expect(l.metaCentavos).toBe(R(11_000) + R(5_500));
    expect(l.metaVemDe).toBe('rede');
    expect(l.realizadoCentavos).toBe(R(18_000));
    expect(p.somaDasComprasCentavos).toBe(R(33_300) + R(16_650));
  });

  it('Delivery personalizado (Proteína 9 %): a rede tem Proteína 12 % só para quem a segue, e o painel da rede soma as duas metas', () => {
    const proprias = new Map(modelo()).set(id('PROTEINA'), 900);
    const redeNova = new Map(modelo()).set(id('PROTEINA'), 1200);
    const p = montarPainelDeCategorias(entrada({ lojas: [loja({ metas: redeNova }), delivery(proprias, 'loja')] }));
    const l = linhaDe(p, 'PROTEINA');
    expect(l.metaCentavos).toBe(R(12_000) + R(4_500));
    expect(l.metaVemDe).toBe('mista');
    // % sobre a receita da rede: (12.000 + 4.500) ÷ 150.000
    expect(l.metaBp).toBe(1100);
    const soDelivery = montarPainelDeCategorias(entrada({ lojas: [delivery(proprias, 'loja')] }));
    expect(linhaDe(soDelivery, 'PROTEINA').metaBp).toBe(900);
    expect(linhaDe(soDelivery, 'PROTEINA').metaVemDe).toBe('loja');
  });

  it('a meta só em parte das lojas não vira meta da rede: diz em quantas, sem farol', () => {
    const p = montarPainelDeCategorias(entrada({ lojas: [loja(), delivery(new Map(), 'loja')] }));
    const l = linhaDe(p, 'PROTEINA');
    expect(l.metaBp).toBeNull();
    expect(l.metaParcial).toBe('meta em 1 de 2 lojas');
    expect(l.farol).toBeNull();
  });

  it('a categoria que só uma das lojas usa tem a meta consolidada só nas lojas que a usam', () => {
    const l2 = delivery(modelo(), 'rede');
    const so1 = montarPainelDeCategorias(entrada({ lojas: [loja({ naoUsa: new Set([id('BEBIDAS')]) }), l2] }));
    expect(linhaDe(so1, 'BEBIDAS').metaCentavos).toBe(R(1_500));
  });
});

describe('I.2a · a fotografia v4 (critério 10)', () => {
  it('ida e volta: o painel do fechado é idêntico ao do ao vivo de quando fechou', () => {
    const lojas = [loja(), loja({ lojaId: 'dl', nome: 'Delivery', receitaBrutaCentavos: R(50_000), compras: [[id('PROTEINA'), 4_000], [null, 100]], naoUsa: new Set([id('LIMPEZA')]), metas: new Map([[id('PROTEINA'), 900]]), metaVemDe: 'loja' })];
    const aoVivo = montarPainelDeCategorias(entrada({ lojas }));
    const json = JSON.parse(JSON.stringify(categoriasParaGravar(CATEGORIAS, lojas)));
    const lida = categoriasLidasDaFotografia(json, (lid) => lojas.find((l) => l.lojaId === lid)!.receitaBrutaCentavos)!;
    const fechado = montarPainelDeCategorias(entrada({ categorias: lida.categorias, lojas: lida.lojas }));
    expect(fechado.linhas.map((l) => [l.chave, l.realizadoCentavos, l.metaBp, l.metaCentavos, l.desvioBp, l.farol?.tipo, l.naoUsada])).toEqual(aoVivo.linhas.map((l) => [l.chave, l.realizadoCentavos, l.metaBp, l.metaCentavos, l.desvioBp, l.farol?.tipo, l.naoUsada]));
    expect(fechado.maioresDesvios.map((l) => l.chave)).toEqual(aoVivo.maioresDesvios.map((l) => l.chave));
  });

  it('reclassificar ou renomear depois não mexe no fechado: ele guarda o id, o nome e a meta da época', () => {
    const lojas = [loja()];
    const json = JSON.parse(JSON.stringify(categoriasParaGravar(CATEGORIAS.map((c) => (c.chave === 'PROTEINA' ? { ...c, nome: 'Carnes (da época)' } : c)), lojas)));
    const lida = categoriasLidasDaFotografia(json, () => R(100_000))!;
    expect(lida.categorias.find((c) => c.id === id('PROTEINA'))!.nome).toBe('Carnes (da época)');
    expect(lida.lojas[0].metas!.get(id('PROTEINA'))).toBe(1100);
  });

  it('lixo no JSON nunca vira número: formato desconhecido é descartado', () => {
    expect(categoriasLidasDaFotografia(null, () => 0)).toBeNull();
    expect(categoriasLidasDaFotografia({ versao: 2, lojas: {} }, () => 0)).toBeNull();
    const l = categoriasLidasDaFotografia({ versao: 1, lojas: { x: { nome: 'X', origem: 'rede', semCategoriaCentavos: 'abc', categorias: [] }, y: { nome: 'Y', origem: null, semCategoriaCentavos: 0, categorias: [{ id: 'a', nome: 'A', compraCentavos: 1.5 }, { id: 'b', nome: 'B', compraCentavos: 100, metaBp: 'x' }] } } }, () => 0)!;
    expect(l.lojas.map((x) => x.lojaId)).toEqual(['y']);
    expect(l.lojas[0].compras.get('b')).toBe(100);
    expect(l.lojas[0].compras.has('a')).toBe(false);
    expect(l.lojas[0].metas).toBeNull();
  });
});
