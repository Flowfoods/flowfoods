import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewNoNivel1 from '@/app/rodolfo/(painel)/integracoes/[slug]/review/page';

const api = vi.hoisted(() => ({
  exigirParceiro: vi.fn(), exigirPermissao: vi.fn(), leituraDoParceiro: vi.fn(),
  moduloLiberado: vi.fn(), transacao: vi.fn(), lojas: vi.fn(), listar: vi.fn(), consultar: vi.fn(),
}));
vi.mock('@/lib/erp/contexto', () => ({
  exigirParceiro: api.exigirParceiro, exigirPermissao: api.exigirPermissao, leituraDoParceiro: api.leituraDoParceiro,
}));
vi.mock('@/lib/erp/liberacao', () => ({ moduloLiberado: api.moduloLiberado }));
vi.mock('@/lib/integracoes/ifood/review-fila', () => ({ listarReviewFila: api.listar, consultarReviewFila: api.consultar }));

const ctx = { parceiro: { id: 'parceiro-teste', slug: 'sandbox', nome: 'Parceiro sintético', homologacaoDeIntegracao: true } };
const tx = { loja: { findMany: api.lojas } };
const loja = { id: 'loja-autorizada', nome: 'Loja de teste' };
const criadoEm = '2026-11-27T13:00:00.000Z';
const itens = [
  { avaliacaoLocalId: 'sugestao-teste', estado: 'RASCUNHO', revisaoAtual: 2, criadoEm, parceiroId: 'segredo-de-fixture' },
  { avaliacaoLocalId: 'aprovacao-teste', estado: 'APROVADA', revisaoAtual: 1, criadoEm },
];
const pagina = (busca: Awaited<Parameters<typeof ReviewNoNivel1>[0]['searchParams']> = {}) =>
  ReviewNoNivel1({ params: Promise.resolve({ slug: ctx.parceiro.slug }), searchParams: Promise.resolve(busca) });
const html = async (busca?: Parameters<typeof pagina>[0]) => renderToStaticMarkup(await pagina(busca));

beforeEach(() => {
  vi.resetAllMocks();
  api.exigirParceiro.mockResolvedValue(ctx);
  api.leituraDoParceiro.mockReturnValue({ transacao: api.transacao });
  api.transacao.mockImplementation(fn => fn(tx));
  api.moduloLiberado.mockResolvedValue(true);
  api.lojas.mockResolvedValue([loja]);
  api.listar.mockResolvedValue({ itens, proximoId: null });
});

describe('Review no Barney · consulta de demonstração', () => {
  it('usa leitura do parceiro e o filtro da loja em uma transação repetível', async () => {
    const conteudo = await html();
    expect(api.exigirParceiro).toHaveBeenCalledWith('sandbox');
    expect(api.leituraDoParceiro).toHaveBeenCalledExactlyOnceWith('parceiro-teste');
    expect(api.transacao).toHaveBeenCalledWith(expect.any(Function), { repetivel: true });
    expect(api.lojas).toHaveBeenCalledWith(expect.objectContaining({ where: { ativa: true } }));
    expect(api.exigirPermissao).toHaveBeenCalledWith(ctx, 'integracao.ver', { lojaId: loja.id });
    expect(api.listar).toHaveBeenCalledExactlyOnceWith(tx, { lojaId: loja.id, limite: 20 });
    expect(api.consultar).not.toHaveBeenCalled();
    expect(conteudo).toContain('Demonstração · dados simulados');
    expect(conteudo).toContain('Aprovada na simulação');
    expect(conteudo).toContain('>Rascunho<');
    expect(conteudo).toContain('method="get"');
    expect(conteudo).toContain('avaliacao=aprovacao-teste#review-fila-revisao');
    expect(conteudo).not.toMatch(/\$ACTION|>Enviar|segredo-de-fixture/);
  });

  it('mostra só a revisão atual da linha selecionada e mantém o filtro ao voltar e avançar', async () => {
    api.listar.mockResolvedValue({ itens: [itens[0]], proximoId: 'seguinte' });
    api.consultar.mockResolvedValue({ revisaoAtual: 2, revisoes: [
      { numero: 1, texto: 'Texto histórico', criadoEm },
      { numero: 2, texto: 'Texto sintético <b>literal</b>', criadoEm, fatosComentario: 'Fato interno' },
    ] });
    const conteudo = await html({ loja: loja.id, estado: 'RASCUNHO', depois: 'anterior', avaliacao: 'sugestao-teste' });
    expect(api.listar).toHaveBeenCalledWith(tx, { lojaId: loja.id, estado: 'RASCUNHO', depoisId: 'anterior', limite: 20 });
    expect(api.consultar).toHaveBeenCalledExactlyOnceWith(tx, { lojaId: loja.id, avaliacaoLocalId: 'sugestao-teste' });
    expect(conteudo).toContain('Texto sintético &lt;b&gt;literal&lt;/b&gt;');
    expect(conteudo).toContain('id="review-fila-revisao"');
    expect(conteudo).not.toMatch(/Texto histórico|Fato interno/);
    expect(conteudo).toContain(`?loja=${loja.id}&amp;estado=RASCUNHO&amp;depois=anterior`);
    expect(conteudo).toContain(`?loja=${loja.id}&amp;estado=RASCUNHO&amp;depois=seguinte`);
  });

  it('não consulta sugestão que não veio da página da loja selecionada', async () => {
    const conteudo = await html({ loja: loja.id, avaliacao: 'sugestao-de-outra-loja' });
    expect(api.consultar).not.toHaveBeenCalled();
    expect(conteudo).toContain('Sugestão indisponível nesta consulta.');
  });

  it('distingue fila local vazia de uma loja indisponível', async () => {
    api.listar.mockResolvedValue({ itens: [], proximoId: null });
    expect(await html()).toContain('Nenhuma sugestão de demonstração nesta consulta.');
    api.lojas.mockResolvedValue([]);
    expect(await html()).toContain('Nenhuma loja de teste disponível para consulta.');
    expect(api.listar).toHaveBeenCalledTimes(1);
  });

  it.each([{ loja: 'loja-de-outro-parceiro' }, { loja: [loja.id, loja.id] }, { estado: 'ENVIADA' }])(
    'rejeita URL sem escopo de consulta válido (%j)', async (busca) => {
      await expect(pagina(busca)).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
      expect(api.listar).not.toHaveBeenCalled();
    },
  );

  it('bloqueia parceiro de produção antes de construir o cliente de leitura', async () => {
    api.exigirParceiro.mockResolvedValue({ parceiro: { ...ctx.parceiro, homologacaoDeIntegracao: false } });
    await expect(pagina()).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
    expect(api.leituraDoParceiro).not.toHaveBeenCalled();
  });

  it('bloqueia o link direto se o módulo estiver bloqueado ou faltar permissão', async () => {
    api.moduloLiberado.mockResolvedValue(false);
    await expect(pagina()).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
    expect(api.lojas).not.toHaveBeenCalled();
    api.exigirPermissao.mockImplementation(() => { throw new Error('Permissão ausente'); });
    await expect(pagina()).rejects.toThrow('Permissão ausente');
    expect(api.listar).not.toHaveBeenCalled();
  });
});
