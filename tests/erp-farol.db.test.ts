/**
 * ERP 2.4 · o farol por canal (Postgres real).
 *
 * Casa Farol: Vila da Penha (3 canais) e Centro (só Loja). Setembro de 2026 completo, com o ano passado (setembro de 2025)
 * completo na Penha e no Centro. A Penha gera as 5 faixas ao mesmo tempo:
 *   receita  Loja +4,0 % (meta 5 %) VERDE · Delivery −5,0 % (meta 0) LARANJA · iFood −18,0 % (meta 5 %) VERMELHO · total LARANJA
 *   custo    Ocupação AZUL · Marketing VERDE · Pessoal AMARELO · Utilidades LARANJA · Deduções VERMELHO
 * Cobre: o farol ao vivo na loja e na rede, a recorrente que falta (o falso azul), fechar com a fotografia v3 (o fechado lê
 * o ano passado e a faixa SÓ dela), o vazamento (gerente de loja, operador, quem só vê o Histórico) e o fechado antigo (v2).
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-farol.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { faturamentoDosGraos, lancarDia, obterDia, salvarCanaisDaLoja, type EntradaDoCanal } from '@/lib/erp/faturamento';
import { lancarDespesa, lancarDoMesPassado, recorrentesEmFalta } from '@/lib/erp/despesas';
import type { TextosDaDespesa } from '@/lib/erp/despesa-campos';
import { dreDoPeriodo, type DreDoPeriodo } from '@/lib/erp/dre';
import { SEM_CMV } from '@/lib/erp/cmv-campos';
import { montarDre } from '@/lib/erp/dre-campos';
import { linhasParaGravar } from '@/lib/erp/dre-fechamento-campos';
import { fecharPeriodo, reabrirPeriodo } from '@/lib/erp/dre-fechamento';
import { gravarFotografia } from '@/lib/erp/dre-fotografia';
import { salvarMetas, situacaoDasMetas } from '@/lib/erp/dre-metas';
import { planoEfetivo } from '@/lib/erp/dre-plano';
import { salvarTaxaDoIfood } from '@/lib/erp/canais';
import { MOTIVO_DE_ANTES_DO_FAROL } from '@/lib/erp/farol-dre-campos';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import { cadastrarInsumo } from '@/lib/erp/insumos';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';
import { BRT, nota, R } from './erp-cmv-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const HOJE = '2026-10-17';
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe.skipIf(!URL_TESTE)('ERP 2.4 · o farol por canal (Postgres real)', { timeout: 300_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `r${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let F: { id: string };
  let f: ClienteDoParceiro;
  const ids: Record<string, string> = {};
  const criados: string[] = [];

  const alcance = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', lojaIds: string[] | 'rede'): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const propria = (permissoes: string[], lojaIds: string[] | 'rede'): Alcance =>
    resolverAlcance({ perfilBase: null, perfilProprio: permissoes, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const DONA = () => alcance('DONO', 'rede');
  const GERENTE_VP = () => alcance('GERENTE', [ids.vp]);
  const OPERADOR = () => alcance('OPERADOR', [ids.vp]);
  const SO_HISTORICO = () => propria(['historico.ver', 'lojas.ver'], 'rede');
  const N1 = () => ALCANCE_FLOWFOODS;

  const canal = (c: string, valor: string, pedidos = '', naoVendeu = false): EntradaDoCanal => ({ canal: c, valor, pedidos, clientes: '', naoVendeu, versao: '' });
  const lancarDiaDe = (lojaId: string, data: string, canais: EntradaDoCanal[]) => lancarDia(f, DONA(), { lojaId, data, canais }, 'Marina', HOJE);
  const diasDe = (mes: string) => Array.from({ length: new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5)), 0)).getUTCDate() }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`);
  const envio = () => globalThis.crypto.randomUUID().replace(/-/g, '');
  const textos = (p: Partial<TextosDaDespesa>): TextosDaDespesa => ({ envio: envio(), lojaId: ids.vp, linha: 'aluguel', descricao: 'Despesa', valor: '1,00', tipo: 'mes', dia: '', mes: '2026-09', de: '', ate: '', recorrente: false, vencimento: '', ...p });
  const despesa = async (p: Partial<TextosDaDespesa>) => {
    const r = await lancarDespesa(f, DONA(), textos(p), 'Marina', HOJE);
    if (!r.ok) throw new Error(JSON.stringify(r));
    return r.id;
  };
  const dre = (al: Alcance, escopo: { tipo: 'rede' } | { tipo: 'loja'; lojaId: string }, data: string): Promise<DreDoPeriodo | null> => dreDoPeriodo(f, al, escopo, data, HOJE);
  const metas = async (valores: Record<string, string>, hoje: string) => salvarMetas(f, DONA(), { valores, versao: (await situacaoDasMetas(f, DONA(), hoje))!.versao }, 'Marina', hoje);
  const cor = (d: DreDoPeriodo, chave: string) => {
    const l = d.farol.porLinha[chave];
    return l ? (l.tipo === 'cor' ? l.cor : `sem:${l.motivo}`) : undefined;
  };

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    F = await db.parceiroFlow.create({ data: { nome: 'Casa Farol', slug: `farol-${sufixo}`, status: 'ATIVO' } });
    criados.push(F.id);
    f = doParceiro(F.id, db);
    for (const [chave, nome] of [['vp', 'Vila da Penha'], ['ct', 'Centro']] as const) {
      const r = await cadastrarLoja(f, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
      await f.loja.update({ where: { id: r.id }, data: { criadoEm: new Date('2026-01-10T12:00:00Z') } });
    }
    expect(await salvarCanaisDaLoja(f, ids.ct, ['LOJA'], ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'], 'Marina')).toEqual({ ok: true, mudou: true });
    expect(await salvarTaxaDoIfood(f, { comissao: '12', pagamento: '3,2', versao: '' }, 'Marina')).toMatchObject({ ok: true });

    // ---- o ano passado (setembro de 2025), COMPLETO nas duas lojas: o valor no dia 1, os outros dias "não vendeu".
    for (const d of diasDe('2025-09')) {
      const primeiro = d.endsWith('-01');
      expect((await lancarDiaDe(ids.vp, d, primeiro ? [canal('LOJA', '80.000,00', '2000'), canal('DELIVERY_PROPRIO', '20.000,00', '500'), canal('IFOOD', '50.000,00', '1250')] : [canal('LOJA', '', '', true), canal('DELIVERY_PROPRIO', '', '', true), canal('IFOOD', '', '', true)])).ok, d).toBe(true);
      expect((await lancarDiaDe(ids.ct, d, [primeiro ? canal('LOJA', '10.000,00', '250') : canal('LOJA', '', '', true)])).ok, d).toBe(true);
    }
    // ---- setembro de 2026: Loja +4,0 %, Delivery −5,0 %, iFood −18,0 %; o Centro igual ao ano passado.
    for (const d of diasDe('2026-09')) {
      const primeiro = d.endsWith('-01');
      expect((await lancarDiaDe(ids.vp, d, primeiro ? [canal('LOJA', '83.200,00', '2080'), canal('DELIVERY_PROPRIO', '19.000,00', '475'), canal('IFOOD', '41.000,00', '1025')] : [canal('LOJA', '', '', true), canal('DELIVERY_PROPRIO', '', '', true), canal('IFOOD', '', '', true)])).ok, d).toBe(true);
      expect((await lancarDiaDe(ids.ct, d, [primeiro ? canal('LOJA', '10.000,00', '250') : canal('LOJA', '', '', true)])).ok, d).toBe(true);
    }
    // ---- as despesas da Penha em setembro (sobre R$ 143.200,00 de receita)
    await despesa({ linha: 'aluguel', valor: '5.000,00' }); // 3,5 %
    await despesa({ linha: 'marketing', valor: '3.000,00' }); // 2,1 %
    await despesa({ linha: 'salarios', valor: '20.000,00' }); // 14,0 %
    await despesa({ linha: 'energia', valor: '4.000,00' }); // 2,8 %
    await despesa({ linha: 'impostos', valor: '9.000,00' }); // + a taxa do iFood estimada
    // ---- o CMV: só a Penha tem nota em setembro (R$ 28.640,00 = 20,0 % do que ela vendeu); o Centro vendeu e não tem nota
    const insumo = await cadastrarInsumo(f, { tipo: 'INGREDIENTE', escala: 'base', nome: 'Insumo da prova', unidade: 'KG', conteudo: '1', preco: '10,00', conservacao: 'SECO' });
    if (!insumo.ok) throw new Error(JSON.stringify(insumo));
    await nota(f, insumo.id, { lojaId: ids.vp, numero: 'VP-24', data: '2026-09-10', centavos: R(28_640), lancadaEm: BRT('2026-09-10', '12:00'), movimenta: false });
    // ---- as metas, valendo em setembro
    expect(
      await metas(
        { 'receita-loja': '5', 'receita-delivery': '0', 'receita-ifood': '5', 'grupo:RECEITA': '0', 'grupo:OCUPACAO': '8', 'grupo:MARKETING': '2', 'grupo:PESSOAL': '12,5', 'grupo:UTILIDADES': '0,5', 'grupo:DEDUCAO': '2', cmv: '18,5', 'margem-contribuicao': '60', 'resultado-do-periodo': '10' },
        '2026-09-05',
      ),
    ).toMatchObject({ ok: true });
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, criados);
    await db?.$disconnect();
  });

  // ================================================================ 1. ao vivo: as 5 faixas
  describe('ao vivo', () => {
    it('a Penha gera as 5 faixas ao mesmo tempo, em receita por canal e em custo', async () => {
      const d = (await dre(DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-09-10'))!;
      expect(d.resultado.receitaBrutaCentavos).toBe(14_320_000);
      expect(d.faltas.total).toBe(0);
      expect(d.farol.motivoGeral).toBeNull();
      expect(cor(d, 'receita-loja')).toBe('VERDE');
      expect(cor(d, 'receita-delivery')).toBe('LARANJA');
      expect(cor(d, 'receita-ifood')).toBe('VERMELHO');
      expect(cor(d, 'grupo:RECEITA')).toBe('LARANJA');
      expect(cor(d, 'grupo:OCUPACAO')).toBe('AZUL');
      expect(cor(d, 'grupo:MARKETING')).toBe('VERDE');
      expect(cor(d, 'grupo:PESSOAL')).toBe('AMARELO');
      expect(cor(d, 'grupo:UTILIDADES')).toBe('LARANJA');
      expect(cor(d, 'grupo:DEDUCAO')).toBe('VERMELHO');
      // Todas as 5 cores aparecem na contagem do painel.
      expect(d.farol.contagem.map((c) => [c.cor, c.linhas.length > 0])).toEqual([['AZUL', true], ['VERDE', true], ['AMARELO', true], ['LARANJA', true], ['VERMELHO', true]]);
      // O azul de uma despesa pede conferência; o de crescimento não.
      expect(d.farol.porLinha['grupo:OCUPACAO']).toMatchObject({ confira: 'confira se está tudo lançado', desvioTexto: '−4,5 pp' });
      // A Penha tem nota de compra: o CMV dela (20,0 % contra 18,5 %) é amarelo, com o selo da fonte; a margem dela tem cor.
      expect(d.farol.porLinha.cmv).toMatchObject({ tipo: 'cor', cor: 'AMARELO', desvioTexto: '+1,5 pp' });
      expect(cor(d, 'margem-contribuicao')).toMatch(/^[A-Z]+$/);
      // O resultado da loja não compara com a meta da rede (a loja não carrega as despesas da rede).
      expect(d.farol.porLinha['resultado-do-periodo']).toBeUndefined();
    });

    it('a meta de crescimento guarda a receita em R$ e o painel por canal traz pedidos, ticket, ano passado e variação', async () => {
      const d = (await dre(DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-09-10'))!;
      expect(d.metas['receita-ifood']).toMatchObject({ tipo: 'crescimento', metaBp: 500, variacaoBp: -1800, desvioBp: -2300, metaCentavos: 5_250_000 });
      expect(d.metas['receita-loja']).toMatchObject({ variacaoBp: 400, desvioBp: -100, metaCentavos: 8_400_000 });
      expect(d.metas['receita-delivery']).toMatchObject({ variacaoBp: -500, desvioBp: -500, metaCentavos: 2_000_000 });
      expect(d.canais.map((c) => c.canal)).toEqual(['LOJA', 'DELIVERY_PROPRIO', 'IFOOD']);
      expect(d.canais[0]).toMatchObject({ receitaCentavos: 8_320_000, pedidos: 2080, ticketCentavos: 4_000, anteriorCentavos: 8_000_000, variacaoBp: 400, metaBp: 500 });
      expect(d.canais[2]).toMatchObject({ pedidos: 1025, ticketCentavos: 4_000, anteriorCentavos: 5_000_000, variacaoBp: -1800 });
      // O CMV e a despesa não existem por canal: nenhum farol de custo no bloco do canal.
      expect(JSON.stringify(d.canais)).not.toContain('cmv');
    });

    it('na rede, a Loja soma a Penha e o Centro: +3,6 % contra a meta de 5 % é AMARELO', async () => {
      const d = (await dre(DONA(), { tipo: 'rede' }, '2026-09-10'))!;
      expect(d.metas['receita-loja']).toMatchObject({ variacaoBp: 356, desvioBp: -144 });
      expect(cor(d, 'receita-loja')).toBe('AMARELO');
      expect(d.canais.find((c) => c.canal === 'LOJA')).toMatchObject({ receitaCentavos: 9_320_000, anteriorCentavos: 9_000_000 });
    });

    it('veto, bloqueante 2: o Centro sem o dia 01/09/2025 (a Penha lançou): a rede e a Loja ficam sem cor com o nome de quem falta; a Penha, que está completa, segue com cor; o Centro diz "29 de 30"', async () => {
      const buraco = async (ate: boolean) => {
        if (ate) await f.faturamentoLancamento.deleteMany({ where: { lojaId: ids.ct, data: dia('2025-09-01') } });
        else expect((await lancarDiaDe(ids.ct, '2025-09-01', [canal('LOJA', '10.000,00', '250')])).ok).toBe(true);
      };
      await buraco(true);
      try {
        const rede = (await dre(DONA(), { tipo: 'rede' }, '2026-09-10'))!;
        // Sem a regra por loja a rede "completaria" (a Penha lançou o dia 1) e mostraria uma variação de uma receita pela metade.
        expect(rede.anoPassado!.motivoCurto).toBe('ano passado incompleto: Centro 29 de 30');
        expect(cor(rede, 'grupo:RECEITA')).toBe('sem:ano passado incompleto: Centro 29 de 30');
        expect(cor(rede, 'receita-loja')).toBe('sem:ano passado incompleto no canal Loja: Centro 29 de 30');
        expect(rede.metas['grupo:RECEITA'].variacaoBp).toBeNull();
        expect(rede.metas['receita-loja'].variacaoBp).toBeNull();
        // Os canais que o Centro não vende não dependem dele: o do iFood e o do Delivery (só a Penha) seguem com cor.
        expect(cor(rede, 'receita-ifood')).toBe('VERMELHO');
        expect(cor(rede, 'receita-delivery')).toBe('LARANJA');
        const penha = (await dre(DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-09-10'))!;
        expect(cor(penha, 'grupo:RECEITA')).toBe('LARANJA');
        expect(cor(penha, 'receita-loja')).toBe('VERDE');
        const centro = (await dre(DONA(), { tipo: 'loja', lojaId: ids.ct }, '2026-09-10'))!;
        expect(cor(centro, 'receita-loja')).toBe('sem:ano passado no canal Loja: 29 de 30 dias');
        expect(cor(centro, 'grupo:RECEITA')).toBe('sem:ano passado: 29 de 30 dias');
      } finally {
        await buraco(false);
      }
      const volta = (await dre(DONA(), { tipo: 'rede' }, '2026-09-10'))!;
      expect(cor(volta, 'receita-loja')).toBe('AMARELO');
    });

    it('veto, bloqueante 1: na rede, o CMV com a Penha em +1,5 pp e o Centro sem nota NÃO tem cor ("sem o CMV de Centro"); a margem da rede também não', async () => {
      const d = (await dre(DONA(), { tipo: 'rede' }, '2026-09-10'))!;
      const cmv = d.resultado.linhas.find((l) => l.chave === 'cmv')!;
      expect(cmv.nota).toContain('sem o CMV de Centro');
      // A rede divide o CMV da Penha pela receita das duas lojas: 18,7 % parece "na meta" (+0,2 pp) e é só o Centro faltando.
      expect(d.metas.cmv.desvioBp!).toBeLessThan(100);
      expect(d.metas.cmv.faixa?.cor).toBe('VERDE');
      expect(d.farol.porLinha.cmv).toMatchObject({ tipo: 'sem', motivo: 'sem o CMV de Centro' });
      expect(d.farol.contagem.flatMap((c) => c.linhas.map((l) => l.chave))).not.toContain('cmv');
      expect(cor(d, 'margem-contribuicao')).toBe('sem:sem contar o CMV de Centro');
    });

    it('faturamento faltando (outubro, sem nenhum lançamento): nenhuma linha tem cor, o desvio segue em texto', async () => {
      expect(await metas({ 'grupo:PESSOAL': '12', 'receita-loja': '5' }, '2026-10-05')).toMatchObject({ ok: true });
      await despesa({ linha: 'salarios', valor: '3.100,00', mes: '2026-10' });
      await lancarDiaDe(ids.vp, '2026-10-01', [canal('LOJA', '1.000,00', '10'), canal('DELIVERY_PROPRIO', '', '', true), canal('IFOOD', '', '', true)]);
      const d = (await dre(DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-10-10'))!;
      expect(d.faltas.total).toBeGreaterThan(0);
      expect(d.farol.motivoGeral).toBe('faltam lançamentos de faturamento');
      for (const l of Object.values(d.farol.porLinha)) expect(l).toMatchObject({ tipo: 'sem', motivo: 'faltam lançamentos de faturamento' });
      expect(d.farol.porLinha['grupo:PESSOAL'].desvioTexto).not.toBeNull();
      expect(d.farol.contagem.every((c) => c.linhas.length === 0)).toBe(true);
    });

    it('o falso azul: a despesa que repete e ainda não foi lançada tira a cor da linha dela; lançar a traz de volta', async () => {
      const origem = await despesa({ linha: 'internet', mes: '2026-08', valor: '200,00', recorrente: true, descricao: 'Internet' });
      const falta = await f.transacao((tx) => recorrentesEmFalta(tx, DONA(), '2026-09'));
      expect(falta.map((x) => [x.origemId, x.grupo])).toEqual([[origem, 'UTILIDADES']]);
      const sem = (await dre(DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-09-10'))!;
      expect(cor(sem, 'grupo:UTILIDADES')).toBe('sem:falta lançar despesa que repete todo mês');
      expect(cor(sem, 'grupo:PESSOAL')).toBe('AMARELO'); // quem não depende dela segue com cor
      expect(cor(sem, 'grupo:OCUPACAO')).toBe('AZUL');
      expect(cor(sem, 'margem-contribuicao')).toMatch(/^[A-Z]+$/); // a margem é antes das despesas fixas: a internet não mexe nela
      const feita = await lancarDoMesPassado(f, DONA(), { envio: envio(), mes: '2026-09', itens: [{ origemId: origem, valor: '200,00' }] }, 'Marina', HOJE);
      expect(feita).toMatchObject({ ok: true, criadas: 1 });
      const com = (await dre(DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-09-10'))!;
      expect(cor(com, 'grupo:UTILIDADES')).toBe('LARANJA'); // 4.200 sobre 143.200 = 2,9 % contra 0,5 %
    });
  });

  // ================================================================ 2. fechar: a fotografia v3
  describe('fechar setembro (fotografia v3)', () => {
    let aoVivoRede: DreDoPeriodo;
    let aoVivoVp: DreDoPeriodo;
    const resumo = (d: DreDoPeriodo) => ({ porLinha: d.farol.porLinha, contagem: d.farol.contagem, canais: d.canais, metas: d.metas });

    it('o fechado grava a versão da conta 3, o ano passado por loja e a versão das faixas, e a meta de crescimento nas linhas de receita', async () => {
      aoVivoRede = (await dre(DONA(), { tipo: 'rede' }, '2026-09-10'))!;
      aoVivoVp = (await dre(DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-09-10'))!;
      const r = await fecharPeriodo(f, N1(), { inicio: '2026-09-01', ressalvas: [], justificativa: '' }, 'Ana Dona', HOJE);
      expect(r).toMatchObject({ ok: true, versao: 1 });
      const foto = (await f.dreFotografia.findFirst({ where: { periodo: { inicio: dia('2026-09-01') }, substituidaEm: null }, select: { id: true, versaoDaConta: true, entrada: true } }))!;
      expect(foto.versaoDaConta).toBe(3);
      const entrada = foto.entrada as { versaoDaConta: number; farol: { versao: number }; anoPassado: { versao: number; de: string; ate: string; lojas: Record<string, { nome: string; exigida: boolean; vende: string[]; dias: number; canais: Record<string, { centavos: number; dias: number }> }> }; receitas: { lojaId: string; canal: string; pedidos?: number }[] };
      expect(entrada.versaoDaConta).toBe(3);
      expect(entrada.farol).toEqual({ versao: 1 });
      expect(entrada.anoPassado).toMatchObject({ versao: 1, de: '2025-09-01', ate: '2025-09-30' });
      expect(entrada.anoPassado.lojas[ids.vp]).toMatchObject({ nome: 'Vila da Penha', exigida: true, dias: 30, vende: ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'] });
      expect(entrada.anoPassado.lojas[ids.vp].canais).toEqual({ LOJA: { centavos: 8_000_000, dias: 30 }, DELIVERY_PROPRIO: { centavos: 2_000_000, dias: 30 }, IFOOD: { centavos: 5_000_000, dias: 30 } });
      expect(entrada.receitas.find((x) => x.lojaId === ids.vp && x.canal === 'IFOOD')!.pedidos).toBe(1025);
      const linhas = await f.dreFotografiaLinha.findMany({ where: { fotografiaId: foto.id, lojaId: null, chave: { in: ['receita-ifood', 'receita-loja', 'grupo:RECEITA'] } }, select: { chave: true, metaBp: true } });
      expect(Object.fromEntries(linhas.map((l) => [l.chave, l.metaBp]))).toEqual({ 'receita-ifood': 500, 'receita-loja': 500, 'grupo:RECEITA': 0 });
    });

    it('critério 12: o farol e a variação do fechado são iguais ao ao vivo de um minuto antes (rede e loja)', async () => {
      const fechadoRede = (await dre(DONA(), { tipo: 'rede' }, '2026-09-10'))!;
      const fechadoVp = (await dre(DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-09-10'))!;
      expect(fechadoRede.status).toBe('FECHADO');
      expect(fechadoRede.farolAntigo).toBe(false);
      expect(resumo(fechadoRede)).toEqual(resumo(aoVivoRede));
      expect(resumo(fechadoVp)).toEqual(resumo(aoVivoVp));
      expect(fechadoVp.anoPassado!.linhas.find((l) => l.chave === 'IFOOD')).toMatchObject({ anteriorCentavos: 5_000_000, variacaoBp: -1800 });
    });

    it('ataque 4: editar o faturamento do ano passado (período antigo ainda aberto) e a meta depois NÃO muda o fechado', async () => {
      // Setembro de 2025 segue aberto: a Penha "corrige" o iFood do dia 1 de R$ 50.000,00 para R$ 10.000,00.
      const dia1 = (await obterDia(f, DONA(), ids.vp, '2025-09-01'))!;
      const versaoDe = (c: string) => dia1.canais.find((x) => x.canal === c)!.humano!.versao;
      const corrigido = await lancarDia(
        f,
        DONA(),
        { lojaId: ids.vp, data: '2025-09-01', canais: [{ ...canal('LOJA', '80.000,00', '2000'), versao: versaoDe('LOJA') }, { ...canal('DELIVERY_PROPRIO', '20.000,00', '500'), versao: versaoDe('DELIVERY_PROPRIO') }, { ...canal('IFOOD', '10.000,00', '250'), versao: versaoDe('IFOOD') }] },
        'Marina',
        HOJE,
      );
      expect(corrigido.ok).toBe(true);
      const graos = await f.transacao((tx) => faturamentoDosGraos(tx, DONA(), { de: '2025-09-01', ate: '2025-09-30', lojaId: ids.vp }));
      expect(graos.filter((g) => g.canal === 'IFOOD').reduce((s, g) => s + g.valorCentavos, 0)).toBe(1_000_000);
      expect(await metas({ 'receita-ifood': '90' }, HOJE)).toMatchObject({ ok: true });
      const d = (await dre(DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-09-10'))!;
      expect(resumo(d)).toEqual(resumo(aoVivoVp));
      expect(d.metas['receita-ifood']).toMatchObject({ metaBp: 500, variacaoBp: -1800 });
    });

    it('reabrir (só o nível 1) e fechar de novo gera a v2 da fotografia, com o ano passado de agora', async () => {
      const antes = (await f.dreFotografia.findFirst({ where: { periodo: { inicio: dia('2026-09-01') }, substituidaEm: null } }))!;
      expect(await reabrirPeriodo(f, N1(), { inicio: '2026-09-01', motivo: 'Refazer com o ano passado corrigido', fotografia: antes.id }, 'Rodolfo')).toMatchObject({ ok: true });
      expect(await fecharPeriodo(f, N1(), { inicio: '2026-09-01', ressalvas: [], justificativa: '' }, 'Ana Dona', HOJE)).toMatchObject({ ok: true, versao: 2 });
      const d = (await dre(DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-09-10'))!;
      // Agora o ano passado do iFood é R$ 10.000,00: R$ 41.000,00 é +310,0 %. A meta é a de setembro (5 %): a de 90 %, de outubro, não vale para ele.
      expect(d.metas['receita-ifood']).toMatchObject({ metaBp: 500, variacaoBp: 31_000 });
      expect(cor(d, 'receita-ifood')).toBe('AZUL');
    });
  });

  describe('fechar com o buraco do ano passado (veto, bloqueante 2, no fechado)', () => {
    it('a fotografia guarda a cobertura por loja: o fechado da rede lê o buraco do Centro e fica sem cor na receita; a Penha, não', async () => {
      await f.faturamentoLancamento.deleteMany({ where: { lojaId: ids.ct, data: dia('2025-09-01') } });
      const antes = (await f.dreFotografia.findFirst({ where: { periodo: { inicio: dia('2026-09-01') }, substituidaEm: null } }))!;
      expect(await reabrirPeriodo(f, N1(), { inicio: '2026-09-01', motivo: 'Fechar com o buraco do Centro', fotografia: antes.id }, 'Rodolfo')).toMatchObject({ ok: true });
      expect(await fecharPeriodo(f, N1(), { inicio: '2026-09-01', ressalvas: [], justificativa: '' }, 'Ana Dona', HOJE)).toMatchObject({ ok: true });
      const guardada = (await f.dreFotografia.findFirst({ where: { periodo: { inicio: dia('2026-09-01') }, substituidaEm: null }, select: { entrada: true } }))!.entrada as { anoPassado: { lojas: Record<string, { dias: number }> } };
      expect(guardada.anoPassado.lojas[ids.ct].dias).toBe(29);
      const rede = (await dre(DONA(), { tipo: 'rede' }, '2026-09-10'))!;
      expect(rede.status).toBe('FECHADO');
      expect(cor(rede, 'grupo:RECEITA')).toBe('sem:ano passado incompleto: Centro 29 de 30');
      expect(cor(rede, 'receita-loja')).toBe('sem:ano passado incompleto no canal Loja: Centro 29 de 30');
      expect(cor(rede, 'receita-ifood')).toMatch(/^[A-Z]+$/);
      const penha = (await dre(DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-09-10'))!;
      expect(cor(penha, 'receita-loja')).toBe('VERDE');
      // O gerente da Penha lê só a loja dele: o buraco do Centro não lhe diz respeito nem aparece.
      const g = (await dre(GERENTE_VP(), { tipo: 'loja', lojaId: ids.vp }, '2026-09-10'))!;
      expect(cor(g, 'receita-loja')).toBe('VERDE');
      expect(JSON.stringify(g)).not.toContain('Centro');
      // Conserta o ano passado e fecha de novo: a v seguinte volta a ter cor (nada ficou preso).
      expect((await lancarDiaDe(ids.ct, '2025-09-01', [canal('LOJA', '10.000,00', '250')])).ok).toBe(true);
      const atual = (await f.dreFotografia.findFirst({ where: { periodo: { inicio: dia('2026-09-01') }, substituidaEm: null } }))!;
      expect(await reabrirPeriodo(f, N1(), { inicio: '2026-09-01', motivo: 'Buraco do Centro corrigido', fotografia: atual.id }, 'Rodolfo')).toMatchObject({ ok: true });
      expect(await fecharPeriodo(f, N1(), { inicio: '2026-09-01', ressalvas: [], justificativa: '' }, 'Ana Dona', HOJE)).toMatchObject({ ok: true });
      expect(cor((await dre(DONA(), { tipo: 'rede' }, '2026-09-10'))!, 'receita-loja')).toBe('AMARELO');
    });
  });

  // ================================================================ 3. vazamento
  describe('vazamento', () => {
    it('o gerente da Penha só recebe a Penha: canais, ano passado e faixas do escopo dele, também no fechado, e nada da rede por URL', async () => {
      for (const data of ['2026-09-10']) {
        const g = (await dre(GERENTE_VP(), { tipo: 'loja', lojaId: ids.vp }, data))!;
        expect(g.escopo).toMatchObject({ tipo: 'loja', lojaId: ids.vp });
        expect(g.canais.find((c) => c.canal === 'LOJA')).toMatchObject({ receitaCentavos: 8_320_000 }); // sem os R$ 10.000,00 do Centro
        const json = JSON.stringify(g);
        expect(json).not.toContain(ids.ct);
        expect(json).not.toContain('Centro');
        expect(g.farol.porLinha['resultado-do-periodo']).toBeUndefined();
      }
      expect(await dre(GERENTE_VP(), { tipo: 'rede' }, '2026-09-10')).toBeNull();
      expect(await dre(GERENTE_VP(), { tipo: 'loja', lojaId: ids.ct }, '2026-09-10')).toBeNull();
    });

    it('o ano passado de uma loja no fechado é o dela: a Loja da Penha compara com R$ 80.000,00, não com a soma do Centro', async () => {
      const g = (await dre(GERENTE_VP(), { tipo: 'loja', lojaId: ids.vp }, '2026-09-10'))!;
      expect(g.anoPassado!.linhas.find((l) => l.chave === 'LOJA')).toMatchObject({ anteriorCentavos: 8_000_000 });
    });

    it('sem dre.ver não há farol: operador e quem só vê o Histórico recebem nada (nem por escopo, nem por período)', async () => {
      for (const al of [OPERADOR(), SO_HISTORICO()]) {
        expect(await dre(al, { tipo: 'loja', lojaId: ids.vp }, '2026-09-10')).toBeNull();
        expect(await dre(al, { tipo: 'rede' }, '2026-09-10')).toBeNull();
        expect(await dre(al, { tipo: 'loja', lojaId: ids.vp }, '2026-10-10')).toBeNull();
      }
    });

    it('o nível 1 (o espelho) vê o mesmo farol do parceiro', async () => {
      const n1 = (await dre(N1(), { tipo: 'rede' }, '2026-09-10'))!;
      const dona = (await dre(DONA(), { tipo: 'rede' }, '2026-09-10'))!;
      expect(n1.farol).toEqual(dona.farol);
    });
  });

  // ================================================================ 4. fechado antes do farol (v2)
  describe('fechado antes do farol (fotografia v2)', () => {
    it('a faixa de custo sai das linhas gravadas; a receita diz "não apurado neste fechamento", e o painel por canal também', async () => {
      await f.transacao(async (tx) => {
        const periodo = await tx.periodoApuracao.create({ data: { parceiroId: tx.parceiroId, nome: 'Agosto de 2026', inicio: dia('2026-08-01'), fim: dia('2026-08-31') } });
        const plano = planoEfetivo([]).map((l, i) => ({ ...l, id: `L${i}` }));
        const r = montarDre({
          escopo: { tipo: 'rede' },
          plano,
          receitas: [{ lojaId: ids.vp, canal: 'LOJA', valorCentavos: 1_000_000 }],
          taxaIfood: null,
          despesas: [{ linhaId: plano.find((l) => l.codigo === 'salarios')!.id!, lojaId: ids.vp, centavos: 300_000 }],
          cmv: SEM_CMV,
        });
        const linhas = linhasParaGravar(r, null, null, (l) => (l.chave === 'grupo:PESSOAL' ? 2000 : null));
        await gravarFotografia(tx, { periodoId: periodo.id, inicio: '2026-08-01', fim: '2026-08-31', nomeDoPeriodo: 'Agosto de 2026', fechadoPorNome: 'Antes da 2.4', taxa: null, versaoDaConta: 2, entrada: {}, ressalvas: [], justificativa: null, linhas }, 1);
        await tx.periodoApuracao.update({ where: { id: periodo.id }, data: { status: 'FECHADO', fechadoEm: new Date(), fechadoPorNome: 'Antes da 2.4' } });
      });
      const d = (await dre(DONA(), { tipo: 'rede' }, '2026-08-10'))!;
      expect(d.status).toBe('FECHADO');
      expect(d.farolAntigo).toBe(true);
      // 30 % contra a meta de 20 %: +10 pp de despesa, muito pior que a meta.
      expect(d.farol.porLinha['grupo:PESSOAL']).toMatchObject({ tipo: 'cor', cor: 'VERMELHO' });
      for (const chave of ['grupo:RECEITA', 'receita-loja', 'receita-delivery', 'receita-ifood']) expect(d.farol.porLinha[chave]).toMatchObject({ tipo: 'sem', motivo: MOTIVO_DE_ANTES_DO_FAROL });
      const loja = d.canais.find((c) => c.canal === 'LOJA')!;
      expect(loja).toMatchObject({ receitaCentavos: 1_000_000, pedidos: null, anteriorCentavos: null });
      expect(loja.farol).toMatchObject({ tipo: 'sem', motivo: MOTIVO_DE_ANTES_DO_FAROL });
    });
  });
});
