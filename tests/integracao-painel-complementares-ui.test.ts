import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { EstadoCoberturaAnalytics, FonteDoPainelAnalytics } from '@/lib/integracoes/ifood/painel-campos';
import { deslocarDiaDoPainel } from '@/lib/integracoes/ifood/painel-campos';
import type { ComplementaresDoPainelAnalytics } from '@/lib/integracoes/ifood/painel-complementares';
import { ComplementaresDoPainel } from '@/components/erp/telas/integracoes/painel-complementares';

vi.mock('@/lib/db', () => { throw new Error('A UI complementar não consulta banco.'); });
vi.mock('@/lib/integracoes/core/painel-complementares', () => { throw new Error('A UI não importa o leitor complementar.'); });

const CHAVE = '11111111-1111-4111-8111-111111111111';
const fontes: FonteDoPainelAnalytics[] = [{ chave: CHAVE, nome: 'Cozinha anterior', marca: 'Casa Centro', selecionada: true, ativa: false, ambigua: false }];
function dados(): ComplementaresDoPainelAnalytics {
  return {
    cobertura: { completa: true, diasEsperados: 1, diasCompletos: 1, fontesSelecionadas: 1, paresEsperados: 1, paresCobertos: 1,
      dias: [{ dia: '2026-11-05', completo: true, fontes: [{ chave: CHAVE, estado: 'publicado', publicadaEm: '2026-11-06T12:00:00Z', revisaoPendente: true }] }] },
    horarios: { total: { estado: 'disponivel', valor: '15' }, distribuicao: { estado: 'disponivel', valor: [
      { termo: '2', ocorrencias: '4' }, { termo: '10', ocorrencias: '6' }, { termo: '23', ocorrencias: '0' }, { termo: 'sem-hora', ocorrencias: '5' },
    ] } },
    primeirosPedidos: { total: { estado: 'disponivel', valor: '10' }, distribuicao: { estado: 'disponivel', valor: [
      { termo: 'true', ocorrencias: '2' }, { termo: 'false', ocorrencias: '3' }, { termo: 'OUTRO', ocorrencias: '5' },
    ] } },
  };
}
const html = (d = dados(), f = fontes) => renderToStaticMarkup(createElement(ComplementaresDoPainel, { dados: d, fontes: f }));
function secao(h: string, horario: boolean): string {
  const nome = horario ? 'Horário informado pela origem' : 'Primeiro pedido por estabelecimento de origem';
  const s = new RegExp(`<section aria-label="${nome}"[\\s\\S]*?</section>`).exec(h)?.[0];
  if (!s) throw new Error(`Seção ausente: ${nome}`);
  return s;
}
function linha(h: string, rotulo: string): string {
  const s = h.match(/<tr[^>]*>[\s\S]*?<\/tr>/g)?.find(t => t.includes(`>${rotulo}</th>`));
  if (!s) throw new Error(`Linha ausente: ${rotulo}`);
  return s;
}

describe('INT-1.8D · horário e primeiro pedido na interface', () => {
  it('oráculos 15 e 10 usam denominadores próprios, inclusive os termos desconhecidos', () => {
    const h = html(), horas = secao(h, true), primeiro = secao(h, false);
    expect(linha(horas, '02h')).toMatch(/>4<.*26,7%/);
    expect(linha(horas, '10h')).toMatch(/>6<.*40,0%/);
    expect(linha(horas, '23h')).toMatch(/>0<.*0,0%/);
    expect(linha(horas, 'Horário não reconhecido: sem-hora')).toMatch(/>5<.*33,3%/);
    expect(linha(primeiro, 'Primeiro pedido no estabelecimento de origem')).toMatch(/>2<.*20,0%/);
    expect(linha(primeiro, 'Demais pedidos informados')).toMatch(/>3<.*30,0%/);
    expect(linha(primeiro, 'Indicador não reconhecido: OUTRO')).toMatch(/>5<.*50,0%/);
    expect(h).not.toMatch(/R\$|GMV|retenção|clientes únicos/);
    expect(h).toContain('Uma pessoa pode aparecer em mais de uma origem');
    expect(h).toContain('Cada tabela tem seu próprio total');
  });
  it('horas não mudam com o fuso do navegador nem completam lacunas como zero', () => {
    const horas = secao(html(), true);
    expect(horas.indexOf('>02h<')).toBeLessThan(horas.indexOf('>10h<'));
    expect(horas.indexOf('>10h<')).toBeLessThan(horas.indexOf('>23h<'));
    expect(horas).not.toMatch(/>0[013-9]h<|<time|Brasília|São Paulo|UTC/);
    expect(horas).toContain('não há conversão de fuso');
  });
  it.each(['00', '01', '1.0', '-1', '24', ' 2 ', '__proto__', 'constructor', 'toString', 'null', '<NOVO>'])('hora não canônica %j permanece explícita e literal', termo => {
    const d = dados(); d.horarios = { total: { estado: 'disponivel', valor: '3' }, distribuicao: { estado: 'disponivel', valor: [{ termo, ocorrencias: '3' }] } };
    const h = secao(html(d), true), escapado = termo === '<NOVO>' ? '&lt;NOVO&gt;' : termo;
    expect(linha(h, `Horário não reconhecido: ${escapado}`)).toContain('100,0%');
    expect(h).not.toMatch(/<NOVO>|\[object Object\]|function Object|>0[012]h</);
  });
  it.each(['TRUE', 'False', '0', 'null', '__proto__', 'constructor', 'toString', '<NOVO>'])('indicador %j não é convertido em true/false', termo => {
    const d = dados(); d.primeirosPedidos = { total: { estado: 'disponivel', valor: '3' }, distribuicao: { estado: 'disponivel', valor: [{ termo, ocorrencias: '3' }] } };
    const h = secao(html(d), false), escapado = termo === '<NOVO>' ? '&lt;NOVO&gt;' : termo;
    expect(linha(h, `Indicador não reconhecido: ${escapado}`)).toContain('100,0%');
    expect(h).not.toMatch(/<NOVO>|\[object Object\]|>Demais pedidos informados<|>Primeiro pedido no estabelecimento de origem</);
  });
  it.each(['horarios', 'primeirosPedidos'] as const)('NULL de %s não apaga o outro mapa publicado', campo => {
    const d = dados(); d[campo] = { total: { estado: 'sem-dado', motivo: 'valor-nao-informado' }, distribuicao: { estado: 'sem-dado', motivo: 'valor-nao-informado' } };
    const h = html(d), ausente = secao(h, campo === 'horarios'), presente = secao(h, campo !== 'horarios');
    expect(h).toContain('Cobertura complementar completa'); expect(ausente).toContain('Distribuição sem dado');
    expect(ausente).toContain('O provedor não informou todos os valores necessários'); expect(ausente).not.toMatch(/<table|>0<|%/);
    expect(presente).toContain('<table'); expect(presente).not.toContain('Distribuição sem dado');
  });
  it('ambos mapas vazios preservam zero sem inventar zero pedidos ou participação', () => {
    const d = dados();
    for (const campo of ['horarios', 'primeirosPedidos'] as const) d[campo] = { total: { estado: 'disponivel', valor: '0' }, distribuicao: { estado: 'disponivel', valor: [] } };
    const h = html(d); expect(h.match(/>0<\/span>/g)).toHaveLength(2);
    expect(h.match(/Nenhuma ocorrência informada/g)).toHaveLength(2);
    expect(h).toContain('Isso não significa que não houve pedidos'); expect(h).not.toMatch(/<table|0,0%|NaN|Infinity/);
  });
  it('zero explícito mantém a linha e exige Sem base quando o total é zero', () => {
    const d = dados(); d.horarios = { total: { estado: 'disponivel', valor: '0' }, distribuicao: { estado: 'disponivel', valor: [{ termo: '0', ocorrencias: '0' }] } };
    const h = secao(html(d), true); expect(linha(h, '00h')).toMatch(/>0<.*Sem base/); expect(h).not.toMatch(/0,0%|NaN|Infinity/);
  });
  it('quantidades além de MAX_SAFE permanecem exatas no valor e na fração', () => {
    const d = dados(); d.horarios = { total: { estado: 'disponivel', valor: '18014398509481986' }, distribuicao: { estado: 'disponivel', valor: [{ termo: '1', ocorrencias: '9007199254740993' }, { termo: '2', ocorrencias: '9007199254740993' }] } };
    const h = secao(html(d), true); expect(h).toContain('18.014.398.509.481.986');
    expect(linha(h, '01h')).toContain('9.007.199.254.740.993'); expect(linha(h, '01h')).toContain('50,0%');
    expect(h).not.toMatch(/\d[eE]\+\d|NaN|Infinity|truncate/); expect(h).toContain('overflow-wrap:anywhere');
  });
  it.each(['cobertura-parcial', 'sem-fontes'] as const)('%s preserva a falta dos dois campos sem totais parciais', motivo => {
    const d = dados(); d.cobertura.completa = false; d.cobertura.paresCobertos = 0;
    if (motivo === 'sem-fontes') { d.cobertura.fontesSelecionadas = 0; d.cobertura.dias = []; }
    for (const campo of ['horarios', 'primeirosPedidos'] as const) d[campo] = { total: { estado: 'sem-dado', motivo }, distribuicao: { estado: 'sem-dado', motivo } };
    const h = html(d); expect(h).toContain('Cobertura complementar incompleta'); expect(h.match(/Distribuição sem dado/g)).toHaveLength(2); expect(h).not.toMatch(/<table|26,7%|>02h</);
  });
  it('fonte desligada e revisão preservam data publicada e identidade visual sem IDs técnicos', () => {
    const h = html(); expect(h).toContain('Cozinha anterior · Casa Centro · vínculo desligado');
    expect(h).toContain('06/11/2026, 09:00'); expect(h).toContain('dateTime="2026-11-06T12:00:00Z"');
    expect(h).toContain('Ela ainda não substitui a versão publicada'); expect(h).not.toContain(CHAVE);
    expect(html(dados(), [])).toContain('Fonte da loja'); expect(html(dados(), [])).not.toContain(CHAVE);
  });
  it.each<[EstadoCoberturaAnalytics, string]>([
    ['ausente', 'Sem leitura publicada'], ['vinculo-ambiguo', 'Vínculo a conferir'], ['identidade-incompativel', 'Identidade da leitura a conferir'],
    ['versao-pendente', 'Revisão ainda não publicada'], ['vazio-oficial', 'Vazio oficial publicado'],
  ])('cobertura %s mantém explicação própria', (estado, rotulo) => {
    const d = dados(); d.cobertura.dias[0].fontes[0].estado = estado; expect(html(d)).toContain(rotulo);
  });
  it('paginação local limita detalhes a 31 dias sem cortar valores do período', () => {
    const d = dados(); d.cobertura.dias = Array.from({ length: 35 }, (_, i) => ({ ...d.cobertura.dias[0], dia: deslocarDiaDoPainel('2026-10-01', i) }));
    const h = html(d); expect(h).toContain('página 1 de 2'); expect(h).toContain('35 dias no período');
    expect(h).toContain('01/10/2026'); expect(h).toContain('31/10/2026'); expect(h).not.toContain('04/11/2026');
    expect(h).toContain('aria-label="Páginas da cobertura complementar"'); expect(h).toContain('Próximos dias');
    expect(linha(secao(h, true), '02h')).toContain('26,7%'); expect(linha(secao(h, false), 'Demais pedidos informados')).toContain('30,0%');
  });
});
