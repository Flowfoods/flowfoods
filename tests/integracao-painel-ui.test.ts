import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PainelAnalytics as DadosPainel, ResultadoDoPainelAnalytics, ResumoDoPainelAnalytics } from '@/lib/integracoes/ifood/painel-campos';
import { deslocarDiaDoPainel } from '@/lib/integracoes/ifood/painel-campos';
import { resumirPainelAnalytics, type LinhaAgregadaDoPainelAnalytics } from '@/lib/integracoes/ifood/painel-resumo';
import { PainelAnalytics } from '@/components/erp/telas/integracoes/painel-analytics';
import { PagamentosDoPainel } from '@/components/erp/telas/integracoes/painel-pagamentos';
import { ComplementaresDoPainel } from '@/components/erp/telas/integracoes/painel-complementares';
import { hrefDoPainelAnalytics } from '@/components/erp/telas/integracoes/painel-filtros';

vi.mock('@/lib/db', () => { throw new Error('UI do painel não consulta banco.'); });
vi.mock('@/lib/integracoes/core/painel-analytics', () => { throw new Error('UI não importa leitor financeiro.'); });

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const loja = { id: 'loja-a', nome: 'Loja Centro' };
const linhas: LinhaAgregadaDoPainelAnalytics[] = [
  { dia: '2026-11-05', orderStatus: 'CONCLUDED', salesChannel: 'IFOOD', deliveredBy: 'MERCHANT_DELIVERY', pedidos: '2', gmv: '10001', gmvSemEntrega: '9001' },
  { dia: '2026-11-05', orderStatus: 'CANCELLED', salesChannel: 'POS', deliveredBy: 'IFOOD_DELIVERY', pedidos: '1', gmv: '999', gmvSemEntrega: '899' },
];
const resumo = () => resumirPainelAnalytics(linhas, true);
function painel(alteracoes: Partial<DadosPainel> = {}): DadosPainel {
  const r = resumo();
  return { loja, ambiente: 'PRODUCAO', periodo: { inicio: '2026-11-05', fim: '2026-11-05', ateOntem: '2026-11-06', fuso: 'America/Sao_Paulo' },
    fontes: [{ chave: A, nome: 'Cozinha Centro', marca: 'Marca da casa', selecionada: true, ambigua: false, ativa: true },
      { chave: B, nome: 'Cozinha anterior', marca: null, selecionada: false, ambigua: false, ativa: false }],
    cobertura: { completa: true, diasEsperados: 1, diasCompletos: 1, fontesSelecionadas: 1, paresEsperados: 1, paresCobertos: 1,
      dias: [{ dia: '2026-11-05', completo: true, fontes: [{ chave: A, estado: 'publicado', publicadaEm: '2026-11-06T12:00:00Z', revisaoPendente: true }] }] },
    pagamentos: { cobertura: { completa: false, diasEsperados: 1, diasCompletos: 0, fontesSelecionadas: 1, paresEsperados: 1, paresCobertos: 0,
      dias: [{ dia: '2026-11-05', completo: false, fontes: [{ chave: A, estado: 'ausente', publicadaEm: null, revisaoPendente: false }] }] },
      distribuicao: { estado: 'sem-dado', motivo: 'cobertura-parcial' }, total: { estado: 'sem-dado', motivo: 'cobertura-parcial' } },
    complementares: { cobertura: { completa: false, diasEsperados: 1, diasCompletos: 0, fontesSelecionadas: 1, paresEsperados: 1, paresCobertos: 0,
      dias: [{ dia: '2026-11-05', completo: false, fontes: [{ chave: A, estado: 'ausente', publicadaEm: null, revisaoPendente: false }] }] },
      horarios: { distribuicao: { estado: 'sem-dado', motivo: 'cobertura-parcial' }, total: { estado: 'sem-dado', motivo: 'cobertura-parcial' } },
      primeirosPedidos: { distribuicao: { estado: 'sem-dado', motivo: 'cobertura-parcial' }, total: { estado: 'sem-dado', motivo: 'cobertura-parcial' } } },
    resumo: r, serie: [{ dia: '2026-11-05', completo: true, indicadores: r.indicadores }], ...alteracoes };
}
function resultado(p = painel()): ResultadoDoPainelAnalytics {
  return { ok: true, lojas: [loja, { id: 'loja-b', nome: 'Loja Sul' }], ambiente: p.ambiente,
    filtros: { lojaId: loja.id, inicio: p.periodo.inicio, fim: p.periodo.fim, merchants: [A] }, painel: p };
}
const props = { base: '/erp/integracoes/analytics', baseSituacao: '/erp/integracoes' };
const html = (r = resultado()) => renderToStaticMarkup(createElement(PainelAnalytics, { ...props, resultado: r }));
function cartao(h: string, titulo: string): string {
  const seguro = titulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`<dt[^>]*>${seguro}</dt>\\s*<dd[^>]*>([\\s\\S]*?)</dd>`).exec(h);
  if (!match) throw new Error(`Cartão não encontrado: ${titulo}`);
  return match[1];
}

describe('INT-1.8B · painel de snapshots em UI', () => {
  it('mantém identidades distintas das marginais e reinicia cada uma quando muda o recorte', () => {
    function identidades(p: DadosPainel) {
      const encontradas: Array<{ tipo: unknown; key: string | null }> = [];
      function visitar(no: ReactNode): void {
        if (Array.isArray(no)) { no.forEach(visitar); return; }
        if (!isValidElement<{ children?: ReactNode }>(no)) return;
        if (no.type === PagamentosDoPainel || no.type === ComplementaresDoPainel) encontradas.push({ tipo: no.type, key: no.key });
        visitar(no.props.children);
      }
      visitar(PainelAnalytics({ ...props, resultado: resultado(p) }));
      expect(encontradas.map(e => e.tipo)).toEqual([PagamentosDoPainel, ComplementaresDoPainel]);
      expect(encontradas.every(e => typeof e.key === 'string' && e.key.length > 0)).toBe(true);
      expect(new Set(encontradas.map(e => e.key)).size).toBe(2);
      return encontradas.map(e => e.key);
    }
    const original = painel(), antes = identidades(original);
    expect(identidades(painel())).toEqual(antes);
    for (const depois of [
      painel({ loja: { ...loja, id: 'loja-b' } }),
      painel({ periodo: { ...original.periodo, inicio: '2026-11-04' } }),
      painel({ periodo: { ...original.periodo, fim: '2026-11-06' } }),
      painel({ fontes: original.fontes.map(f => ({ ...f, selecionada: f.chave === B })) }),
    ]) identidades(depois).forEach((key, indice) => expect(key).not.toBe(antes[indice]));
  });
  it('oráculo 2 concluídos e 1 cancelado separa GMV total, ticket dos concluídos e taxa ponderada', () => {
    const h = html();
    expect(cartao(h, 'GMV · todos os status')).toContain('R$ 110,00');
    expect(cartao(h, 'GMV sem entrega · todos os status')).toContain('R$ 99,00');
    expect(cartao(h, 'GMV concluído')).toContain('R$ 100,01');
    expect(cartao(h, 'GMV cancelado')).toContain('R$ 9,99');
    expect(cartao(h, 'Ticket médio dos concluídos')).toContain('R$ 50,01');
    expect(cartao(h, 'Ticket médio dos concluídos')).not.toContain('R$ 36,67');
    expect(cartao(h, 'Taxa de cancelamento')).toContain('33,3%');
    expect(h).toContain('não representa faturamento realizado, repasse nem lucro');
  });
  it('formulário GET conserva loja, datas ISO, fontes repetidas e contexto completo nos atalhos', () => {
    const r = resultado(); if (!r.ok) throw new Error('fixture'); r.filtros.merchants.push(B);
    const h = html(r);
    expect(h).toContain('method="get"'); expect(h).toContain('action="/erp/integracoes/analytics"');
    for (const nome of ['loja', 'inicio', 'fim']) expect(h).toContain(`name="${nome}"`);
    expect(h.match(/name="merchant"/g)).toHaveLength(2);
    expect(h.match(/checked=""/g)).toHaveLength(2);
    expect(h).toContain('max="2026-11-06"'); expect(h).not.toContain('min="2020-01-01"');
    expect(h).toContain('vínculos desligados com histórico');
    const u = new URL(hrefDoPainelAnalytics('/rodolfo/integracoes/casa/analytics', r.filtros, { inicio: '2026-11-01' }), 'https://fixture.invalid');
    expect(u.pathname).toBe('/rodolfo/integracoes/casa/analytics');
    expect([...u.searchParams]).toEqual([['loja', 'loja-a'], ['inicio', '2026-11-01'], ['fim', '2026-11-05'], ['merchant', A], ['merchant', B]]);
  });
  it('cobertura parcial não mostra soma parcial como total; o dia completo continua disponível', () => {
    const p = painel({ resumo: resumirPainelAnalytics(linhas, false) });
    p.cobertura = { ...p.cobertura, completa: false, paresEsperados: 2, paresCobertos: 1, diasEsperados: 2, diasCompletos: 1 };
    const h = html(resultado(p));
    expect(cartao(h, 'GMV · todos os status')).toContain('Sem dado');
    expect(cartao(h, 'GMV · todos os status')).not.toContain('R$ 110,00');
    expect(h).toContain('Cobertura incompleta'); expect(h).toContain('1 de 2 dias completos');
    expect(h).toContain('R$ 110,00'); // somente a série do dia realmente completo
    expect(h).toContain('não formam um total parcial do período');
  });
  it('vazio oficial é zero válido; ticket e taxa sem denominador continuam ausentes', () => {
    const r = resumirPainelAnalytics([], true), p = painel({ resumo: r, serie: [{ dia: '2026-11-05', completo: true, indicadores: r.indicadores }] });
    p.cobertura.dias[0].fontes[0].estado = 'vazio-oficial';
    const h = html(resultado(p));
    expect(cartao(h, 'GMV · todos os status')).toContain('R$ 0,00');
    expect(cartao(h, 'Ticket médio dos concluídos')).toContain('Sem dado');
    expect(cartao(h, 'Taxa de cancelamento')).toContain('Sem dado');
    expect(h).toContain('Vazio oficial publicado'); expect(h).not.toContain('NaN'); expect(h).not.toContain('Infinity');
  });
  it('GMV cancelado nulo não apaga ticket dos concluídos ou pedidos conhecidos', () => {
    const r = resumirPainelAnalytics([linhas[0], { ...linhas[1], gmv: null }], true);
    const h = html(resultado(painel({ resumo: r })));
    expect(cartao(h, 'GMV · todos os status')).toContain('Sem dado');
    expect(cartao(h, 'Ticket médio dos concluídos')).toContain('R$ 50,01');
    expect(cartao(h, 'Pedidos observados')).not.toContain('Sem dado');
  });
  it('status novo e null aparecem distintos e escapados; taxa não é fabricada', () => {
    const r = resumirPainelAnalytics([...linhas, { ...linhas[0], orderStatus: '<STATUS_NOVO>', salesChannel: null, deliveredBy: 'LOGISTICA_NOVA', pedidos: '9' }], true);
    const h = html(resultado(painel({ resumo: r })));
    expect(h).toContain('&lt;STATUS_NOVO&gt;'); expect(h).toContain('Não informado'); expect(h).toContain('LOGISTICA_NOVA');
    expect(h).not.toContain('<STATUS_NOVO>'); expect(cartao(h, 'Taxa de cancelamento')).toContain('Sem dado');
    expect(h).toContain('Status não classificados deixam esta taxa sem dado');
  });
  it.each(['__proto__', 'constructor', 'toString'])('enum novo %s permanece rótulo literal, sem acessar protótipos', valor => {
    const r = resumirPainelAnalytics([{ ...linhas[0], salesChannel: valor, orderStatus: valor, deliveredBy: valor }], true);
    const h = html(resultado(painel({ resumo: r })));
    expect(h.match(new RegExp(`>${valor}<`, 'g'))).toHaveLength(3);
    expect(cartao(h, 'Taxa de cancelamento')).toContain('Sem dado');
  });
  it('números longos/negativos ficam completos e quebráveis, sem truncate ou exponencial monetário', () => {
    const r = resumirPainelAnalytics([{ ...linhas[0], gmv: '-9007199254740993', gmvSemEntrega: '18014398509481986', pedidos: '9007199254740993' }], true);
    const h = html(resultado(painel({ resumo: r })));
    expect(cartao(h, 'GMV · todos os status')).toContain('−R$ 90.071.992.547.409,93');
    expect(cartao(h, 'GMV sem entrega · todos os status')).toContain('R$ 180.143.985.094.819,86');
    expect(cartao(h, 'Pedidos observados')).toContain('9.007.199.254.740.993');
    expect(h).toContain('overflow-wrap:anywhere'); expect(h).not.toContain('truncate'); expect(h).not.toMatch(/\d[eE][+]\d/);
    expect(h).toContain('o sinal foi preservado');
  });
  it('pagamentos, horário e primeiro pedido vêm das marginais próprias, sem inferência do agrupado diário', () => {
    const r: ResumoDoPainelAnalytics = resumo();
    r.distribuicoes.pagamento = { estado: 'disponivel', valor: [{ valor: 'PAGAMENTO_NAO_SUPORTADO', pedidos: '667788' }] };
    r.distribuicoes.horario = { estado: 'disponivel', valor: [{ valor: 'HORA_NAO_SUPORTADA', pedidos: '998877' }] };
    r.distribuicoes.primeiroPedido = { estado: 'disponivel', valor: [{ valor: 'PRIMEIRO_NAO_SUPORTADO', pedidos: '554433' }] };
    const h = html(resultado(painel({ resumo: r })));
    for (const t of ['Formas de pagamento', 'Cobertura de pagamentos incompleta', 'Distribuição sem dado', 'Horário informado pela origem', 'Primeiro pedido por estabelecimento de origem', 'Cobertura complementar incompleta']) expect(h).toContain(t);
    expect(h).not.toMatch(/PAGAMENTO_NAO_SUPORTADO|667788|HORA_NAO_SUPORTADA|998877|PRIMEIRO_NAO_SUPORTADO|554433/);
    expect(cartao(h, 'Pedidos observados')).toMatch(/>3</);
    expect(cartao(h, 'GMV · todos os status')).toContain('R$ 110,00');
  });
  it('complementares completos permanecem disponíveis quando diário e pagamentos estão incompletos', () => {
    const p = painel({ resumo: resumirPainelAnalytics(linhas, false) }); p.cobertura.completa = false;
    p.complementares = { cobertura: { ...p.complementares.cobertura, completa: true, paresCobertos: 1, diasCompletos: 1 },
      horarios: { total: { estado: 'disponivel', valor: '4' }, distribuicao: { estado: 'disponivel', valor: [{ termo: '2', ocorrencias: '1' }, { termo: '10', ocorrencias: '3' }] } },
      primeirosPedidos: { total: { estado: 'disponivel', valor: '10' }, distribuicao: { estado: 'disponivel', valor: [{ termo: 'true', ocorrencias: '2' }, { termo: 'false', ocorrencias: '8' }] } } };
    const h = html(resultado(p));
    expect(cartao(h, 'Pedidos observados')).toContain('Sem dado'); expect(h).toContain('Cobertura de pagamentos incompleta');
    expect(h).toContain('Cobertura complementar completa'); expect(h).toMatch(/>02h<.*25,0%/); expect(h).toMatch(/>Primeiro pedido no estabelecimento de origem<.*20,0%/);
    expect(h).toContain('Datas do recorte em São Paulo'); expect(h).not.toContain('Dias e horários de São Paulo');
    expect(h).not.toContain('Distribuições ainda indisponíveis');
  });
  it('pagamentos completos continuam disponíveis quando a cobertura diária é parcial, com denominador próprio', () => {
    const p = painel({ resumo: resumirPainelAnalytics(linhas, false) });
    p.cobertura.completa = false;
    p.pagamentos = { cobertura: { ...p.cobertura, completa: true }, total: { estado: 'disponivel', valor: '8' },
      distribuicao: { estado: 'disponivel', valor: [{ metodo: 'PIX', ocorrencias: '2' }, { metodo: 'VOUCHER', ocorrencias: '6' }] } };
    const h = html(resultado(p));
    expect(cartao(h, 'Pedidos observados')).toContain('Sem dado');
    expect(cartao(h, 'Total de ocorrências de pagamento')).toMatch(/>8</);
    expect(h).toContain('Cobertura de pagamentos completa');
    expect(h).toContain('25,0%'); expect(h).toContain('75,0%');
    expect(h).not.toContain('66,7%');
  });
  it('TEST permanece visível com dados ou erro; erro não despeja DTO residual nem raw', () => {
    const h = html(resultado(painel({ ambiente: 'TEST' })));
    expect(h).toContain('Ambiente TEST'); expect(h).toContain('não entram no faturamento'); expect(h).toContain('R$ 110,00');
    const erro = Object.assign({ ok: false as const, motivo: 'leitura-indisponivel' as const, mensagem: 'Tente novamente.' }, { painel: painel(), raw: 'SEGREDO_RAW' });
    const e = renderToStaticMarkup(createElement(PainelAnalytics, { ...props, teste: true, resultado: erro }));
    expect(e).toContain('Ambiente TEST'); expect(e).toContain('Tente novamente'); expect(e).not.toMatch(/R\$|SEGREDO_RAW|Cozinha Centro/);
    expect(e).toContain('href="/erp/integracoes/analytics"');
  });
  it('sem lojas não cria campos vazios, métricas ou zeros', () => {
    const h = html({ ok: true, lojas: [], ambiente: 'PRODUCAO', filtros: { lojaId: '', inicio: '2026-11-01', fim: '2026-11-05', merchants: [] }, painel: null });
    expect(h).toContain('Nenhuma loja disponível'); expect(h).not.toMatch(/<form|R\$|Pedidos observados/);
  });
  it('cobertura por fonte preserva revisão anterior e horário, sem expor chave no texto', () => {
    const h = html();
    expect(h).toContain('Versão publicada em'); expect(h).toContain('06/11/2026, 09:00'); expect(h).toContain('Ela ainda não substitui a versão publicada');
    expect(h).not.toContain(`>${A}<`);
    expect(h).toContain('/erp/integracoes?loja=loja-a&amp;dia=2026-11-05');
  });
  it('série tem páginas de 31 dias e controles estáveis, sem cortar os totais do período', () => {
    const p = painel(), r = resumo();
    p.serie = Array.from({ length: 35 }, (_, x) => ({ dia: deslocarDiaDoPainel('2026-10-01', x), completo: true, indicadores: r.indicadores }));
    const h = html(resultado(p));
    expect(h).toContain('página 1 de 2'); expect(h).toContain('35 dias no período'); expect(h).toContain('Próximos dias');
    expect(h).toMatch(/<button[^>]*disabled=""[^>]*>Dias anteriores<\/button>/);
    expect(h).toContain('01/10/2026'); expect(h).toContain('31/10/2026');
    expect(cartao(h, 'GMV · todos os status')).toContain('R$ 110,00');
  });
});
