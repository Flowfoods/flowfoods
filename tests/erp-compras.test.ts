/**
 * ERP 1.5 · Entrada de compra — regras puras (sem banco).
 *
 * Regras da nota: rateio do frete, conversão de embalagem, total conferido,
 * desempate do último preço, efeito de cancelar, número e série normalizados.
 *
 * Heranças da 1.4: (b) o marcador JPEG 0xC8 (reservado, JPG) sai da lista do
 * que fica; (c) ficha com principal marcada e nenhuma validade avisa.
 */
import { describe, expect, it } from 'vitest';
import { limparMetadados, MENSAGEM_JPEG_ESTRANHO } from '@/lib/erp/foto-metadados';
import { JPG_LIMPO } from './erp-fotos-teste';
import { lerValidades } from '@/lib/erp/validade';
import {
  compararCompras,
  custoDaCompra,
  documentoValido,
  erroDoFormatoDaData,
  hojeNoRio,
  lerData,
  lerFormFornecedor,
  lerFormNota,
  lerFiltrosDeNota,
  normalizarCodigo,
  numeroDaNota,
  quantidadeDoItem,
  queryDosFiltrosDeNota,
  ratearFrete,
  retratoDaNota,
  ultimaCompraDaLista,
  type InsumoDaCompra,
} from '@/lib/erp/compra-campos';
import { custoPorUnidade, formatarCusto as fc, formatarFracao as ff, type CustoExato, type Fracao, type Unidade } from '@/lib/erp/unidades';

/** O Intl separa "R$" com espaço fino (NBSP): nos testes, espaço comum. */
const sp = (t: string | false | undefined) => (typeof t === 'string' ? t.replace(/\u00a0/g, ' ') : t);
const formatarCusto = (c: CustoExato | null, u: Unidade) => sp(fc(c, u));
const formatarFracao = (f: Fracao) => sp(ff(f));

describe('ERP 1.5 (herança b da 1.4) · JPEG: o reservado 0xC8 recusa', () => {
  const comSegmento = (marcador: number, dados: number[]) =>
    new Uint8Array([0xff, 0xd8, 0xff, marcador, 0, dados.length + 2, ...dados, ...JPG_LIMPO.subarray(2)]);

  it('C8 (JPG, reservado para extensões) recusa a foto inteira', () => {
    expect(limparMetadados(comSegmento(0xc8, [1, 2, 3, 4]), 'jpg')).toEqual({ ok: false, erro: MENSAGEM_JPEG_ESTRANHO });
  });

  it('os vizinhos que desenham a imagem continuam ficando (C4 DHT, CC DAC)', () => {
    for (const m of [0xc4, 0xcc]) {
      const r = limparMetadados(comSegmento(m, [0, 2]), 'jpg');
      expect(r.ok, `marcador ${m.toString(16)}`).toBe(true);
    }
  });
});

describe('ERP 1.5 (herança c da 1.4) · ficha com principal e nenhuma validade avisa', () => {
  it('formulário com "refrigerado" como principal e nada marcado: erro na principal, não grava sem dizer', () => {
    const r = lerValidades({ principal: 'REFRIGERADO', linhas: {} }, 'ficha');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erros.conservacao).toMatch(/refrigerado.*nenhuma conservação tem validade/i);
  });

  it('sem principal e sem nada marcado continua sendo "validade não informada"', () => {
    expect(lerValidades({ principal: '', linhas: {} }, 'ficha')).toEqual({ ok: true, validades: null });
    expect(lerValidades({ linhas: {} }, 'ficha')).toEqual({ ok: true, validades: null });
  });

  it('no insumo a principal sem validade continua valendo (é onde se guarda)', () => {
    expect(lerValidades({ principal: 'REFRIGERADO', linhas: {} }, 'insumo')).toEqual({ ok: true, validades: { principal: 'REFRIGERADO', minutos: {} } });
  });
});

describe('ERP 1.5 · frete rateado pelo valor dos itens', () => {
  it('proporcional e a soma bate ao centavo (maior resto)', () => {
    // 404,55 · 134,85 · 60,60: os 2 centavos que sobram vão para os maiores restos (,85 e ,60).
    expect(ratearFrete([26970, 8990, 4040], 600)).toEqual([404, 135, 61]);
    for (const [valores, frete] of [[[1, 1, 1], 100], [[333, 333, 334], 1], [[12345, 1, 99999], 777], [[5, 5], 3]] as const) {
      const partes = ratearFrete(valores, frete);
      expect(partes.reduce((s, p) => s + p, 0)).toBe(frete);
    }
  });

  it('empate no resto: a sobra vai para a linha de cima; frete 0 = nada', () => {
    expect(ratearFrete([100, 100, 100], 100)).toEqual([34, 33, 33]);
    expect(ratearFrete([500, 700], 0)).toEqual([0, 0]);
    expect(ratearFrete([], 500)).toEqual([]);
  });

  it('valores enormes não perdem precisão (BigInt por dentro)', () => {
    const partes = ratearFrete([1_999_999_999, 1], 1_999_999_999);
    expect(partes.reduce((s, p) => s + p, 0)).toBe(1_999_999_999);
    expect(partes[1]).toBe(1);
  });
});

describe('ERP 1.5 · conversão e custo do item', () => {
  it('embalagens × conteúdo em milésimos; meio milésimo arredonda para cima', () => {
    expect(quantidadeDoItem(3000, 5000)).toBe(15000); // 3 caixas de 5 kg
    expect(quantidadeDoItem(2500, 750)).toBe(1875); // 2,5 garrafas de 750 ml
    expect(quantidadeDoItem(3245, 1000)).toBe(3245); // 3,245 kg a granel
    expect(quantidadeDoItem(1, 500)).toBe(1); // 0,5 milésimo → 1
  });

  it('custo = (valor + frete rateado) ÷ quantidade, exato; vários itens da mesma nota somam', () => {
    const c = custoDaCompra([{ valorCentavos: 26970, freteRateadoCentavos: 405, quantidadeMilesimos: 15000 }])!;
    expect(formatarCusto(c, 'KG')).toBe('R$ 18,25/kg');
    const dois = custoDaCompra([
      { valorCentavos: 8990, freteRateadoCentavos: 0, quantidadeMilesimos: 5000 },
      { valorCentavos: 1990, freteRateadoCentavos: 10, quantidadeMilesimos: 1000 },
    ])!;
    expect(formatarFracao(custoPorUnidade(dois))).toBe('R$ 18,32'); // 110,00 ÷ 6 kg
  });
});

describe('ERP 1.5 · último preço: data da nota, depois a hora do lançamento', () => {
  const item = (notaId: string, entradaEm: string, lancadaEm: number, valor: number, status = 'LANCADA') => ({
    notaId,
    entradaEm,
    lancadaEm,
    status,
    valorCentavos: valor,
    freteRateadoCentavos: 0,
    quantidadeMilesimos: 1000,
  });

  it('nota de data mais nova vence, mesmo digitada antes', () => {
    const r = ultimaCompraDaLista([item('b', '2026-10-14', 100, 4490), item('a', '2026-10-10', 999, 4251)])!;
    expect(r.compra.notaId).toBe('b');
    expect(formatarCusto(r.custo, 'KG')).toBe('R$ 44,90/kg');
  });

  it('mesma data: a lançada por último; mesma hora: o id decide (determinístico)', () => {
    expect(ultimaCompraDaLista([item('a', '2026-10-14', 200, 1), item('b', '2026-10-14', 100, 2)])!.compra.notaId).toBe('a');
    expect(compararCompras({ notaId: 'b', entradaEm: '2026-10-14', lancadaEm: 1 }, { notaId: 'a', entradaEm: '2026-10-14', lancadaEm: 1 })).toBeGreaterThan(0);
  });

  it('cancelar a última volta ao preço da anterior; tudo cancelado = sem compra', () => {
    const lista = [item('nova', '2026-10-15', 300, 4490, 'CANCELADA'), item('velha', '2026-10-10', 100, 4251)];
    const r = ultimaCompraDaLista(lista)!;
    expect(r.compra.notaId).toBe('velha');
    expect(formatarCusto(r.custo, 'KG')).toBe('R$ 42,51/kg');
    expect(ultimaCompraDaLista([item('x', '2026-10-15', 1, 10, 'CANCELADA')])).toBeNull();
  });
});

describe('ERP 1.5 · leitura da nota (total conferido no servidor)', () => {
  const CHEDDAR: InsumoDaCompra = {
    id: 'ched',
    nome: 'Cheddar',
    unidade: 'KG',
    ativo: true,
    produzidoPor: null,
    conteudoMilesimos: 1000,
    embalagens: [{ id: 'cx', nome: 'Caixa', conteudoMilesimos: 5000, ativo: true }],
  };
  const PAO: InsumoDaCompra = { id: 'pao', nome: 'Pão brioche', unidade: 'UN', ativo: true, produzidoPor: null, conteudoMilesimos: 12000, embalagens: [] };
  const MOLHO: InsumoDaCompra = { ...PAO, id: 'molho', nome: 'Molho cheddar', produzidoPor: 'Molho cheddar' };
  const cadastro = new Map([CHEDDAR, PAO, MOLHO].map((i) => [i.id, i]));
  const opcoes = {
    hoje: '2026-10-16',
    lojas: new Map([['vp', { nome: 'Vila da Penha', ativa: true }]]),
    fornecedores: new Map([['f1', { nome: 'Laticínios Rio', ativo: true }]]),
  };
  const base = {
    lojaId: 'vp',
    fornecedorId: 'f1',
    numero: '000123',
    serie: '1',
    data: '14/10/2026',
    frete: '6,00',
    total: '330,60',
    itens: [
      { insumoId: 'ched', embalagem: 'v:cx', quantidade: '3', valor: '269,70' },
      { insumoId: 'pao', embalagem: 'padrao', quantidade: '2', valor: '54,90' },
    ],
  };

  it('lê, converte, rateia o frete e normaliza número/série', () => {
    const r = lerFormNota(base, cadastro, opcoes);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados).toMatchObject({ numero: '123', serie: '1', entradaEm: '2026-10-14', freteCentavos: 600, totalCentavos: 33060 });
    expect(r.dados.itens[0]).toMatchObject({ varianteId: 'cx', embalagem: 'Caixa · 5 kg', quantidadeMilesimos: 15000, valorCentavos: 26970 });
    expect(r.dados.itens[1]).toMatchObject({ varianteId: null, quantidadeMilesimos: 24000, valorCentavos: 5490 });
    expect(r.dados.itens.reduce((s, i) => s + i.freteRateadoCentavos, 0)).toBe(600);
  });

  it('total que não bate com itens + frete é recusado com a conta', () => {
    const r = lerFormNota({ ...base, total: '330,00' }, cadastro, opcoes);
    expect(r.ok).toBe(false);
    expect(sp(!r.ok && r.erros.total)).toBe('A soma dá R$ 330,60 (itens R$ 324,60 + frete R$ 6,00), mas a nota diz R$ 330,00. Confira os valores.');
  });

  it('a granel: quantidade direto em kg', () => {
    const r = lerFormNota({ ...base, frete: '', total: '129,48', itens: [{ insumoId: 'ched', embalagem: 'granel', quantidade: '3,245', valor: '129,48' }] }, cadastro, opcoes);
    expect(r.ok && r.dados.itens[0]).toMatchObject({ embalagem: 'A granel (kg)', quantidadeMilesimos: 3245, conteudoMilesimos: 1000 });
  });

  it('recusa: pré-preparo, valor zero, repetido na mesma embalagem, loja fora do acesso, data futura, sem total', () => {
    const r = lerFormNota(
      {
        ...base,
        lojaId: 'outra',
        data: '2026-10-17',
        total: '',
        itens: [
          { insumoId: 'molho', embalagem: 'padrao', quantidade: '1', valor: '10' },
          { insumoId: 'pao', embalagem: 'padrao', quantidade: '1', valor: '0' },
          { insumoId: 'ched', embalagem: 'padrao', quantidade: '1', valor: '10' },
          { insumoId: 'ched', embalagem: '', quantidade: '1', valor: '10' },
          { insumoId: 'xx', embalagem: 'padrao', quantidade: '1', valor: '10' },
        ],
      },
      cadastro,
      opcoes,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros.lojaId).toMatch(/fora do seu acesso/);
    expect(r.erros.data).toMatch(/depois de hoje/);
    expect(r.erros.total).toMatch(/Digite o total/);
    expect(r.erros['item-0']).toMatch(/feito na casa/);
    expect(r.erros['item-1']).toMatch(/bonificação/);
    expect(r.erros['item-3']).toMatch(/já está na nota \(item 3\)/);
    expect(r.erros['item-4']).toMatch(/não encontrado/);
  });

  it('desativado só passa se já estava na nota (edição)', () => {
    const inativo = new Map(cadastro).set('pao', { ...PAO, ativo: false });
    const so = { ...base, total: '60,90', itens: [base.itens[1]] };
    expect(lerFormNota(so, inativo, opcoes).ok).toBe(false);
    expect(lerFormNota(so, inativo, { ...opcoes, jaNaNota: { insumoIds: new Set(['pao']), variantes: new Set() } }).ok).toBe(true);
  });

  it('retrato do histórico: legível, com os itens', () => {
    const r = lerFormNota(base, cadastro, opcoes);
    if (!r.ok) throw new Error('nota');
    const ret = retratoDaNota(r.dados, { loja: 'Vila da Penha', fornecedor: 'Laticínios Rio' });
    expect(ret).toMatchObject({ nome: 'Nota 123 · série 1', loja: 'Vila da Penha', data: '14/10/2026', totalCentavos: 33060 });
    expect(sp(String(ret.itensDaNota))).toContain('Cheddar, Caixa · 5 kg: 3 = 15 kg por R$ 269,70');
  });
});

describe('ERP 1.5 · número, data, documento, filtros', () => {
  it('número só de dígitos perde zeros à esquerda; letras em maiúscula; espaço some', () => {
    expect(normalizarCodigo(' 000123 ', 20)).toBe('123');
    expect(normalizarCodigo('0', 20)).toBe('0');
    expect(normalizarCodigo('ab 12-3', 20)).toBe('AB12-3');
    expect(normalizarCodigo('12#3', 20)).toBeNull();
    expect(normalizarCodigo('', 10)).toBe('');
  });

  it('data em dd/mm/aaaa ou aaaa-mm-dd; 31/02 não existe', () => {
    expect(lerData('14/10/2026')).toBe('2026-10-14');
    expect(lerData('2026-10-14')).toBe('2026-10-14');
    expect(lerData('31/02/2026')).toBeNull();
    expect(hojeNoRio(new Date('2026-10-17T02:00:00Z'))).toBe('2026-10-16');
  });

  it('herança da 1.5: data com formato errado tem frase (o campo mostra ao sair dele)', () => {
    expect(erroDoFormatoDaData('')).toBeNull();
    expect(erroDoFormatoDaData('14/10/2026')).toBeNull();
    expect(erroDoFormatoDaData('14/10')).toBe('Data incompleta: use dd/mm/aaaa (ex.: 14/10/2026).');
    expect(erroDoFormatoDaData('31/02/2026')).toBe('31/02/2026 não existe no calendário.');
  });

  it('herança da 1.5: o número da nota é o mesmo na lista do desktop e do celular ("4521-1")', () => {
    expect(numeroDaNota({ numero: '4521', serie: '1' })).toBe('4521-1');
    expect(numeroDaNota({ numero: '4521', serie: '' })).toBe('4521');
    expect(numeroDaNota({ numero: null, serie: '' })).toBe('s/n');
  });

  it('CPF/CNPJ com dígito verificador', () => {
    expect(documentoValido('11222333000181')).toBe(true);
    expect(documentoValido('11222333000182')).toBe(false);
    expect(documentoValido('52998224725')).toBe(true);
    expect(documentoValido('11111111111')).toBe(false);
    expect(lerFormFornecedor({ nome: 'Laticínios Rio', documento: '11.222.333/0001-81', contato: ' (21) 99999-0000 ' })).toEqual({
      ok: true,
      dados: { nome: 'Laticínios Rio', documento: '11222333000181', contato: '(21) 99999-0000' },
    });
    expect(lerFormFornecedor({ nome: 'X', documento: '123' }).ok).toBe(false);
  });

  it('filtros da lista vão e voltam pela URL; lixo é ignorado', () => {
    const f = lerFiltrosDeNota({ loja: 'abc', fornecedor: "x'; drop", de: '2026-10-01', ate: 'ontem', situacao: 'canceladas', pagina: '2' });
    expect(f).toEqual({ lojaId: 'abc', fornecedorId: '', de: '2026-10-01', ate: '', situacao: 'canceladas', pagina: 2 });
    expect(queryDosFiltrosDeNota(f)).toBe('loja=abc&de=2026-10-01&situacao=canceladas&pagina=2');
  });
});

describe('ERP 1.5 (revisão de UX) · data em dd/mm/aaaa em qualquer navegador', () => {
  it('a máscara põe as barras e o servidor lê o que ela produz', async () => {
    const { mascararData } = await import('@/lib/erp/compra-campos');
    expect(mascararData('14')).toBe('14');
    expect(mascararData('1410')).toBe('14/10');
    expect(mascararData('14102026')).toBe('14/10/2026');
    expect(mascararData('14/10/20261')).toBe('14/10/2026');
    expect(lerData(mascararData('14102026'))).toBe('2026-10-14');
  });
});
