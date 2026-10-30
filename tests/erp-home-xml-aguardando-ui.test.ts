import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PainelDoDia } from '@/lib/erp/painel-do-dia';
import type { XmlAguardandoHome } from '@/lib/erp/home-xml-aguardando';
import type { WidgetComprasHome } from '@/lib/erp/home-analitico';
import { ajudaParaATela } from '@/lib/erp/ajuda';
import { HubDoParceiro } from '@/components/erp/telas/hub-do-parceiro';

vi.mock('@/lib/db', () => { throw new Error('A apresentação não acessa banco.'); });
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

const consulta = '2026-10-30T14:00:00.000Z';
const xml = (aguardando = 2): XmlAguardandoHome => ({
  estado: 'ok', aguardando, loja: { id: 'lojab', nome: 'Loja B', ativa: true }, referencia: 'fila_atual', consultadoEm: consulta,
  aviso: 'Fila atual, sem recorte mensal: somente XML atribuídos a esta loja aguardando conferência. O destino também pode incluir notas recebidas ou com erro.',
  detalhe: { href: '/erp/compras/recebidas?loja=lojab', rotulo: 'Ver fila de notas recebidas' },
});
const painel = (x: XmlAguardandoHome | undefined = xml()): PainelDoDia => ({
  indicadores: [], pendencias: [], consultadoEm: consulta,
  analitico: { tipo: 'loja', loja: { id: 'lojab', nome: 'Loja B' }, widgets: [] },
  ...(x ? { xmlAguardando: x } : {}),
});
const renderizar = (p = painel()) => renderToStaticMarkup(createElement(HubDoParceiro, {
  titulo: 'Áreas da Rede', subtitulo: 'Loja B', modulos: [], semAcesso: false, painel: p,
}));
const compras = (): WidgetComprasHome => ({
  familia: 'compras', titulo: 'Compras', estado: 'ok', escopo: { tipo: 'loja', lojaId: 'lojab', nome: 'Loja B' },
  valor: { unidade: 'centavos', valor: 123400 }, percentual: null,
  referencia: { base: 'mes_civil', rotulo: 'Mês atual', inicio: '2026-10-01', fim: '2026-10-30', apuradoAte: '2026-10-30' },
  origem: { fonte: 'compras', modo: 'vivo', fotografia: null }, cobertura: null, consultadoEm: consulta, avisos: [],
  detalhe: { href: '/erp/compras/relatorios/periodo?loja=lojab&de=2026-10-01&ate=2026-10-30&base=entrada', rotulo: 'Ver compras no relatório' },
  baseDeData: 'entrada', notas: 1, itensCentavos: 123400, freteCentavos: 0, semBase: {}, notasComDesconto: 0,
});

describe('Home · XML no feed existente, separado do dinheiro', () => {
  it.each([1, 2, 999999])('%i pendentes entram uma vez no feed, com alcance e destino mais amplo', quantidade => {
    const p = painel(xml(quantidade));
    p.pendencias.push({ chave: 'anterior', titulo: 'Pendência existente', texto: 'Confira.', href: '/erp/fichas', acao: 'Ver fichas' });
    const antes = JSON.stringify(p);
    const h = renderizar(p);
    expect(h).toContain(`${quantidade.toLocaleString('pt-BR')} XML aguardando conferência`);
    expect(h).toContain('Loja B · fila atual, sem recorte mensal');
    expect(h).toContain('Só documentos atribuídos a esta loja.');
    expect(h).toContain('não é compra lançada e não entra em Compras, estoque ou CMV');
    expect(h).toContain('A fila também pode incluir notas recebidas ou com erro.');
    expect(h).toContain('href="/erp/compras/recebidas?loja=lojab"');
    expect(h.match(/Ver fila de notas recebidas/g)).toHaveLength(1);
    expect(h.indexOf('Pendência existente')).toBeLessThan(h.indexOf(' XML aguardando'));
    expect(JSON.stringify(p)).toBe(antes);
    expect(h).not.toContain('Indicador de XML');
  });

  it('zero é informação discreta, não pendência nem declaração de fila vazia', () => {
    const h = renderizar(painel(xml(0)));
    expect(h).toContain('Nenhum XML atribuído a esta loja aguardando conferência nesta consulta.');
    expect(h).toContain('aria-label="Conferência de XML"');
    expect(h).not.toContain('<ol');
    expect(h).not.toContain('O que precisa de você');
    expect(h).not.toMatch(/fila vazia|Tudo em dia|0 XML aguardando/);
    expect(h).toContain('notas recebidas ou com erro');
    expect(h).toContain('Ver fila de notas recebidas');
  });

  it.each(['erro', 'indisponivel'] as const)('%s não reaproveita contador residual nem derruba Compras', estado => {
    const p = painel({ ...xml(999999), estado, aviso: 'Não foi possível conferir os XML desta loja.' });
    if (p.analitico?.tipo === 'loja') p.analitico.widgets = [compras()];
    const h = renderizar(p).replace(/\s/g, ' ');
    expect(h).toContain('Contagem de XML aguardando conferência indisponível nesta consulta.');
    expect(h).not.toContain('999.999');
    expect(h).not.toContain('Nenhum XML');
    expect(h).toContain('Indicador de Compras');
    expect(h).toContain('1.234,00');
    expect(h).toContain('base=entrada');
    expect(h).not.toContain('<ol');
  });

  it.each([null, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('contador incompatível %s não é zero ou pendência', aguardando => {
    const h = renderizar(painel({ ...xml(), aguardando }));
    expect(h).toContain('Contagem de XML aguardando conferência indisponível');
    expect(h).not.toContain('<ol');
    expect(h).not.toContain('Nenhum XML');
  });

  it('loja desativada conserva os documentos existentes e identifica o estado', () => {
    const x = xml(); x.loja.ativa = false;
    expect(renderizar(painel(x))).toContain('Loja B · fila atual, sem recorte mensal · loja desativada');
  });

  it('N1 conserva o destino já autorizado e escapa o nome da loja', () => {
    const x = xml(); x.detalhe.href = '/rodolfo/erp/casa-b/compras/recebidas?loja=lojab'; x.loja.nome = '<script>loja</script>';
    const h = renderizar(painel(x));
    expect(h).toContain('href="/rodolfo/erp/casa-b/compras/recebidas?loja=lojab"');
    expect(h).toContain('&lt;script&gt;loja&lt;/script&gt;');
    expect(h).not.toContain('<script>loja');
  });

  it.each(['loja', 'consulta', 'referencia'] as const)('DTO de outro contexto (%s) não entra na Home desta loja', campo => {
    const x = xml(789012);
    if (campo === 'loja') x.loja.id = 'outraloja';
    if (campo === 'consulta') x.consultadoEm = '2026-10-29T14:00:00.000Z';
    if (campo === 'referencia') x.referencia = 'mes_civil' as 'fila_atual';
    const h = renderizar(painel(x));
    expect(h).not.toContain('XML');
    expect(h).not.toContain('789.012');
    expect(h).not.toContain('/compras/recebidas');
  });

  it('Rede e consumidor antigo não recebem fila nem inventam um total consolidado', () => {
    const p = painel(); p.analitico = { tipo: 'rede' };
    expect(renderizar(p)).not.toContain('XML');
    delete p.xmlAguardando;
    p.analitico = { tipo: 'loja', loja: { id: 'lojab', nome: 'Loja B' }, widgets: [] };
    expect(renderizar(p)).not.toContain('XML');
    expect(renderizar(p)).not.toContain('Atualizar resumo');
  });

  it.each([0, 2])('fila com %i usa o atualizador existente e identifica somente hora da consulta', aguardando => {
    const h = renderizar(painel(xml(aguardando)));
    expect(h.match(/Atualizar resumo/g)).toHaveLength(1);
    expect(h).toContain('Resumo consultado em');
    expect(h).not.toMatch(/sincronizad|Atualizado em|alterado em/i);
  });

  it('a ajuda de XML acompanha compras.ver sem abrir os outros blocos financeiros', () => {
    const inicio = (permissoes: Set<'compras.ver'>) => ajudaParaATela({ nivel: 'LOJA', lojas: ['lojab'], permissoes }).find(e => e.chave === 'inicio')!;
    const visivel = inicio(new Set(['compras.ver']));
    expect(visivel.secoes?.find(s => s.id === 'xml-conferencia')?.blocos).toHaveLength(3);
    expect(visivel.secoes?.some(s => s.id === 'faturamento-totais')).toBe(false);
    expect(inicio(new Set()).secoes?.some(s => s.id === 'xml-conferencia')).toBe(false);
  });
});
