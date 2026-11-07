import { describe, expect, it, vi } from 'vitest';
import { criarBuscaClassificacao } from '@/components/erp/telas/fichas/busca-classificacao-estado';
import type { AcaoBuscarClassificacao, PaginaDeClassificacao, RegistroDeClassificacao, ResultadoBuscaClassificacao } from '@/lib/erp/ficha-secoes-campos';

const registro = (n: number): RegistroDeClassificacao => ({ nivel: 'secao', registro: { id: `s${n}`, nome: `Seção ${n}`, ativa: true, versao: '2026-11-06T12:00:00.000Z' } });
const pagina = (itens: RegistroDeClassificacao[], proximoCursor: string | null = null, selecionados: RegistroDeClassificacao[] = []): PaginaDeClassificacao => ({ itens, proximoCursor, selecionados });
const ok = (p: PaginaDeClassificacao): ResultadoBuscaClassificacao => ({ ok: true, pagina: p });
function pendente() { let resolver!: (r: ResultadoBuscaClassificacao) => void; let rejeitar!: (e: Error) => void; const promessa = new Promise<ResultadoBuscaClassificacao>((resolve, reject) => { resolver = resolve; rejeitar = reject; }); return { promessa, resolver, rejeitar }; }

describe('3A busca assíncrona usada pelo seletor e gestão', () => {
  it('resposta antiga não substitui texto mais novo nem seu estado de carregamento', async () => {
    const velha = pendente(), nova = pendente();
    const buscar = vi.fn<AcaoBuscarClassificacao>().mockReturnValueOnce(velha.promessa).mockReturnValueOnce(nova.promessa);
    const c = criarBuscaClassificacao(buscar, { contexto: 'formulario', nivel: 'secao' });
    const a = c.buscar('pr'), b = c.buscar('pratos');
    velha.resolver(ok(pagina([registro(1)]))); await a;
    expect(c.estado()).toMatchObject({ carregando: true, pagina: { itens: [] } });
    nova.resolver(ok(pagina([registro(2)]))); await b;
    expect(c.estado()).toMatchObject({ carregando: false, erro: '', pagina: { itens: [registro(2)] } });
    expect(buscar.mock.calls.map(([p]) => p.q)).toEqual(['pr', 'pratos']);
  });
  it('erro tardio de uma busca anterior não apaga sucesso nem produz aviso falso', async () => {
    const velha = pendente();
    const buscar = vi.fn<AcaoBuscarClassificacao>().mockReturnValueOnce(velha.promessa).mockResolvedValueOnce(ok(pagina([registro(9)])));
    const c = criarBuscaClassificacao(buscar, { contexto: 'filtro', nivel: 'secao' });
    const antes = c.buscar('antiga'); await c.buscar('nova'); velha.rejeitar(new Error('atrasada')); await antes;
    expect(c.estado()).toMatchObject({ erro: '', carregando: false, pagina: { itens: [registro(9)] } });
  });
  it('trocar pai/desmontar invalida pedidos pendentes; não entrega filhos antigos ao consumidor', async () => {
    const p = pendente(); const buscar = vi.fn<AcaoBuscarClassificacao>().mockReturnValue(p.promessa);
    const c = criarBuscaClassificacao(buscar, { contexto: 'formulario', nivel: 'subsecao', secaoId: 'paiA' });
    const ouvir = vi.fn(); const parar = c.observar(ouvir); const chamada = c.buscar('');
    c.invalidar(); parar(); const notificacoes = ouvir.mock.calls.length;
    p.resolver(ok(pagina([{ nivel: 'subsecao', registro: { id: 'filhoA', nome: 'Filho', ativa: true, versao: 'v1', secaoId: 'paiA', secaoAtiva: true } }]))); await chamada;
    expect(ouvir).toHaveBeenCalledTimes(notificacoes);
    expect(c.estado().pagina.itens).toEqual([]);
    const semPai = criarBuscaClassificacao(buscar, { contexto: 'formulario', nivel: 'subsecao' });
    await semPai.buscar(''); expect(buscar).toHaveBeenCalledTimes(1);
  });
  it('acumula mais de 200 opções, sem duplicar borda da página ou perder impacto da gestão', async () => {
    const buscar = vi.fn<AcaoBuscarClassificacao>(async (pedido) => {
      const inicio = pedido.cursor ? Number(pedido.cursor.slice(1)) + 1 : 0;
      const itens = Array.from({ length: 50 }, (_, i) => registro(inicio + i));
      return ok({ ...pagina(itens, inicio < 200 ? `s${inicio + 49}` : null), impacto: Object.fromEntries(itens.map((r) => [r.registro.id, { fichas: inicio, subsecoes: 0 }])) });
    });
    const c = criarBuscaClassificacao(buscar, { contexto: 'gestao', nivel: 'secao' });
    await c.buscar(''); for (let i = 0; i < 4; i++) await c.carregarMais();
    expect(c.estado().pagina.itens).toHaveLength(250);
    expect(new Set(c.estado().pagina.itens.map((r) => r.registro.id)).size).toBe(250);
    expect(c.estado().pagina.impacto?.s0).toEqual({ fichas: 0, subsecoes: 0 });
    expect(c.estado().pagina.impacto?.s249).toEqual({ fichas: 200, subsecoes: 0 });
    expect(c.estado().pagina.proximoCursor).toBeNull();
    await c.carregarMais(); expect(buscar).toHaveBeenCalledTimes(5);
  });
  it('seleção fora da página fica fixada enquanto busca e erro permitem tentar novamente', async () => {
    const p = pendente(); const escolhida = registro(1000);
    const buscar = vi.fn<AcaoBuscarClassificacao>().mockReturnValueOnce(p.promessa).mockResolvedValueOnce(ok(pagina([registro(2)], null, [escolhida])));
    const c = criarBuscaClassificacao(buscar, { contexto: 'formulario', nivel: 'secao', selecionados: ['s1000'] }, pagina([registro(1)], null, [escolhida]));
    const primeira = c.buscar('prato');
    expect(c.estado().pagina.selecionados).toEqual([escolhida]);
    p.resolver({ ok: false, erro: 'A sessão mudou.' }); await primeira;
    expect(c.estado()).toMatchObject({ carregando: false, erro: 'A sessão mudou.' });
    await c.recarregar();
    expect(buscar.mock.lastCall?.[0]).toMatchObject({ q: 'prato', selecionados: ['s1000'] });
    expect(c.estado()).toMatchObject({ erro: '', pagina: { selecionados: [escolhida], itens: [registro(2)] } });
  });
  it('não repete pedido de próxima página enquanto ela está em voo', async () => {
    const p = pendente(); const buscar = vi.fn<AcaoBuscarClassificacao>().mockReturnValueOnce(p.promessa);
    const c = criarBuscaClassificacao(buscar, { contexto: 'filtro', nivel: 'secao' }, pagina([registro(1)], 's1'));
    const mais = c.carregarMais(); await c.carregarMais(); expect(buscar).toHaveBeenCalledTimes(1);
    p.resolver(ok(pagina([registro(1), registro(2)]))); await mais;
    expect(c.estado().pagina.itens.map((r) => r.registro.id)).toEqual(['s1', 's2']);
  });
});
