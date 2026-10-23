/**
 * ERP L.4 · consumo e conciliação de estoque: a parte PURA (sem banco). A classificação em SQL é provada no teste de banco; aqui o
 * mapa das caixas, a ponte, bruto × líquido, as lacunas, os filtros da URL, o sinal e os avisos, com conta feita à mão.
 */
import { describe, expect, it } from 'vitest';
import {
  BUCKETS,
  BUCKETS_DA_COLUNA,
  COLUNAS_DA_TELA,
  LISTA_DE_BUCKETS,
  LISTA_DE_LINKS,
  avisosDoConsumo,
  bucketsDoLink,
  comprasBrutaELiquida,
  conferirPonte,
  dinheiroComSinal,
  fraseDoPeriodoDoConsumo,
  lacunasDaLinha,
  lerFiltrosDoConsumo,
  quantidadeComSinal,
  quantidadeLimpa,
  quantidadeParaPlanilha,
  queryDoConsumo,
  reaisComSinalParaPlanilha,
  somaDaColuna,
  somaDeTudo,
  usoBrutoELiquido,
  type DadosParaLacunas,
  type SomasPorBucket,
} from '@/lib/erp/consumo-estoque-campos';

const HOJE = '2026-11-20';

describe('L.4 · o mapa das caixas', () => {
  it('cada tipo de movimento tem uma caixa e cada caixa pertence a UMA coluna (sem dupla contagem)', () => {
    const vistos = new Map<string, string>();
    for (const [coluna, buckets] of Object.entries(BUCKETS_DA_COLUNA)) {
      for (const b of buckets) {
        expect(vistos.has(b)).toBe(false);
        vistos.set(b, coluna);
        expect(BUCKETS[b].coluna).toBe(coluna);
      }
    }
    expect(Array.from(vistos.keys()).sort()).toEqual([...LISTA_DE_BUCKETS].sort());
  });

  it('transferência existe só como lugar reservado (nenhuma coluna da tela) e cada link abre as caixas da coluna', () => {
    expect(COLUNAS_DA_TELA).not.toContain('transferencias');
    expect(BUCKETS.transf_entrada.origem).toBe('ainda não existe');
    expect(bucketsDoLink('uso')).toEqual(['uso_producao', 'uso_setor']);
    expect(bucketsDoLink('inicial')).toBeNull();
    expect(bucketsDoLink('final')).toBeNull();
    expect(LISTA_DE_LINKS[0]).toBe('inicial');
    expect(LISTA_DE_LINKS.at(-1)).toBe('final');
  });
});

describe('L.4 · a ponte e bruto × líquido', () => {
  // Cebola de outubro (a mesma do teste de banco): inicial 20, compras 80, cancelada −20, corrigida +2, uso −30 e −1,239, devolução +5, falta −0,761.
  const cebola: SomasPorBucket = {
    compra: { n: 3, q: 80_000, v: 48_000 },
    nota_cancelada: { n: 1, q: -20_000, v: -12_000 },
    nota_corrigida: { n: 2, q: 2_000, v: 1_200 },
    uso_setor: { n: 1, q: -30_000, v: -18_000 },
    uso_producao: { n: 2, q: -1_239, v: -743 },
    devolucao_setor: { n: 2, q: 5_000, v: 3_000 },
    contagem_falta: { n: 1, q: -761, v: -457 },
  };

  it('inicial + soma dos movimentos = final; diferença diz quanto falta quando não fecha', () => {
    expect(somaDeTudo(cebola).q).toBe(35_000);
    expect(conferirPonte(20_000, cebola, 55_000)).toEqual({ fecha: true, diferencaMilesimos: 0 });
    expect(conferirPonte(20_000, cebola, 54_000)).toEqual({ fecha: false, diferencaMilesimos: -1_000 });
    expect(conferirPonte(0, {}, 0).fecha).toBe(true);
  });

  it('as colunas da tela somam o que as caixas somam', () => {
    expect(somaDaColuna(cebola, 'compras')).toEqual({ n: 3, q: 80_000, v: 48_000 });
    expect(somaDaColuna(cebola, 'uso').q).toBe(-31_239);
    expect(somaDaColuna(cebola, 'estornos').q).toBe(-18_000);
    expect(somaDaColuna(cebola, 'devolucoes').q).toBe(5_000);
    expect(somaDaColuna(cebola, 'ajustes').q).toBe(-761);
    expect(somaDaColuna(cebola, 'perdas').q).toBe(0);
    const tudo = COLUNAS_DA_TELA.reduce((s, c) => s + somaDaColuna(cebola, c).q, 0) + somaDaColuna(cebola, 'transferencias').q;
    expect(tudo).toBe(somaDeTudo(cebola).q);
  });

  it('bruto, o que foi desfeito e o líquido: compras 80 − 18 = 62; uso −31,239 + 5 = −26,239', () => {
    const c = comprasBrutaELiquida(cebola);
    expect([c.bruto.q, c.desfeito.q, c.liquido.q]).toEqual([80_000, -18_000, 62_000]);
    const u = usoBrutoELiquido(cebola);
    expect([u.bruto.q, u.desfeito.q, u.liquido.q]).toEqual([-31_239, 5_000, -26_239]);
    // Dinheiro, do mesmo jeito (centavos): −R$ 187,43 de uso bruto, +R$ 30,00 devolvido.
    expect([u.bruto.v, u.desfeito.v]).toEqual([-18_743, 3_000]);
  });

  it('propriedade: com qualquer sequência de movimentos o saldo final lido por soma direta fecha com a ponte', () => {
    let semente = 12345;
    const sorteio = (n: number) => {
      semente = (semente * 1103515245 + 12345) & 0x7fffffff;
      return semente % n;
    };
    for (let rodada = 0; rodada < 300; rodada++) {
      const somas: SomasPorBucket = {};
      let direto = 0;
      const inicial = sorteio(100_000) - 20_000;
      for (let k = 0; k < sorteio(40); k++) {
        const b = LISTA_DE_BUCKETS[sorteio(LISTA_DE_BUCKETS.length)];
        const q = sorteio(20_000) - 10_000;
        const s = (somas[b] ??= { n: 0, q: 0, v: 0 });
        s.n++;
        s.q += q;
        direto += q;
      }
      expect(conferirPonte(inicial, somas, inicial + direto).fecha).toBe(true);
    }
  });
});

describe('L.4 · as lacunas', () => {
  const base: DadosParaLacunas = {
    unidade: 'KG',
    finalMilesimos: 55_000,
    minSaldoMilesimos: 12_000,
    movimentosNoPeriodo: 10,
    semOrigem: 0,
    semValor: 0,
    unidades: 1,
    saldoGuardadoMilesimos: 55_000,
    totalDoLivroMilesimos: 55_000,
    contadoNoPeriodo: true,
    ultimaContagemEm: '2026-10-12',
    verValores: true,
  };
  const chaves = (d: Partial<DadosParaLacunas>) => lacunasDaLinha({ ...base, ...d }).map((x) => x.chave);

  it('linha limpa não tem lacuna', () => expect(chaves({})).toEqual([]));

  it('saldo negativo no fim, negativo no meio (só um dos dois) e a frase com o número', () => {
    expect(chaves({ finalMilesimos: -10_000, minSaldoMilesimos: -10_000 })).toEqual(['negativo-final']);
    expect(chaves({ minSaldoMilesimos: -3_000 })).toEqual(['negativo-no-meio']);
    const l = lacunasDaLinha({ ...base, unidade: 'UN', finalMilesimos: -10_000 })[0];
    expect(l.texto).toMatch(/termina o período com −10\u00A0un/);
    expect(l.dura).toBe(true);
  });

  it('sem origem, saldo que não bate e unidade que mudou são lacunas duras; sem contagem e sem valor são só avisos', () => {
    expect(chaves({ semOrigem: 2 })).toEqual(['sem-origem']);
    expect(chaves({ saldoGuardadoMilesimos: 54_000 })).toEqual(['livro-diverge']);
    expect(chaves({ unidades: 2 })).toEqual(['unidade-mudou']);
    const ls = lacunasDaLinha({ ...base, contadoNoPeriodo: false, ultimaContagemEm: null, semValor: 1 });
    expect(ls.map((x) => [x.chave, x.dura])).toEqual([['sem-contagem', false], ['sem-valor', false]]);
    expect(ls[0].texto).toMatch(/Nenhuma contagem até aqui/);
    expect(lacunasDaLinha({ ...base, contadoNoPeriodo: false })[0].texto).toMatch(/A última contagem foi em 12\/10\/2026/);
  });

  it('R$ negativo com quantidade positiva ganha a explicação (só para quem vê R$, e só como aviso)', () => {
    const l = lacunasDaLinha({ ...base, finalMilesimos: 7_000, finalCentavos: -1_000 }).find((x) => x.chave === 'valor-negativo');
    expect(l?.dura).toBe(false);
    expect(l?.rotulo).toBe('R$ negativo');
    expect(l?.texto).toMatch(/saldo tem 7\u00A0kg, mas o R\$ dele está negativo \(−R\$\s10,00\)/);
    expect(l?.texto).toMatch(/A quantidade está certa/);
    // Sem ver R$, quantidade zero ou R$ positivo: nada a explicar.
    expect(chaves({ finalMilesimos: 7_000, finalCentavos: -1_000, verValores: false })).toEqual([]);
    expect(chaves({ finalMilesimos: 7_000, finalCentavos: 500 })).toEqual([]);
    expect(chaves({ finalMilesimos: 0, finalCentavos: -500 })).toEqual([]);
  });

  it('sem movimento no período não pede contagem; sem valor só é dito a quem vê R$', () => {
    expect(chaves({ movimentosNoPeriodo: 0, contadoNoPeriodo: false })).toEqual([]);
    expect(chaves({ semValor: 3, verValores: false })).toEqual([]);
  });
});

describe('L.4 · filtros da URL, sinal e planilha', () => {
  it('padrão: o mês até hoje; datas em dd/mm/aaaa ou aaaa-mm-dd; período torto e longo viram frase', () => {
    const f = lerFiltrosDoConsumo({}, HOJE);
    expect([f.de, f.ate, f.so, f.col, f.pagina]).toEqual(['2026-11-01', '2026-11-20', '', '', 1]);
    expect(lerFiltrosDoConsumo({ de: '01/10/2026', ate: '31/10/2026' }, HOJE)).toMatchObject({ de: '2026-10-01', ate: '2026-10-31', periodoInvalido: null });
    expect(lerFiltrosDoConsumo({ de: '2026-10-31', ate: '2026-10-01' }, HOJE).periodoInvalido).toMatch(/data final vem antes/);
    expect(lerFiltrosDoConsumo({ de: '2024-01-01', ate: '2026-10-01' }, HOJE).periodoInvalido).toMatch(/passa de 400 dias/);
    expect(lerFiltrosDoConsumo({ de: '1999-01-01', ate: '2000-02-01' }, HOJE).periodoInvalido).toMatch(/entre 2000 e 2100/);
  });

  it('lixo na URL é ignorado: coluna desconhecida, filtro desconhecido, id torto, volta que não é caminho', () => {
    const f = lerFiltrosDoConsumo({ col: 'uso;DROP', so: 'tudo', insumo: "x' OR 1=1", loja: ['abc', '../../x', 'def'], volta: 'http://fora.com', pagina: '1e12' }, HOJE);
    expect(f).toMatchObject({ col: '', so: '', insumoId: '', lojaIds: ['abc', 'def'], volta: '', pagina: 1 });
    expect(lerFiltrosDoConsumo({ col: 'uso', so: 'atencao', volta: '/erp/estoque/relatorios/consumo?de=2026-10-01' }, HOJE)).toMatchObject({ col: 'uso', so: 'atencao', volta: '/erp/estoque/relatorios/consumo?de=2026-10-01' });
  });

  it('a URL de volta leva as datas e só o que foi mudado', () => {
    const f = lerFiltrosDoConsumo({ de: '2026-10-01', ate: '2026-10-31', loja: 'abc', insumo: 'i1', so: 'atencao' }, HOJE);
    expect(queryDoConsumo(f)).toBe('loja=abc&insumo=i1&de=2026-10-01&ate=2026-10-31&so=atencao');
    expect(queryDoConsumo(f, { col: 'compras', so: '' }, { semPagina: true })).toBe('loja=abc&insumo=i1&de=2026-10-01&ate=2026-10-31&col=compras');
    expect(fraseDoPeriodoDoConsumo({ de: '2026-10-01', ate: '2026-10-31' })).toBe('Movimentos do livro do estoque de 01/10/2026 a 31/10/2026');
    expect(fraseDoPeriodoDoConsumo({ de: '2026-10-05', ate: '2026-10-05' })).toBe('Movimentos do livro do estoque em 05/10/2026');
  });

  it('sinal sempre à vista (+ entra, − sai), negativo com o sinal tipográfico, zero sem sinal', () => {
    expect(quantidadeComSinal(12_500, 'KG')).toBe('+12,5\u00A0kg');
    expect(quantidadeComSinal(-2_000, 'KG')).toBe('−2\u00A0kg');
    expect(quantidadeComSinal(-761, 'KG')).toBe('−761\u00A0g');
    expect(quantidadeComSinal(0, 'UN')).toBe('0\u00A0un');
    // Zero diz a unidade do insumo, não a menor ("0 ml", "0 g"), e número e unidade não se separam na quebra de linha.
    expect(quantidadeComSinal(0, 'L')).toBe('0\u00A0L');
    expect(quantidadeLimpa(0, 'KG')).toBe('0\u00A0kg');
    expect(quantidadeComSinal(-37_739, 'KG')).toBe('−37,739\u00A0kg');
    expect(quantidadeLimpa(-10_000, 'UN')).toBe('−10\u00A0un');
    expect(quantidadeLimpa(6_500, 'L')).toBe('6,5\u00A0L');
    expect(dinheiroComSinal(-625).replace(/ /g, ' ')).toBe('−R$ 6,25');
    expect(dinheiroComSinal(4250).replace(/ /g, ' ')).toBe('+R$ 42,50');
  });

  it('planilha: vírgula decimal e sinal ASCII, também no negativo com centavos (o de reais da L.2 errava "-1,-50")', () => {
    expect(quantidadeParaPlanilha(-761)).toBe('-0,761');
    expect(quantidadeParaPlanilha(55_000)).toBe('55');
    expect(quantidadeParaPlanilha(12_500)).toBe('12,5');
    expect(reaisComSinalParaPlanilha(-150)).toBe('-1,50');
    expect(reaisComSinalParaPlanilha(-5)).toBe('-0,05');
    expect(reaisComSinalParaPlanilha(120_000)).toBe('1200,00');
    expect(reaisComSinalParaPlanilha(0)).toBe('0,00');
  });
});

describe('L.4 · os avisos (tela, CSV e impressão dizem as mesmas frases)', () => {
  const base = { de: '2026-10-01', ate: '2026-10-31', hoje: '2026-11-20', verValores: true, lojasSemEstoque: [], aguardando: 0, contagensEmAndamento: 0, linhas: 8, comLacunaDura: 0, semContagem: 0, semValor: 0, movimentosSemOrigem: 0 };
  const chaves = (d: Partial<typeof base>) => avisosDoConsumo({ ...base, ...d }).map((a) => a.chave);

  it('sem nada a avisar, nada é dito', () => expect(chaves({})).toEqual([]));

  it('período em andamento, loja sem estoque aberto, nota fiscal aguardando e contagem em andamento', () => {
    expect(chaves({ ate: '2026-11-30' })).toEqual(['andamento']);
    const a = avisosDoConsumo({ ...base, lojasSemEstoque: ['Centro', 'Delivery'], aguardando: 3, contagensEmAndamento: 1 });
    expect(a.map((x) => x.chave)).toEqual(['sem-estoque', 'aguardando', 'contagem-aberta']);
    expect(a[0].texto).toMatch(/As lojas Centro, Delivery ainda não abriram o estoque/);
    expect(a[1].texto).toMatch(/3 notas fiscais recebidas \(XML\) aguardam conferência e ficam fora/);
    expect(a[2].texto).toMatch(/1 contagem está em andamento e ainda não foi aplicada/);
  });

  it('lacunas: contadores no plural certo; "sem valor" só para quem vê R$', () => {
    const a = avisosDoConsumo({ ...base, comLacunaDura: 1, semContagem: 6, semValor: 2 });
    expect(a.map((x) => x.chave)).toEqual(['lacunas', 'sem-contagem', 'sem-valor']);
    expect(a[0].texto).toMatch(/^1 insumo tem lacuna/);
    expect(a[1].texto).toMatch(/^6 insumos tiveram movimento e nenhuma contagem aplicada/);
    expect(chaves({ semValor: 2, verValores: false })).toEqual([]);
    // Sem linha nenhuma no recorte, "sem contagem" não faz sentido.
    expect(chaves({ semContagem: 6, linhas: 0 })).toEqual([]);
  });
});
