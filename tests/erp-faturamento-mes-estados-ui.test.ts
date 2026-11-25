/**
 * Decisão 538 — Faturamento do mês: sem lançamento, zero declarado (Não vendeu) e "não vende" são três coisas
 * diferentes na tela. Antes, a loja sem nenhum lançamento mostrava R$ 0,00 nos cartões, e o canal com Não vendeu
 * aparecia igual ao canal em branco ("—"). O dado, a soma e a falta não mudam: só a leitura do mês já carregado.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { DiaDaLojaNoMes, LojaDoFaturamento, LojaNoMes, MesDoFaturamento } from '@/lib/erp/faturamento';
import { CANAIS_EM_ORDEM, totalizar, type CanalVenda, type GraoLido } from '@/lib/erp/faturamento-campos';
import { coberturaDaLoja, coberturaDaRede, estadoDoCanal, fraseDeParcial } from '@/lib/erp/faturamento-cobertura';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { TelaDoMes } from '@/components/erp/telas/faturamento/mes';

vi.mock('@/lib/db', () => { throw new Error('UI não consulta banco.'); });

const MES = '2026-11';
const HOJE = '2026-11-25';
const TODOS: CanalVenda[] = ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'];
const PENHA: LojaDoFaturamento = { id: 'loja-penha', nome: 'Vila da Penha', ativa: true, canais: TODOS };
const PENHA_DELIVERY: LojaDoFaturamento = { id: 'loja-penha-delivery', nome: 'Vila da Penha · Delivery', ativa: true, canais: TODOS };
const MEIER: LojaDoFaturamento = { id: 'loja-meier', nome: 'Méier', ativa: true, canais: ['DELIVERY_PROPRIO'] };

const grao = (valorCentavos: number, pedidos: number): GraoLido => ({ valorCentavos, pedidos, clientes: pedidos, fonte: 'HUMANO', fonteClientes: 'HUMANO', conferencia: null });
/** Não vendeu: o canal fecha o dia com zero (é lançamento). */
const NAO_VENDEU = grao(0, 0);

/** O mês de uma loja a partir dos lançamentos por dia; falta = canal que a loja vende, sem lançamento, nos dias que já têm algum. */
function loja(l: LojaDoFaturamento, lancamentos: Record<string, Partial<Record<CanalVenda, GraoLido>>> = {}): LojaNoMes {
  const dias: DiaDaLojaNoMes[] = Array.from({ length: 30 }, (_, i) => {
    const data = `${MES}-${String(i + 1).padStart(2, '0')}`;
    const canais = { ...(lancamentos[data] ?? {}) };
    const lidos = Object.values(canais) as GraoLido[];
    return {
      data,
      canais,
      total: lidos.length ? totalizar(lidos) : null,
      faltam: lidos.length ? l.canais.filter((c) => !canais[c]) : [],
      emAberto: data === HOJE,
      futuro: data > HOJE,
    };
  });
  const porCanal = Object.fromEntries(CANAIS_EM_ORDEM.map((c) => [c, totalizar(dias.flatMap((d) => (d.canais[c] ? [d.canais[c]!] : [])))])) as LojaNoMes['porCanal'];
  const faltas = dias.reduce((s, d) => s + d.faltam.length, 0);
  const primeira = dias.find((d) => d.total);
  return {
    loja: l,
    primeiraData: primeira ? primeira.data : null,
    dias,
    porCanal,
    total: totalizar(CANAIS_EM_ORDEM.map((c) => porCanal[c])),
    faltasPorCanal: { LOJA: 0, DELIVERY_PROPRIO: 0, IFOOD: faltas },
    faltas,
  };
}

function mes(lojas: LojaNoMes[]): MesDoFaturamento {
  const porCanal = Object.fromEntries(CANAIS_EM_ORDEM.map((c) => [c, totalizar(lojas.map((l) => l.porCanal[c]))])) as MesDoFaturamento['porCanal'];
  return { mes: MES, hoje: HOJE, dias: lojas[0].dias.map((d) => d.data), lojas, porCanal, total: totalizar(CANAIS_EM_ORDEM.map((c) => porCanal[c])), faltas: lojas.reduce((s, l) => s + l.faltas, 0), temIntegracao: false };
}

/** O dia do QA de 25/11: Loja vendeu, Delivery "Não vendeu", iFood em branco (falta). */
const penhaComDia = () => loja(PENHA, { [`${MES}-24`]: { LOJA: grao(125_000, 40), DELIVERY_PROPRIO: NAO_VENDEU } });

const n = (s: string) => s.replace(/&nbsp;| /g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
const html = (m: MesDoFaturamento, lojaAberta?: LojaNoMes) =>
  n(renderToStaticMarkup(createElement(TelaDoMes, { m, base: '/erp/faturamento', lojaAberta, podeLancar: true, bloqueio: null, veRede: true })));
const R0 = n(formatarDinheiro(0));
const contar = (h: string, t: string) => h.split(t).length - 1;
/** A linha da tabela cujo cabeçalho de linha (`th scope="row"`) tem o texto, até o fim da linha. */
const linha = (h: string, rotulo: string, de = 0) => {
  const i = h.indexOf(`>${rotulo}</`, de);
  expect(i, `linha "${rotulo}"`).toBeGreaterThan(-1);
  return h.slice(i, h.indexOf('</tr>', i));
};
const secao = (h: string, inicio: string, fim: string) => h.slice(h.indexOf(inicio), h.indexOf(fim, h.indexOf(inicio)));

describe('decisão 538 · a regra: quantos lançamentos formam o número', () => {
  it('Não vendeu conta como lançamento; canal em branco não; canal que a loja não vende é outra coisa', () => {
    const c = coberturaDaLoja(penhaComDia());
    expect(c.porCanal).toEqual({ LOJA: 1, DELIVERY_PROPRIO: 1, IFOOD: 0 });
    expect(c.total).toBe(2);
    expect(estadoDoCanal('LOJA', c)).toBe('valor');
    expect(estadoDoCanal('DELIVERY_PROPRIO', c)).toBe('valor');
    expect(estadoDoCanal('IFOOD', c)).toBe('sem-lancamento');
    const meier = coberturaDaLoja(loja(MEIER));
    expect(estadoDoCanal('IFOOD', meier)).toBe('nao-vende');
    expect(estadoDoCanal('DELIVERY_PROPRIO', meier)).toBe('sem-lancamento');
  });

  it('na rede, soma os lançamentos das lojas e "vende" se alguma loja vende', () => {
    const r = coberturaDaRede(mes([penhaComDia(), loja(PENHA_DELIVERY), loja(MEIER)]));
    expect(r.porCanal).toEqual({ LOJA: 1, DELIVERY_PROPRIO: 1, IFOOD: 0 });
    expect(r.vende).toEqual({ LOJA: true, DELIVERY_PROPRIO: true, IFOOD: true });
    expect(coberturaDaRede(mes([loja(MEIER)])).vende).toEqual({ LOJA: false, DELIVERY_PROPRIO: true, IFOOD: false });
  });

  it('a frase do parcial só existe com falta, no singular e no plural', () => {
    expect(fraseDeParcial(0)).toBeNull();
    expect(fraseDeParcial(1)).toBe('Parcial · 1 lançamento faltando');
    expect(fraseDeParcial(1234)).toBe('Parcial · 1.234 lançamentos faltando');
  });
});

describe('decisão 538 · a tela do mês de uma loja', () => {
  it('loja sem nenhum lançamento: "Sem dados" nos cartões e "sem lançamento" por canal; nenhum R$ 0,00 inventado', () => {
    const l = loja(PENHA_DELIVERY);
    const h = html(mes([l]), l);
    expect(contar(h, '>Sem dados<')).toBe(3); // Faturamento, Pedidos, Clientes atendidos
    expect(h).toContain('nenhum lançamento neste mês');
    expect(h).not.toContain(R0);
    const porCanal = secao(h, 'Por canal', '</table>');
    expect(contar(porCanal, '>sem lançamento<')).toBe(4); // os três canais e o total
    expect(porCanal).not.toMatch(/>0</);
  });

  it('o dia do QA: Loja com valor, Delivery Não vendeu (R$ 0,00) e iFood em branco (sem lançamento); total marcado como parcial', () => {
    const l = penhaComDia();
    const h = html(mes([l]), l);
    expect(h).toContain(n(formatarDinheiro(125_000)));
    expect(h).toContain('Parcial · 1 lançamento faltando');
    expect(h).not.toContain('>Sem dados<');
    const porCanal = secao(h, 'Por canal', '</table>');
    expect(linha(porCanal, 'Loja')).toContain(n(formatarDinheiro(125_000)));
    expect(linha(porCanal, 'Delivery próprio')).toContain(R0);
    expect(linha(porCanal, 'iFood')).toContain('sem lançamento');
    expect(linha(porCanal, 'iFood')).not.toContain(R0);
    expect(linha(porCanal, 'Total')).toContain(n(formatarDinheiro(125_000)));
  });

  it('loja que só lançou Não vendeu: o zero declarado é número (R$ 0,00), não "Sem dados"', () => {
    const l = loja(PENHA, { [`${MES}-24`]: { LOJA: NAO_VENDEU, DELIVERY_PROPRIO: NAO_VENDEU, IFOOD: NAO_VENDEU } });
    const h = html(mes([l]), l);
    expect(h).not.toContain('>Sem dados<');
    expect(h).toContain('venda dos pedidos concluídos');
    const porCanal = secao(h, 'Por canal', '</table>');
    expect(contar(porCanal, R0)).toBe(4);
    expect(porCanal).not.toContain('sem lançamento');
  });
});

describe('decisão 538 · a tela do mês da rede', () => {
  it('por loja e na linha Rede: valor, zero declarado, sem lançamento e não vende, cada um com o seu nome', () => {
    const m = mes([penhaComDia(), loja(PENHA_DELIVERY), loja(MEIER)]);
    const h = html(m);
    const tabela = secao(h, '<table class="w-full min-w-[640px]', '</table>');
    const delivery = linha(tabela, 'Vila da Penha · Delivery');
    expect(contar(delivery, '>sem lançamento<')).toBe(4); // três canais e o total da loja
    expect(delivery).not.toContain(R0);
    const meier = linha(tabela, 'Méier');
    expect(contar(meier, '>não vende<')).toBe(2);
    expect(contar(meier, '>sem lançamento<')).toBe(2); // Delivery e o total
    const rede = secao(tabela, '<tfoot', '</tfoot>');
    expect(rede).toContain(n(formatarDinheiro(125_000)));
    expect(rede).toContain(R0); // Delivery: Não vendeu da Penha
    expect(contar(rede, '>sem lançamento<')).toBe(1); // iFood: ninguém lançou
  });

  it('o total da rede diz o que falta: o lançamento em branco e as lojas que nunca lançaram', () => {
    const h = html(mes([penhaComDia(), loja(PENHA_DELIVERY), loja(MEIER)]));
    expect(h).toContain('Parcial · 1 lançamento faltando · 2 lojas ainda sem lançamento');
  });

  it('no celular, o cartão de cada loja usa as mesmas palavras', () => {
    const h = html(mes([penhaComDia(), loja(PENHA_DELIVERY), loja(MEIER)]));
    const celular = secao(h, '<ul class="divide-y divide-linha sm:hidden">', '</ul>');
    expect(celular).toContain(`Loja ${n(formatarDinheiro(125_000))} · Delivery ${R0} · iFood sem lançamento`);
    expect(celular).toContain('Loja não vende · Delivery sem lançamento · iFood não vende');
  });

  it('rede sem nenhum lançamento: "Sem dados" nos cartões e nenhum R$ 0,00', () => {
    const h = html(mes([loja(PENHA_DELIVERY), loja(MEIER)]));
    expect(contar(h, '>Sem dados<')).toBe(3);
    expect(h).not.toContain(R0);
  });

  it('os valores lançados continuam os mesmos: a soma da rede é a de antes', () => {
    const m = mes([penhaComDia(), loja(PENHA_DELIVERY), loja(MEIER)]);
    expect(m.total.valorCentavos).toBe(125_000);
    expect(html(m)).toContain(n(formatarDinheiro(m.total.valorCentavos)));
  });
});

describe('decisão 538 · revisão', () => {
  it('loja desativada sem lançamento não entra em "lojas sem lançamento" do total da rede', () => {
    const desativada = loja({ ...PENHA_DELIVERY, ativa: false });
    const h = html(mes([penhaComDia(), desativada]));
    expect(h).toContain('Parcial · 1 lançamento faltando');
    expect(h).not.toContain('ainda sem lançamento');
  });

  it('loja que já lançou antes (ou só depois deste mês) não entra em "ainda sem lançamento": as faltas já a mostram, ou o mês é anterior a ela', () => {
    const jaLancou = { ...loja(PENHA_DELIVERY), primeiraData: '2026-10-03' };
    const comecouDepois = { ...loja(MEIER), primeiraData: '2026-12-01' };
    const h = html(mes([penhaComDia(), jaLancou, comecouDepois]));
    expect(h).toContain('Parcial · 1 lançamento faltando');
    expect(h).not.toContain('ainda sem lançamento');
  });

  it('canal que só uma loja desativada vende é "não vende" na linha Rede', () => {
    const r = coberturaDaRede(mes([loja(MEIER), loja({ ...PENHA_DELIVERY, ativa: false })]));
    expect(estadoDoCanal('IFOOD', r)).toBe('nao-vende');
    expect(estadoDoCanal('DELIVERY_PROPRIO', r)).toBe('sem-lancamento');
  });

  it('grão da integração conta como lançamento, igual ao humano (inclusive com zero)', () => {
    const integ = (v: number, p: number): GraoLido => ({ ...grao(v, p), fonte: 'INTEGRACAO', fonteClientes: 'SEM_DADO', clientes: null });
    const l = loja(PENHA, { [`${MES}-24`]: { IFOOD: integ(0, 0), LOJA: integ(50_000, 5) } });
    const c = coberturaDaLoja(l);
    expect(estadoDoCanal('IFOOD', c)).toBe('valor');
    const porCanal = secao(html(mes([l]), l), 'Por canal', '</table>');
    expect(linha(porCanal, 'iFood')).toContain(R0);
    expect(linha(porCanal, 'Delivery próprio')).toContain('sem lançamento');
  });
});
