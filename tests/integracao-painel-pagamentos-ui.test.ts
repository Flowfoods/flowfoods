import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { EstadoCoberturaAnalytics, FonteDoPainelAnalytics } from '@/lib/integracoes/ifood/painel-campos';
import { deslocarDiaDoPainel } from '@/lib/integracoes/ifood/painel-campos';
import type { PagamentosDoPainelAnalytics } from '@/lib/integracoes/ifood/painel-pagamentos';
import { PagamentosDoPainel } from '@/components/erp/telas/integracoes/painel-pagamentos';

vi.mock('@/lib/db', () => { throw new Error('A apresentação marginal não consulta banco.'); });
vi.mock('@/lib/integracoes/core/painel-pagamentos', () => { throw new Error('A UI não importa o leitor marginal.'); });

const CHAVE = '11111111-1111-4111-8111-111111111111';
const fontes: FonteDoPainelAnalytics[] = [{ chave: CHAVE, nome: 'Cozinha anterior', marca: 'Casa Centro', selecionada: true, ativa: false, ambigua: false }];
function dados(): PagamentosDoPainelAnalytics {
  return { cobertura: { completa: true, diasEsperados: 1, diasCompletos: 1, fontesSelecionadas: 1, paresEsperados: 1, paresCobertos: 1,
    dias: [{ dia: '2026-11-05', completo: true, fontes: [{ chave: CHAVE, estado: 'publicado', publicadaEm: '2026-11-06T12:00:00Z', revisaoPendente: true }] }] },
    total: { estado: 'disponivel', valor: '3' },
    distribuicao: { estado: 'disponivel', valor: [{ metodo: 'PIX', ocorrencias: '2' }, { metodo: 'VOUCHER', ocorrencias: '1' }] } };
}
const html = (d = dados(), f = fontes) => renderToStaticMarkup(createElement(PagamentosDoPainel, { dados: d, fontes: f }));
function linha(h: string, metodo: string): string {
  const l = h.match(/<tr[^>]*>[\s\S]*?<\/tr>/g)?.find(t => t.includes(`>${metodo}</th>`));
  if (!l) throw new Error(`Método não apresentado: ${metodo}`);
  return l;
}

describe('INT-1.8C · pagamentos na interface', () => {
  it('ocorrências 2+1 usam o total 3 da marginal e percentuais finais de uma casa', () => {
    const h = html();
    expect(linha(h, 'PIX')).toMatch(/>2<.*66,7%/);
    expect(linha(h, 'VOUCHER')).toMatch(/>1<.*33,3%/);
    expect(h).toContain('Total de ocorrências de pagamento');
    expect(h).toContain('Um pedido pode ter mais de uma forma de pagamento');
    expect(h).toContain('não são pedidos únicos nem valores pagos');
    expect(h).not.toMatch(/R\$|GMV|faturamento realizado/);
  });
  it('contagens além de Number.MAX_SAFE_INTEGER permanecem exatas na linha e no denominador', () => {
    const d = dados(); d.total = { estado: 'disponivel', valor: '18014398509481986' };
    d.distribuicao = { estado: 'disponivel', valor: [{ metodo: 'PIX', ocorrencias: '9007199254740993' }, { metodo: 'VOUCHER', ocorrencias: '9007199254740993' }] };
    const h = html(d);
    expect(h).toContain('18.014.398.509.481.986');
    expect(linha(h, 'PIX')).toContain('9.007.199.254.740.993');
    expect(linha(h, 'PIX')).toContain('50,0%'); expect(linha(h, 'VOUCHER')).toContain('50,0%');
    expect(h).not.toMatch(/\d[eE]\+\d|NaN|Infinity|truncate/);
    expect(h).toContain('overflow-wrap:anywhere');
  });
  it.each(['__proto__', 'constructor', 'toString', 'null', '&lt;NOVO&gt;'])('método desconhecido %s fica literal e escapado, sem consulta a protótipos', valor => {
    const d = dados(), metodo = valor === '&lt;NOVO&gt;' ? '<NOVO>' : valor;
    d.distribuicao = { estado: 'disponivel', valor: [{ metodo, ocorrencias: '3' }] };
    const h = html(d);
    expect(linha(h, valor)).toContain('100,0%');
    expect(h).not.toMatch(/<NOVO>|\[object Object\]|function Object/);
    expect(h).not.toContain('Não informado');
  });
  it('mapa publicado vazio mostra zero ocorrências, sem deduzir zero pedidos ou percentual', () => {
    const d = dados(); d.total = { estado: 'disponivel', valor: '0' }; d.distribuicao = { estado: 'disponivel', valor: [] };
    const h = html(d);
    expect(h).toMatch(/>0<\/span>/);
    expect(h).toContain('Nenhuma ocorrência de pagamento informada no conjunto publicado');
    expect(h).toContain('Isso não significa que não houve pedidos');
    expect(h).not.toMatch(/<table|0,0%|Sem dado|NaN|Infinity/);
  });
  it('método com contagem zero é preservado e não produz divisão por zero', () => {
    const d = dados(); d.total = { estado: 'disponivel', valor: '0' }; d.distribuicao = { estado: 'disponivel', valor: [{ metodo: 'PIX', ocorrencias: '0' }] };
    const h = html(d);
    expect(linha(h, 'PIX')).toMatch(/>0<.*Sem base/);
    expect(h).not.toMatch(/0,0%|NaN|Infinity/);
  });
  it('agregado NULL mantém cobertura completa e valores ausentes, sem inventar mapa ou zero', () => {
    const d = dados(); d.total = { estado: 'sem-dado', motivo: 'valor-nao-informado' }; d.distribuicao = { estado: 'sem-dado', motivo: 'valor-nao-informado' };
    const h = html(d);
    expect(h).toContain('Cobertura de pagamentos completa'); expect(h).toContain('Distribuição sem dado');
    expect(h).toContain('O provedor não informou todos os valores necessários');
    expect(h).not.toMatch(/>0<|<table|Nenhuma ocorrência|[\d,]+%/);
  });
  it('parcial e ausência de fontes não apresentam totais parciais ou dados residuais', () => {
    for (const motivo of ['cobertura-parcial', 'sem-fontes'] as const) {
      const d = dados(); d.cobertura.completa = false; d.cobertura.paresCobertos = 0;
      if (motivo === 'sem-fontes') { d.cobertura.fontesSelecionadas = 0; d.cobertura.dias = []; }
      d.total = { estado: 'sem-dado', motivo }; d.distribuicao = { estado: 'sem-dado', motivo };
      const h = html(d);
      expect(h).toContain('Cobertura de pagamentos incompleta'); expect(h).toContain('Distribuição sem dado');
      expect(h).not.toMatch(/<table|>PIX<|>VOUCHER<|66,7%|33,3%/);
    }
  });
  it('fonte desligada, publicação anterior e revisão pendente continuam visíveis sem IDs técnicos', () => {
    const h = html();
    expect(h).toContain('Cozinha anterior · Casa Centro · vínculo desligado');
    expect(h).toContain('Leitura publicada'); expect(h).toContain('06/11/2026, 09:00');
    expect(h).toContain('dateTime="2026-11-06T12:00:00Z"');
    expect(h).toContain('Ela ainda não substitui a versão publicada'); expect(h).not.toContain(CHAVE);
    expect(html(dados(), [])).toContain('Fonte da loja'); expect(html(dados(), [])).not.toContain(CHAVE);
  });
  it.each<[EstadoCoberturaAnalytics, string]>([
    ['ausente', 'Sem leitura publicada'], ['vinculo-ambiguo', 'Vínculo a conferir'], ['identidade-incompativel', 'Identidade da leitura a conferir'],
    ['versao-pendente', 'Revisão ainda não publicada'], ['vazio-oficial', 'Vazio oficial publicado'],
  ])('cobertura %s tem explicação própria', (estado, rotulo) => {
    const d = dados(); d.cobertura.dias[0].fontes[0].estado = estado;
    expect(html(d)).toContain(rotulo);
  });
  it('detalhes de cobertura usam 31 dias por página e não cortam as ocorrências do período', () => {
    const d = dados(); d.cobertura.dias = Array.from({ length: 35 }, (_, i) => ({ ...d.cobertura.dias[0], dia: deslocarDiaDoPainel('2026-10-01', i) }));
    const h = html(d);
    expect(h).toContain('página 1 de 2'); expect(h).toContain('35 dias no período');
    expect(h).toContain('01/10/2026'); expect(h).toContain('31/10/2026'); expect(h).not.toContain('04/11/2026');
    expect(h).toContain('aria-label="Páginas da cobertura de pagamentos"'); expect(h).toContain('Próximos dias');
    expect(linha(h, 'PIX')).toContain('66,7%');
  });
});
