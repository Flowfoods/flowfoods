import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Alcance, Permissao } from '@/lib/erp/permissoes';
import { ErroDeRelatorio, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { lerConferenciaFinancial } from '@/lib/integracoes/core/conferencia-financial';

const contexto = { parceiroId: 'parceiro-a', homologacaoDeIntegracao: false };
const permissoes: Permissao[] = ['integracao.ver', 'faturamento.ver'];
const acesso = (perms = permissoes, lojas: Alcance['lojas'] = ['loja-a']): Alcance => ({
  nivel: lojas === 'todas' ? 'REDE' : 'LOJA', permissoes: new Set(perms), lojas,
});

function clienteDeTeste() {
  const loja = { id: 'loja-a', nome: 'Loja sintética' };
  const consultarLojas = vi.fn(async () => [loja]);
  const consultarConexoes = vi.fn(async () => [{
    id: 'c1', nomeExterno: 'Vínculo sintético', estado: 'ATIVA', ambiente: 'PRODUCAO', modulos: [{ estado: 'ATIVO' }],
  }]);
  const liberacao = vi.fn(async () => ({ liberado: true }));
  const sql = vi.fn(async () => [{ repetivel: true, leitura: true }]);
  const tx = {
    parceiroId: contexto.parceiroId, somenteLeitura: true,
    loja: { findMany: consultarLojas }, integracaoConexao: { findMany: consultarConexoes }, liberacaoDeModulo: { findUnique: liberacao }, sql,
  } as unknown as ClienteDoParceiro;
  const transacao = vi.fn(async <T>(fn: (c: ClienteDoParceiro) => Promise<T>) => fn(tx));
  return { cliente: { ...tx, transacao } as ClienteDoParceiro, transacao, consultarLojas, consultarConexoes, liberacao, sql, loja };
}

afterEach(() => vi.useRealTimers());

describe('conferência mensal Financial · leitura por loja', () => {
  it.each([['integracao.ver'], ['faturamento.ver'], ['dre.ver'], []] as Permissao[][])(
    'exige Integração e Faturamento, inclusive para a consulta direta (%j)', async (...perms) => {
      const m = clienteDeTeste();
      expect(await lerConferenciaFinancial(m.cliente, acesso(perms), contexto)).toMatchObject({ ok: false, motivo: 'sem-permissao' });
      expect(m.transacao).not.toHaveBeenCalled();
    },
  );

  it('recusa contexto de outro parceiro antes de consultar os vínculos', async () => {
    const m = clienteDeTeste();
    expect(await lerConferenciaFinancial(m.cliente, acesso(), { ...contexto, parceiroId: 'parceiro-b' })).toMatchObject({ ok: false, motivo: 'contexto-invalido' });
    expect(m.transacao).not.toHaveBeenCalled();
  });

  it.each([
    { competencia: ['2026-02', '2026-02'] }, { competencia: '' }, { competencia: '2026-13' }, { competencia: '26-02' },
    { competencia: '0000-02' }, { competencia: '2026-02-01' }, { competencia: '2026-02 ' }, { competencia: null },
    { lojaId: ['loja-a', 'loja-a'] }, { lojaId: null }, { lojaId: '' }, { lojaId: ' loja-a' }, { lojaId: 'a'.repeat(129) },
  ])('não usa valor padrão quando o parâmetro informado é inválido (%j)', async entrada => {
    const m = clienteDeTeste();
    expect(await lerConferenciaFinancial(m.cliente, acesso(), contexto, entrada)).toMatchObject({ ok: false, motivo: 'filtro-invalido' });
    expect(m.transacao).not.toHaveBeenCalled();
  });

  it('ao omitir filtros, escolhe loja autorizada e mês civil de São Paulo na virada do ano', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-01T02:59:59.999Z'));
    const m = clienteDeTeste();
    expect(await lerConferenciaFinancial(m.cliente, acesso(), contexto)).toMatchObject({ ok: true, loja: m.loja, competencia: '2026-12' });
    vi.setSystemTime(new Date('2027-01-01T03:00:00Z'));
    expect(await lerConferenciaFinancial(m.cliente, acesso(), contexto)).toMatchObject({ ok: true, competencia: '2027-01' });
  });

  it('loja fora do alcance, inexistente ou de outro parceiro dá a mesma recusa, sem listar vínculos', async () => {
    const m = clienteDeTeste();
    const entrada = { lojaId: 'desconhecida', competencia: '2026-02' };
    const negado = await lerConferenciaFinancial(m.cliente, acesso(), contexto, entrada);
    expect(m.transacao).not.toHaveBeenCalled();
    expect(negado).toMatchObject({ ok: false, motivo: 'sem-permissao' });
    expect(await lerConferenciaFinancial(m.cliente, acesso(permissoes, 'todas'), contexto, entrada)).toEqual(negado);
    expect(m.consultarConexoes).not.toHaveBeenCalled();
  });

  it('sem liberação do módulo ou sem fotografia de leitura, não lista nomes de lojas', async () => {
    const m = clienteDeTeste();
    m.liberacao.mockResolvedValueOnce({ liberado: false });
    expect(await lerConferenciaFinancial(m.cliente, acesso(), contexto)).toMatchObject({ ok: false, motivo: 'nao-liberado' });
    m.sql.mockResolvedValueOnce([{ repetivel: false, leitura: true }]);
    expect(await lerConferenciaFinancial(m.cliente, acesso(), contexto)).toMatchObject({ ok: false, motivo: 'leitura-indisponivel' });
    m.sql.mockRejectedValueOnce(new ErroDeRelatorio('ocupado'));
    expect(await lerConferenciaFinancial(m.cliente, acesso(), contexto)).toMatchObject({ ok: false, motivo: 'leitura-indisponivel' });
    expect(m.consultarLojas).not.toHaveBeenCalled();
    expect(m.consultarConexoes).not.toHaveBeenCalled();
  });

  it('carrega somente o cadastro Financial da loja, sem inferir movimento de um módulo ativo', async () => {
    const m = clienteDeTeste();
    const resultado = await lerConferenciaFinancial(m.cliente, acesso(), contexto, { lojaId: m.loja.id, competencia: '2026-02' });
    expect(m.transacao).toHaveBeenCalledWith(expect.any(Function), { repetivel: true, relatorio: {} });
    expect(m.consultarLojas).toHaveBeenCalledWith(expect.objectContaining({
      where: { parceiroId: contexto.parceiroId, id: { in: [m.loja.id] } }, select: { id: true, nome: true },
    }));
    expect(m.consultarConexoes).toHaveBeenCalledWith(expect.objectContaining({
      where: { parceiroId: contexto.parceiroId, lojaId: m.loja.id, provedor: 'IFOOD' },
      select: { id: true, nomeExterno: true, estado: true, ambiente: true, modulos: { where: { modulo: 'FINANCIAL' }, select: { estado: true } } },
    }));
    expect(resultado).toEqual({
      ok: true, lojas: [m.loja], loja: m.loja, competencia: '2026-02', ambiente: 'PRODUCAO',
      conexoes: [{ id: 'c1', nome: 'Vínculo sintético', estado: 'ATIVA', estadoFinancial: 'ATIVO' }], fonteMensal: 'SEM_DADOS',
    });
  });

  it('recusa ambiente divergente e distingue o vínculo TEST sem módulo Financial', async () => {
    const m = clienteDeTeste();
    const teste = { ...contexto, homologacaoDeIntegracao: true };
    expect(await lerConferenciaFinancial(m.cliente, acesso(), teste)).toMatchObject({ ok: false, motivo: 'contexto-invalido' });
    m.consultarConexoes.mockResolvedValueOnce([{ id: 'c2', nomeExterno: 'Teste', estado: 'DESLIGADA', ambiente: 'TEST', modulos: [] }]);
    expect(await lerConferenciaFinancial(m.cliente, acesso(), teste)).toMatchObject({
      ok: true, ambiente: 'TEST', fonteMensal: 'SEM_DADOS', conexoes: [{ id: 'c2', estado: 'DESLIGADA', estadoFinancial: null }],
    });
  });

  it('sem loja no alcance retorna seleção vazia, sem dados de outra loja ou consulta de vínculo', async () => {
    const m = clienteDeTeste();
    m.consultarLojas.mockResolvedValueOnce([]);
    expect(await lerConferenciaFinancial(m.cliente, acesso(permissoes, []), contexto)).toMatchObject({
      ok: true, lojas: [], loja: null, conexoes: [], fonteMensal: 'SEM_DADOS',
    });
    expect(m.consultarConexoes).not.toHaveBeenCalled();
  });
});
