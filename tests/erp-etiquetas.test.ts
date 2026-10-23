/**
 * ERP 3.4 · etiquetas, sem banco: a validade efetiva do item aberto (o menor entre o vencimento do lote e abertura + prazo,
 * sem inventar prazo), o relógio do Rio, a leitura dos formulários, o desenho da etiqueta (ZPL e prévia do mesmo layout:
 * conteúdo, tamanho, acentos, quebra de linha, o que não cabe) e o ZPL seguro (nenhum dado vira comando na impressora), o
 * retrato da emissão (reimprimir = o mesmo papel) e o rastro do XML como sugestão.
 *
 *   npx vitest run tests/erp-etiquetas.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  codigoDaEtiqueta,
  conservacaoSugerida,
  dataHoraDaEtiqueta,
  diaNoRio,
  fimDoVencimento,
  fraseDaValidadeDaAbertura,
  fraseDoVencido,
  lerCodigoDoLote,
  limiteDeUso,
  NOME_DO_PEDIDO,
  seloDoPedido,
  venceu,
  inicioDoDiaNoRio,
  lerAbertura,
  lerCopias,
  lerEmissaoDaAbertura,
  lerEmissaoDoLote,
  lerLote,
  prazoNaConservacao,
  sequenciaDaEtiqueta,
  situacaoDaValidade,
  validadeDaAbertura,
} from '@/lib/erp/etiqueta-campos';
import { conteudoDeTeste, larguraDoTexto, linhasDoConteudo, montarEtiqueta, nomeDoArquivo, paraCampoZpl, quebrarEmLinhas, textoDaEtiqueta, VERSAO_DO_LAYOUT, zplDoLayout, type ConteudoDaEtiqueta } from '@/lib/erp/etiqueta-zpl';
import { conteudoDaEmissao, desenhoDaEmissao, zplDaEmissao } from '@/lib/erp/etiquetas';
import { rastrosDoXmlGuardado } from '@/lib/erp/nfe-xml';
import { traduzirErroDaZebra } from '@/components/erp/telas/etiquetas/browser-print';
import { BASE } from './erp-documento-fiscal-apoio';

const MIN = 60_000;
const DIA = 1440;
const at = (iso: string) => new Date(iso);

// ================================================================ o relógio do Rio

describe('3.4 · o dia e a hora no Rio', () => {
  it('a etiqueta diz a hora do Rio, não a do servidor: 02:30 UTC de 24/10 é 23:30 de 23/10', () => {
    expect(dataHoraDaEtiqueta(at('2026-10-24T02:30:00Z'))).toBe('23/10/26 23:30');
    expect(dataHoraDaEtiqueta(at('2026-10-24T02:30:00Z'), false)).toBe('23/10/26');
    expect(diaNoRio(at('2026-10-24T02:59:59Z'))).toBe('2026-10-23');
    expect(diaNoRio(at('2026-10-24T03:00:00Z'))).toBe('2026-10-24');
  });

  it('o fim do dia do vencimento é a meia-noite seguinte no Rio, inclusive na virada do mês e do ano', () => {
    expect(fimDoVencimento('2026-11-10').toISOString()).toBe('2026-11-11T03:00:00.000Z');
    expect(fimDoVencimento('2026-10-31').toISOString()).toBe('2026-11-01T03:00:00.000Z');
    expect(fimDoVencimento('2026-12-31').toISOString()).toBe('2027-01-01T03:00:00.000Z');
    expect(fimDoVencimento('2028-02-28').toISOString()).toBe('2028-02-29T03:00:00.000Z');
    expect(inicioDoDiaNoRio('2026-10-23').toISOString()).toBe('2026-10-23T03:00:00.000Z');
  });
});

// ================================================================ a validade efetiva do item aberto

describe('3.4 · validade efetiva = o menor entre o vencimento do lote e abertura + prazo após abertura', () => {
  const aberto = at('2026-10-23T17:00:00Z'); // 14:00 no Rio

  it('o prazo chega antes do vencimento: vale abertura + prazo (com hora)', () => {
    const v = validadeDaAbertura({ abertoEm: aberto, prazoMin: 3 * DIA, vencimentoLote: '2026-11-10' });
    expect(v).toEqual({ ok: true, validadeEm: at('2026-10-26T17:00:00Z'), regra: 'PRAZO_APOS_ABERTURA' });
  });

  it('o vencimento chega antes: vale o vencimento (o fim daquele dia), e abrir NÃO prolonga', () => {
    const v = validadeDaAbertura({ abertoEm: aberto, prazoMin: 30 * DIA, vencimentoLote: '2026-10-25' });
    expect(v).toEqual({ ok: true, validadeEm: at('2026-10-26T03:00:00Z'), regra: 'VENCIMENTO_DO_LOTE' });
    // Nunca depois do vencimento, qualquer que seja o prazo.
    for (const prazo of [1, 60, 3 * DIA, 30 * DIA, 730 * DIA]) {
      const r = validadeDaAbertura({ abertoEm: aberto, prazoMin: prazo, vencimentoLote: '2026-10-25' });
      if (!r.ok || !r.validadeEm) throw new Error('deveria ter validade');
      expect(r.validadeEm.getTime()).toBeLessThanOrEqual(fimDoVencimento('2026-10-25').getTime());
      expect(r.validadeEm.getTime()).toBeLessThanOrEqual(aberto.getTime() + prazo * MIN);
    }
  });

  it('sem prazo após abertura cadastrado: SEM data (nunca inventada, nem o vencimento do lote no lugar)', () => {
    expect(validadeDaAbertura({ abertoEm: aberto, prazoMin: null, vencimentoLote: '2026-11-10' })).toEqual({ ok: true, validadeEm: null, regra: 'PRAZO_NAO_INFORMADO' });
    expect(validadeDaAbertura({ abertoEm: aberto, prazoMin: null, vencimentoLote: null })).toEqual({ ok: true, validadeEm: null, regra: 'PRAZO_NAO_INFORMADO' });
    const frase = fraseDaValidadeDaAbertura({ regra: 'PRAZO_NAO_INFORMADO', validadeEm: null, vencimentoLote: '2026-11-10', prazoMin: null, conservacao: 'REFRIGERADO' });
    expect(frase).toContain('Prazo após abertura não informado em refrigerado');
    expect(frase).toContain('não é a validade depois de aberto');
  });

  it('sem vencimento do lote: vale só o prazo, e a frase manda conferir a embalagem', () => {
    const v = validadeDaAbertura({ abertoEm: aberto, prazoMin: 5 * DIA, vencimentoLote: null });
    expect(v).toEqual({ ok: true, validadeEm: at('2026-10-28T17:00:00Z'), regra: 'PRAZO_APOS_ABERTURA' });
    expect(fraseDaValidadeDaAbertura({ regra: 'PRAZO_APOS_ABERTURA', validadeEm: at('2026-10-28T17:00:00Z'), vencimentoLote: null, prazoMin: 5 * DIA, conservacao: 'REFRIGERADO' })).toContain('confira a embalagem');
  });

  it('abertura depois do vencimento: recusa (lote vencido não abre); no próprio dia do vencimento ainda abre', () => {
    const r = validadeDaAbertura({ abertoEm: at('2026-10-26T03:00:00Z'), prazoMin: 3 * DIA, vencimentoLote: '2026-10-25' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toBe('Este lote venceu em 25/10/2026: não abra. Separe para descarte e avise a gerência.');
    const noDia = validadeDaAbertura({ abertoEm: at('2026-10-26T02:59:00Z'), prazoMin: 3 * DIA, vencimentoLote: '2026-10-25' });
    expect(noDia).toEqual({ ok: true, validadeEm: at('2026-10-26T03:00:00Z'), regra: 'VENCIMENTO_DO_LOTE' });
  });

  it('o prazo da conservação escolhida: só o que está cadastrado; zero ou nulo = não informado', () => {
    const insumo = { validadeSecoMin: null, validadePistaFriaMin: 0, validadeRefrigeradoMin: 3 * DIA, validadeCongeladoMin: null, conservacao: 'SECO' as const };
    expect(prazoNaConservacao(insumo, 'REFRIGERADO')).toBe(3 * DIA);
    expect(prazoNaConservacao(insumo, 'SECO')).toBeNull();
    expect(prazoNaConservacao(insumo, 'PISTA_FRIA')).toBeNull();
    // A única com prazo é a sugerida (lata de tomate: guarda no seco, depois de aberta vai à geladeira).
    expect(conservacaoSugerida(insumo)).toBe('REFRIGERADO');
    expect(conservacaoSugerida({ ...insumo, validadeRefrigeradoMin: null })).toBe('SECO');
  });

  it('a situação diz o dia: venceu, vence hoje, amanhã, em N dias; a do vencimento do lote conta pelo dia', () => {
    const agora = at('2026-10-23T15:00:00Z');
    expect(situacaoDaValidade(null, agora)).toEqual({ texto: 'Validade não informada', tom: 'alerta' });
    expect(situacaoDaValidade(at('2026-10-23T14:00:00Z'), agora).texto).toBe('Venceu');
    expect(situacaoDaValidade(at('2026-10-23T20:00:00Z'), agora).texto).toBe('Vence hoje às 17:00');
    expect(situacaoDaValidade(at('2026-10-24T20:00:00Z'), agora).texto).toBe('Vence amanhã');
    expect(situacaoDaValidade(at('2026-11-02T20:00:00Z'), agora).texto).toBe('Vence em 10 dias');
    expect(situacaoDaValidade(fimDoVencimento('2026-10-23'), agora, '2026-10-23').texto).toBe('Vence hoje');
    expect(situacaoDaValidade(fimDoVencimento('2026-10-22'), agora, '2026-10-22').texto).toBe('Venceu');
  });
});

// ================================================================ os formulários

describe('3.4 · leitura dos formulários (servidor decide)', () => {
  const ctx = { unidade: 'KG' as const, produzidoMilesimos: 4600 };
  const base = { formato: 'E60X40', quantas: '3', quanto: '', escala: 'base', hora: 'on' };

  it('emitir do lote: formato, quantas (1 a 50), quanto em cada (opcional, sem lixo), e o total não passa do que saiu', () => {
    expect(lerEmissaoDoLote(base, ctx)).toEqual({ ok: true, emissao: { formato: 'E60X40', quantas: 3, quantidadeMilesimos: null, mostrarHora: true } });
    expect(lerEmissaoDoLote({ ...base, quanto: '500', escala: 'menor', hora: '' }, ctx)).toEqual({ ok: true, emissao: { formato: 'E60X40', quantas: 3, quantidadeMilesimos: 500, mostrarHora: false } });
    expect(lerEmissaoDoLote({ ...base, quanto: '1,5' }, ctx)).toMatchObject({ ok: true, emissao: { quantidadeMilesimos: 1500 } });
    const erro = (f: Partial<typeof base>, campo: string) => {
      const r = lerEmissaoDoLote({ ...base, ...f }, ctx);
      expect(r.ok, JSON.stringify(f)).toBe(false);
      if (!r.ok) expect(Object.keys(r.erros), JSON.stringify(f)).toContain(campo);
    };
    erro({ formato: '60x40' }, 'formato');
    erro({ quantas: '0' }, 'quantas');
    erro({ quantas: '51' }, 'quantas');
    erro({ quantas: '3,5' }, 'quantas');
    erro({ quantas: '' }, 'quantas');
    erro({ quantas: '2abc' }, 'quantas');
    erro({ quanto: '-1' }, 'quanto');
    erro({ quanto: '0' }, 'quanto');
    erro({ quanto: '1,5abc' }, 'quanto');
    erro({ quanto: '1e3' }, 'quanto');
    erro({ quanto: '0,5', escala: 'menor' }, 'quanto'); // em g só inteiro
    // 3 × 2 kg = 6 kg > 4,6 kg que saíram.
    const r = lerEmissaoDoLote({ ...base, quanto: '2' }, ctx);
    expect(r).toEqual({ ok: false, erros: { quanto: '3 × 2 kg passa do que saiu do lote (4,6 kg).' } });
  });

  it('emitir da abertura: quantas padrão 1; cópias de 1 a 50 no pedido', () => {
    expect(lerEmissaoDaAbertura({ formato: 'E60X60', quantas: '', hora: 'on' })).toEqual({ ok: true, emissao: { formato: 'E60X60', quantas: 1, mostrarHora: true } });
    expect(lerCopias('2')).toEqual({ ok: true, copias: 2 });
    for (const ruim of ['0', '51', '', '1,5', 'x']) expect(lerCopias(ruim).ok, ruim).toBe(false);
  });

  it('lote do fornecedor: tudo opcional e nunca inventado; no recebimento pede o código ou o vencimento; datas coerentes', () => {
    const hoje = '2026-10-23';
    expect(lerLote({ codigo: ' L 2309-A ', vencimento: '10/11/2026', fabricacao: '01/10/2026', marca: 'Tirolez' }, { hoje, exigeAlgo: true })).toEqual({
      ok: true,
      lote: { codigo: 'L 2309-A', vencimento: '2026-11-10', fabricacao: '2026-10-01', marca: 'Tirolez' },
    });
    expect(lerLote({ codigo: '', vencimento: '', fabricacao: '', marca: '' }, { hoje, exigeAlgo: false })).toEqual({ ok: true, lote: { codigo: null, vencimento: null, fabricacao: null, marca: null } });
    const erros = (f: Record<string, string>) => {
      const r = lerLote({ codigo: '', vencimento: '', fabricacao: '', marca: '', ...f }, { hoje, exigeAlgo: true });
      return r.ok ? {} : r.erros;
    };
    expect(erros({})).toHaveProperty('codigo');
    expect(erros({ vencimento: '31/02/2026' })).toHaveProperty('vencimento');
    expect(erros({ vencimento: '2026-11-10' })).toEqual({}); // aaaa-mm-dd também vale
    expect(erros({ codigo: 'L1', fabricacao: '24/10/2026' })).toHaveProperty('fabricacao');
    expect(erros({ codigo: 'L1', fabricacao: '10/11/2026', vencimento: '01/11/2026' })).toHaveProperty('fabricacao');
    expect(erros({ codigo: 'L1', vencimento: '01/01/2040' })).toHaveProperty('vencimento');
    expect(erros({ codigo: 'L^1' })).toHaveProperty('codigo');
    expect(erros({ codigo: 'x'.repeat(41) })).toHaveProperty('codigo');
    expect(erros({ codigo: 'L1', marca: 'm'.repeat(81) })).toHaveProperty('marca');
  });

  it('abrir: a conservação é escolhida (ela dá o prazo); quanto foi aberto é opcional', () => {
    expect(lerAbertura({ conservacao: 'REFRIGERADO', quanto: '1', escala: 'base' }, 'KG')).toEqual({ ok: true, abertura: { conservacao: 'REFRIGERADO', quantidadeMilesimos: 1000 } });
    expect(lerAbertura({ conservacao: '', quanto: '', escala: 'base' }, 'KG').ok).toBe(false);
    expect(lerAbertura({ conservacao: 'GELADEIRA', quanto: '', escala: 'base' }, 'KG').ok).toBe(false);
  });

  it('o código da etiqueta: dia e sequência', () => {
    expect(codigoDaEtiqueta('2026-10-23', 7)).toBe('E261023-0007');
    expect(sequenciaDaEtiqueta('E261023-0007')).toBe(7);
    expect(sequenciaDaEtiqueta('qualquer')).toBeNull();
  });
});

// ================================================================ o desenho e o ZPL

const LOTE: ConteudoDaEtiqueta = {
  origem: 'LOTE',
  produto: 'Molho cheddar',
  conservacao: 'REFRIGERADO',
  quantidade: '500 g',
  manipuladoEm: at('2026-10-23T17:05:00Z'),
  abertoEm: null,
  validade: { tipo: 'instante', em: at('2026-10-26T17:05:00Z') },
  vencimentoLote: null,
  lote: '261023-01',
  marca: null,
  responsavel: 'Caio Lima',
  loja: 'Vila da Penha',
  codigo: 'E261023-0007',
  mostrarHora: true,
};

const ABERTA: ConteudoDaEtiqueta = {
  origem: 'ABERTA',
  produto: 'Creme de leite',
  conservacao: 'REFRIGERADO',
  quantidade: '1 kg',
  manipuladoEm: null,
  abertoEm: at('2026-10-23T17:00:00Z'),
  validade: { tipo: 'dia', dia: '2026-10-25' },
  vencimentoLote: '2026-10-25',
  lote: 'L2309',
  marca: 'Itambé',
  responsavel: 'Duda Lima',
  loja: 'Vila da Penha',
  codigo: 'E261023-0008',
  mostrarHora: true,
};

/** Os textos do ZPL, decodificados do ^FH (para ler o que vai no papel). */
function textos(zpl: string): string[] {
  return [...zpl.matchAll(/\^FD(.*?)\^FS/g)].map((m) => m[1].replace(/_([0-9A-F]{2})/g, (_x, h: string) => String.fromCharCode(parseInt(h, 16))));
}

describe('3.4 · o ZPL: estrutura, tamanho e conteúdo', () => {
  it('60 × 40 a 203 dpi: ^XA, ^CI28 (UTF-8), 480 × 320 pontos, as cópias em ^PQ e ^XZ no fim; todo texto em ^FH', () => {
    const l = montarEtiqueta(LOTE, 'E60X40');
    expect(l.erro).toBeNull();
    const zpl = zplDoLayout(l, 3);
    const linhas = zpl.trim().split('\n');
    expect(linhas.slice(0, 6)).toEqual(['^XA', '^CI28', '^PW480', '^LL320', '^LH0,0', '^PON']);
    expect(linhas.at(-2)).toBe('^PQ3,0,1,Y');
    expect(linhas.at(-1)).toBe('^XZ');
    expect(zpl.match(/\^XA/g)).toHaveLength(1);
    expect(zpl.match(/\^XZ/g)).toHaveLength(1);
    for (const t of linhas.filter((x) => x.includes('^FD'))) expect(t).toMatch(/^\^FO\d+,\d+\^A0N,\d+,\d+\^FH_\^FD.*\^FS$/);
    expect(textos(zpl)).toEqual([
      'Molho cheddar',
      'REFRIGERADO · 500 g',
      'MANIPULADO 23/10/26 14:05',
      'VALIDADE 26/10/26 14:05',
      'LOTE 261023-01',
      'RESP. Caio Lima',
      'Vila da Penha · E261023-0007',
    ]);
  });

  it('tudo dentro da mídia: nenhum elemento passa da largura nem da altura (margem de 2 mm), nos dois formatos e nas duas resoluções', () => {
    for (const c of [LOTE, ABERTA, { ...LOTE, produto: 'Molho de queijo cheddar com bacon defumado e cebola caramelizada' }]) {
      for (const formato of ['E60X40', 'E60X60'] as const) {
        for (const res of [203, 300] as const) {
          const l = montarEtiqueta(c, formato, res);
          if (l.erro) continue;
          const m = res === 203 ? 16 : 24;
          for (const e of l.elementos) {
            if (e.tipo === 'texto') {
              expect(e.x + larguraDoTexto(e.texto, e.altura), `${formato} ${res} ${e.texto}`).toBeLessThanOrEqual(l.larguraPontos - m);
              expect(e.y + e.altura, `${formato} ${res} ${e.texto}`).toBeLessThanOrEqual(l.alturaPontos - m);
              expect(e.x).toBeGreaterThanOrEqual(m);
            } else {
              expect(e.x + e.largura).toBeLessThanOrEqual(l.larguraPontos - m);
            }
          }
        }
      }
    }
    expect(zplDoLayout(montarEtiqueta(LOTE, 'E60X60', 300), 1)).toContain('^PW720\n^LL720');
    expect(zplDoLayout(montarEtiqueta(LOTE, 'E60X40', 300), 1)).toContain('^PW720\n^LL480');
  });

  it('nome longo quebra a linha (nunca corta); se não cabe na 60 × 40 diz o campo e manda para a 60 × 60', () => {
    const medio = montarEtiqueta({ ...LOTE, produto: 'Molho de queijo cheddar com bacon' }, 'E60X40');
    expect(medio.erro).toBeNull();
    const doProduto = medio.elementos.filter((e) => e.tipo === 'texto' && e.campo === 'produto').map((e) => (e as { texto: string }).texto);
    expect(doProduto.length).toBe(2);
    expect(doProduto.join(' ')).toBe('Molho de queijo cheddar com bacon');
    const longo = { ...LOTE, produto: 'Molho de queijo cheddar com bacon defumado e cebola caramelizada da casa' };
    expect(montarEtiqueta(longo, 'E60X40').erro).toBe('O nome do produto não cabe na 60 × 40: use a 60 × 60.');
    const grande = montarEtiqueta(longo, 'E60X60');
    expect(grande.erro).toBeNull();
    expect(grande.elementos.filter((e) => e.tipo === 'texto' && e.campo === 'produto').map((e) => (e as { texto: string }).texto).join(' ')).toBe(longo.produto);
    expect(() => zplDoLayout(montarEtiqueta(longo, 'E60X40'), 1)).toThrow(/não cabe/);
    // Nome grande demais até para a 60 × 60: recusa com a saída (encurtar o nome), nunca corta.
    expect(montarEtiqueta({ ...LOTE, produto: 'Molho de queijo cheddar com bacon defumado, cebola caramelizada e pimenta da casa' }, 'E60X60').erro).toBe('O nome do produto não cabe na 60 × 60: encurte o nome na ficha ou no cadastro.');
    // Palavra maior que a linha: parte, não corta.
    const partes = quebrarEmLinhas('X'.repeat(60), 32, 448);
    expect(partes.join('')).toBe('X'.repeat(60));
    expect(partes.length).toBeGreaterThan(1);
  });

  it('item aberto: aberto em, usar até (o vencimento do lote, só o dia), vencimento e lote do fornecedor; a marca, opcional, fica de fora da 60 × 40 quando falta espaço, DITO', () => {
    const p = montarEtiqueta({ ...ABERTA, marca: null }, 'E60X40');
    expect(p.erro).toBeNull();
    expect(p.fora).toEqual([]);
    expect(montarEtiqueta(ABERTA, 'E60X40').fora).toEqual([]); // nome de uma linha: a marca cabe
    const doisNomes = montarEtiqueta({ ...ABERTA, produto: 'Creme de leite fresco pasteurizado' }, 'E60X40');
    expect(doisNomes.erro).toBeNull();
    expect(doisNomes.fora).toEqual(['a marca']);
    expect(textos(zplDoLayout(p, 1))).toEqual([
      'Creme de leite',
      'REFRIGERADO · 1 kg',
      'ABERTO 23/10/26 14:00',
      'USAR ATÉ 25/10/26',
      'VENC. LOTE 25/10/26',
      'LOTE FORN. L2309',
      'RESP. Duda Lima',
      'Vila da Penha · E261023-0008',
    ]);
    const g = montarEtiqueta(ABERTA, 'E60X60');
    expect(g.fora).toEqual([]);
    expect(textos(zplDoLayout(g, 1))).toContain('MARCA Itambé');
  });

  it('sem validade: a etiqueta diz que não foi informada, nunca uma data; sem lote, sem vencimento e sem responsável, idem', () => {
    const lote = textos(zplDoLayout(montarEtiqueta({ ...LOTE, validade: { tipo: 'nao-informada' }, conservacao: null, responsavel: null }, 'E60X40'), 1));
    expect(lote).toContain('VALIDADE NÃO INFORMADA');
    expect(lote).toContain('CONSERVAÇÃO NÃO INFORMADA · 500 g');
    expect(lote).toContain('RESP. NÃO REGISTRADO');
    expect(lote.join(' ')).not.toMatch(/VALIDADE \d/);
    const aberta = textos(zplDoLayout(montarEtiqueta({ ...ABERTA, validade: { tipo: 'nao-informada' }, vencimentoLote: null, lote: null, marca: null }, 'E60X40'), 1));
    expect(aberta).toEqual(expect.arrayContaining(['PRAZO APÓS ABERTURA', 'NÃO INFORMADO', 'VENC. LOTE NÃO INFORMADO', 'LOTE FORN. NÃO INFORMADO']));
    expect(aberta.join(' ')).not.toMatch(/USAR ATÉ/);
  });

  it('sem a hora: só o dia (o registro não perde precisão; é formatação)', () => {
    const t = textos(zplDoLayout(montarEtiqueta({ ...LOTE, mostrarHora: false }, 'E60X40'), 1));
    expect(t).toContain('MANIPULADO 23/10/26');
    expect(t).toContain('VALIDADE 26/10/26');
  });

  it('acentos do português vão em UTF-8 (^CI28), sem trocar letra', () => {
    const zpl = zplDoLayout(montarEtiqueta({ ...LOTE, produto: 'Maçã, pão e açúcar — Ãngela' }, 'E60X60'), 1);
    expect(zpl).toContain('^CI28');
    const doProduto = montarEtiqueta({ ...LOTE, produto: 'Maçã, pão e açúcar — Ãngela' }, 'E60X60').elementos.filter((e) => e.tipo === 'texto' && e.campo === 'produto').length;
    expect(textos(zpl).slice(0, doProduto).join(' ')).toBe('Maçã, pão e açúcar - Ãngela');
    expect(new TextEncoder().encode(zpl).length).toBeGreaterThan(zpl.length); // bytes UTF-8 multibyte
  });
});

describe('3.4 · ZPL seguro: dado nenhum vira comando', () => {
  it('^ e ~ (os prefixos de comando) e o próprio _ vão em hexadecimal; ^XZ/^XA/~JA no nome do lote não fecham nem abrem nada', () => {
    expect(paraCampoZpl('A^B~C_D')).toBe('A_5EB_7EC_5FD');
    const malicioso = { ...ABERTA, produto: 'Creme^FS^XZ^XA^FO0,0^FDHACK', lote: 'L1^XZ~JA', responsavel: 'Caio_~JR', marca: null };
    const zpl = zplDoLayout(montarEtiqueta(malicioso, 'E60X60'), 1);
    expect(zpl.match(/\^XA/g)).toHaveLength(1);
    expect(zpl.match(/\^XZ/g)).toHaveLength(1);
    expect(zpl).not.toMatch(/~/);
    // Em cada linha de texto, o único ^ é o dos comandos do próprio campo.
    for (const linha of zpl.split('\n').filter((x) => x.includes('^FD'))) {
      expect(linha.match(/\^/g)).toHaveLength(5); // ^FO, ^A0N, ^FH, ^FD e ^FS: nenhum veio do dado
    }
    const lidos = textos(zpl);
    expect(lidos.join('')).toContain('Creme^FS^XZ^XA^FO0,0^FDHACK');
    expect(lidos).toEqual(expect.arrayContaining(['LOTE FORN. L1^XZ~JA', 'RESP. Caio_~JR']));
  });

  it('quebra de linha, tabulação, controle e caracteres invisíveis saem; emoji sai; nada de comando novo por quebra', () => {
    expect(textoDaEtiqueta('Molho\ncheddar\r\n^XZ')).toBe('Molho cheddar ^XZ');
    expect(textoDaEtiqueta('A\u0000B\u0007C\u001bD')).toBe('ABCD');
    expect(textoDaEtiqueta('Pa\u200Bpri\u202Eca\uFEFF')).toBe('Paprica');
    expect(textoDaEtiqueta('Bolo 🎂 de chocolate')).toBe('Bolo de chocolate');
    expect(textoDaEtiqueta('Linha\u2028outra\u2029mais')).toBe('Linha outra mais');
    expect(textoDaEtiqueta('“aspas” ‘simples’ – travessão…')).toBe('"aspas" \'simples\' - travessão...');
    expect(textoDaEtiqueta('5°C')).toBe('5°C');
    const zpl = zplDoLayout(montarEtiqueta({ ...LOTE, produto: 'Molho\n^XZ\n^XA' }, 'E60X40'), 1);
    expect(zpl.split('\n').filter((l) => l === '^XZ' || l === '^XA')).toHaveLength(2);
  });

  it('o nome do arquivo é seguro', () => {
    expect(nomeDoArquivo('E261023-0007')).toBe('etiqueta-E261023-0007.zpl');
    expect(nomeDoArquivo('../../etc/passwd')).toBe('etiqueta-etcpasswd.zpl');
    expect(nomeDoArquivo('')).toBe('etiqueta-etiqueta.zpl');
  });

  it('a etiqueta de teste é fictícia e cabe nos dois formatos', () => {
    for (const f of ['E60X40', 'E60X60'] as const) {
      const l = montarEtiqueta(conteudoDeTeste(f, at('2026-10-23T17:00:00Z')), f);
      expect(l.erro).toBeNull();
      expect(textos(zplDoLayout(l, 1))[0]).toMatch(/^TESTE/);
    }
  });
});

// ================================================================ o retrato da emissão

describe('3.4 · a emissão é um retrato: reimprimir dá o mesmo papel', () => {
  const linha = {
    codigo: 'E261023-0007',
    ordemProducaoId: 'o1',
    nomeSnapshot: 'Molho cheddar',
    unidadeSnapshot: 'KG',
    quantidadeMilesimos: 500,
    conservacao: 'REFRIGERADO',
    loteFornecedor: null,
    loteProduzido: '261023-01',
    fabricadoEm: at('2026-10-23T17:05:00Z'),
    abertoEm: null,
    validadeEm: at('2026-10-26T17:05:00Z'),
    vencimentoLoteEm: null,
    regraDaValidade: 'LOTE_PRODUZIDO',
    marcaSnapshot: null,
    responsavelNomeSnapshot: 'Caio Lima',
    lojaNomeSnapshot: 'Vila da Penha',
    mostrarHora: true,
    formato: 'E60X40',
  };

  it('o conteúdo sai SÓ das colunas gravadas (nada de ficha, insumo ou relógio)', () => {
    expect(conteudoDaEmissao(linha)).toEqual(LOTE);
  });

  it('o mesmo retrato dá o mesmo ZPL hoje e amanhã; só as cópias mudam', () => {
    const hoje = zplDaEmissao(linha, 1);
    const depois = zplDaEmissao({ ...linha }, 1);
    expect(depois).toBe(hoje);
    expect(zplDaEmissao(linha, 4).replace('^PQ4,', '^PQ1,')).toBe(hoje);
  });

  it('item aberto pelo vencimento do lote: o papel diz o DIA do vencimento, não a meia-noite seguinte', () => {
    const aberta = {
      ...linha,
      codigo: 'E261023-0008',
      ordemProducaoId: null,
      nomeSnapshot: 'Creme de leite',
      quantidadeMilesimos: 1000,
      loteFornecedor: 'L2309',
      loteProduzido: null,
      fabricadoEm: null,
      abertoEm: at('2026-10-23T17:00:00Z'),
      validadeEm: fimDoVencimento('2026-10-25'),
      vencimentoLoteEm: at('2026-10-25T00:00:00Z'),
      regraDaValidade: 'VENCIMENTO_DO_LOTE',
      marcaSnapshot: 'Itambé',
      responsavelNomeSnapshot: 'Duda Lima',
    };
    expect(conteudoDaEmissao(aberta)).toEqual(ABERTA);
    expect(linhasDoConteudo(conteudoDaEmissao(aberta)).find((l) => l.campo === 'validade')?.texto).toBe('USAR ATÉ 25/10/26');
  });
});

// ================================================================ o rastro do XML (sugestão)

describe('3.4 · o rastro do XML vira sugestão (nada entra sozinho)', () => {
  const comRastro = BASE.replace(
    '<xProd>QUEIJO MUSSARELA PECA 2KG</xProd>',
    '<xProd>QUEIJO MUSSARELA PECA 2KG</xProd><rastro><nLote>L2309A</nLote><qLote>2.000</qLote><dFab>2026-10-01</dFab><dVal>2026-11-10</dVal></rastro><rastro><nLote>L2309B</nLote><qLote>1.000</qLote><dFab>2026-10-02</dFab><dVal>2026-02-30</dVal></rastro>',
  );

  it('lê nLote, qLote, dFab e dVal por item; data impossível vira null; item sem rastro não aparece', () => {
    const r = rastrosDoXmlGuardado(comRastro);
    expect([...r.keys()]).toEqual([1]);
    expect(r.get(1)).toEqual([
      { nLote: 'L2309A', qLoteMilesimos: 2000, dFab: '2026-10-01', dVal: '2026-11-10' },
      { nLote: 'L2309B', qLoteMilesimos: 1000, dFab: '2026-10-02', dVal: null },
    ]);
  });

  it('XML sem rastro ou estragado: sem sugestão, nunca erro', () => {
    expect(rastrosDoXmlGuardado(BASE).size).toBe(0);
    expect(rastrosDoXmlGuardado('<!DOCTYPE x [<!ENTITY a "b">]><x/>').size).toBe(0);
    expect(rastrosDoXmlGuardado('não é xml').size).toBe(0);
  });
});

// ================================================================ rodada de correção 1 (Guardião e UX)

describe('3.4 · rodada 1: vencido não emite, lote com pontuação, 300 dpi sem sumir nada, um termo para o sem prazo', () => {
  it('venceu: a validade passou (no instante); sem data não se sabe; a frase diz quando, pelo dia quando é o vencimento do lote', () => {
    const agora = new Date('2026-10-23T15:00:00Z'); // 12:00 no Rio
    expect(venceu(new Date('2026-10-23T14:59:00Z'), agora)).toBe(true);
    expect(venceu(new Date('2026-10-23T15:00:00Z'), agora)).toBe(true);
    expect(venceu(new Date('2026-10-23T15:01:00Z'), agora)).toBe(false);
    expect(venceu(null, agora)).toBe(false);
    expect(fraseDoVencido({ origem: 'LOTE', validadeEm: new Date('2026-10-22T17:05:00Z'), porDia: null })).toBe('Este lote venceu em 22/10 às 14:05: não use. Separe para descarte e avise a gerência.');
    expect(fraseDoVencido({ origem: 'ABERTA', validadeEm: fimDoVencimento('2026-10-22'), porDia: '2026-10-22' })).toBe('Esta embalagem venceu em 22/10: não use. Separe para descarte e avise a gerência.');
  });

  it('o lote do fornecedor aceita a pontuação comum (_ : # , ( ) +), como vem no nLote do XML; o resto continua recusado', () => {
    for (const c of ['L_2310', 'LT:2026', 'N#4521', 'A-1/2.3', 'L 12, 3', 'L(1)+2']) expect(lerCodigoDoLote(c)).toEqual({ ok: true, codigo: c });
    for (const c of ['L^XZ', 'L~1', 'L*1', 'L<1>', 'L"1']) expect(lerCodigoDoLote(c).ok, c).toBe(false);
    // O ZPL protege o que passou: `_` vira hexadecimal dentro de ^FH.
    expect(paraCampoZpl('LOTE FORN. L_2310')).toBe('LOTE FORN. L_5F2310');
  });

  it('300 dpi: o mesmo desenho de 203 ampliado — o que fica de fora é o mesmo e tudo cabe (o caso do Guardião e 3.000 sorteados)', () => {
    const guardiao: ConteudoDaEtiqueta = {
      origem: 'ABERTA',
      produto: 'WWW casa cheddar caramelizada',
      conservacao: 'REFRIGERADO',
      quantidade: null,
      manipuladoEm: null,
      abertoEm: new Date('2026-10-23T15:00:00Z'),
      validade: { tipo: 'instante', em: new Date('2026-10-26T15:00:00Z') },
      vencimentoLote: '2026-11-10',
      lote: 'cheddar com caramelizada',
      marca: 'Molho especial Molho',
      responsavel: 'cheddar cebola mmmm caramelizada',
      loja: 'mmmm cheddar com',
      codigo: 'E261023-0001',
      mostrarHora: true,
    };
    const palavras = ['WWW', 'casa', 'cheddar', 'caramelizada', 'Molho', 'especial', 'mmmm', 'com', 'cebola', 'Ação', 'Ãçé', 'L-2310', 'leite', 'MMMMMM'];
    let semente = 7;
    const sorte = (n: number) => {
      semente = (semente * 1103515245 + 12345) % 2147483648;
      return semente % n;
    };
    const frase = (max: number) => Array.from({ length: 1 + sorte(max) }, () => palavras[sorte(palavras.length)]).join(' ');
    const casos = [guardiao];
    for (let i = 0; i < 3000; i++) {
      casos.push({ ...guardiao, origem: sorte(2) ? 'ABERTA' : 'LOTE', produto: frase(5), lote: sorte(3) ? frase(3) : null, marca: sorte(2) ? frase(3) : null, responsavel: sorte(4) ? frase(3) : null, loja: frase(3) });
    }
    for (const c of casos) {
      for (const f of ['E60X40', 'E60X60'] as const) {
        const a = montarEtiqueta(c, f, 203);
        const b = montarEtiqueta(c, f, 300);
        expect(b.erro).toBe(a.erro);
        expect(b.fora).toEqual(a.fora);
        expect(b.elementos.map((e) => (e.tipo === 'texto' ? e.texto : '—'))).toEqual(a.elementos.map((e) => (e.tipo === 'texto' ? e.texto : '—')));
        for (const e of b.elementos) {
          const largura = e.tipo === 'texto' ? larguraDoTexto(e.texto, e.altura) : e.largura;
          const altura = e.tipo === 'texto' ? e.altura : e.espessura;
          expect(e.x + largura).toBeLessThanOrEqual(b.larguraPontos);
          expect(e.y + altura).toBeLessThanOrEqual(b.alturaPontos);
        }
      }
    }
    expect(montarEtiqueta(guardiao, 'E60X60', 300).fora).toEqual(montarEtiqueta(guardiao, 'E60X60', 203).fora);
  });

  it('a embalagem sem prazo usa um termo só e cabe na 60 × 40 com nome de duas linhas (letra normal, não a de destaque)', () => {
    const c: ConteudoDaEtiqueta = { ...conteudoDeTeste('E60X40', new Date('2026-10-23T15:00:00Z')), origem: 'ABERTA', produto: 'Creme de leite fresco integral', abertoEm: new Date('2026-10-23T15:00:00Z'), validade: { tipo: 'nao-informada' }, lote: null, vencimentoLote: null, responsavel: 'Otto Operador da Silva' };
    const l = montarEtiqueta(c, 'E60X40');
    expect(l.erro).toBeNull();
    const t = l.elementos.filter((e) => e.tipo === 'texto') as { texto: string; altura: number }[];
    // Rodada final (UX 4): o termo em duas linhas (inteiro numa linha encostava na borda com Arial), na letra normal.
    const i = t.findIndex((e) => e.texto === 'PRAZO APÓS ABERTURA');
    expect(i).toBeGreaterThan(-1);
    expect(t[i + 1]).toMatchObject({ texto: 'NÃO INFORMADO', altura: 22 });
    expect(t[i].altura).toBe(22);
    expect(t.some((e) => /PRAZO NÃO INFORMADO/.test(e.texto) && !/APÓS/.test(e.texto))).toBe(false);
    // Folga real: cada parte termina bem antes da borda, mesmo com a estimativa de largura 10 % mais larga (Arial/Roboto).
    for (const e of [t[i], t[i + 1]]) expect(16 + larguraDoTexto(e.texto, e.altura) * 1.1).toBeLessThan(480 - 16);
  });
});

describe('3.4 · rodada final: a embalagem sem prazo vence com o lote; o desenho pela versão gravada', () => {
  it('limiteDeUso: a validade gravada; sem ela, o fim do dia do vencimento do lote no Rio; sem os dois, nada', () => {
    const v = new Date('2026-10-25T12:00:00Z');
    expect(limiteDeUso(v, '2026-10-24')).toBe(v);
    expect(limiteDeUso(null, '2026-10-23')!.toISOString()).toBe('2026-10-24T03:00:00.000Z');
    expect(limiteDeUso(null, null)).toBeNull();
    const fim = limiteDeUso(null, '2026-10-23')!;
    expect(venceu(fim, new Date(fim.getTime() - 1))).toBe(false);
    expect(venceu(fim, fim)).toBe(true);
    expect(fraseDoVencido({ origem: 'ABERTA', validadeEm: fim, porDia: '2026-10-23' })).toBe('Esta embalagem venceu em 23/10: não use. Separe para descarte e avise a gerência.');
  });

  it('a versão do layout é a 1 (a primeira em produção); a emissão é desenhada pela versão gravada; versão desconhecida não imprime', () => {
    expect(VERSAO_DO_LAYOUT).toBe(1);
    const base = { codigo: 'E261023-0009', ordemProducaoId: 'o1', nomeSnapshot: 'Molho', unidadeSnapshot: 'KG', quantidadeMilesimos: null, conservacao: 'REFRIGERADO', loteFornecedor: null, loteProduzido: '261023-01', fabricadoEm: new Date('2026-10-23T15:00:00Z'), abertoEm: null, validadeEm: new Date('2026-10-26T15:00:00Z'), vencimentoLoteEm: null, regraDaValidade: 'LOTE_PRODUZIDO', marcaSnapshot: null, responsavelNomeSnapshot: 'Caio', lojaNomeSnapshot: 'Vila da Penha', mostrarHora: true, formato: 'E60X40' };
    const sem = desenhoDaEmissao({ ...base, versaoDoLayout: null });
    expect(desenhoDaEmissao({ ...base, versaoDoLayout: 1 })).toEqual(sem);
    expect(sem.erro).toBeNull();
    const futura = desenhoDaEmissao({ ...base, versaoDoLayout: 2 });
    expect(futura.erro).toBe('Esta etiqueta foi emitida com o desenho versão 2, que este sistema não tem: emita de novo.');
    expect(() => zplDaEmissao({ ...base, versaoDoLayout: 2 }, 1)).toThrow(/versão 2/);
  });
});

describe('3.4 · rodada 1: os pedidos por nome, "Já imprimi", sem resposta ≠ falhou, o erro da Zebra em palavras', () => {
  it('nome do pedido pelo caminho (não "Reimpressão N"); selo: Já imprimi > enviada > falhou > sem resultado > arquivo baixado / papel aberto', () => {
    expect(NOME_DO_PEDIDO).toEqual({ BROWSER_PRINT: 'Zebra', ARQUIVO_ZPL: 'Arquivo', PAPEL: 'Papel' });
    const quando = new Date('2026-10-23T17:05:00Z');
    expect(seloDoPedido({ transporte: 'PAPEL', situacao: 'EXPORTADA', confirmadaEm: null })).toEqual({ texto: 'Papel aberto', tom: 'neutro' });
    expect(seloDoPedido({ transporte: 'ARQUIVO_ZPL', situacao: 'EXPORTADA', confirmadaEm: null })).toEqual({ texto: 'Arquivo baixado', tom: 'neutro' });
    expect(seloDoPedido({ transporte: 'BROWSER_PRINT', situacao: 'PREPARADA', confirmadaEm: null })).toEqual({ texto: 'Sem resultado', tom: 'alerta' });
    expect(seloDoPedido({ transporte: 'BROWSER_PRINT', situacao: 'FALHOU', confirmadaEm: null })).toEqual({ texto: 'Falhou', tom: 'erro' });
    expect(seloDoPedido({ transporte: 'BROWSER_PRINT', situacao: 'ENVIADA', confirmadaEm: null })).toEqual({ texto: 'Enviada à impressora', tom: 'ok' });
    for (const t of ['PAPEL', 'ARQUIVO_ZPL', 'BROWSER_PRINT'] as const) {
      expect(seloDoPedido({ transporte: t, situacao: t === 'BROWSER_PRINT' ? 'PREPARADA' : 'EXPORTADA', confirmadaEm: quando })).toEqual({ texto: 'Já imprimi', tom: 'ok' });
    }
  });

  it('os erros comuns da Zebra viram frase de cozinha; o desconhecido aparece como veio', () => {
    expect(traduzirErroDaZebra('Error: Paper out')).toMatch(/^Acabou o rolo de etiquetas/);
    expect(traduzirErroDaZebra('Error: Media Out')).toMatch(/^Acabou o rolo/);
    expect(traduzirErroDaZebra('Error: Printer head open')).toMatch(/^A tampa da Zebra está aberta/);
    expect(traduzirErroDaZebra('Ribbon Out')).toMatch(/fita \(ribbon\)/);
    expect(traduzirErroDaZebra('Printer is paused')).toMatch(/pausada/);
    expect(traduzirErroDaZebra('Head too hot')).toMatch(/quente demais/);
    expect(traduzirErroDaZebra('Printer offline')).toMatch(/não está ligada/);
    expect(traduzirErroDaZebra('Erro 42 qualquer')).toBe('A impressora respondeu: Erro 42 qualquer');
  });
});
