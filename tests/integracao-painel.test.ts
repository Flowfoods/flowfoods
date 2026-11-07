import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/erp/liberacao', () => ({ moduloLiberado: vi.fn(async () => true) }));
import { moduloLiberado } from '@/lib/erp/liberacao';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import type { Alcance, Permissao } from '@/lib/erp/permissoes';
import { lerPainelAnalytics } from '@/lib/integracoes/core/painel-analytics';

const id = '12345678-abcd-abcd-abcd-123456789abc', outro = '12345678-abcd-abcd-abcd-123456789abd';
const dia = '2026-10-19', contexto = { parceiroId: 'p1', homologacaoDeIntegracao: false };
const acesso = (permissoes: Permissao[] = ['integracao.ver', 'faturamento.ver']): Alcance => ({ nivel: 'LOJA', lojas: ['l1'], permissoes: new Set(permissoes) });
const entrada = { lojaId: 'l1', inicio: dia, fim: dia };
const conexao = (merchant = id, modulo = 'm1') => ({ id: `c-${modulo}`, lojaId: 'l1', idExterno: merchant, nomeExterno: 'Fonte autorizada', ambiente: 'PRODUCAO', estado: 'ATIVA', marca: null, modulos: [{ id: modulo }] });
const versao = (p: Record<string, unknown> = {}) => ({ id: 'snapshot-interno', moduloId: 'm1', dia, fuso: 'America/Sao_Paulo', unidade: 'REAL', situacao: 'PUBLICADO', geracao: 1, vazioOficial: false, criadoEm: new Date('2026-10-20T03:00:00Z'), ...p });
function fixture() {
  const consultas: string[] = [];
  const estado = { repetivel: true, leitura: true, conexoes: [conexao()], versoes: [versao()], conflitos: [] as Array<{ merchant: string }>,
    linhas: [{ dia, orderStatus: 'CONCLUDED', salesChannel: 'IFOOD', deliveredBy: 'IFOOD_DELIVERY', pedidos: '3', gmv: '1000', gmvSemEntrega: '900' }] };
  const tx = { parceiroId: 'p1', somenteLeitura: true,
    loja: { findMany: vi.fn(async () => [{ id: 'l1', nome: 'Loja autorizada' }]) },
    integracaoConexao: { findMany: vi.fn(async () => estado.conexoes) },
    sql: vi.fn(async (partes: TemplateStringsArray) => {
      const sql = partes.join('?'); consultas.push(sql);
      if (sql.includes('current_setting')) return [{ repetivel: estado.repetivel, leitura: estado.leitura }];
      if (sql.includes('SELECT DISTINCT c.')) return estado.conflitos;
      if (sql.includes('DISTINCT ON')) return estado.versoes;
      if (sql.includes('FROM "KpiIfoodDia"')) return estado.linhas;
      throw new Error('Consulta não reconhecida.');
    }),
  };
  const transacao = vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx));
  return { estado, tx, transacao, consultas, cliente: { parceiroId: 'p1', transacao } as unknown as ClienteDoParceiro };
}
beforeEach(() => vi.mocked(moduloLiberado).mockReset().mockResolvedValue(true));
describe('Painel Analytics · gates e projeção do leitor', () => {
  it.each(([[], ['integracao.ver'], ['faturamento.ver']] as Permissao[][]).map(permissoes => ({ permissoes })))('ambas permissões obrigatórias: $permissoes', async ({ permissoes }) => {
    const f = fixture(); expect(await lerPainelAnalytics(f.cliente, acesso(permissoes), contexto, entrada)).toMatchObject({ ok: false, motivo: 'sem-permissao' });
    expect(f.transacao).not.toHaveBeenCalled();
  });
  it('contexto/loja forjados recusam antes de qualquer transação; liberação antes de loja', async () => {
    const f = fixture();
    expect(await lerPainelAnalytics(f.cliente, acesso(), { ...contexto, parceiroId: 'outro' }, entrada)).toMatchObject({ motivo: 'contexto-invalido' });
    expect(await lerPainelAnalytics(f.cliente, acesso(), contexto, { ...entrada, lojaId: 'l2' })).toMatchObject({ motivo: 'sem-permissao' });
    expect(f.transacao).not.toHaveBeenCalled();
    vi.mocked(moduloLiberado).mockResolvedValue(false);
    expect(await lerPainelAnalytics(f.cliente, acesso(), contexto, entrada)).toMatchObject({ motivo: 'nao-liberado' });
    expect(f.tx.loja.findMany).not.toHaveBeenCalled();
  });
  it.each([{ repetivel: false, leitura: true }, { repetivel: true, leitura: false }])('nested inadequado falha fechado %j', async settings => {
    const f = fixture(); Object.assign(f.estado, settings);
    expect(await lerPainelAnalytics(f.cliente, acesso(), contexto, entrada)).toMatchObject({ motivo: 'leitura-indisponivel' });
    expect(f.tx.loja.findMany).not.toHaveBeenCalled(); expect(moduloLiberado).not.toHaveBeenCalled();
  });
  it('perfil financeiro autorizado recebe DTO sem ids de execução/snapshot nem raw', async () => {
    const f = fixture(); const r = await lerPainelAnalytics(f.cliente, acesso(), contexto, entrada);
    expect(r).toMatchObject({ ok: true, painel: { cobertura: { completa: true, paresCobertos: 1 }, resumo: { indicadores: { gmv: { valor: '1000' } } } } });
    expect(f.transacao).toHaveBeenCalledWith(expect.any(Function), { repetivel: true, relatorio: {} });
    expect(JSON.stringify(r)).not.toMatch(/snapshot-interno|corpoOriginal|execucaoId|appId|leaseAte|requestId/);
    expect(f.consultas.filter(s => s.includes('KpiIfoodDia'))).toHaveLength(1);
    expect(f.consultas.find(s => s.includes('KpiIfoodDia'))).toContain('count(k.gmv) = count(*)');
  });
  it('pendente nova conserva PUBLICADO anterior; ausência não vira zero', async () => {
    const f = fixture(); f.estado.versoes.push(versao({ id: 'pendente', situacao: 'PENDENTE_PERIODO', geracao: 2 }));
    expect(await lerPainelAnalytics(f.cliente, acesso(), contexto, entrada)).toMatchObject({ painel: { cobertura: { completa: true, dias: [{ fontes: [{ estado: 'publicado', revisaoPendente: true }] }] } } });
    f.estado.versoes = []; f.consultas.length = 0;
    expect(await lerPainelAnalytics(f.cliente, acesso(), contexto, entrada)).toMatchObject({ painel: { resumo: { indicadores: { pedidos: { estado: 'sem-dado', motivo: 'cobertura-parcial' } } } } });
    expect(f.consultas.some(s => s.includes('KpiIfoodDia'))).toBe(false);
  });
  it('um merchant ausente impede total da loja; seleção explícita coberta é legítima', async () => {
    const f = fixture(); f.estado.conexoes.push(conexao(outro, 'm2'));
    expect(await lerPainelAnalytics(f.cliente, acesso(), contexto, entrada)).toMatchObject({ painel: { cobertura: { paresEsperados: 2, paresCobertos: 1, completa: false }, resumo: { indicadores: { gmv: { estado: 'sem-dado' } } } } });
    expect(await lerPainelAnalytics(f.cliente, acesso(), contexto, { ...entrada, merchants: [id, id] })).toMatchObject({ painel: { cobertura: { paresEsperados: 1, completa: true } } });
  });
  it('um dia incompleto não apaga o dia completo da série', async () => {
    const f = fixture();
    expect(await lerPainelAnalytics(f.cliente, acesso(), contexto, { ...entrada, fim: '2026-10-20' })).toMatchObject({ painel: { cobertura: { diasCompletos: 1, completa: false },
      serie: [{ dia, completo: true, indicadores: { pedidos: { valor: '3' } } }, { dia: '2026-10-20', completo: false, indicadores: { pedidos: { estado: 'sem-dado' } } }] } });
  });
  it.each(['duplicado', 'outra-loja'])('ambiguidade %s não seleciona nem soma uma origem arbitrária', async modo => {
    const f = fixture(); if (modo === 'duplicado') f.estado.conexoes.push(conexao(id, 'm2')); else f.estado.conflitos.push({ merchant: id });
    expect(await lerPainelAnalytics(f.cliente, acesso(), contexto, entrada)).toMatchObject({ painel: { cobertura: { completa: false, dias: [{ fontes: [{ estado: 'vinculo-ambiguo' }] }] } } });
    expect(f.consultas.some(s => s.includes('KpiIfoodDia'))).toBe(false);
  });
  it('ambiente/fuso incompatíveis não misturam métricas', async () => {
    const f = fixture(); f.estado.conexoes[0].ambiente = 'TEST';
    expect(await lerPainelAnalytics(f.cliente, acesso(), contexto, entrada)).toMatchObject({ motivo: 'contexto-invalido' });
    f.estado.conexoes[0].ambiente = 'PRODUCAO'; f.estado.versoes[0].fuso = 'UTC';
    expect(await lerPainelAnalytics(f.cliente, acesso(), contexto, entrada)).toMatchObject({ painel: { cobertura: { dias: [{ fontes: [{ estado: 'identidade-incompativel' }] }] } } });
  });
  it('merchant forjado é recusado; nenhuma fonte retorna sem-fontes, inclusive TEST sem conexão', async () => {
    const f = fixture();
    expect(await lerPainelAnalytics(f.cliente, acesso(), contexto, { ...entrada, merchants: outro })).toMatchObject({ motivo: 'filtro-invalido' });
    f.estado.conexoes = [];
    expect(await lerPainelAnalytics(f.cliente, acesso(), { ...contexto, homologacaoDeIntegracao: true }, entrada)).toMatchObject({ ambiente: 'TEST', painel: { ambiente: 'TEST', resumo: { indicadores: { pedidos: { motivo: 'sem-fontes' } } } } });
  });
  it('falha de schema não é escondida como ausência de métricas', async () => {
    const f = fixture(); f.tx.loja.findMany.mockRejectedValueOnce(new Error('programação/schema'));
    await expect(lerPainelAnalytics(f.cliente, acesso(), contexto, entrada)).rejects.toThrow('programação/schema');
  });
});
