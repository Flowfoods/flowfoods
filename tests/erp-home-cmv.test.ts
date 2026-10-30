import { describe, expect, it, vi } from 'vitest';
import { montarDre } from '@/lib/erp/dre-campos';
import { planoEfetivo } from '@/lib/erp/dre-plano';
import { resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import type { CmvDaLoja, CmvDoDre, RealApurado } from '@/lib/erp/cmv-campos';
import type { DreDoPeriodo } from '@/lib/erp/dre';
import { cmvDaHome, type ContextoDoCmvHome, type LeituraDoDreParaHome } from '../src/lib/erp/home-cmv';

// Type-only imports from the service must stay type-only: no query is part of this adapter.
vi.mock('@/lib/erp/dre', () => { throw new Error('O adaptador puro não importa o serviço DRE em runtime.'); });
vi.mock('@/lib/db', () => { throw new Error('Esta suíte não acessa banco.'); });

const consulta = '2026-10-29T20:00:00.000Z';
const periodo = { inicio: '2026-10-01', fim: '2026-10-31', nome: 'Outubro de 2026' };
const loja = { id: 'lojab', nome: 'Loja B', ativa: true, canais: ['LOJA' as const] };
const dono = resolverAlcance({ perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
const contexto = (alteracoes: Partial<ContextoDoCmvHome> = {}): ContextoDoCmvHome => ({ alcance: dono, loja, raiz: '/erp', consultadoEm: consulta, ...alteracoes });
const real = (alteracoes: Partial<RealApurado> = {}): RealApurado => ({
  centavos: 40_000, inicialCentavos: 10_000, finalCentavos: 20_000, comprasReaisCentavos: 50_000,
  inicialDe: 'fechamento', retratoEm: '2026-11-01T10:00:00.000Z', fechamentoId: 'fecho-privado', aberturaId: 'abertura-privada',
  semPrecoInicial: 0, semPrecoFinal: 0, ...alteracoes,
});
const fonte = (alteracoes: Partial<CmvDaLoja> = {}): CmvDaLoja => ({
  lojaId: loja.id, lojaNome: loja.nome, compraCentavos: 50_000, real: null, motivoSemReal: 'estoque não aberto', ...alteracoes,
});
function dre(alteracoes: Partial<DreDoPeriodo> = {}, cmv: CmvDoDre = { lojas: [fonte()], parcial: false }, receita = 100_000): DreDoPeriodo {
  const escopo = { tipo: 'loja', lojaId: loja.id, nome: loja.nome } as const;
  const resultado = montarDre({ escopo, plano: planoEfetivo([]), receitas: [{ lojaId: loja.id, canal: 'LOJA', valorCentavos: receita }], despesas: [], taxaIfood: null, cmv });
  return {
    periodo, hoje: '2026-11-01', ate: periodo.fim, emCurso: false, encerrado: true, diasDoPeriodo: 31, diaDeHoje: null,
    diasApurados: 31, status: null, escopo, resultado, porLoja: null, faltas: { total: 0 }, faltaLancar: [], taxaConfigurada: false,
    anterior: null, proximo: null, lojasDoEscopo: [loja], metas: {}, anoPassado: null, fechamento: null,
    cmv: { antigo: false, painel: null }, cmvDasLojas: cmv, metaDoCmvDaLoja: null, lojasComMetaPropria: [], trocasDeCusto: [],
    farol: {} as DreDoPeriodo['farol'], farolAntigo: false, canais: [], ...alteracoes,
  };
}
const adaptar = (d: DreDoPeriodo, c = contexto()) => cmvDaHome({ estado: 'lido', dre: d }, c)!;
const linhaCmv = (d: DreDoPeriodo) => d.resultado.linhas.find((l) => l.tipo === 'cmv')!;
const fechado = (d: DreDoPeriodo, antigo = false): DreDoPeriodo => ({
  ...d, status: 'FECHADO', cmv: { ...d.cmv, antigo }, fechamento: {
    versao: 2, fotografiaId: 'fotografia-b', versaoDaConta: antigo ? 1 : 5,
    fechadoEm: new Date('2026-11-02T12:00:00.000Z'), fechadoPorNome: 'Autor privado',
    ressalvas: [], totalDeRessalvas: 100, justificativa: 'Justificativa privada da rede',
  },
});

describe('H1 · CMV canônico de uma loja, sem consulta ou fórmula nova', () => {
  it('projeta compra, valor e bp exatos da linha do DRE, com calendário e aprofundamento reais', () => {
    const d = dre();
    const w = adaptar(d);
    expect(w).toMatchObject({ familia: 'cmv', estado: 'ok', fonteDoCmv: 'compras', valor: { unidade: 'centavos', valor: 50_000 } });
    expect(w.valor.valor).toBe(linhaCmv(d).valorCentavos);
    expect(w.percentual).toEqual({ pontosBase: 5000, denominador: { unidade: 'centavos', valor: 100_000, rotulo: 'Receita bruta do mesmo recorte do DRE' } });
    expect(w.notaDaConta).toBe(linhaCmv(d).nota);
    expect(w.referencia).toEqual({ base: 'periodo_apuracao', rotulo: periodo.nome, inicio: periodo.inicio, fim: periodo.fim, apuradoAte: periodo.fim });
    const url = new URL(w.detalhe.href, 'https://local.test');
    expect(url.pathname).toBe('/erp/dre');
    expect(url.searchParams.get('loja')).toBe(loja.id);
    expect(url.searchParams.get('periodo')).toBe(periodo.inicio);
    expect(w.origem).toEqual({ fonte: 'dre', modo: 'vivo', fotografia: null });
    expect(w.consultadoEm).toBe(consulta);
  });

  it('real prevalece sobre compra e copia a conta, sem refazer a fórmula dos componentes', () => {
    const d = dre({}, { lojas: [fonte({ real: real({ inicialCentavos: 999_999 }) })], parcial: false });
    linhaCmv(d).percentualBp = 4123; // Provar cópia do percentual canônico, não nova divisão.
    const w = adaptar(d);
    expect(w.fonteDoCmv).toBe('real');
    expect(w.valor.valor).toBe(40_000);
    expect(w.percentual?.pontosBase).toBe(4123);
    expect(w.estado).toBe('ok');
    expect(w.cobertura?.custosDoEstoque).toEqual({ semPrecoInicial: 0, semPrecoFinal: 0 });
  });

  it('preserva CMV negativo e percentual canônicos sem limitar ou arredondar de novo', () => {
    const d = dre({}, { lojas: [fonte({ real: real({ centavos: -1234 }) })], parcial: false });
    const w = adaptar(d);
    expect(w.valor.valor).toBe(-1234);
    expect(w.percentual?.pontosBase).toBe(linhaCmv(d).percentualBp);
    expect(w.valor.valor).toBe(linhaCmv(d).valorCentavos);
  });

  it.each([
    { inicio: '2026-10-16', fim: '2026-10-31', nome: 'Segunda quinzena' },
    { inicio: '2026-10-26', fim: '2026-11-01', nome: 'Semana de operação' },
  ])('preserva período configurado $nome sem convertê-lo em mês civil', (p) => {
    const w = adaptar(dre({ periodo: p, ate: p.fim, diasDoPeriodo: 7, diasApurados: 7 }));
    expect(w.referencia).toMatchObject({ base: 'periodo_apuracao', rotulo: p.nome, inicio: p.inicio, fim: p.fim, apuradoAte: p.fim });
    expect(w.detalhe.href).toContain('periodo=' + p.inicio);
  });

  it('curso e corte até ontem ficam visíveis, sem usar hoje como dado já apurado', () => {
    const w = adaptar(dre({ hoje: '2026-10-29', emCurso: true, encerrado: false, ate: '2026-10-28', diasApurados: 28 }, { lojas: [fonte()], parcial: true }));
    expect(w.estado).toBe('parcial');
    expect(w.referencia?.apuradoAte).toBe('2026-10-28');
    expect(w.cobertura).toMatchObject({ diasApurados: 28, diasDoPeriodo: 31, lojasIncluidas: ['lojab'], lojasElegiveis: 1 });
    expect(w.avisos.some((a) => a.codigo === 'periodo-em-curso')).toBe(true);
  });

  it('primeiro dia é sem dados apurados, nunca zero monetário ou base de receita fictícia', () => {
    const w = adaptar(dre({ hoje: periodo.inicio, emCurso: true, encerrado: false, ate: null, diasApurados: 0 }));
    expect(w.estado).toBe('sem_dados');
    expect(w.valor.valor).toBeNull();
    expect(w.percentual?.pontosBase).toBeNull();
    expect(w.percentual?.denominador?.valor).toBeNull();
    expect(w.fonteDoCmv).toBeNull();
    expect(w.avisos.some((a) => a.codigo === 'nenhum-dia-apurado')).toBe(true);
  });

  it('nenhuma nota/real é sem base, mas uma compra registrada zero continua zero', () => {
    const sem = adaptar(dre({}, { lojas: [fonte({ compraCentavos: null })], parcial: false }));
    expect(sem).toMatchObject({ estado: 'sem_base', valor: { valor: null }, fonteDoCmv: null });
    const zero = adaptar(dre({}, { lojas: [fonte({ compraCentavos: 0 })], parcial: false }));
    expect(zero).toMatchObject({ estado: 'ok', valor: { valor: 0 }, fonteDoCmv: 'compras' });
    expect(zero.percentual?.pontosBase).toBe(0);
  });

  it('sem receita conserva o CMV informado, mas nunca inventa percentual zero', () => {
    const w = adaptar(dre({}, { lojas: [fonte()], parcial: false }, 0));
    expect(w).toMatchObject({ estado: 'sem_base', valor: { valor: 50_000 } });
    expect(w.percentual?.pontosBase).toBeNull();
    expect(w.percentual?.denominador?.valor).toBe(0);
    expect(w.avisos.some((a) => a.codigo === 'percentual-sem-receita')).toBe(true);
  });

  it('faltas de faturamento marcam a base parcial sem recalcular o percentual existente', () => {
    const w = adaptar(dre({ faltas: { total: 3 } }));
    expect(w.estado).toBe('parcial');
    expect(w.cobertura?.faltasDeFaturamento).toBe(3);
    expect(w.percentual?.pontosBase).toBe(5000);
    expect(w.avisos.some((a) => a.codigo === 'faturamento-incompleto')).toBe(true);
  });

  it.each([2, null])('cobertura de custo incompleta/desconhecida (%s) mantém aviso e parcial', (semPreco) => {
    const w = adaptar(dre({}, { lojas: [fonte({ real: real({ semPrecoInicial: semPreco, semPrecoFinal: semPreco }) })], parcial: false }));
    expect(w.estado).toBe('parcial');
    expect(w.valor.valor).toBe(40_000);
    expect(w.cobertura?.custosDoEstoque).toEqual({ semPrecoInicial: semPreco, semPrecoFinal: semPreco });
    expect(w.avisos.map((a) => a.codigo)).toContain('estoque-inicial-sem-preco');
    expect(w.avisos.map((a) => a.codigo)).toContain('estoque-final-sem-preco');
  });

  it('mantém nota e semContar canônicos e avisa troca de base sem expor a ponte financeira', () => {
    const d = dre({ trocasDeCusto: [{ nome: loja.nome, desde: '2026-10-15', ponteCentavos: 12345 }] });
    linhaCmv(d).semContar = ['parcela de CMV da Loja B'];
    const w = adaptar(d);
    expect(w.estado).toBe('parcial');
    expect(w.notaDaConta).toBe(linhaCmv(d).nota);
    expect(w.semContar).toEqual(['parcela de CMV da Loja B']);
    expect(w.avisos.some((a) => a.codigo === 'troca-de-custo')).toBe(true);
    expect(JSON.stringify(w)).not.toContain('12345');
  });
});

describe('H1 · fotografia e projeção mínima', () => {
  it('fechado usa valor/versão/nome/período da leitura e não serializa autoria, justificativa ou componentes', () => {
    const d = fechado(dre({}, { lojas: [fonte({ real: real() })], parcial: false }));
    d.escopo = { tipo: 'loja', lojaId: loja.id, nome: 'Nome da leitura fechada' };
    const antes = JSON.stringify(d);
    const w = adaptar(d, contexto({ loja: { id: loja.id, nome: 'Nome atual diferente' } }));
    expect(w.valor.valor).toBe(linhaCmv(d).valorCentavos);
    expect(w.escopo.nome).toBe('Nome da leitura fechada');
    expect(w.origem).toEqual({ fonte: 'dre', modo: 'fotografia', fotografia: { id: 'fotografia-b', versao: 2, versaoDaConta: 5, fechadaEm: '2026-11-02T12:00:00.000Z' } });
    expect(JSON.stringify(w)).not.toMatch(/Autor privado|Justificativa privada|totalDeRessalvas|fecho-privado|abertura-privada|inicialCentavos|finalCentavos/);
    expect(JSON.stringify(d)).toBe(antes);
  });

  it('fechamento anterior ao CMV é indisponível, sem substituir por custo de hoje ou zero', () => {
    const w = adaptar(fechado(dre(), true));
    expect(w.estado).toBe('indisponivel');
    expect(w.valor.valor).toBeNull();
    expect(w.percentual?.pontosBase).toBeNull();
    expect(w.origem?.modo).toBe('fotografia');
    expect(w.fonteDoCmv).toBeNull();
    expect(w.avisos.some((a) => a.codigo === 'fechado-anterior-ao-cmv')).toBe(true);
  });

  it('ressalvas de outra loja/rede e de despesa não entram no widget CMV da loja', () => {
    const d = fechado(dre());
    d.fechamento!.ressalvas = [
      { id: 'estoque-a', tipo: 'ESTOQUE', lojaId: 'lojaa', lojaNome: 'Loja A protegida', titulo: 'Privado A', detalhe: 'Segredo A' },
      { id: 'rec-b', tipo: 'RECORRENTE', lojaId: loja.id, lojaNome: loja.nome, titulo: 'Aluguel privado', detalhe: 'Dados financeiros despesa' },
      { id: 'rec-rede', tipo: 'RECORRENTE', lojaId: null, lojaNome: null, titulo: 'Rede privada', detalhe: 'Segredo rede' },
    ];
    const w = adaptar(d);
    expect(w.estado).toBe('ok');
    expect(w.avisos).toEqual([]);
    expect(JSON.stringify(w)).not.toMatch(/Loja A|Privado|Segredo|Aluguel|financeiros despesa|Rede privada/);
    d.fechamento!.ressalvas.push({ id: 'est-b', tipo: 'ESTOQUE', lojaId: loja.id, lojaNome: loja.nome, titulo: 'Outro texto privado', detalhe: 'Não copiar o raw' });
    const com = adaptar(d);
    expect(com.estado).toBe('parcial');
    expect(com.avisos.map((a) => a.codigo)).toContain('fechado-com-ressalva-estoque');
    expect(JSON.stringify(com)).not.toMatch(/Outro texto privado|copiar o raw/);
  });

  it('loja sem faturamento no fechado preserva ressalva mesmo quando faltas.total está zerado', () => {
    const d = fechado(dre());
    d.fechamento!.ressalvas = [{ id: 'sem-b', tipo: 'LOJA_SEM_LANCAMENTO', lojaId: loja.id, lojaNome: loja.nome, titulo: 'Não copiar', detalhe: 'Não copiar' }];
    const w = adaptar(d);
    expect(w.estado).toBe('parcial');
    expect(w.cobertura?.faltasDeFaturamento).toBe(0);
    expect(w.avisos.some((a) => a.codigo === 'fechado-sem-faturamento')).toBe(true);
  });
});

describe('H1 · autorização, identidade de escopo e falhas sanitizadas', () => {
  it('sem dre.ver ou loja fora do alcance omite antes de ler qualquer dado protegido', () => {
    const payload = Object.defineProperty({ estado: 'lido' }, 'dre', { get: () => { throw new Error('não ler payload protegido'); } }) as LeituraDoDreParaHome;
    const semPermissao: Alcance = { nivel: 'LOJA', lojas: [loja.id], permissoes: new Set() };
    const soA: Alcance = { nivel: 'LOJA', lojas: ['lojaa'], permissoes: new Set(['dre.ver']) };
    expect(cmvDaHome(payload, contexto({ alcance: semPermissao }))).toBeNull();
    expect(cmvDaHome(payload, contexto({ alcance: soA }))).toBeNull();
  });

  it('dre.ver sem compras/estoque só oferece o DRE, sem ampliar drilldowns', () => {
    const restrito: Alcance = { nivel: 'LOJA', lojas: [loja.id], permissoes: new Set(['dre.ver']) };
    const w = adaptar(dre(), contexto({ alcance: restrito }));
    expect(w.detalhe.href).toMatch(/^\/erp\/dre\?/);
    expect(JSON.stringify(w)).not.toMatch(/\/compras|\/estoque/);
  });

  it.each(['rede', 'outra-loja', 'resultado-outra-loja', 'metadados-multiloja', 'cmv-multiloja'] as const)('recusa contexto %s, em vez de fingir valor de loja', (caso) => {
    const d = dre();
    if (caso === 'rede') d.escopo = { tipo: 'rede' };
    if (caso === 'outra-loja') d.escopo = { tipo: 'loja', lojaId: 'lojaa', nome: 'Loja A protegida' };
    if (caso === 'resultado-outra-loja') d.resultado.escopo = { tipo: 'loja', lojaId: 'lojaa', nome: 'Loja A protegida' };
    if (caso === 'metadados-multiloja') d.lojasDoEscopo.push({ ...loja, id: 'lojaa', nome: 'Loja A protegida' });
    if (caso === 'cmv-multiloja') d.cmvDasLojas = { ...d.cmvDasLojas, lojas: [...d.cmvDasLojas.lojas, fonte({ lojaId: 'lojaa', lojaNome: 'Loja A protegida' })] };
    expect(cmvDaHome({ estado: 'lido', dre: d }, contexto())).toBeNull();
  });

  it.each(['https://fora.test/erp', '//fora.test/erp', '/rodolfo/erp/outro/fora', '/erp/../erp', '/erp?parceiro=outro', '/erp/'] as const)('recusa raiz %s sem montar destino externo ou de outra rota', (raiz) => {
    expect(cmvDaHome({ estado: 'lido', dre: dre() }, contexto({ raiz }))).toBeNull();
  });

  it('espelho N1 usa raiz resolvida pelo chamador, mesmo mês/período e loja', () => {
    const w = adaptar(dre(), contexto({ raiz: '/rodolfo/erp/casa-alfa' }));
    const url = new URL(w.detalhe.href, 'https://local.test');
    expect(url.pathname).toBe('/rodolfo/erp/casa-alfa/dre');
    expect(url.searchParams.get('loja')).toBe(loja.id);
    expect(url.searchParams.get('periodo')).toBe(periodo.inicio);
  });

  it.each(['erro', 'indisponivel'] as const)('%s não transporta reason, erro bruto ou metadado inexistente', (estado) => {
    const payload = { estado, reason: new Error('SQL Prisma segredo-tabela'), dados: { valor: 999, outraLoja: 'Loja A privada' } } as LeituraDoDreParaHome;
    const w = cmvDaHome(payload, contexto())!;
    expect(w.estado).toBe(estado);
    expect(w.valor.valor).toBeNull();
    expect(w.origem).toBeNull();
    expect(w.cobertura).toBeNull();
    expect(w.referencia).toBeNull();
    expect(w.detalhe.href).toBe('/erp/dre?loja=lojab');
    expect(JSON.stringify(w)).not.toMatch(/SQL|Prisma|segredo|999|outraLoja|Loja A/);
  });

  it('null da leitura autorizada e linha ausente/duplicada são indisponibilidade sem valor', () => {
    expect(cmvDaHome({ estado: 'lido', dre: null }, contexto())?.estado).toBe('indisponivel');
    for (const duplicar of [false, true]) {
      const d = dre();
      d.resultado.linhas = duplicar ? [...d.resultado.linhas, { ...linhaCmv(d) }] : d.resultado.linhas.filter((l) => l.tipo !== 'cmv');
      const w = adaptar(d);
      expect(w.estado).toBe('indisponivel');
      expect(w.valor.valor).toBeNull();
    }
  });

  it('não mostra fechado por fonte viva nem fonte mista em piloto de uma loja', () => {
    const semFoto = adaptar(dre({ status: 'FECHADO' }));
    expect(semFoto.estado).toBe('indisponivel');
    expect(semFoto.valor.valor).toBeNull();
    const d = dre(); linhaCmv(d).nota = 'misto: real em A; pelas compras em B';
    const misto = adaptar(d);
    expect(misto.estado).toBe('indisponivel');
    expect(JSON.stringify(misto)).not.toContain('real em A');
  });

  it('horário desconhecido não vira data inventada, e o DTO é serializável', () => {
    const w = adaptar(dre(), contexto({ consultadoEm: 'não é uma data' }));
    expect(w.consultadoEm).toBeNull();
    expect(JSON.parse(JSON.stringify(w))).toEqual(w);
  });
});
