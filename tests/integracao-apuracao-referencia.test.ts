import { gzipSync } from 'node:zlib';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ApuracaoReferenciaPage from '@/app/rodolfo/(painel)/integracoes/apps/[id]/financial/page';
import { POST } from '@/app/rodolfo/(painel)/integracoes/apps/[id]/financial/conferir/route';

const m = vi.hoisted(() => ({ sessao: vi.fn(), exigirNivel1: vi.fn(), app: vi.fn() }));
vi.mock('next-auth', () => ({ getServerSession: m.sessao }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('404'); } }));
vi.mock('@/lib/erp/contexto', () => ({ exigirNivel1: m.exigirNivel1 }));
vi.mock('@/lib/db', () => ({ prisma: { integracaoApp: { findFirst: m.app } } }));
vi.mock('@/lib/erp/sessao', () => ({ origemDoSite: async () => 'https://erp.example' }));
vi.mock('@/lib/rodolfo/auth', () => ({ authOptions: {} }));

const props = { params: Promise.resolve({ id: 'app-de-ensaio' }) };
const app = { id: 'app-de-ensaio', nome: 'Aplicativo de referência', clientId: 'client-publico-sintetico' };
const loja = 'dddddddd-3333-4444-8888-eeeeeeeeeeee';
const origem = 'https://erp.example';
const req = (body: FormData | null = null, origin = origem) => new Request(origem, { method: 'POST', body, headers: { origin } });

function formulario() {
  const form = new FormData();
  const inicio = '2024-02-05', fim = '2024-02-11';
  form.set('competencia', '2024-02'); form.set('inicio', inicio); form.set('fim', fim);
  const csv = 'loja_id;competencia;data_apuracao_inicio;data_apuracao_fim;valor;impacto_no_repasse\n'
    + [loja, '2024-02', inicio, fim, '-2.75', 'SIM'].join(';');
  form.set('conciliacao', new Blob([Uint8Array.from(gzipSync(csv))]), 'csv.txt');
  const registro = { amount: { value: -2.75 }, hasTransferImpact: true, competence: '2024-02',
    period: { beginDate: inicio, endDate: fim }, receiver: { merchantId: loja }, reference: { id: 'privado-sintetico' } };
  form.set('eventos', new Blob([JSON.stringify({ page: 1, size: 10, hasNextPage: false, financialEvents: [registro] })]), 'evento.txt');
  form.set('liquidacao', new Blob([JSON.stringify({ merchantId: loja, beginDate: inicio, endDate: fim, balance: -2.75, settlements: [] })]), 'saldo.txt');
  return form;
}

describe('acesso à apuração de referência', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.sessao.mockResolvedValue({ user: { id: 'admin' } });
    m.app.mockResolvedValue(app);
  });
  it('mostra o modo e o Client ID cadastrado, sem loja operacional selecionada nem resultado automático', async () => {
    const html = renderToStaticMarkup(await ApuracaoReferenciaPage(props));
    expect(m.exigirNivel1).toHaveBeenCalledOnce();
    expect(m.app).toHaveBeenCalledWith({ where: { id: app.id, provedor: 'IFOOD', ambiente: 'TEST', categoria: 'TEST',
      modulos: { has: 'FINANCIAL' } }, select: { id: true, nome: true, clientId: true } });
    for (const texto of ['TEST', 'Sem consulta ao vivo', 'Client ID', app.clientId, 'Conferir apuração', 'Financial Events', 'Settlements']) expect(html).toContain(texto);
    expect(html).not.toMatch(/R\$|privado-sintetico|Valores conferem/);
    m.app.mockResolvedValue(null);
    await expect(ApuracaoReferenciaPage(props)).rejects.toThrow('404');
  });
  it('a sessão administrativa precede resolução do aplicativo, inclusive na URL direta', async () => {
    m.exigirNivel1.mockRejectedValue(new Error('login'));
    await expect(ApuracaoReferenciaPage(props)).rejects.toThrow('login');
    m.sessao.mockResolvedValue(null);
    expect((await POST(req(), props)).status).toBe(401);
    expect(m.app).not.toHaveBeenCalled();
  });
  it('revalida app e origem antes de ler o corpo e recusa um cadastro desabilitado depois da abertura', async () => {
    expect((await POST(req(null, 'https://outra.example'), props)).status).toBe(403);
    expect(m.app).not.toHaveBeenCalled();
    m.app.mockResolvedValue(null);
    const pedido = req(formulario());
    expect((await POST(pedido, props)).status).toBe(403);
    expect(pedido.bodyUsed).toBe(false);
    expect(m.app.mock.calls[0][0].where).toEqual({ id: app.id, provedor: 'IFOOD', ambiente: 'TEST', categoria: 'TEST', modulos: { has: 'FINANCIAL' } });
  });
  it('lê os três arquivos identificados pelo conteúdo, sem aceitar números ou Client ID do navegador', async () => {
    const resposta = await POST(req(formulario()), props);
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('Cache-Control')).toBe('no-store');
    const dto = await resposta.json();
    expect(dto).toMatchObject({ app: { clientId: app.clientId, ambiente: 'TEST' }, origem: 'ARQUIVOS_APRESENTADOS',
      apuracao: { saldosIguais: true, mesmaComposicao: true, somas: { eventosCentavos: '-275' } } });
    expect(JSON.stringify(dto)).not.toMatch(/privado-sintetico|dddddddd|\.txt/);
    for (const [campo, valor] of [['soma', '100'], ['clientId', 'do-navegador'], ['inicio', '2024-02-05']]) {
      const form = formulario(); form.append(campo, valor);
      expect((await POST(req(form), props)).status).toBe(400);
    }
  });
  it('interrompe envio ausente, truncado ou maior que o limite, sem ecoar a fonte', async () => {
    const form = formulario(); form.delete('eventos');
    expect((await POST(req(form), props)).status).toBe(400);
    form.set('eventos', new Blob(['privado-sintetico']), 'p.txt');
    const invalido = await POST(req(form), props);
    expect(invalido.status).toBe(422);
    expect(await invalido.text()).not.toContain('privado-sintetico');
    form.set('eventos', new Blob([new Uint8Array(2 * 1024 * 1024 + 1)]), 'p.txt');
    expect((await POST(req(form), props)).status).toBe(413);
  });
});
