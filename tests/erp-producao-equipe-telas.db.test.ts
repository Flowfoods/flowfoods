/**
 * ERP 3.3 · a cozinha pega a tarefa nas telas (as páginas e as actions de verdade, com banco): o que cada pessoa recebe no
 * HTML e o que as actions deixam passar.
 *  - a cozinha (Caio, Operador) vê "Você está como Caio Cozinha" e "Trocar de pessoa", pega a linha da lista pela action
 *    (volta às tarefas com "pegou"; o segundo toque, "ja-pegou"), e o "Concluir" espera os insumos com o motivo escrito;
 *  - a Duda vê o lote "com Caio Cozinha", sem "Pegar" nem "Passar"; no lote, o "Concluir" diz que está com o Caio;
 *  - a gerência passa para outra pessoa (só quem registra produção na loja; o formulário não escolhe fora disso) e solta;
 *  - histórico: a cozinha lê sem R$ (o operador sem custos) e a dona com R$; indicadores: só a gerência, sem R$, com a amostra;
 *  - gerente de outra loja e outro parceiro: 404; o nível 1 vê, passa e solta, mas não pega;
 *  - concluir vindo das tarefas volta para elas.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff npx vitest run tests/erp-producao-equipe-telas.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const atual = vi.hoisted(() => ({ ctx: null as null | (() => unknown) }));
const PESSOAS = vi.hoisted(() => [
  { usuarioId: 'u-caio', nome: 'Caio Cozinha' },
  { usuarioId: 'u-duda', nome: 'Duda Lima' },
  { usuarioId: 'u-gil', nome: 'Gil Gerente' },
]);
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`REDIRECT ${url}`), { url });
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  usePathname: () => '/erp/producao/tarefas',
}));
vi.mock('@/lib/erp/contexto', async () => {
  const { recusaDaAcao, exigirPermissao, pode } = await import('@/lib/erp/permissoes');
  return {
    exigirParceiroDaSessao: async () => atual.ctx!(),
    exigirParceiro: async () => atual.ctx!(),
    recusaDaAcao,
    exigirPermissao,
    pode,
    exigirPermissaoNaPagina: (ctx: { alcance: Alcance }, p: Parameters<typeof pode>[1], o?: { lojaId?: string }) => {
      if (!pode(ctx.alcance, p, o)) throw new Error('SEM_ACESSO');
    },
  };
});
// Quem pode receber o lote vem das credenciais (fora do tenant, outro banco no teste): a lista fixa da loja.
vi.mock('@/lib/erp/credenciais', async (orig) => ({ ...(await orig<typeof import('@/lib/erp/credenciais')>()), pessoasQueProduzem: async () => PESSOAS }));
vi.mock('@/app/entrar/actions', () => ({ acaoSair: async () => {} }));
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));
vi.mock('react-dom', async (orig) => ({ ...(await orig<typeof import('react-dom')>()), useFormState: (_acao: unknown, inicial: unknown) => [inicial, undefined], useFormStatus: () => ({ pending: false }) }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarInsumo } from '@/lib/erp/insumos';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { cadastrarFicha } from '@/lib/erp/fichas';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { concluirAbertura, contarItem, iniciarAbertura, obterContagemDeAbertura } from '@/lib/erp/estoque';
import { salvarListaDoDia, obterListaDoDia } from '@/lib/erp/producao-lista';
import { atenderRequisicao, obterRequisicao } from '@/lib/erp/requisicao';
import { obterOrdem } from '@/lib/erp/producao';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance, type Permissao } from '@/lib/erp/permissoes';
import ErpTarefasPage from '@/app/erp/producao/tarefas/page';
import ErpTarefasDaLojaPage from '@/app/erp/producao/tarefas/[lojaId]/page';
import ErpHistoricoDaLojaPage from '@/app/erp/producao/historico/[lojaId]/page';
import ErpIndicadoresDaLojaPage from '@/app/erp/producao/indicadores/[lojaId]/page';
import ErpLotePage from '@/app/erp/producao/[lojaId]/[ordemId]/page';
import ErpConcluirLotePage from '@/app/erp/producao/[lojaId]/[ordemId]/concluir/page';
import ParceiroTarefasDaLojaPage from '@/app/rodolfo/(painel)/erp/[slug]/producao/tarefas/[lojaId]/page';
import * as daSessao from '@/app/erp/producao/actions';
import * as doNivel1 from '@/app/rodolfo/(painel)/erp/[slug]/producao/actions';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const DIA = 86_400_000;
const sp = (s: string | null | undefined) => (s ?? '').replace(/ /g, ' ');
const texto = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe.skipIf(!URL_TESTE)('ERP 3.3 · telas da cozinha, do histórico e dos indicadores (Postgres real)', { timeout: 180_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `te${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string; slug: string; nome: string; status: string };
  let B: { id: string; slug: string; nome: string; status: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};
  const hoje = hojeNoRio();

  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR' | null, lojaIds: string[] | 'rede', proprio: Permissao[] | null = null): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: proprio, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const como = (alcance: Alcance, quem: { userId: string; nome: string } = { userId: 'u-gil', nome: 'Gil Gerente' }, parceiro = A, cliente = a) => {
    atual.ctx = () => ({ parceiro, alcance, cliente, bloqueio: null, podeEscrever: true, sessao: { userId: quem.userId, autorNome: quem.nome }, pessoa: { setores: [] } });
  };
  const CAIO = { userId: 'u-caio', nome: 'Caio Cozinha' };
  const DUDA = { userId: 'u-duda', nome: 'Duda Lima' };
  const DONA = () => alcanceDe('DONO', 'rede');
  const GERENTE = () => alcanceDe('GERENTE', [ids.vp]);
  const OPERADOR = () => alcanceDe('OPERADOR', [ids.vp]);
  const GERENTE_DELIVERY = () => alcanceDe('GERENTE', [ids.delivery]);
  const COZINHA_SEM_CUSTO = () => alcanceDe(null, [ids.vp], ['producao.ver', 'producao.registrar']);

  const rodar = async <T,>(fn: () => Promise<T>): Promise<T | { erro: string; url?: string }> => {
    try {
      return await fn();
    } catch (e) {
      return { erro: (e as Error).message, url: (e as { url?: string }).url };
    }
  };
  const pagina = async (el: Promise<unknown>) => sp(renderToStaticMarkup((await el) as ReactElement));
  const formDe = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.append(k, v);
    return f;
  };
  const tarefas = (feito?: string, lojaId = ids.vp) => pagina(ErpTarefasDaLojaPage({ params: { lojaId }, searchParams: { feito } }));

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = (await db.parceiroFlow.create({ data: { nome: 'Telas Equipe A', slug: `tequipe-a-${sufixo}`, status: 'ATIVO' } })) as typeof A;
    B = (await db.parceiroFlow.create({ data: { nome: 'Telas Equipe B', slug: `tequipe-b-${sufixo}`, status: 'ATIVO' } })) as typeof B;
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    await a.regraDoPeriodo.create({ data: { parceiroId: A.id, vigenteDesde: new Date('2020-01-01T00:00:00Z'), tipo: 'MENSAL', diaInicio: 1, criadoPorNome: 'teste' } });
    for (const [chave, nome] of [['vp', 'Vila da Penha'], ['delivery', 'Delivery']] as const) {
      const r = await cadastrarLoja(a, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
    }
    for (const [chave, campos] of Object.entries({
      cheddar: { nome: 'Queijo cheddar', unidade: 'KG', conteudo: '1', preco: '40,00', conservacao: 'REFRIGERADO' },
      leite: { nome: 'Leite', unidade: 'L', conteudo: '1', preco: '5,00', conservacao: 'REFRIGERADO' },
    })) {
      const r = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', ...campos });
      if (!r.ok) throw new Error(`${chave}: ${JSON.stringify(r)}`);
      ids[chave] = r.id;
    }
    const antes = new Date(Date.now() - 10 * DIA);
    expect((await iniciarAbertura(a, DONA(), ids.vp, 'Marina', antes)).ok).toBe(true);
    const ab = (await obterContagemDeAbertura(a, DONA(), ids.vp))!;
    for (const i of ab.itens) expect((await contarItem(a, DONA(), ids.vp, { itemId: i.id, embalagens: '', solto: '50', escala: 'base', versao: i.versao }, 'Marina', { agora: antes })).ok).toBe(true);
    const v = (await a.contagem.findFirst({ where: { lojaId: ids.vp, tipo: 'ABERTURA' }, select: { versao: true } }))!.versao;
    expect((await concluirAbertura(a, DONA(), ids.vp, { versao: v, confirmarNaoContados: false }, 'Marina', antes)).ok).toBe(true);
    const validade = { principal: 'REFRIGERADO', linhas: { REFRIGERADO: { marcada: true, quantidade: '3', em: 'dias' } } };
    const f = await cadastrarFicha(a, { nome: 'Molho cheddar', tipo: 'PRE_PREPARO', rendimento: '2', rendimentoUnidade: 'kg', itens: [{ insumoId: ids.cheddar, quantidade: '1', unidade: 'kg' }, { insumoId: ids.leite, quantidade: '1', unidade: 'L' }], validade } as never, { tipo: 'manter' }, 'Marina');
    if (!f.ok) throw new Error(JSON.stringify(f));
    ids.molho = f.id;
    expect(await salvarListaDoDia(a, GERENTE(), ids.vp, { dia: hoje, versao: '', linhaIds: [''], fichaIds: [ids.molho], quantidades: ['5'] }, { nome: 'Gil Gerente', userId: 'u-gil' })).toMatchObject({ ok: true });
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
  });

  it('a cozinha: quem está usando, a linha da lista para pegar (botão de 56 px), sem gerência e sem R$; a entrada leva direto à loja', async () => {
    como(OPERADOR(), CAIO);
    expect(await rodar(() => ErpTarefasPage())).toMatchObject({ url: `/erp/producao/tarefas/${ids.vp}` });
    const h = await tarefas();
    const t = texto(h);
    expect(t).toContain('Tarefas da cozinha');
    expect(t).toContain('Você está como Caio Cozinha .');
    expect(t).toContain('Não é você? Trocar de pessoa');
    expect(t).toContain('Nada com você agora.');
    expect(t).toContain('Molho cheddar');
    expect(t).toContain('5 kg');
    expect(t).toContain('vira lote ao pegar');
    expect(h).toContain('min-h-14');
    expect(t).toContain('Pegar Molho cheddar, 5 kg');
    const linha = (await obterListaDoDia(a, OPERADOR(), ids.vp, hoje))!.linhas[0];
    expect(h).toContain(`name="linha" value="${linha.id}"`);
    expect(h).toContain(`name="quantidade" value="5000"`);
    expect(t).not.toContain('Passar para outra pessoa');
    expect(h).not.toContain('R$');
  });

  it('pegar pela action volta às tarefas com "pegou"; o segundo toque, "ja-pegou"; o Concluir espera os insumos com o motivo', async () => {
    como(OPERADOR(), CAIO);
    const linha = (await obterListaDoDia(a, OPERADOR(), ids.vp, hoje))!.linhas[0];
    const form = () => formDe({ linha: linha.id, ficha: ids.molho, quantidade: '5000', voltar: 'tarefas' });
    expect(await rodar(() => daSessao.acaoPegarDaLista(ids.vp, null, form()))).toMatchObject({ url: `/erp/producao/tarefas/${ids.vp}?feito=pegou` });
    expect(await rodar(() => daSessao.acaoPegarDaLista(ids.vp, null, form()))).toMatchObject({ url: `/erp/producao/tarefas/${ids.vp}?feito=ja-pegou` });
    const h = await tarefas('pegou');
    const t = texto(h);
    expect(t).toContain('Lote pego: está com você.');
    expect(t).toMatch(/Com você 1/);
    expect(t).toMatch(/pegou \d\d:\d\d/);
    expect(t).toContain('Insumos: a entregar');
    expect(h).toMatch(/<button type="button" disabled="" aria-describedby="falta-[^"]+"[^>]*>Concluir<\/button>/);
    expect(t).toContain('Falta o estoque entregar os insumos.');
    expect(t).toContain('Soltar');
    ids.lote = (await a.ordemProducao.findFirst({ where: { fichaId: ids.molho }, select: { id: true } }))!.id;
  });

  it('a Duda vê o lote com o Caio, sem pegar nem passar; no lote, o Concluir diz que está com ele; a action de soltar dela é recusada', async () => {
    como(OPERADOR(), DUDA);
    const t = texto(await tarefas());
    expect(t).toMatch(/Com outras pessoas 1/);
    expect(t).toMatch(/com Caio Cozinha · pegou \d\d:\d\d/);
    expect(t).not.toContain('Passar para outra pessoa');
    expect(t).not.toContain('Soltar o lote de');
    const l = texto(await pagina(ErpLotePage({ params: { lojaId: ids.vp, ordemId: ids.lote }, searchParams: {} })));
    expect(l).toContain('Está com Caio Cozinha: só quem pegou ou a gerência conclui');
    expect(l).toMatch(/Caio Cozinha pegou às \d\d:\d\d/);
    expect(l).toContain('Se for para você terminar, peça para a gerência passar o lote para você.');
    const versao = (await obterOrdem(a, DONA(), ids.vp, ids.lote))!.ordem.versao;
    expect(await rodar(() => daSessao.acaoSoltarLote(ids.vp, null, formDe({ lote: ids.lote, versao: String(versao), motivo: 'quero fazer' })))).toMatchObject({ ok: false, erros: { geral: 'Este lote está com Caio Cozinha: só Caio Cozinha ou a gerência solta.' } });
    expect(await rodar(() => daSessao.acaoPassarLote(ids.vp, null, formDe({ lote: ids.lote, versao: String(versao), motivo: 'troca', para: 'u-duda' })))).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/definir a lista do dia/) } });
  });

  it('a gerência passa para a Duda (só quem registra produção na loja) e vê o formulário com as pessoas; quem não está na lista é recusado', async () => {
    como(GERENTE());
    const h = await tarefas();
    const t = texto(h);
    expect(t).toContain('Passar para outra pessoa');
    expect(t).toContain('Soltar o lote de Caio Cozinha');
    const versao = (await obterOrdem(a, DONA(), ids.vp, ids.lote))!.ordem.versao;
    expect(await rodar(() => daSessao.acaoPassarLote(ids.vp, null, formDe({ lote: ids.lote, versao: String(versao), motivo: 'troca', para: 'u-fora', voltar: 'tarefas' })))).toMatchObject({ ok: false, erros: { para: expect.any(String) } });
    expect(await rodar(() => daSessao.acaoPassarLote(ids.vp, null, formDe({ lote: ids.lote, versao: String(versao), motivo: 'Caio foi para a chapa', para: 'u-duda', voltar: 'tarefas' })))).toMatchObject({ url: `/erp/producao/tarefas/${ids.vp}?feito=passou` });
    expect(texto(await tarefas('passou'))).toContain('Lote passado: a hora de quem recebeu começa agora.');
    como(OPERADOR(), DUDA);
    expect(texto(await tarefas())).toMatch(/Com você 1/);
  });

  it('concluir vindo das tarefas: a tela diz "Voltar para as tarefas" e a action volta para elas', async () => {
    const r = (await obterOrdem(a, DONA(), ids.vp, ids.lote))!;
    const req = (await obterRequisicao(a, DONA(), ids.vp, r.requisicao!.id))!;
    expect(
      (await atenderRequisicao(a, GERENTE(), ids.vp, req.requisicao.id, { versao: req.requisicao.versao, linhas: req.itens.map((i) => ({ itemId: i.id, quantidade: String(i.faltaMilesimos / 1000).replace('.', ','), escala: 'base' })), encerrar: false, confirmarNegativo: true }, 'Edu Estoque')).ok,
    ).toBe(true);
    como(OPERADOR(), DUDA);
    const tela = await tarefas();
    expect(tela).toContain(`/erp/producao/${ids.vp}/${ids.lote}/concluir?de=tarefas`);
    const h = await pagina(ErpConcluirLotePage({ params: { lojaId: ids.vp, ordemId: ids.lote }, searchParams: { de: 'tarefas' } }));
    expect(texto(h)).toContain('Voltar para as tarefas');
    expect(texto(h)).toContain('Este lote está com você.');
    expect(h).toContain('name="voltar" value="tarefas"');
    // O Caio (o lote está com a Duda) não conclui pela tela.
    como(OPERADOR(), CAIO);
    expect(texto(await pagina(ErpConcluirLotePage({ params: { lojaId: ids.vp, ordemId: ids.lote }, searchParams: { de: 'tarefas' } })))).toMatch(/Este lote está com Duda Lima \(pegou às \d\d:\d\d\)\. Só Duda Lima ou a gerência conclui\./);
    como(OPERADOR(), DUDA);
    const v = (await obterOrdem(a, DONA(), ids.vp, ids.lote))!.ordem.versao;
    expect(await rodar(() => daSessao.acaoConcluirProducao(ids.vp, ids.lote, null, formDe({ versao: String(v), produzido: '4,6', escala: 'base', motivo: '', conservacao: '', voltar: 'tarefas' })))).toMatchObject({ url: `/erp/producao/tarefas/${ids.vp}?feito=concluido` });
    const feitas = texto(await tarefas('concluido'));
    expect(feitas).toMatch(/Feitas hoje 1/);
    expect(feitas).toMatch(/4,6 kg de 5 kg · rendeu 92% · Duda Lima · \d\d:\d\d/);
  });

  it('histórico: a cozinha lê o quê, quanto, quem fez e o tempo (sem R$ quando não vê custos); a dona vê o custo', async () => {
    como(COZINHA_SEM_CUSTO(), CAIO);
    const h = await pagina(ErpHistoricoDaLojaPage({ params: { lojaId: ids.vp }, searchParams: { periodo: 'hoje' } }));
    const t = texto(h);
    expect(t).toContain('Histórico da produção');
    expect(t).toContain('1 lote encerrado: 1 concluído');
    expect(t).toContain('Molho cheddar');
    expect(t).toContain('4,6 kg de 5 kg');
    expect(t).toContain('92%');
    expect(t).toContain('Duda Lima');
    expect(h).not.toContain('R$');
    expect(t).not.toContain('Custo do lote');
    como(DONA());
    const d = texto(await pagina(ErpHistoricoDaLojaPage({ params: { lojaId: ids.vp }, searchParams: { periodo: 'hoje' } })));
    expect(d).toContain('Custo do lote');
    expect(d).toContain('R$');
    // Filtro de pessoa sem lote: a frase, nunca zero.
    const vazio = texto(await pagina(ErpHistoricoDaLojaPage({ params: { lojaId: ids.vp }, searchParams: { periodo: 'hoje', pessoa: 'u-caio' } })));
    expect(vazio).toContain('Nenhum lote encerrado neste período.');
    expect(vazio).toContain('Tire o filtro ou escolha outro período.');
  });

  it('indicadores: só a gerência, por pessoa, com a amostra e sem R$; a cozinha não abre', async () => {
    como(OPERADOR(), CAIO);
    expect(await rodar(() => pagina(ErpIndicadoresDaLojaPage({ params: { lojaId: ids.vp }, searchParams: { periodo: 'hoje' } })))).toMatchObject({ erro: 'SEM_ACESSO' });
    como(GERENTE());
    const h = await pagina(ErpIndicadoresDaLojaPage({ params: { lojaId: ids.vp }, searchParams: { periodo: 'hoje' } }));
    const t = texto(h);
    expect(t).toContain('Indicadores da produção');
    expect(t).toContain('Um retrato do período, não uma nota.');
    expect(t).toContain('Duda Lima');
    expect(t).toContain('1 lote: amostra pequena, ainda não diz muito');
    expect(t).toContain('92% em média');
    expect(t).toContain('Molho cheddar: 4,6 kg em 1 lote · rendeu 92%');
    expect(h).toContain(`pessoa=u-duda`);
    expect(h).not.toContain('R$');
  });

  it('gerente de outra loja e outro parceiro: 404 nas três telas; o nível 1 vê e passa, mas não pega', async () => {
    como(GERENTE_DELIVERY());
    expect(await rodar(() => tarefas())).toMatchObject({ erro: 'NOT_FOUND' });
    expect(await rodar(() => pagina(ErpHistoricoDaLojaPage({ params: { lojaId: ids.vp }, searchParams: {} })))).toMatchObject({ erro: 'NOT_FOUND' });
    expect(await rodar(() => pagina(ErpIndicadoresDaLojaPage({ params: { lojaId: ids.vp }, searchParams: {} })))).toMatchObject({ erro: 'NOT_FOUND' });
    como(DONA(), { userId: 'u-bia', nome: 'Bia' }, B, b);
    expect(await rodar(() => tarefas())).toMatchObject({ erro: 'NOT_FOUND' });
    expect(await rodar(() => pagina(ErpHistoricoDaLojaPage({ params: { lojaId: ids.vp }, searchParams: {} })))).toMatchObject({ erro: 'NOT_FOUND' });
    // O nível 1: uma linha nova na lista, que ele não pega.
    const l = (await obterListaDoDia(a, GERENTE(), ids.vp, hoje))!;
    expect(await salvarListaDoDia(a, GERENTE(), ids.vp, { dia: hoje, versao: String(l.lista!.versao), linhaIds: [''], fichaIds: [ids.molho], quantidades: ['2'], vistas: '' }, { nome: 'Gil Gerente', userId: 'u-gil' })).toMatchObject({ ok: true });
    como(ALCANCE_FLOWFOODS, { userId: 'user-n1', nome: 'Rodolfo' });
    const h = texto(await pagina(ParceiroTarefasDaLojaPage({ params: { slug: A.slug, lojaId: ids.vp }, searchParams: {} })));
    expect(h).toContain('A FlowFoods vê as tarefas e pode soltar ou passar um lote; quem pega é a equipe da loja.');
    expect(h).not.toContain('Você está como');
    expect(h).not.toMatch(/Pegar Molho cheddar/);
    const nova = (await obterListaDoDia(a, GERENTE(), ids.vp, hoje))!.linhas.find((x) => x.estado === 'NA_LISTA')!;
    expect(await rodar(() => doNivel1.acaoPegarDaLista(A.slug, ids.vp, null, formDe({ linha: nova.id, ficha: ids.molho, quantidade: '2000' })))).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/a FlowFoods não pega lote/) } });
  });

  it('o lote concluído mostra quem fez', async () => {
    como(DONA());
    const l = texto(await pagina(ErpLotePage({ params: { lojaId: ids.vp, ordemId: ids.lote }, searchParams: {} })));
    expect(l).toMatch(/Quem fez\s+Duda Lima/);
  });
});
