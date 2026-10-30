import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ComplementosFaturamentoHome } from '@/lib/erp/home-faturamento-complementos';
import type { FaturamentoDiarioHome, WidgetFaturamentoHome, WidgetProducaoHome } from '@/lib/erp/home-analitico';
import type { PainelDoDia } from '@/lib/erp/painel-do-dia';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { FaturamentoComplementosHome } from '../src/components/erp/telas/faturamento-complementos-home';
import { HubDoParceiro } from '../src/components/erp/telas/hub-do-parceiro';
import { ValorMonetarioHome } from '../src/components/erp/telas/valor-monetario-home';

vi.mock('@/lib/db', () => { throw new Error('Complementos não consultam banco.'); });
vi.mock('@/lib/erp/faturamento', () => { throw new Error('A UI não importa o serviço de Faturamento.'); });
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

const c = (): ComplementosFaturamentoHome => ({ estado: 'ok', pedidos: 80, atendimentos: 95, ticketMedioCentavos: 8750, aviso: 'Atendimentos informados não representam pessoas únicas.' });
const widget = (): WidgetFaturamentoHome => ({
  familia: 'faturamento', titulo: 'Faturamento', estado: 'ok', escopo: { tipo: 'loja', lojaId: 'lojab', nome: 'Loja B sintética' },
  valor: { unidade: 'centavos', valor: 700_000 }, percentual: null,
  referencia: { base: 'mes_civil', rotulo: 'Mês civil', inicio: '2026-10-01', fim: '2026-10-31', apuradoAte: '2026-10-30' },
  origem: { fonte: 'faturamento', modo: 'vivo', fotografia: null }, cobertura: null, consultadoEm: '2026-10-30T12:00:00Z',
  avisos: [], detalhe: { href: '/erp/faturamento?mes=2026-10&loja=lojab', rotulo: 'Ver o faturamento da loja' }, complementos: c(),
});
const diario = (): FaturamentoDiarioHome => ({
  mes: '2026-10', hoje: '2026-10-30', estado: 'ok', totalCentavos: 700_000, consultadoEm: '2026-10-30T12:00:00Z',
  detalhe: { href: '/erp/faturamento?mes=2026-10&loja=lojab', rotulo: 'Ver o faturamento da loja' },
  serie: { canais: ['LOJA'], maximo: 700_000, diasLancados: 1, diasComFalta: 0, dias: [
    { data: '2026-10-28', valores: { LOJA: 700_000, DELIVERY_PROPRIO: null, IFOOD: null }, total: 700_000, estado: 'lancado', faltam: [] },
  ] },
});
const painel = (w = widget()): PainelDoDia => ({ indicadores: [], pendencias: [], consultadoEm: '2026-10-30T12:00:00Z', analitico: { tipo: 'loja', loja: { id: 'lojab', nome: 'Loja B sintética' }, widgets: [w], faturamentoDiario: diario() } });
const leituraDoWidget = (w: WidgetFaturamentoHome): FaturamentoDiarioHome => ({ ...diario(), estado: w.estado, totalCentavos: w.valor.valor, consultadoEm: w.consultadoEm ?? '', detalhe: w.detalhe });
const html = (w = widget(), leitura = leituraDoWidget(w)) => renderToStaticMarkup(createElement(FaturamentoComplementosHome, { widget: w, leitura }));
const home = (p = painel()) => renderToStaticMarkup(createElement(HubDoParceiro, { titulo: 'Áreas da Rede', subtitulo: 'Parceiro sintético', modulos: [], semAcesso: false, painel: p }));
const card = (h: string) => /<div role="group" aria-label="Indicador de Faturamento"[\s\S]*?<\/a>/.exec(h)?.[0] ?? '';

describe('Home · complementos canônicos do Faturamento', () => {
  it('usa dl com Pedidos, Atendimentos e Ticket, origem dos informados e sentido não único', () => {
    const h = html();
    expect(h).toContain('aria-label="Complementos do Faturamento"'); expect(h).toContain('<dl');
    for (const t of ['Pedidos', 'Atendimentos', 'Ticket médio', '>80</dd>', '>95</dd>', formatarDinheiro(8750), 'Dos lançamentos informados', 'não representam pessoas únicas']) expect(h).toContain(t);
    expect(h).not.toMatch(/<a |<button|<input|role="progressbar"/);
  });

  it('copia o ticket fornecido em vez de dividir a receita ou tirar média de canais', () => {
    const w = widget(); w.complementos!.ticketMedioCentavos = 777;
    const h = html(w); expect(h).toContain(formatarDinheiro(777)); expect(h).not.toContain(formatarDinheiro(8750));
  });

  it('Não vendeu conserva pedidos/atendimentos zero e ticket null sem dinheiro zero inventado', () => {
    const w = widget(); w.valor.valor = 0; w.complementos = { ...c(), pedidos: 0, atendimentos: 0, ticketMedioCentavos: null };
    const h = html(w); expect(h.match(/>0<\/dd>/g)).toHaveLength(2);
    expect(h).toContain('Não disponível'); expect(h).not.toContain(formatarDinheiro(0)); expect(h).not.toContain('sem dados neste mês');
  });

  it('ticket zero com pedido e fonte válida continua zero', () => {
    const w = widget(); w.valor.valor = 0; w.complementos = { ...c(), pedidos: 5, atendimentos: 7, ticketMedioCentavos: 0 };
    const h = html(w); expect(h).toContain(formatarDinheiro(0)); expect(h).not.toContain('Não disponível');
  });

  it('ticket negativo recebido é formatado com sinal, sem clamp ou classificação nova', () => {
    const w = widget(); w.complementos!.ticketMedioCentavos = -1234;
    const h = html(w); expect(h).toContain(formatarDinheiro(-1234)); expect(h).not.toMatch(/farol|atingiu|saudável|progressbar/);
  });

  it('sem lançamentos não mostra contadores ou ticket como zero', () => {
    const w = widget(); w.estado = 'sem_dados'; w.valor.valor = null;
    w.complementos = { estado: 'sem_dados', pedidos: null, atendimentos: null, ticketMedioCentavos: null, aviso: 'Ainda não há lançamentos para informar pedidos, atendimentos e ticket médio.' };
    const h = html(w); expect(h).toContain('Complementos sem dados neste mês.'); expect(h).not.toContain('<dl');
    expect(h).not.toMatch(/>0<\/dd>|R\$/);
  });

  it('parcial conserva números informados e o aviso canônico de cobertura', () => {
    const w = widget(); w.estado = 'parcial'; w.complementos = { ...c(), estado: 'parcial', aviso: 'Valores dos lançamentos informados; há canais sem lançamento. Atendimentos não representam pessoas únicas.' };
    const h = html(w); expect(h).toContain('leitura parcial'); expect(h).toContain('há canais sem lançamento');
    expect(h).toContain('>80</dd>'); expect(h).toContain('>95</dd>'); expect(h).toContain(formatarDinheiro(8750));
  });

  it('estado parcial do pai permanece visível mesmo num complemento compatível antigo', () => {
    const w = widget(); w.estado = 'parcial'; expect(html(w)).toContain('leitura parcial');
  });

  it.each(['erro', 'indisponivel'] as const)('%s oculta números stale, sem afirmar ausência de lançamento', (estado) => {
    const w = widget(); w.complementos = { ...c(), estado, pedidos: 123456, atendimentos: 654321, ticketMedioCentavos: 999999, aviso: 'Aviso controlado da projeção.' };
    const h = html(w); expect(h).toContain('Complementos indisponíveis nesta leitura.'); expect(h).toContain('Aviso controlado da projeção.');
    expect(h).not.toMatch(/123\.456|654\.321|R\$|<dl|sem dados neste mês/);
  });

  it.each(['erro', 'indisponivel', 'sem_base', 'sem_dados'] as const)('pai %s não expõe contadores de um complemento residual ok', (estado) => {
    const w = widget(); w.estado = estado; const h = html(w);
    expect(h).not.toContain('<dl'); expect(h).not.toContain(formatarDinheiro(8750));
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1.5, -1])('contador incompatível %s afeta só o complemento', (valor) => {
    const w = widget(); w.complementos!.pedidos = valor;
    expect(html(w)).toContain('Complementos indisponíveis'); expect(html(w)).not.toContain('<dl');
    const h = home(painel(w)); expect(card(h)).toContain(formatarDinheiro(700_000)); expect(h).toContain('aria-label="Evolução do faturamento"');
  });

  it('pedidos zero com ticket conhecido é incompatível, não um ticket válido', () => {
    const w = widget(); w.complementos!.pedidos = 0;
    expect(html(w)).toContain('Complementos indisponíveis'); expect(html(w)).not.toContain(formatarDinheiro(8750));
  });

  it.each(['referencia', 'origem'] as const)('metadado %s ausente não apaga receita ou série', (campo) => {
    const w = widget(); w[campo] = null; const h = home(painel(w));
    expect(card(h)).toContain(formatarDinheiro(700_000)); expect(h).toContain('aria-label="Evolução do faturamento"');
    expect(html(w)).toContain('Complementos indisponíveis');
  });

  it('erro ao acessar campo novo preserva a receita e evolução, sem reason interno', () => {
    const w = widget(); Object.defineProperty(w.complementos!, 'pedidos', { get() { throw new Error('SENTINELA_INTERNA'); } });
    const h = home(painel(w)); expect(card(h)).toContain(formatarDinheiro(700_000)); expect(h).toContain('aria-label="Evolução do faturamento"');
    expect(h).toContain('Complementos indisponíveis'); expect(h).not.toContain('SENTINELA_INTERNA');
  });

  it('omissão/null de DTO antigo não acrescenta conteúdo', () => {
    const w = widget(); delete w.complementos; expect(html(w)).toBe('');
    Object.assign(w, { complementos: null }); expect(html(w)).toBe('');
  });

  it('aviso longo é texto escapado e números longos preservam formatação integral', () => {
    const w = widget(); w.complementos = { ...c(), pedidos: 9_000_000_000_000, atendimentos: 8_000_000_000_000, ticketMedioCentavos: 9_000_000_000_000, aviso: '<script>Atendimentos & cobertura</script> '+ 'Aviso canônico longo '.repeat(12) };
    const h = html(w); expect(h).toContain('&lt;script&gt;Atendimentos &amp; cobertura&lt;/script&gt;'); expect(h).not.toContain('<script>');
    expect(h).toContain('9.000.000.000.000'); expect(h).toContain(formatarDinheiro(9_000_000_000_000)); expect(h).toContain('[overflow-wrap:anywhere]');
  });
});

describe('Home · integração discreta no painel existente de evolução', () => {
  it('card compacto mantém um único link; complementos ficam no painel antes dos gráficos', () => {
    const h = home(), f = card(h);
    expect(f.match(/<a /g)).toHaveLength(1); expect(f).toContain('/erp/faturamento?mes=2026-10&amp;loja=lojab');
    expect(f).not.toContain('Complementos do Faturamento'); expect(f).not.toContain('Atendimentos'); expect(f).not.toContain('<button');
    expect(h).toContain('Complementos do Faturamento');
    expect(h.indexOf('Faturamento por dia')).toBeLessThan(h.indexOf('Complementos do Faturamento'));
    expect(h.indexOf('Complementos do Faturamento')).toBeLessThan(h.indexOf('Total informado no mês'));
    expect(h).toContain('sm:grid-cols-3');
    expect(h).toContain('xl:grid-cols-6'); expect(h).toContain('aria-label="Evolução do faturamento"');
    expect(h.match(/Atualizar resumo/g)).toHaveLength(1);
  });

  it('falha só nos complementos conserva receita e série disponíveis', () => {
    const w = widget(); w.complementos = { ...c(), estado: 'erro', pedidos: null, atendimentos: null, ticketMedioCentavos: null };
    const h = home(painel(w)); expect(card(h)).toContain(formatarDinheiro(700_000));
    expect(h).toContain('Faturamento por dia'); expect(h).toContain('<table');
  });

  it('perfil sem Faturamento não recebe os três complementos ou dinheiro', () => {
    const p = painel();
    const op: WidgetProducaoHome = { ...widget(), familia: 'producao', titulo: 'Produção', valor: { unidade: 'contagem', valor: 1 }, naLista: 1, semLote: 1 };
    if(p.analitico?.tipo === 'loja'){p.analitico.widgets = [op];delete p.analitico.faturamentoDiario;}
    const h = home(p); expect(h).not.toContain('Complementos do Faturamento'); expect(h).not.toMatch(/Ticket médio|Atendimentos|R\$/);
  });

  it('visão Rede conserva seu resumo e não recebe o novo dl da loja', () => {
    const p = painel(); p.analitico = { tipo: 'rede' }; const h = home(p);
    expect(h).not.toContain('Complementos do Faturamento'); expect(h).toContain('Selecione uma loja no topo');
  });
});

describe('Home · vínculo explícito entre complemento e evolução', () => {
  it.each(['mes', 'hoje', 'href', 'consulta', 'total', 'estado'] as const)('%s divergente não publica números do complemento, preservando o núcleo', (campo) => {
    const w = widget(), d = leituraDoWidget(w);
    if(campo === 'mes')d.mes = '2026-09';
    if(campo === 'hoje')d.hoje = '2026-10-29';
    if(campo === 'href')d.detalhe = { ...d.detalhe, href: '/erp/faturamento?mes=2026-10&loja=lojaa' };
    if(campo === 'consulta')d.consultadoEm = '2026-10-30T11:59:00Z';
    if(campo === 'total')d.totalCentavos = 1;
    if(campo === 'estado')d.estado = 'parcial';
    const h = html(w,d); expect(h).toContain('Complementos indisponíveis'); expect(h).not.toContain('<dl');
    const p = painel(w); if(p.analitico?.tipo === 'loja')p.analitico.faturamentoDiario = d;
    const principal = home(p); expect(card(principal)).toContain(formatarDinheiro(700_000)); expect(principal).toContain('aria-label="Evolução do faturamento"');
  });

  it('loja do widget divergente da query é incompatível mesmo com href igual nos dois DTOs', () => {
    const w = widget(); w.escopo = { ...w.escopo, lojaId: 'lojaa' };
    expect(html(w)).toContain('Complementos indisponíveis'); expect(html(w)).not.toContain('<dl');
  });

  it('DTO antigo da evolução sem widget continua com sua série e sem novos complementos', () => {
    const p = painel(); if(p.analitico?.tipo === 'loja')p.analitico.widgets = [];
    const h = home(p); expect(h).toContain('aria-label="Evolução do faturamento"'); expect(h).not.toContain('Complementos do Faturamento');
  });
});

describe('Home · moeda inteira sem quebrar dígitos ou centavos', () => {
  const dinheiro = (n: number) => renderToStaticMarkup(createElement(ValorMonetarioHome, { centavos: n }));
  it.each([1_000_000, -1_000_000, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER])('preserva integralmente a saída canônica para %s centavos', n => {
    const h = dinheiro(n), formatado = formatarDinheiro(n), partes = formatado.split('\u00a0');
    expect(h).toContain(`data-valor-monetario="${formatado}"`);
    expect(h).toContain(`data-parte-monetaria="numero" class="whitespace-nowrap">${partes[1]}</span>`);
    expect(h).toContain(`class="whitespace-nowrap">${partes[0]}</span>`);
    expect(h).not.toMatch(/truncate|line-clamp|overflow-hidden|overflow-wrap|<button|<a /);
    expect(h).toContain(Math.abs(n) === Number.MAX_SAFE_INTEGER ? 'text-[14px]' : 'text-[20px]');
  });

  it('R$10k no KPI mantém todo o número numa unidade visual, sem os complementos', () => {
    const w = widget(); w.valor.valor = 1_000_000; const f = card(home(painel(w)));
    expect(f).toContain('data-parte-monetaria="numero" class="whitespace-nowrap">10.000,00</span>');
    expect(f).not.toContain('Complementos do Faturamento'); expect(f).not.toContain('[overflow-wrap:anywhere]');
  });
});
