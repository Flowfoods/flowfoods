import { describe, expect, it, vi } from 'vitest';
import { montarDre } from '@/lib/erp/dre-campos';
import { planoEfetivo } from '@/lib/erp/dre-plano';
import { compararLinhas } from '@/lib/erp/dre-metas-campos';
import { farolDoDre } from '@/lib/erp/farol-dre-campos';
import { resolverAlcance } from '@/lib/erp/permissoes';
import type { DreDoPeriodo } from '@/lib/erp/dre';
import { cmvDaHome, type ContextoDoCmvHome } from '@/lib/erp/home-cmv';

vi.mock('@/lib/erp/dre', () => { throw new Error('Projeção pura não carrega o serviço DRE.'); });
vi.mock('@/lib/erp/dre-metas', () => { throw new Error('Projeção não lê metas atuais.'); });
vi.mock('@/lib/db', () => { throw new Error('Projeção não acessa banco.'); });

const loja = { id: 'lojab', nome: 'Loja B', ativa: true, canais: ['LOJA' as const] };
const alcance = resolverAlcance({ perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
const contexto: ContextoDoCmvHome = { alcance, loja, raiz: '/erp', consultadoEm: '2026-10-30T15:00:00.000Z' };
const linhaCmv = (d: DreDoPeriodo) => d.resultado.linhas.find((l) => l.tipo === 'cmv')!;

function dre(meta: number | null = 3000, valor = 40_000, receita = 100_000, extra: Partial<DreDoPeriodo> = {}): DreDoPeriodo {
  const escopo = { tipo: 'loja', lojaId: loja.id, nome: loja.nome } as const;
  const cmv = { lojas: [{ lojaId: loja.id, lojaNome: loja.nome, compraCentavos: valor, real: null, motivoSemReal: 'estoque não aberto' }], parcial: false };
  const resultado = montarDre({ escopo, plano: planoEfetivo([]), receitas: [{ lojaId: loja.id, canal: 'LOJA', valorCentavos: receita }], despesas: [], taxaIfood: null, cmv });
  const metas = compararLinhas(resultado.linhas, new Map(meta === null ? [] : [['cmv', meta]]), receita, true, null);
  const farol = farolDoDre({ linhas: resultado.linhas, metas, faltasDeFaturamento: 0, recorrentes: [], receitaNaoApurada: false });
  return {
    periodo: { inicio: '2026-09-01', fim: '2026-09-30', nome: 'Setembro de 2026' }, hoje: '2026-10-30', ate: '2026-09-30',
    emCurso: false, encerrado: true, diasDoPeriodo: 30, diaDeHoje: null, diasApurados: 30, status: null,
    escopo, resultado, porLoja: null, faltas: { total: 0 }, faltaLancar: [], taxaConfigurada: false,
    anterior: null, proximo: null, lojasDoEscopo: [loja], metas, anoPassado: null, fechamento: null,
    cmv: { antigo: false, painel: null }, cmvDasLojas: cmv, metaDoCmvDaLoja: 'rede', lojasComMetaPropria: [],
    trocasDeCusto: [], farol, farolAntigo: false, canais: [], ...extra,
  };
}
const adaptar = (d: DreDoPeriodo) => cmvDaHome({ estado: 'lido', dre: d }, contexto)!;
function fechar(d: DreDoPeriodo, versaoDaConta = 5): DreDoPeriodo {
  return { ...d, status: 'FECHADO', metaDoCmvDaLoja: null, fechamento: {
    versao: 3, fotografiaId: 'foto-b', versaoDaConta, fechadoEm: new Date('2026-10-01T15:00:00.000Z'),
    fechadoPorNome: 'Autor privado', ressalvas: [], totalDeRessalvas: 99, justificativa: 'Justificativa privada',
  } };
}
const core = (w: ReturnType<typeof adaptar>) => ({ estado: w.estado, valor: w.valor, percentual: w.percentual, fonte: w.fonteDoCmv,
  referencia: w.referencia, origem: w.origem, cobertura: w.cobertura, detalhe: w.detalhe });

describe('Home · meta/farol da mesma linha CMV, sem consulta ou fórmula', () => {
  it('copia a comparação e o farol canônicos com a origem da meta da rede', () => {
    const d = dre(); const w = adaptar(d); const c = d.metas.cmv;
    expect(w.comparacaoComMeta).toEqual({ estado: 'com_meta', tipo: 'percentual', metaBp: c.metaBp, metaCentavos: c.metaCentavos,
      desvioBp: c.desvioBp, desvioTexto: c.desvioTexto, semComparacao: c.semComparacao, origemDaMeta: 'rede',
      farol: d.farol.porLinha.cmv, versaoDasFaixas: 1, farolAntigo: false });
    expect(w.comparacaoComMeta).toMatchObject({ metaBp: 3000, metaCentavos: 30_000, desvioBp: 1000, farol: { tipo: 'cor', escala: 'custo' } });
  });

  it('não refaz percentuais, valor de meta, desvio ou classificação recebidos', () => {
    const d = dre(); d.metas.cmv.metaCentavos = 31_234; d.metas.cmv.desvioBp = -432; d.metas.cmv.desvioTexto = 'desvio canônico';
    d.farol.porLinha.cmv = { tipo: 'sem', motivo: 'motivo da fonte', desvioTexto: 'texto do farol da fonte' };
    expect(adaptar(d).comparacaoComMeta).toMatchObject({ metaCentavos: 31_234, desvioBp: -432, desvioTexto: 'desvio canônico',
      farol: { tipo: 'sem', motivo: 'motivo da fonte', desvioTexto: 'texto do farol da fonte' } });
  });

  it('meta própria da loja conserva origem; meta ausente não vira meta zero', () => {
    expect(adaptar(dre(3500, 40_000, 100_000, { metaDoCmvDaLoja: 'loja' })).comparacaoComMeta).toMatchObject({ metaBp: 3500, origemDaMeta: 'loja' });
    const sem = adaptar(dre(null));
    expect(sem.comparacaoComMeta).toMatchObject({ estado: 'sem_meta', metaBp: null, metaCentavos: null, desvioBp: null, farol: null });
    expect(sem.avisos).toEqual([]);
    expect(adaptar(dre(0)).comparacaoComMeta).toMatchObject({ estado: 'com_meta', metaBp: 0, metaCentavos: 0, desvioBp: 4000 });
  });

  it('CMV zero preserva o motivo canônico sem lançamento; zero menos zero não cria cor', () => {
    const w = adaptar(dre(0, 0));
    expect(w.valor.valor).toBe(0);
    expect(w.comparacaoComMeta).toMatchObject({ estado: 'com_meta', metaBp: 0, desvioBp: null, semComparacao: 'sem lançamento', farol: { tipo: 'sem', motivo: 'sem lançamento' } });
  });

  it.each([-12_345, 150_000])('preserva realizado/desvio fora de 0–100%% (%s centavos), sem clamp', (valor) => {
    const d = dre(3000, valor); const w = adaptar(d);
    expect(w.valor.valor).toBe(valor);
    expect(w.percentual?.pontosBase).toBe(linhaCmv(d).percentualBp);
    expect(w.comparacaoComMeta?.desvioBp).toBe(d.metas.cmv.desvioBp);
    expect(w.comparacaoComMeta?.farol).toEqual(d.farol.porLinha.cmv);
  });

  it('sem receita e primeiro dia preservam motivo da comparação sem criar percentual', () => {
    const d = dre(3000, 40_000, 0); const w = adaptar(d);
    expect(w.valor.valor).toBe(40_000); expect(w.percentual?.pontosBase).toBeNull();
    expect(w.comparacaoComMeta).toMatchObject({ metaBp: 3000, metaCentavos: null, desvioBp: null, semComparacao: 'sem faturamento' });
    const primeiro = adaptar({ ...d, ate: null, diasApurados: 0, emCurso: true });
    expect(primeiro.valor.valor).toBeNull(); expect(primeiro.comparacaoComMeta?.farol).toEqual(d.farol.porLinha.cmv);
  });

  it('faltas de faturamento mantêm sem cor mesmo quando existe desvio numérico', () => {
    const d = dre(); d.faltas.total = 2;
    d.farol = farolDoDre({ linhas: d.resultado.linhas, metas: d.metas, faltasDeFaturamento: 2, recorrentes: [], receitaNaoApurada: false });
    const w = adaptar(d);
    expect(w.estado).toBe('parcial'); expect(w.comparacaoComMeta?.desvioBp).toBe(1000);
    expect(w.comparacaoComMeta?.farol).toEqual({ tipo: 'sem', motivo: 'faltam lançamentos de faturamento', desvioTexto: d.metas.cmv.desvioTexto });
  });

  it('fotografia conserva sua meta/versão e não lê origem atual de loja ou rede', () => {
    const d = fechar(dre(2500));
    Object.defineProperty(d, 'metaDoCmvDaLoja', { get: () => { throw new Error('Não ler configuração atual.'); } });
    expect(adaptar(d).comparacaoComMeta).toMatchObject({ estado: 'com_meta', metaBp: 2500, origemDaMeta: 'fotografia', versaoDasFaixas: 1 });
  });

  it('farolAntigo não remove a cor CMV válida de fotografia v2: o legado é da receita', () => {
    const d = fechar(dre(3000, 40_000, 100_000, { farolAntigo: true }), 2);
    expect(adaptar(d).comparacaoComMeta).toMatchObject({ farolAntigo: true, origemDaMeta: 'fotografia', farol: { tipo: 'cor' } });
  });

  it('versão desconhecida conserva o motivo sem cor da fonte', () => {
    const d = fechar(dre());
    d.farol = farolDoDre({ linhas: d.resultado.linhas, metas: d.metas, faltasDeFaturamento: 0, recorrentes: [], receitaNaoApurada: false,
      versaoDasFaixas: 999, faixasDesconhecidas: true });
    const w = adaptar(d);
    expect(w.comparacaoComMeta).toMatchObject({ estado: 'com_meta', versaoDasFaixas: 999, farol: { tipo: 'sem', motivo: expect.stringContaining('versão 999') } });
    expect(w.valor.valor).toBe(40_000);
  });

  it('cor contraditória com versão desconhecida vira comparação indisponível sem apagar CMV', () => {
    const d = dre(); const antes = core(adaptar(d)); d.farol.versaoDasFaixas = 999;
    const w = adaptar(d);
    expect(core(w)).toEqual(antes); expect(w.comparacaoComMeta?.estado).toBe('indisponivel');
    expect(w.avisos).toContainEqual({ codigo: 'cmv-comparacao-indisponivel', texto: expect.any(String) });
  });
});

describe('Home · fronteira independente para metadados adversos da comparação', () => {
  it.each(['metas', 'meta', 'metaBp', 'farol', 'porLinha', 'farolDaLinha', 'versao', 'rotulo', 'origem', 'antigo', 'chave'])(
    'getter adverso em %s só indisponibiliza comparação e nunca vaza reason', (caso) => {
      const d = dre(); const esperado = core(adaptar(d));
      const quebra = (obj: object, chave: string) => Object.defineProperty(obj, chave, { get: () => { throw new Error('SQL tenant-privado Loja A segredo'); } });
      if (caso === 'metas') quebra(d, 'metas');
      if (caso === 'meta') quebra(d.metas, 'cmv');
      if (caso === 'metaBp') quebra(d.metas.cmv, 'metaBp');
      if (caso === 'farol') quebra(d, 'farol');
      if (caso === 'porLinha') quebra(d.farol, 'porLinha');
      if (caso === 'farolDaLinha') quebra(d.farol.porLinha, 'cmv');
      if (caso === 'versao') quebra(d.farol, 'versaoDasFaixas');
      if (caso === 'rotulo') quebra(d.farol.porLinha.cmv, 'rotulo');
      if (caso === 'origem') quebra(d, 'metaDoCmvDaLoja');
      if (caso === 'antigo') quebra(d, 'farolAntigo');
      if (caso === 'chave') quebra(linhaCmv(d), 'chave');
      const w = adaptar(d);
      expect(core(w)).toEqual(esperado);
      expect(w.comparacaoComMeta).toMatchObject({ estado: 'indisponivel', metaBp: null, metaCentavos: null, desvioBp: null, farol: null });
      expect(JSON.stringify(w)).not.toMatch(/SQL|tenant-privado|Loja A|segredo/);
    },
  );

  it.each(['null', 'array', 'tipo', 'NaN', 'undefined', 'sem-farol', 'origem-invalida'])(
    'estrutura %s não derruba o CMV nem inventa meta', (caso) => {
      const d = dre(); const antes = core(adaptar(d));
      if (caso === 'null') d.metas = null as unknown as DreDoPeriodo['metas'];
      if (caso === 'array') d.metas = [] as unknown as DreDoPeriodo['metas'];
      if (caso === 'tipo') d.metas.cmv.tipo = 'crescimento';
      if (caso === 'NaN') d.metas.cmv.metaBp = NaN;
      if (caso === 'undefined') d.metas.cmv = undefined as unknown as DreDoPeriodo['metas'][string];
      if (caso === 'sem-farol') delete d.farol.porLinha.cmv;
      if (caso === 'origem-invalida') d.metaDoCmvDaLoja = 'privado' as DreDoPeriodo['metaDoCmvDaLoja'];
      const w = adaptar(d); expect(core(w)).toEqual(antes); expect(w.comparacaoComMeta?.estado).toBe('indisponivel');
    },
  );

  it('não percorre outros mapas/lojas e projeta somente campos permitidos, sem mutar ou reter referências', () => {
    const d = dre();
    Object.defineProperty(d.metas, 'lojaa', { enumerable: true, get: () => { throw new Error('Não ler outra loja.'); } });
    Object.defineProperty(d.farol.porLinha, 'lojaa', { enumerable: true, get: () => { throw new Error('Não ler outro farol.'); } });
    Object.assign(d.metas.cmv, { segredo: 'metadado privado' });
    Object.assign(d.farol.porLinha.cmv, { outrasLojas: [{ nome: 'Loja A privada', valor: 999_999 }] });
    Object.defineProperty(d.farol, 'contagem', { get: () => { throw new Error('Não ler painel inteiro.'); } });
    const w = adaptar(d);
    expect(w.comparacaoComMeta?.estado).toBe('com_meta');
    expect(w.comparacaoComMeta?.farol).not.toBe(d.farol.porLinha.cmv);
    expect(JSON.stringify(w)).not.toMatch(/lojaa|Loja A|999999|segredo|outrasLojas|metadado privado/);
    d.metas.cmv.metaBp = 9999;
    expect(w.comparacaoComMeta?.metaBp).toBe(3000);
  });

  it('nega acesso antes dos metadados e omite comparação em erro de leitura ou escopo divergente', () => {
    const restrito = { ...alcance, lojas: ['lojaa'] };
    const payload = Object.defineProperty({ estado: 'lido' }, 'dre', { get: () => { throw new Error('Proibido ler.'); } });
    expect(cmvDaHome(payload as Parameters<typeof cmvDaHome>[0], { ...contexto, alcance: restrito })).toBeNull();
    const erro = cmvDaHome({ estado: 'erro' }, contexto)!;
    expect(erro.comparacaoComMeta).toBeUndefined();
    const d = dre(); d.escopo = { tipo: 'rede' };
    expect(cmvDaHome({ estado: 'lido', dre: d }, contexto)).toBeNull();
  });
});
