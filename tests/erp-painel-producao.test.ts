import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import type { Alcance, Permissao } from '@/lib/erp/permissoes';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { obterMes } from '@/lib/erp/faturamento';
import { situacaoDoEstoque } from '@/lib/erp/estoque';
import { saudeDoCardapio } from '@/lib/erp/saude-do-cardapio';
import { lojasDaListaDoDia } from '@/lib/erp/producao-lista';
import { painelDoDia, type PainelDoDia } from '@/lib/erp/painel-do-dia';
import { PainelDoDiaNaTela } from '@/components/erp/telas/painel-do-dia';

vi.mock('@/lib/erp/faturamento', () => ({ obterMes: vi.fn() }));
vi.mock('@/lib/erp/estoque', () => ({ situacaoDoEstoque: vi.fn() }));
vi.mock('@/lib/erp/saude-do-cardapio', () => ({ saudeDoCardapio: vi.fn() }));
vi.mock('@/lib/erp/producao-lista', () => ({ lojasDaListaDoDia: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

const cliente = {} as ClienteDoParceiro;
const HOJE = '2026-10-29';
const visao = { tipo: 'loja', lojaId: 'lojab', nome: 'Loja B' } as const;
const acesso = (permissoes: Permissao[] = ['producao.ver'], lojas: Alcance['lojas'] = ['lojab']): Alcance => ({ nivel: 'LOJA', lojas, permissoes: new Set(permissoes) });
const lista = (naLista = 3, semLote = 1) => [{ id: 'lojab', nome: 'Loja B', naLista, semLote }];
const htmlDe = (painel: PainelDoDia) => renderToStaticMarkup(createElement(PainelDoDiaNaTela, { painel }));
const ler = () => painelDoDia(cliente, acesso(), '/erp', HOJE, visao);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(lojasDaListaDoDia).mockResolvedValue(lista());
  vi.mocked(situacaoDoEstoque).mockResolvedValue([]);
  vi.mocked(obterMes).mockResolvedValue({ lojas: [], total: { valorCentavos: 0, pedidos: 0 }, faltas: 0 } as unknown as Awaited<ReturnType<typeof obterMes>>);
});

describe('Home · produção de hoje de uma loja, sem consolidado ou custo', () => {
  it('quem só vê produção recebe contagens exatas e caminho de consulta, sem dados financeiros', async () => {
    const p = await ler();
    expect(p.indicadores).toEqual([{
      chave: 'producao', escopo: 'Loja B', rotulo: 'Pré-preparos na lista de hoje',
      valor: { tipo: 'numero', numero: 3 },
      contexto: '1 pré-preparo ainda sem lote ativo. A lista inclui os que já viraram lote.',
      href: '/erp/producao/lista/lojab?dia=2026-10-29',
    }]);
    expect(p.estados).toEqual([expect.objectContaining({ chave: 'producao', estado: 'ok', referencia: 'Hoje · 29/10/2026' })]);
    expect(p.pendencias).toEqual([expect.objectContaining({ chave: 'producao-sem-lote', titulo: '1 pré-preparo ainda sem lote ativo', acao: 'Ver a lista' })]);
    expect(obterMes).not.toHaveBeenCalled();
    expect(saudeDoCardapio).not.toHaveBeenCalled();
    expect(situacaoDoEstoque).not.toHaveBeenCalled();
    const html = htmlDe(p);
    expect(html).toContain('Hoje · 29/10/2026');
    expect(html).toContain('href="/erp/producao/lista/lojab?dia=2026-10-29"');
    expect(html).not.toMatch(/R\$|centavos|Gerar lotes|Salvar a lista|progressbar|Tudo concluído/i);
    expect(html.match(/>Atualizar resumo</g)).toHaveLength(1);
  });

  it('lista vazia informa zero pré-preparos listados, sem concluir que não houve produção', async () => {
    vi.mocked(lojasDaListaDoDia).mockResolvedValueOnce(lista(0, 0));
    const p = await ler();
    expect(p.indicadores[0].valor).toEqual({ tipo: 'numero', numero: 0 });
    expect(p.estados?.[0]).toMatchObject({ estado: 'sem_dados', mensagem: 'Nenhum pré-preparo listado hoje.' });
    expect(p.pendencias).toEqual([]);
    expect(htmlDe(p)).toContain('Nenhum pré-preparo listado hoje.');
    expect(htmlDe(p)).not.toMatch(/Nenhuma produção|Lista não criada|Tudo concluído|Tudo produzido/);
  });

  it('sem lote pendente não quer dizer produção concluída; mantém a quantidade total listada', async () => {
    vi.mocked(lojasDaListaDoDia).mockResolvedValueOnce(lista(4, 0));
    const p = await ler();
    expect(p.indicadores[0].valor).toEqual({ tipo: 'numero', numero: 4 });
    expect(p.indicadores[0].contexto).toContain('0 pré-preparos ainda sem lote ativo');
    expect(p.estados?.[0].estado).toBe('ok');
    expect(p.pendencias).toEqual([]);
    expect(htmlDe(p)).not.toMatch(/Concluídos|Tudo produzido|100%|progressbar/);
  });

  it('sem loja ativa na fonte não fabrica indicador zero', async () => {
    vi.mocked(lojasDaListaDoDia).mockResolvedValueOnce([]);
    const p = await ler();
    expect(p.indicadores).toEqual([]);
    expect(p.estados?.[0]).toMatchObject({ estado: 'sem_dados', mensagem: 'Nenhuma loja ativa disponível para produção neste contexto.' });
    expect(p.pendencias).toEqual([]);
  });

  it('aplica a loja autorizada antes da fonte e projeta só a linha correspondente', async () => {
    vi.mocked(lojasDaListaDoDia).mockResolvedValueOnce([
      { id: 'lojaa', nome: 'Loja A privada', naLista: 999, semLote: 999 },
      ...lista(2, 1),
      { id: 'lojac', nome: 'Loja C privada', naLista: 888, semLote: 888 },
    ]);
    const p = await painelDoDia(cliente, acesso(['producao.ver'], 'todas'), '/erp', HOJE, visao);
    expect(vi.mocked(lojasDaListaDoDia).mock.calls[0][1].lojas).toEqual(['lojab']);
    expect(p.indicadores[0].valor).toEqual({ tipo: 'numero', numero: 2 });
    expect(JSON.stringify(p)).not.toMatch(/Loja A privada|Loja C privada|999|888/);
  });

  it('omite Rede e visão não resolvida, mesmo com permissão, sem consultar ou inventar total', async () => {
    const rede = await painelDoDia(cliente, acesso(['producao.ver'], 'todas'), '/erp', HOJE, { tipo: 'rede' });
    const semVisao = await painelDoDia(cliente, acesso(), '/erp', HOJE);
    expect(rede).toEqual({ indicadores: [], pendencias: [] });
    expect(semVisao).toEqual({ indicadores: [], pendencias: [] });
    expect(lojasDaListaDoDia).not.toHaveBeenCalled();
  });

  it('sem producao.ver não consulta nem serializa estado, link ou pendência da produção', async () => {
    const p = await painelDoDia(cliente, acesso(['estoque.ver']), '/erp', HOJE, visao);
    expect(lojasDaListaDoDia).not.toHaveBeenCalled();
    expect(JSON.stringify(p) + htmlDe(p)).not.toMatch(/producao|produção|pré-preparo/i);
  });

  it.each(['lojaa', '', '../lojab'])('recusa loja fora do alcance ou inválida (%s) antes de qualquer fonte', async (lojaId) => {
    expect(await painelDoDia(cliente, acesso(), '/erp', HOJE, { ...visao, lojaId })).toEqual({ indicadores: [], pendencias: [] });
    expect(lojasDaListaDoDia).not.toHaveBeenCalled();
    expect(obterMes).not.toHaveBeenCalled();
    expect(situacaoDoEstoque).not.toHaveBeenCalled();
    expect(saudeDoCardapio).not.toHaveBeenCalled();
  });

  it('falha da produção conserva o faturamento, não expõe detalhes internos e mantém retry único', async () => {
    vi.mocked(lojasDaListaDoDia).mockRejectedValueOnce(new Error('SQL ListaProducao tenant-privado'));
    vi.mocked(obterMes).mockResolvedValueOnce({
      lojas: [{ loja: { id: 'lojab', nome: 'Loja B' }, dias: [{ data: '2026-10-28', total: { valorCentavos: 700_000 } }] }],
      total: { valorCentavos: 700_000, pedidos: 70 }, faltas: 0,
    } as unknown as Awaited<ReturnType<typeof obterMes>>);
    const p = await painelDoDia(cliente, acesso(['producao.ver', 'faturamento.ver']), '/erp', HOJE, visao);
    expect(p.indicadores).toEqual([expect.objectContaining({ chave: 'faturamento', valor: { tipo: 'dinheiro', centavos: 700_000 } })]);
    expect(p.estados?.find((e) => e.chave === 'producao')).toMatchObject({ estado: 'erro', mensagem: 'Não foi possível carregar a lista de produção de hoje.' });
    expect(p.pendencias).toEqual([]);
    const html = htmlDe(p);
    expect(html).toContain('role="group" aria-label="Pré-preparos na lista de hoje"');
    expect(html).toContain('Não foi possível carregar a lista de produção de hoje.');
    expect(html.match(/>Atualizar resumo</g)).toHaveLength(1);
    expect(JSON.stringify(p) + html).not.toMatch(/SQL|ListaProducao|tenant-privado/);
  });

  it('captura exceção síncrona da fonte como erro isolado', async () => {
    vi.mocked(lojasDaListaDoDia).mockImplementationOnce(() => { throw new Error('interno'); });
    const p = await ler();
    expect(p.estados?.[0].estado).toBe('erro');
    expect(p.indicadores).toEqual([]);
  });

  it('espelho do parceiro preserva a base e o dia nos links, sem serializar campos extras da fonte', async () => {
    const fonteComCamposExtras = [{ ...lista()[0], custoCentavos: 123456, segredo: 'campo-privado' }];
    vi.mocked(lojasDaListaDoDia).mockResolvedValueOnce(fonteComCamposExtras);
    const base = '/rodolfo/erp/parceiro-qa';
    const p = await painelDoDia(cliente, acesso(), base, HOJE, visao);
    expect(p.indicadores[0].href).toBe(base + '/producao/lista/lojab?dia=2026-10-29');
    expect(p.estados?.[0].href).toBe(p.indicadores[0].href);
    expect(p.pendencias[0].href).toBe(p.indicadores[0].href);
    expect(JSON.stringify(p)).not.toMatch(/custo|centavos|123456|campo-privado/i);
  });

  it.each([
    ['2026-11-01T02:59:59.000Z', '2026-10-31', '2026-10', '31/10/2026'],
    ['2026-11-01T03:00:00.000Z', '2026-11-01', '2026-11', '01/11/2026'],
  ])('usa o mesmo instante Rio para lista, mês e aprofundamento: %s', async (instante, dia, mes, rotulo) => {
    const agora = new Date(instante);
    const p = await painelDoDia(cliente, acesso(['producao.ver', 'faturamento.ver']), '/erp', agora, visao);
    expect(vi.mocked(lojasDaListaDoDia).mock.calls[0][2]).toBe(agora);
    expect(vi.mocked(obterMes).mock.calls[0][2]).toMatchObject({ mes, lojaId: 'lojab' });
    expect(vi.mocked(obterMes).mock.calls[0][3]).toBe(dia);
    expect(p.indicadores[0].href).toBe(`/erp/producao/lista/lojab?dia=${dia}`);
    expect(p.estados?.find((e) => e.chave === 'producao')?.referencia).toBe(`Hoje · ${rotulo}`);
  });

  it('data textual dos chamadores existentes permanece no mesmo dia no Rio', async () => {
    const p = await ler();
    const agoraDaFonte = vi.mocked(lojasDaListaDoDia).mock.calls[0][2];
    expect(hojeNoRio(agoraDaFonte)).toBe(HOJE);
    expect(p.indicadores[0].href).toContain(`dia=${HOJE}`);
  });
});
