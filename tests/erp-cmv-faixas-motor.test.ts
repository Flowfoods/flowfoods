import { describe, expect, it } from 'vitest';
import { classificarFarolDeCmv, lerCortesDoFarol, lerFaixasDeCmv, LIMITE_DO_FAROL_BP, type CortesDoFarol } from '@/lib/erp/cmv-faixas-campos';
import { cmvDoCanal, porcentagemDoCmv } from '@/lib/erp/cmv-produto-campos';
import type { EntradaDoCanal } from '@/lib/erp/preco-campos';
import type { Fracao } from '@/lib/erp/unidades';

const cortes: CortesDoFarol = { aBp: 2000, bBp: 3000, cBp: 4000, dBp: 5000 };
const digitados = { a: '20', b: '30', c: '40', d: '50' };
const vazio = { a: '', b: '', c: '', d: '' };
const classificar = (cmvBp: Fracao, limites: CortesDoFarol | null = cortes) => classificarFarolDeCmv({ ofertado: true, custoCompleto: true, custoPositivo: true, cmvBp, motivoSemDados: null }, limites);

describe('3B · fronteiras exatas, antes da apresentação', () => {
  it.each([
    [1999999n, 'muitoFavoravel'], [2000000n, 'favoravel'], [2000001n, 'favoravel'],
    [2999999n, 'favoravel'], [3000000n, 'confortavel'], [3000001n, 'confortavel'],
    [3999999n, 'confortavel'], [4000000n, 'confortavel'], [4000001n, 'atencao'],
    [4999999n, 'atencao'], [5000000n, 'atencao'], [5000001n, 'critico'],
  ] as const)('%s/1000 bp pertence a %s', (num, faixa) => {
    expect(classificar({ num, den: 1000n })).toMatchObject({ faixa, cortes, motivo: null });
    // A mesma razão com inteiros além da precisão de Number deve manter a identidade.
    const escala = 10n ** 25n;
    expect(classificar({ num: num * escala, den: 1000n * escala }).faixa).toBe(faixa);
  });

  it('dois CMVs exibidos como 30,0% ficam em lados distintos de B', () => {
    const abaixo = { num: 29999n, den: 10n }, acima = { num: 30001n, den: 10n };
    expect(porcentagemDoCmv(abaixo)).toBe('30,0%');
    expect(porcentagemDoCmv(acima)).toBe('30,0%');
    expect(classificar(abaixo).faixa).toBe('favoravel');
    expect(classificar(acima).faixa).toBe('confortavel');
  });

  it('limites acima de 100% e A zero não são meta, default ou saturação', () => {
    const limites = { aBp: 0, bBp: 11000, cBp: 15000, dBp: 20000 };
    expect(classificar({ num: 15000n, den: 1n }, limites).faixa).toBe('confortavel');
    expect(classificar({ num: 20001n, den: 1n }, limites).faixa).toBe('critico');
    expect(classificar({ num: 1n, den: 1n }, limites).faixa).toBe('favoravel');
  });
});

describe('3B · entrada completa e limite de representação', () => {
  it('só quatro textos vazios retiram configuração; um canal vazio não apaga os outros', () => {
    expect(lerCortesDoFarol(vazio)).toEqual({ ok: true, dados: null });
    expect(lerFaixasDeCmv({ LOJA: digitados, DELIVERY_PROPRIO: vazio, IFOOD: digitados })).toEqual({ ok: true, dados: { LOJA: cortes, DELIVERY_PROPRIO: null, IFOOD: cortes } });
  });

  it.each([undefined, null, {}, [], { ...digitados, d: undefined }, { ...digitados, d: null }, { ...digitados, a: 20 }, { ...digitados, c: '' }])('recusa entrada ausente/parcial ou não textual: %j', entrada => {
    expect(lerCortesDoFarol(entrada).ok).toBe(false);
  });

  it.each(['-1', '+1', '2e1', '20,001', '20.01', 'vinte', '20.000.000,01'])('recusa formato/teto inválido %s sem mudar o valor', a => {
    expect(lerCortesDoFarol({ ...digitados, a }).ok).toBe(false);
  });

  it('igualdade e inversão de cada fronteira são inválidas; formulário truncado não limpa iFood', () => {
    for (const entrada of [{ ...digitados, b: '20' }, { ...digitados, c: '29,99' }, { ...digitados, d: '40' }]) expect(lerCortesDoFarol(entrada).ok).toBe(false);
    expect(lerFaixasDeCmv({ LOJA: digitados, DELIVERY_PROPRIO: digitados }).ok).toBe(false);
  });

  it('aceita precisão de 1 bp até o teto acordado, incluindo zero e percentuais acima de 100%', () => {
    expect(LIMITE_DO_FAROL_BP).toBe(2_000_000_000);
    expect(lerCortesDoFarol({ a: '0', b: '100,01%', c: '19.999.999,99', d: '20.000.000,00%' })).toEqual({ ok: true, dados: { aBp: 0, bBp: 10001, cBp: 1999999999, dBp: 2000000000 } });
  });
});

describe('3B · motor de canal integrado, independente de meta e taxa', () => {
  const entrada: EntradaDoCanal = { canal: 'IFOOD', custoDaFicha: { porRendimento: { num: 420n, den: 1n }, faltaPreco: [] }, embalagens: [], taxa: { comissaoBp: 2000, pagamentoBp: 0 } };

  it('sem meta mantém CMV/faixa calculáveis, sem sugestão; alterar meta/taxa não altera a faixa', () => {
    const sem = cmvDoCanal(entrada, { metaBp: null, precoCentavos: 1200, cortesDoFarol: cortes });
    expect(sem).toMatchObject({ status: 'semDados', sugerido: { tipo: 'semMeta' }, farol: { faixa: 'confortavel', cortes } });
    for (const taxa of [entrada.taxa, 'naoConfigurada', { comissaoBp: 0, pagamentoBp: 0 }] as const) {
      const outro = cmvDoCanal({ ...entrada, taxa }, { metaBp: 2500, precoCentavos: 1200, cortesDoFarol: cortes });
      expect(outro.status).toBe('acima');
      expect(outro.cmvBp).toEqual(sem.cmvBp);
      expect(outro.farol).toEqual(sem.farol);
      expect(outro.sugerido).toMatchObject({ tipo: 'ok', centavos: 1680 });
    }
  });

  it('não ofertado prevalece sobre faltas; custo zero, ausente e preço ausente não ganham faixa positiva', () => {
    const faltante = { ...entrada, custoDaFicha: { porRendimento: { num: 0n, den: 1n }, faltaPreco: ['Ingrediente'] } };
    expect(cmvDoCanal(faltante, { metaBp: null, precoCentavos: null, ofertado: false, cortesDoFarol: cortes }).farol.faixa).toBe('naoOfertado');
    expect(cmvDoCanal(faltante, { metaBp: 2500, precoCentavos: 1200, cortesDoFarol: cortes }).farol.faixa).toBe('semDados');
    expect(cmvDoCanal({ ...entrada, custoDaFicha: { porRendimento: { num: 0n, den: 1n }, faltaPreco: [] } }, { metaBp: 2500, precoCentavos: 1200, cortesDoFarol: cortes }).farol.faixa).toBe('semDados');
    expect(cmvDoCanal(entrada, { metaBp: 2500, precoCentavos: null, cortesDoFarol: cortes }).farol.faixa).toBe('semDados');
  });

  it('cortes ausentes não escondem número real nem usam meta como faixa', () => {
    const sem = cmvDoCanal(entrada, { metaBp: 4000, precoCentavos: 1200 });
    expect(sem).toMatchObject({ status: 'dentro', farol: { faixa: 'faixasNaoConfiguradas', cortes: null } });
    expect(sem.cmvBp).not.toBeNull();
    expect(cmvDoCanal(entrada, { metaBp: 4000, precoCentavos: null }).farol.faixa).toBe('semDados');
  });
});
