/** ERP L.2 · a parte pura dos relatórios de compras: filtros da URL, datas, a conta do preço médio e a planilha segura. */
import { describe, expect, it } from 'vitest';
import {
  abreComoFormula,
  atalhosDePeriodo,
  celulaDeTexto,
  custoMedioEntregue,
  fraseDoPeriodo,
  lerFiltrosDoRelatorio,
  lerPagina,
  linhasSemBase,
  precoDaLinha,
  precoMedioPonderado,
  quantidadeParaPlanilha,
  queryDoRelatorio,
  recorteDeUmInsumo,
  reaisParaPlanilha,
  somarDias,
  ultimoDiaDoMes,
  type TotalPorUnidade,
} from '@/lib/erp/compras-relatorio-campos';
import { linhaDaCompra, precoParaPlanilha } from '@/lib/erp/compras-relatorio-planilha';
import type { LinhaDeCompra } from '@/lib/erp/compras-relatorio';
import { formatarCusto } from '@/lib/erp/unidades';

const HOJE = '2026-10-22';
const nb = (t: string) => t.replace(/ /g, ' ');
const total = (c: Partial<TotalPorUnidade['comparavel']>, resto: Partial<TotalPorUnidade> = {}): TotalPorUnidade => ({
  unidade: 'KG',
  linhas: 4,
  quantidadeMilesimos: 26000,
  valorCentavos: 118600,
  freteCentavos: 500,
  comparavel: { linhas: 4, quantidadeMilesimos: 26000, valorCentavos: 118600, freteCentavos: 500, ...c },
  ...resto,
});

describe('L.2 · filtros da URL', () => {
  it('sem nada na URL: o mês até hoje, pela entrada, agrupado por insumo, só lançadas', () => {
    expect(lerFiltrosDoRelatorio({}, HOJE)).toMatchObject({ de: '2026-10-01', ate: HOJE, base: 'entrada', agrupar: 'insumo', situacao: 'lancadas', ver: 'resumo', lojaIds: [], pagina: 1, porPagina: 50, periodoInvalido: null });
  });
  it('datas em dd/mm/aaaa ou aaaa-mm-dd; torta cai no padrão; fim antes do começo vira frase', () => {
    expect(lerFiltrosDoRelatorio({ de: '05/09/2026', ate: '2026-09-30' }, HOJE)).toMatchObject({ de: '2026-09-05', ate: '2026-09-30' });
    expect(lerFiltrosDoRelatorio({ de: '31/02/2026', ate: 'ontem' }, HOJE)).toMatchObject({ de: '2026-10-01', ate: HOJE });
    expect(lerFiltrosDoRelatorio({ de: '2026-10-31', ate: '2026-10-01' }, HOJE).periodoInvalido).toMatch(/final vem antes da inicial/);
    expect(lerFiltrosDoRelatorio({ de: '1999-01-01', ate: '2026-01-01' }, HOJE).periodoInvalido).toMatch(/2000 e 2100/);
  });
  it('base, agrupar, situação, unidade, tamanho: só valores da lista; o resto cai no padrão', () => {
    const f = lerFiltrosDoRelatorio({ base: 'emissao', agrupar: 'dia', situacao: 'canceladas', ver: 'linhas', unidade: 'sem', so: 'sembase', por: '25' }, HOJE);
    expect(f).toMatchObject({ base: 'emissao', agrupar: 'dia', situacao: 'canceladas', ver: 'linhas', unidade: 'sem', so: 'sembase', porPagina: 25 });
    const torto = lerFiltrosDoRelatorio({ base: "x'; DROP", agrupar: '<b>', situacao: 'todas', ver: '1', unidade: 'kg', so: 'sim', por: '1000' }, HOJE);
    expect(torto).toMatchObject({ base: 'entrada', agrupar: 'insumo', situacao: 'lancadas', ver: 'resumo', unidade: '', so: '', porPagina: 50 });
  });
  it('lojas: várias, sem repetir; ids com lixo somem; o texto da busca é aparado e limitado', () => {
    const f = lerFiltrosDoRelatorio({ loja: ['abc123', 'abc123', "a'b", 'def456', ''], insumo: "x';--", fornecedor: 'forn1', q: `  ${'a'.repeat(200)}  ` }, HOJE);
    expect(f.lojaIds).toEqual(['abc123', 'def456']);
    expect(f.insumoId).toBe('');
    expect(f.fornecedorId).toBe('forn1');
    expect(f.q).toHaveLength(80);
  });
  it('o grupo aberto é id, dia ou "-"; qualquer outra coisa é ignorada', () => {
    expect(lerFiltrosDoRelatorio({ grupo: 'ck123abc' }, HOJE).grupo).toBe('ck123abc');
    expect(lerFiltrosDoRelatorio({ grupo: '2026-10-05' }, HOJE).grupo).toBe('2026-10-05');
    expect(lerFiltrosDoRelatorio({ grupo: '-' }, HOJE).grupo).toBe('-');
    expect(lerFiltrosDoRelatorio({ grupo: '../../etc' }, HOJE).grupo).toBe('');
    expect(lerFiltrosDoRelatorio({ grupo: '2026-13-45' }, HOJE).grupo).toBe('');
  });
  it('a URL vai e volta sem perder nada (e leva as datas e a base, que não mudam com o dia)', () => {
    const f = lerFiltrosDoRelatorio({ loja: ['l1', 'l2'], fornecedor: 'f1', insumo: 'i1', q: 'açaí', categoria: 'c1', de: '2026-09-01', ate: '2026-09-30', base: 'lancamento', agrupar: 'fornecedor', situacao: 'canceladas', ver: 'linhas', grupo: 'f1', unidade: 'KG', so: 'sembase', por: '10', pagina: '3' }, HOJE);
    const volta = lerFiltrosDoRelatorio(Object.fromEntries(new URLSearchParams(queryDoRelatorio(f))) as Record<string, string>, '2030-01-01');
    // `loja` repetida precisa de multi-valor para voltar: confere pelos pares.
    const pares = new URLSearchParams(queryDoRelatorio(f));
    expect(pares.getAll('loja')).toEqual(['l1', 'l2']);
    expect({ ...volta, lojaIds: f.lojaIds }).toEqual(f);
    expect(queryDoRelatorio(lerFiltrosDoRelatorio({}, HOJE))).toBe('de=2026-10-01&ate=2026-10-22&base=entrada&agrupar=insumo');
  });
  it('um insumo só no recorte: escolhido, ou grupo de insumo aberto', () => {
    expect(recorteDeUmInsumo({ insumoId: 'i1', agrupar: 'dia', grupo: '' })).toBe(true);
    expect(recorteDeUmInsumo({ insumoId: '', agrupar: 'insumo', grupo: 'i2' })).toBe(true);
    expect(recorteDeUmInsumo({ insumoId: '', agrupar: 'insumo', grupo: '-' })).toBe(false);
    expect(recorteDeUmInsumo({ insumoId: '', agrupar: 'fornecedor', grupo: 'f1' })).toBe(false);
  });
});

describe('L.2 · página da URL', () => {
  it('só inteiro de 1 a 1.000.000; o resto cai na primeira (nada de 22003 no banco)', () => {
    for (const bom of ['1', '2', '15', '1000000']) expect(lerPagina(bom), bom).toBe(Number(bom));
    for (const ruim of ['', '0', '-3', '1,5', '1.5', '1e12', '99999999', '1000001', '9007199254740993', 'abc', ' 2', '0x10', '٣']) expect(lerPagina(ruim), ruim).toBe(1);
    expect(lerFiltrosDoRelatorio({ pagina: '99999999' }, HOJE).pagina).toBe(1);
    expect(lerFiltrosDoRelatorio({ pagina: '1e12' }, HOJE).pagina).toBe(1);
    expect(lerFiltrosDoRelatorio({ pagina: '1000000' }, HOJE).pagina).toBe(1_000_000);
  });
});

describe('L.2 · calendário', () => {
  it('somar dias atravessa mês, ano e fevereiro bissexto', () => {
    expect(somarDias('2026-10-31', 1)).toBe('2026-11-01');
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(somarDias('2028-02-28', 1)).toBe('2028-02-29');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
    expect(ultimoDiaDoMes('2028-02-10')).toBe('2028-02-29');
    expect(ultimoDiaDoMes('2026-09-10')).toBe('2026-09-30');
  });
  it('atalhos: hoje, ontem, 7 dias, este mês e o mês passado (inclusive virada de ano)', () => {
    const a = Object.fromEntries(atalhosDePeriodo(HOJE).map((x) => [x.chave, [x.de, x.ate]]));
    expect(a).toEqual({ hoje: [HOJE, HOJE], ontem: ['2026-10-21', '2026-10-21'], '7dias': ['2026-10-16', HOJE], mes: ['2026-10-01', HOJE], mespassado: ['2026-09-01', '2026-09-30'] });
    expect(Object.fromEntries(atalhosDePeriodo('2027-01-03').map((x) => [x.chave, [x.de, x.ate]])).mespassado).toEqual(['2026-12-01', '2026-12-31']);
  });
  it('a frase do período diz a data usada, igual na tela, na planilha e na impressão', () => {
    expect(fraseDoPeriodo({ de: '2026-10-01', ate: '2026-10-31', base: 'entrada' })).toBe('Data da entrada da nota, de 01/10/2026 a 31/10/2026');
    expect(fraseDoPeriodo({ de: '2026-10-05', ate: '2026-10-05', base: 'emissao' })).toBe('Data de emissão da nota fiscal, em 05/10/2026');
    expect(fraseDoPeriodo({ de: '2026-10-05', ate: '2026-10-06', base: 'lancamento' })).toMatch(/^Dia do lançamento no sistema/);
  });
});

describe('L.2 · preço médio ponderado', () => {
  it('é valor ÷ quantidade, não a média dos preços: 5 kg a R$ 46 e 10 kg a R$ 47 dão R$ 46,67, não R$ 46,50', () => {
    const t = total({ quantidadeMilesimos: 15000, valorCentavos: 23000 + 47000, freteCentavos: 0 });
    expect(nb(formatarCusto(precoMedioPonderado(t), 'KG'))).toBe('R$ 46,67/kg');
    expect(nb(formatarCusto(precoMedioPonderado(total({})), 'KG'))).toBe('R$ 45,62/kg');
    expect(nb(formatarCusto(custoMedioEntregue(total({})), 'KG'))).toBe('R$ 45,81/kg');
  });
  it('sem quantidade comparável ou sem valor: sem base (nunca R$ 0,00)', () => {
    expect(precoMedioPonderado(total({ quantidadeMilesimos: 0, valorCentavos: 0, linhas: 0 }))).toBeNull();
    expect(precoMedioPonderado(total({ valorCentavos: 0 }))).toBeNull();
    expect(custoMedioEntregue(total({ valorCentavos: 0, freteCentavos: 500 }))).toBeNull();
  });
  it('preço abaixo de 1 centavo por unidade não vira zero (guardanapo a R$ 0,08)', () => {
    const t = total({ quantidadeMilesimos: 1_000_000, valorCentavos: 8000, freteCentavos: 0 }, { unidade: 'UN' });
    expect(nb(formatarCusto(precoMedioPonderado(t), 'UN'))).toBe('R$ 0,08/un');
    expect(nb(formatarCusto(precoMedioPonderado(total({ quantidadeMilesimos: 4_000_000, valorCentavos: 1000 }, { unidade: 'UN' })), 'UN'))).toBe('R$ 0,0025/un');
  });
  it('as linhas sem base são contadas por unidade', () => {
    expect(linhasSemBase(total({ linhas: 3 }))).toBe(1);
    expect(linhasSemBase(total({}))).toBe(0);
  });
  it('o preço de uma linha só existe com base', () => {
    const base = { valorCentavos: 47000, freteCentavos: 500, quantidadeMilesimos: 10000 };
    expect(nb(formatarCusto(precoDaLinha({ ...base, motivoSemBase: null }).preco, 'KG'))).toBe('R$ 47,00/kg');
    expect(nb(formatarCusto(precoDaLinha({ ...base, motivoSemBase: null }).entregue, 'KG'))).toBe('R$ 47,50/kg');
    expect(precoDaLinha({ ...base, motivoSemBase: 'unidade' })).toEqual({ preco: null, entregue: null });
  });
});

describe('L.2 · planilha segura', () => {
  it('texto que abre como fórmula ganha apóstrofo, com ou sem espaço antes', () => {
    for (const t of ['=1+1', '+cmd|x', '-2+3', '@SOMA(1)', '\t=x', '\r=x', ' =x', '  +x', '=HYPERLINK("http://a";"b")']) {
      expect(abreComoFormula(t), t).toBe(true);
      expect(celulaDeTexto(t).replace(/^"/, '').startsWith("'") || celulaDeTexto(t).replace(/^"/, '').startsWith(' '), t).toBe(true);
    }
    expect(celulaDeTexto('=1+1')).toBe("'=1+1");
    expect(celulaDeTexto('+55 21')).toBe("'+55 21");
    expect(abreComoFormula(celulaDeTexto('=1+1'))).toBe(false);
  });
  it('texto comum passa como está; ponto e vírgula e aspas viram célula entre aspas; quebra de linha vira espaço', () => {
    expect(celulaDeTexto('Muçarela')).toBe('Muçarela');
    expect(celulaDeTexto('Queijo; prato')).toBe('"Queijo; prato"');
    expect(celulaDeTexto('Peça "grande"')).toBe('"Peça ""grande"""');
    expect(celulaDeTexto('linha 1\nlinha 2\r\nlinha 3')).toBe('linha 1 linha 2 linha 3');
    expect(celulaDeTexto(null)).toBe('');
    // Travessão no meio não é fórmula.
    expect(celulaDeTexto('Pão - brioche')).toBe('Pão - brioche');
  });
  it('número e preço saem com vírgula decimal e sem milhar', () => {
    expect(reaisParaPlanilha(118600)).toBe('1186,00');
    expect(reaisParaPlanilha(5)).toBe('0,05');
    expect(quantidadeParaPlanilha(26000)).toBe('26');
    expect(quantidadeParaPlanilha(1250)).toBe('1,25');
    expect(quantidadeParaPlanilha(1_000_000)).toBe('1000');
    expect(precoParaPlanilha(118600, 26000)).toBe('45,6154');
    expect(precoParaPlanilha(8000, 1_000_000)).toBe('0,0800');
    expect(precoParaPlanilha(0, 1000)).toBe('');
    expect(precoParaPlanilha(1000, 0)).toBe('');
  });
  it('a linha do CSV protege o nome do insumo e do fornecedor e deixa o preço vazio quando falta base', () => {
    const l: LinhaDeCompra = {
      notaId: 'n1', itemId: 'i1', lojaId: 'l1', loja: 'Vila da Penha', fornecedorId: 'f1', fornecedor: '=cmd|"x"', numero: '102', serie: '', rotuloDaNota: '102', chaveAcesso: null,
      data: '2026-10-05', entradaEm: '2026-10-05', emitidaEm: null, lancadaEm: '2026-10-01T02:30:00.000Z', insumoId: 'ins', insumo: '@SOMA(A1)', embalagem: '+Peça',
      embalagensMilesimos: 5000, conteudoMilesimos: 2000, quantidadeMilesimos: 10000, unidade: 'KG', valorCentavos: 47000, freteCentavos: 500, totalCentavos: 47500,
      descontoDaNotaCentavos: 0, motivoSemBase: null, documentoId: null, cancelada: false, motivoCancelamento: null,
    };
    const c = linhaDaCompra(l).split(';');
    expect(linhaDaCompra(l)).toContain(`"'=cmd|""x"""`);
    expect(c).toContain("'@SOMA(A1)");
    expect(c).toContain("'+Peça");
    expect(c[3]).toBe('30/09/2026'); // 02:30 UTC de 01/10 = 23:30 de 30/09 no Rio
    expect(c).toContain('47,0000');
    const sem = linhaDaCompra({ ...l, unidade: null, motivoSemBase: 'unidade' }).split(';');
    expect(sem[11]).toBe('');
    expect(sem[13]).toBe('');
    expect(sem[19]).toMatch(/unidade não foi gravada/);
  });
});

describe('L.2 · a volta atravessa nota e documento fiscal (só caminho interno da área)', async () => {
  const { readFileSync } = await import('node:fs');
  const { caminhoDeVolta, rotuloDaVolta } = await import('@/lib/erp/volta');
  const ler = (f: string) => readFileSync(f, 'utf8');
  const paginas = {
    documento: ['src/app/erp/compras/recebidas/[id]/page.tsx', 'src/app/rodolfo/(painel)/erp/[slug]/compras/recebidas/[id]/page.tsx'],
    nota: ['src/app/erp/compras/[id]/page.tsx', 'src/app/rodolfo/(painel)/erp/[slug]/compras/[id]/page.tsx'],
  };
  it('as duas páginas do documento honram `volta` pelo mesmo filtro da nota (nada de endereço de fora)', () => {
    for (const f of paginas.documento) {
      const t = ler(f);
      expect(t, f).toMatch(/caminhoDeVolta\(searchParams\.volta, [^)]*, 2000\)/);
      expect(t, f).toMatch(/voltar=\{deOnde \?\? undefined\}/);
    }
  });
  it('as duas páginas da nota mandam a própria nota (com o relatório dela) como volta do documento fiscal', () => {
    for (const f of paginas.nota) expect(ler(f), f).toMatch(/recebidas\/\$\{nota\.documentoId\}\?volta=\$\{encodeURIComponent\(/);
  });
  it('o filtro da volta recusa o que sai da área e rotula o relatório e a nota', () => {
    const P = '/erp/';
    expect(caminhoDeVolta('https://outro.site/erp/x', P, 2000)).toBeNull();
    expect(caminhoDeVolta('//outro.site', P, 2000)).toBeNull();
    expect(caminhoDeVolta('/rodolfo/erp/casa/compras', P, 2000)).toBeNull();
    const relatorio = '/erp/compras/relatorios/periodo?de=2026-10-01&ate=2026-10-22&loja=a&loja=b';
    expect(caminhoDeVolta(relatorio, P, 2000)).toBe(relatorio);
    expect(rotuloDaVolta(relatorio)).toBe('o relatório de compras');
    const nota = `/erp/compras/cabc123?volta=${encodeURIComponent(relatorio)}`;
    expect(caminhoDeVolta(nota, P, 2000)).toBe(nota);
    expect(rotuloDaVolta(nota)).toBe('a nota de compra');
  });
});

describe('L.4 (Guardião) · o grupo "n:" aceita o nome da nota até o tamanho em que o banco o corta', () => {
  it('nome longo de fornecedor sem cadastro abre a linha; passou do corte, o grupo é ignorado', () => {
    const grupo = (g: string) => lerFiltrosDoRelatorio({ grupo: g }, '2026-11-20').grupo;
    expect(grupo('n:Feira do João')).toBe('n:Feira do João');
    expect(grupo(`n:${'x'.repeat(300)}`)).toBe(`n:${'x'.repeat(300)}`);
    expect(grupo(`n:${'x'.repeat(500)}`)).toBe(`n:${'x'.repeat(500)}`);
    expect(grupo(`n:${'x'.repeat(501)}`)).toBe('');
  });
});
