import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextoDoParceiro } from '@/lib/erp/contexto-base';
import { moduloLiberado } from '@/lib/erp/liberacao';
import { ALCANCE_FLOWFOODS } from '@/lib/erp/permissoes';
import { registrarFontesFinancial } from '@/lib/integracoes/core/fontes-financial';
import { receberPacoteFinancial } from '@/lib/integracoes/core/fontes-financial-http';

vi.mock('@/lib/erp/liberacao', () => ({ moduloLiberado: vi.fn() }));
vi.mock('@/lib/integracoes/core/fontes-financial', () => ({ registrarFontesFinancial: vi.fn() }));
const origem = 'https://erp.example';
const url = origem + '/rodolfo/integracoes/sintetico/financial/fontes?loja=loj&conexao=con&competencia=2024-02';
const ctx = { alcance: ALCANCE_FLOWFOODS, podeEscrever: true, bloqueio: null, parceiro: { status: 'ATIVO', slug: 'sintetico' }, cliente: {} } as ContextoDoParceiro;
const registrar = vi.mocked(registrarFontesFinancial);
const liberar = vi.mocked(moduloLiberado);

function partes() {
  const form = new FormData();
  form.append('arquivo', new Blob(['csv de teste']), 'arquivo.gz');
  form.append('manifesto', new Blob(['{}']), 'manifesto.json');
  return form;
}
function requisicao(body: BodyInit = partes(), destino = url, headers: Record<string, string> = {}) {
  return new Request(destino, { method: 'POST', headers: { origin: origem, ...headers }, body });
}

describe('recebimento HTTP das fontes mensais', () => {
  beforeEach(() => { vi.resetAllMocks(); liberar.mockResolvedValue(true); });

  it('encaminha os bytes e o recorte de loja, conexão e mês e recupera o mesmo recibo no reenvio', async () => {
    for (const reenvio of [false, true]) {
      registrar.mockResolvedValueOnce({ ok: true, reciboId: 'recibo-fixture', reenvio });
      const r = await receberPacoteFinancial(requisicao(), ctx, origem);
      expect(r.status).toBe(reenvio ? 200 : 201);
      expect(await r.json()).toEqual({ reciboId: 'recibo-fixture', reenvio });
      expect(r.headers.get('cache-control')).toBe('no-store');
    }
    expect(registrar).toHaveBeenCalledWith(ctx, { lojaId: 'loj', conexaoId: 'con', competencia: '2024-02',
      arquivoGzip: new TextEncoder().encode('csv de teste'), manifestoJson: new TextEncoder().encode('{}') });
  });

  it('exige sessão de escrita da central, a origem do ERP e a liberação de integração', async () => {
    expect((await receberPacoteFinancial(requisicao(), null, origem)).status).toBe(401);
    for (const acesso of [{ ...ctx, podeEscrever: false }, { ...ctx, bloqueio: 'suspenso' },
      { ...ctx, alcance: { ...ctx.alcance, nivel: 'REDE' as const } }])
      expect((await receberPacoteFinancial(requisicao(), acesso, origem)).status).toBe(403);
    expect((await receberPacoteFinancial(requisicao(partes(), url, { origin: 'https://outra.example' }), ctx, origem)).status).toBe(403);
    liberar.mockResolvedValue(false);
    expect((await receberPacoteFinancial(requisicao(), ctx, origem)).status).toBe(403);
    expect(registrar).not.toHaveBeenCalled();
  });

  it('recusa filtro ambíguo, tipo incorreto, parte ausente, duplicada ou grande antes de registrar', async () => {
    expect((await receberPacoteFinancial(requisicao(partes(), url + '&loja=outra'), ctx, origem)).status).toBe(400);
    expect((await receberPacoteFinancial(requisicao('{}'), ctx, origem)).status).toBe(415);
    for (const modo of ['ausente', 'duplicada', 'tipo', 'vazia', 'grande']) {
      const f = partes();
      if (modo === 'ausente') f.delete('manifesto');
      if (modo === 'duplicada') f.append('arquivo', new Blob(['outro']), 'outro.gz');
      if (modo === 'tipo') f.set('manifesto', 'texto');
      if (modo === 'vazia') f.set('manifesto', new Blob([]), 'vazio.json');
      if (modo === 'grande') f.set('arquivo', new Blob([new Uint8Array(2 * 1024 * 1024 + 1)]), 'grande.gz');
      expect((await receberPacoteFinancial(requisicao(f), ctx, origem)).status).toBe(modo === 'grande' ? 413 : 400);
    }
    expect((await receberPacoteFinancial(requisicao(partes(), url, { 'content-length': '9000000' }), ctx, origem)).status).toBe(413);
    expect(registrar).not.toHaveBeenCalled();
  });

  it('devolve a recusa da conferência sem expor o conteúdo transmitido', async () => {
    registrar.mockResolvedValue({ ok: false, motivo: 'pacote-invalido', mensagem: 'Arquivo incompatível.' });
    const r = await receberPacoteFinancial(requisicao(), ctx, origem);
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({ mensagem: 'Arquivo incompatível.' });
  });

  it('encaminha o POST nativo ao histórico ou ao erro do formulário por GET, inclusive antes da hidratação', async () => {
    const nativo = () => requisicao(partes(), url, { accept: 'text/html,application/xhtml+xml,*/*;q=0.8' });
    for (const reenvio of [false, true]) {
      registrar.mockResolvedValueOnce({ ok: true, reciboId: 'recibo-fixture', reenvio });
      const r = await receberPacoteFinancial(nativo(), ctx, origem);
      expect(r.status).toBe(303);
      expect(r.headers.get('location')).toBe('/rodolfo/integracoes/sintetico/financial?loja=loj&competencia=2024-02&conexao=con&recibo=recibo-fixture#recibo-recibo-fixture');
    }
    registrar.mockResolvedValueOnce({ ok: false, motivo: 'pacote-invalido', mensagem: 'Arquivo incompatível.' });
    const erro = await receberPacoteFinancial(nativo(), ctx, origem);
    expect(erro.status).toBe(303);
    expect(erro.headers.get('location')).toBe('/rodolfo/integracoes/sintetico/financial?loja=loj&competencia=2024-02&conexao=con&erroEnvio=422#aviso-envio');
    expect((await receberPacoteFinancial(nativo(), null, origem)).headers.get('location')).toBe('/rodolfo/login');
  });

  it.each(['application/json', 'application/json, text/html;q=0', 'text/html;q=0.1, application/json;q=0.9', '*/*'])(
    'preserva o contrato JSON quando HTML não tem preferência (%s)', async accept => {
      registrar.mockResolvedValue({ ok: true, reciboId: 'recibo-fixture', reenvio: true });
      const r = await receberPacoteFinancial(requisicao(partes(), url, { accept }), ctx, origem);
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ reciboId: 'recibo-fixture', reenvio: true });
    });
});
