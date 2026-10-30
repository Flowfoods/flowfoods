import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import { resolverAlcance, type Alcance, type Permissao } from '@/lib/erp/permissoes';
import { obterMes } from '@/lib/erp/faturamento';
import { situacaoDoEstoque } from '@/lib/erp/estoque';
import { saudeDoCardapio } from '@/lib/erp/saude-do-cardapio';
import { dreDoPeriodo } from '@/lib/erp/dre';
import { painelDoDia, type PainelDoDia } from '@/lib/erp/painel-do-dia';
import { PainelDoDiaNaTela } from '@/components/erp/telas/painel-do-dia';

vi.mock('@/lib/erp/faturamento', () => ({ obterMes: vi.fn() }));
vi.mock('@/lib/erp/estoque', () => ({ situacaoDoEstoque: vi.fn() }));
vi.mock('@/lib/erp/producao-lista', () => ({ lojasDaListaDoDia: vi.fn() }));
vi.mock('@/lib/erp/saude-do-cardapio', () => ({ saudeDoCardapio: vi.fn() }));
vi.mock('@/lib/erp/dre', () => ({ dreDoPeriodo: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

const HOJE = '2026-10-29';
const cliente = {} as ClienteDoParceiro;
const visao = { tipo: 'loja', lojaId: 'lojab', nome: 'Loja B' } as const;
const dono = resolverAlcance({
  // Esta matriz cobre as três fontes de H1; Produção tem matriz própria.
  perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: ['producao.ver'], redeInteira: true, lojaIds: [],
});
const alcanceCom = (...permissoes: Permissao[]): Alcance => ({ nivel: 'LOJA', lojas: ['lojab'], permissoes: new Set(permissoes) });
const faturamento = (centavos: number | null = 700_000, faltas = 0) => ({
  lojas: [{ loja: { id: 'lojab', nome: 'Loja B' }, dias: [{ data: '2026-10-28', total: centavos === null ? null : { valorCentavos: centavos } }] }],
  total: { valorCentavos: centavos ?? 0, pedidos: centavos ? 70 : 0 }, faltas,
}) as unknown as Awaited<ReturnType<typeof obterMes>>;
const estoque = (ativa = true) => [{
  id: 'lojab', nome: 'Loja B', ativa, estado: 'NAO_ABERTO' as const, contagem: null, aberto: null, verValores: false,
}];
const htmlDe = (painel: PainelDoDia) => renderToStaticMarkup(createElement(PainelDoDiaNaTela, { painel }));
const ler = (alcance = dono) => painelDoDia(cliente, alcance, '/erp', HOJE, visao);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(dreDoPeriodo).mockResolvedValue(null);
  vi.mocked(obterMes).mockResolvedValue(faturamento());
  vi.mocked(saudeDoCardapio).mockResolvedValue({ pratos: 2, prontos: 1, custoIncompleto: 0 } as Awaited<ReturnType<typeof saudeDoCardapio>>);
  vi.mocked(situacaoDoEstoque).mockResolvedValue(estoque());
});

describe('H1 · cada fonte tem estado independente e conserva o contexto autorizado', () => {
  it.each(['faturamento', 'cardapio', 'estoque'] as const)('falha de %s conserva os números e as pendências das outras fontes', async (chave) => {
    const leituras = { faturamento: vi.mocked(obterMes), cardapio: vi.mocked(saudeDoCardapio), estoque: vi.mocked(situacaoDoEstoque) };
    leituras[chave].mockRejectedValueOnce(new Error('Prisma SQL FaturamentoLancamento tenant-segredo'));
    const p = await ler();
    expect(p.estados?.map((e) => [e.chave, e.estado])).toEqual([
      ['faturamento', chave === 'faturamento' ? 'erro' : 'ok'],
      ['cardapio', chave === 'cardapio' ? 'erro' : 'ok'],
      ['estoque', chave === 'estoque' ? 'erro' : 'ok'],
    ]);
    expect(p.indicadores.map((i) => i.chave)).toEqual(['faturamento', 'cardapio', 'estoque'].filter((c) => c !== chave));
    expect(p.pendencias.map((p) => p.chave)).toEqual([
      ...(chave !== 'cardapio' ? ['cardapio-preco'] : []),
      ...(chave !== 'estoque' ? ['estoque-abrir'] : []),
    ]);
    if (chave !== 'faturamento') expect(p.indicadores[0].valor).toEqual({ tipo: 'dinheiro', centavos: 700_000 });
    expect(JSON.stringify(p) + htmlDe(p)).not.toMatch(/Prisma|SQL|FaturamentoLancamento|tenant-segredo/);
  });

  it('captura também uma exceção síncrona da fonte sem derrubar as demais', async () => {
    vi.mocked(obterMes).mockImplementationOnce(() => { throw new Error('interno'); });
    const p = await ler();
    expect(p.estados?.find((e) => e.chave === 'faturamento')?.estado).toBe('erro');
    expect(p.indicadores.map((i) => i.chave)).toEqual(['cardapio', 'estoque']);
  });

  it('todas as fontes com erro ainda produzem resumo recuperável, sem zeros nem detalhes internos', async () => {
    vi.mocked(obterMes).mockRejectedValueOnce({ message: 'SQL', reason: 'nome privado da tabela' });
    vi.mocked(saudeDoCardapio).mockRejectedValueOnce(new Error('Prisma'));
    vi.mocked(situacaoDoEstoque).mockRejectedValueOnce('tenant-segredo');
    const p = await ler();
    expect(p.indicadores).toEqual([]);
    expect(p.pendencias).toEqual([]);
    expect(p.estados?.every((e) => e.estado === 'erro')).toBe(true);
    const html = htmlDe(p);
    expect(html).toContain('Não foi possível carregar o faturamento.');
    expect(html).toContain('Não foi possível carregar a situação do cardápio.');
    expect(html).toContain('Não foi possível carregar a situação do estoque.');
    expect(html).toContain('Atualizar resumo');
    expect(html).not.toMatch(/R\$|SQL|Prisma|tenant-segredo|nome privado|reason/);
  });

  it('fonte sem permissão não é chamada e nem seu estado vai para o cliente', async () => {
    vi.mocked(obterMes).mockRejectedValueOnce(new Error('não deveria ler'));
    vi.mocked(saudeDoCardapio).mockRejectedValueOnce(new Error('não deveria ler'));
    const p = await ler(alcanceCom('estoque.ver', 'fichas.ver'));
    expect(obterMes).not.toHaveBeenCalled();
    expect(saudeDoCardapio).not.toHaveBeenCalled();
    expect(p.estados?.map((e) => e.chave)).toEqual(['estoque']);
    expect(p.indicadores.map((i) => i.chave)).toEqual(['estoque']);
    expect(JSON.stringify(p) + htmlDe(p)).not.toMatch(/faturamento|cardapio|centavos|preço/i);
  });

  it('sem fonte autorizada, conserva o contrato vazio anterior e não cria metadados', async () => {
    const p = await ler(alcanceCom());
    expect(p).toEqual({ indicadores: [], pendencias: [] });
    expect(htmlDe(p)).toBe('');
    expect(obterMes).not.toHaveBeenCalled();
    expect(saudeDoCardapio).not.toHaveBeenCalled();
    expect(situacaoDoEstoque).not.toHaveBeenCalled();
  });

  it('parcial indica lançamento faltante, enquanto frações operacionais continuam ok', async () => {
    vi.mocked(obterMes).mockResolvedValueOnce(faturamento(700_000, 3));
    const p = await ler();
    expect(p.estados?.map((e) => e.estado)).toEqual(['parcial', 'ok', 'ok']);
    expect(p.estados?.[0].mensagem).toContain('3 canais sem lançamento');
    expect(p.indicadores.find((i) => i.chave === 'cardapio')?.valor).toEqual({ tipo: 'fracao', de: 1, total: 2 });
    expect(p.indicadores.find((i) => i.chave === 'estoque')?.valor).toEqual({ tipo: 'fracao', de: 0, total: 1 });
    expect(htmlDe(p).match(/>Parcial</g)).toHaveLength(1);
  });

  it('distingue ausência e zero declarado, sem usar as faltas para inventar valor', async () => {
    vi.mocked(obterMes).mockResolvedValueOnce(faturamento(null, 6));
    const sem = await ler();
    expect(sem.estados?.[0]).toMatchObject({ estado: 'sem_dados', escopo: 'Loja B', mensagem: 'Ainda não há lançamentos neste mês.' });
    expect(sem.indicadores[0].valor).toEqual({ tipo: 'dinheiro', centavos: null });
    const html = htmlDe(sem);
    expect(html).toContain('Sem dados');
    expect(html).toContain('Ainda não há lançamentos neste mês.');
    expect(html).not.toMatch(/R\$/);
    vi.mocked(obterMes).mockResolvedValueOnce(faturamento(0));
    const zero = await ler();
    expect(zero.estados?.[0].estado).toBe('ok');
    expect(zero.indicadores[0].valor).toEqual({ tipo: 'dinheiro', centavos: 0 });
    expect(htmlDe(zero)).toContain('R$');
  });

  it('parceiro vazio declara falta de lojas e pratos, com caminho real em cada fonte', async () => {
    vi.mocked(obterMes).mockResolvedValueOnce({ lojas: [], total: { valorCentavos: 0, pedidos: 0 }, faltas: 0 } as unknown as Awaited<ReturnType<typeof obterMes>>);
    vi.mocked(saudeDoCardapio).mockResolvedValueOnce({ pratos: 0, prontos: 0, custoIncompleto: 0 } as Awaited<ReturnType<typeof saudeDoCardapio>>);
    vi.mocked(situacaoDoEstoque).mockResolvedValueOnce([]);
    const p = await ler();
    expect(p.indicadores).toEqual([]);
    expect(p.estados?.every((e) => e.estado === 'sem_dados')).toBe(true);
    const html = htmlDe(p);
    expect(html).toContain('Nenhuma loja disponível para faturamento neste contexto.');
    expect(html).toContain('Ainda não há pratos neste resumo da rede.');
    expect(html).toContain('Nenhuma loja disponível para estoque neste contexto.');
    expect(html).toContain('href="/erp/faturamento?mes=2026-10&amp;loja=lojab"');
    expect(html).toContain('href="/erp/fichas"');
    expect(html).toContain('href="/erp/estoque/lojab"');
    expect(html).not.toContain('R$');
  });

  it('loja inativa usa mensagem própria em vez de informar um estoque zero', async () => {
    vi.mocked(situacaoDoEstoque).mockResolvedValueOnce(estoque(false));
    const p = await ler();
    expect(p.estados?.find((e) => e.chave === 'estoque')).toMatchObject({ estado: 'sem_dados', mensagem: 'Nenhuma loja ativa neste contexto.' });
    expect(p.indicadores.some((i) => i.chave === 'estoque')).toBe(false);
    expect(p.pendencias.some((p) => p.chave.startsWith('estoque'))).toBe(false);
  });

  it('metadados registram momento da consulta, referência civil e escopos reais', async () => {
    const antes = Date.now();
    const p = await ler();
    expect(Date.parse(p.consultadoEm!)).toBeGreaterThanOrEqual(antes);
    expect(Date.parse(p.consultadoEm!)).toBeLessThanOrEqual(Date.now());
    expect(p.estados?.[0]).toMatchObject({ escopo: 'Loja B', referencia: 'Mês civil · outubro de 2026', href: '/erp/faturamento?mes=2026-10&loja=lojab' });
    expect(p.estados?.[1]).toMatchObject({ escopo: 'Da rede', referencia: 'Situação atual do cadastro' });
    expect(p.estados?.[2]).toMatchObject({ escopo: 'Loja B', referencia: 'Posição atual', href: '/erp/estoque/lojab' });
    expect(htmlDe(p)).toContain('Resumo consultado em');
    expect(htmlDe(p)).not.toContain('Dados atualizados em');
  });
});

describe('H1 · HTML acessível e compatibilidade com resumo institucional', () => {
  it('mantém ordem dos cartões e atualização fora dos links, com anúncio local', async () => {
    vi.mocked(obterMes).mockRejectedValueOnce(new Error('interno'));
    const html = htmlDe(await ler());
    expect(html).toContain('aria-label="Resumo da operação"');
    expect(html).toContain('role="group" aria-label="Faturamento de outubro"');
    expect(html.indexOf('Faturamento de outubro')).toBeLessThan(html.indexOf('Pratos prontos para o preço'));
    expect(html.indexOf('Pratos prontos para o preço')).toBeLessThan(html.indexOf('Lojas com estoque aberto'));
    expect(html).toContain('type="button" aria-disabled="false" aria-busy="false"');
    expect(html).not.toMatch(/<button[^>]+(?:\sdisabled[=\s>])/);
    expect(html).toContain('role="status" aria-live="polite"');
    expect(html).not.toMatch(/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<button/);
    expect(html).not.toMatch(/<section[^>]+aria-live/);
    expect(html.match(/>Atualizar resumo</g)).toHaveLength(1);
  });

  it('painel N1 sem contrato opcional conserva sua leitura e não ganha retry', () => {
    const html = htmlDe({ indicadores: [{ chave: 'respostas', rotulo: 'Respostas de hoje', valor: { tipo: 'numero', numero: 4 }, contexto: 'Hoje', href: '/rodolfo/prospeccao' }], pendencias: [] });
    expect(html).toContain('aria-label="Resumo de hoje"');
    expect(html).toContain('Respostas de hoje');
    expect(html).toContain('href="/rodolfo/prospeccao"');
    expect(html).not.toContain('Atualizar resumo');
    expect(html).not.toContain('Resumo consultado em');
  });
});
