/**
 * ERP 0.2 — regras puras do Parceiro Flow e do histórico (sem banco).
 */
import { describe, expect, it } from 'vitest';
import { gerarSlug, SLUG_VALIDO } from '@/lib/erp/slug';
import { transicoesDe } from '@/lib/erp/parceiros';
import { descreverMudancas, rotuloAcao, rotuloEntidade } from '@/lib/erp/historico';

describe('ERP · slug do parceiro', () => {
  it('gera endereço limpo a partir do nome', () => {
    expect(gerarSlug("Grupo Valentin's")).toBe('grupo-valentins');
    expect(gerarSlug('  Açaí & Cia — Méier  ')).toBe('acai-cia-meier');
    expect(gerarSlug('---')).toBe('');
    expect(gerarSlug('a'.repeat(60)).length).toBe(48);
    expect(gerarSlug('abc def ghi', 7)).toBe('abc-def');
  });

  it('valida o formato aceito', () => {
    for (const ok of ['grupo-valentins', 'casa1', 'a-b-c']) expect(SLUG_VALIDO.test(ok), ok).toBe(true);
    for (const ruim of ['Com Espaço', '-x', 'x-', 'a--b', 'ação']) expect(SLUG_VALIDO.test(ruim), ruim).toBe(false);
  });
});

describe('ERP · status do parceiro', () => {
  it('só as transições combinadas', () => {
    expect(transicoesDe('RASCUNHO')).toEqual(['ATIVO']);
    expect(transicoesDe('ATIVO')).toEqual(['SUSPENSO']);
    expect(transicoesDe('SUSPENSO')).toEqual(['ATIVO']);
  });
});

describe('ERP · histórico legível', () => {
  it('alteração mostra só o que mudou, de quanto para quanto', () => {
    expect(descreverMudancas({ nome: 'A', status: 'ATIVO' }, { nome: 'B', status: 'ATIVO' })).toEqual([
      { campo: 'nome', antes: 'A', depois: 'B' },
    ]);
    expect(descreverMudancas({ status: 'ATIVO' }, { status: 'SUSPENSO' })).toEqual([
      { campo: 'status', antes: 'Ativo', depois: 'Suspenso' },
    ]);
  });

  it('criação mostra o que nasceu; dinheiro e quantidade formatados', () => {
    const m = descreverMudancas(null, { nome: 'Bacon', precoEmbalagemCentavos: 4290, conteudoMilesimos: 1500 });
    expect(m.map((x) => [x.campo, x.antes, x.depois.replace(/\s/g, ' ')])).toEqual([
      ['nome', null, 'Bacon'],
      ['preço', null, 'R$ 42,90'],
      ['embalagem', null, '1,5'],
    ]);
    // Com a unidade na linha, a quantidade sai com ela e a unidade não repete.
    expect(
      descreverMudancas(null, { nome: 'Bacon', unidade: 'KG', conteudoMilesimos: 1500 }).map((x) => [x.campo, x.depois]),
    ).toEqual([
      ['nome', 'Bacon'],
      ['embalagem', '1,5 kg'],
    ]);
  });

  it('rótulos', () => {
    expect(rotuloEntidade('ParceiroFlow')).toBe('Parceiro');
    expect(rotuloAcao('SUSPENDEU')).toBe('Suspendeu');
    expect(rotuloAcao('ZEROU')).toBe('Zerou');
  });
});
