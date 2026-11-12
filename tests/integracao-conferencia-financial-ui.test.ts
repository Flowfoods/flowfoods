import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TelaConferenciaFinancial } from '@/components/erp/telas/integracoes/tela-conferencia-financial';
import { ALCANCE_FLOWFOODS } from '@/lib/erp/permissoes';
import { doParceiro } from '@/lib/erp/tenant';
import { lerConferenciaFinancial, type ResultadoConferenciaFinancial } from '@/lib/integracoes/core/conferencia-financial';

vi.mock('@/lib/integracoes/core/conferencia-financial', () => ({ lerConferenciaFinancial: vi.fn() }));

const loja = { id: 'loja-consulta', nome: 'Unidade selecionada' };
const consulta: Extract<ResultadoConferenciaFinancial, { ok: true }> = {
  ok: true, loja, lojas: [loja], competencia: '2026-06', ambiente: 'TEST', fonteMensal: 'SEM_DADOS',
  conexoes: [{ id: 'conexao', nome: 'Vínculo cadastrado', estado: 'ATIVA', estadoFinancial: 'ATIVO' }],
};
const ctx = { parceiro: { id: 'parceiro-tela', homologacaoDeIntegracao: true }, alcance: ALCANCE_FLOWFOODS, cliente: doParceiro('parceiro-tela') };
const ler = vi.mocked(lerConferenciaFinancial);
const html = async (busca: Record<string, string | string[] | undefined>, central = '/erp/integracoes') =>
  renderToStaticMarkup(await TelaConferenciaFinancial({ ctx, central, busca }));

describe('tela de conferência Financial · fontes e navegação', () => {
  beforeEach(() => { ler.mockReset(); ler.mockResolvedValue(consulta); });

  it('mantém cadastro, mês e origem distintos, mesmo com Financial ativo no ambiente de teste', async () => {
    const tela = await html({ loja: loja.id, competencia: '2026-06', origem: 'SIMULACAO' });
    expect(ler).toHaveBeenCalledWith(ctx.cliente, ctx.alcance, { parceiroId: ctx.parceiro.id, homologacaoDeIntegracao: true }, { lojaId: loja.id, competencia: '2026-06' });
    for (const texto of ['Unidade selecionada', 'junho de 2026', 'Sem dados', 'Vínculo cadastrado', 'Teste', 'Financial ativo']) expect(tela).toContain(texto);
    expect(tela).not.toMatch(/R\$|data:application\/gzip|Baixar CSV/);
  });

  it.each(['/erp/integracoes', '/rodolfo/integracoes/rede'])('preserva o recorte no retorno e restringe os valores à loja fictícia em %s', async central => {
    const tela = await html({ loja: loja.id, competencia: '2026-06', exemplo: 'divergente' }, central);
    expect(tela).toContain(`href="${central}/financial?loja=loja-consulta&amp;competencia=2026-06"`);
    for (const texto of ['Loja fictícia', 'fevereiro de 2026', 'Dados simulados', 'Divergente', 'R$ 26,70', '−R$ 0,30', '9%', '8%', 'Baixar CSV.gz simulado']) expect(tela).toContain(texto);
    for (const texto of ['0012', 'Cartão de crédito', 'Recebedor', '03/02/2026', '04/03/2026', 'Pago', '+R$ 30,00', 'Sem impacto no repasse', 'Arquivo disponível e verificado']) expect(tela).toContain(texto);
    expect(tela).toContain('Data da referência · 03/02/2026');
    expect(tela).toContain('Previsão de repasse · 04/03/2026');
    expect(tela).toContain('Previsão de repasse · Não informada');
    expect(tela).not.toMatch(/Unidade selecionada|junho de 2026|Vínculo cadastrado/);
  });

  it('mostra as fontes faltantes sem converter ausência em valor zero', async () => {
    const tela = await html({ exemplo: 'incompleto' });
    expect(tela).toContain('Apenas o arquivo mensal está disponível');
    expect(tela).toContain('Pendente');
    for (const texto of ['Fonte de vendas ausente', 'Fonte de eventos ausente', 'Fonte de liquidações ausente']) expect(tela).toContain(texto);
    expect(tela).toContain('Baixar CSV.gz simulado');
    expect(tela).not.toContain('R$');
  });

  it.each([{ exemplo: 'desconhecido' }, { exemplo: ['conforme', 'divergente'] }])('recusa um cenário inválido ou repetido', async ({ exemplo }) => {
    const tela = await html({ exemplo });
    expect(tela).toContain('Cenário inválido');
    expect(tela).not.toMatch(/R\$|data:application\/gzip/);
  });

  it('exige consulta autorizada com loja inclusive pelo link direto do exemplo', async () => {
    ler.mockResolvedValueOnce({ ok: false, motivo: 'sem-permissao', mensagem: 'Loja indisponível.' });
    const negada = await html({ loja: 'fora', exemplo: 'conforme' });
    ler.mockResolvedValueOnce({ ...consulta, loja: null, lojas: [], conexoes: [] });
    const vazia = await html({ exemplo: 'conforme' });
    expect(negada).toContain('Loja indisponível');
    expect(vazia).toContain('Nenhuma loja disponível');
    for (const tela of [negada, vazia]) expect(tela).not.toMatch(/R\$|Loja fictícia|data:application\/gzip|Ver exemplo/);
  });
});
