/** 3A: transações reais, identidade e ciclo de vida da taxonomia própria da ficha. */
import { PrismaClient } from '@prisma/client';
import { setTimeout as esperar } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarFicha, editarFicha, obterFicha, listarFichas } from '@/lib/erp/fichas';
import { importarFichas, previaDaImportacao } from '@/lib/erp/ficha-importar';
import { buscarClassificacao, gerirClassificacao } from '@/lib/erp/ficha-secoes';
import { classificacaoVazia, type ClassificacaoDigitada, type PedidoGestaoClassificacao } from '@/lib/erp/ficha-secoes-campos';
import { chaveDoNome } from '@/lib/erp/categoria-campos';
import { listarHistorico } from '@/lib/erp/historico';
import { cadastrarInsumoDeTeste, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const nova = (secao: string, subsecao?: string): ClassificacaoDigitada => ({ secao: { tipo: 'nova', nome: secao }, subsecao: subsecao ? { tipo: 'nova', nome: subsecao } : { tipo: 'nenhuma' } });
const existente = (secaoId: string, subsecaoId?: string): ClassificacaoDigitada => ({ secao: { tipo: 'existente', id: secaoId }, subsecao: subsecaoId ? { tipo: 'existente', id: subsecaoId } : { tipo: 'nenhuma' } });

describe.skipIf(!URL_TESTE)('3A · seções e subseções (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient, perfil: PerfilDoBanco, a: ClienteDoParceiro, b: ClienteDoParceiro;
  const parceiros: string[] = [];
  let insumoId: string;
  const entrada = (nome: string, classificacao?: ClassificacaoDigitada) => ({
    nome, tipo: 'PRATO', rendimento: '1', descricao: 'Descrição original', passos: ['Montar na hora.'],
    consumoImediato: 'sim', itens: [{ insumoId, quantidade: '300', unidade: 'g' }],
    ...(classificacao === undefined ? {} : { classificacao }),
  });
  async function criar(nome: string, classificacao?: ClassificacaoDigitada) {
    const r = await cadastrarFicha(a, entrada(nome, classificacao), { tipo: 'manter' }, 'Teste 3A');
    if (!r.ok) throw new Error(JSON.stringify(r));
    const ficha = await a.fichaTecnica.findUniqueOrThrow({ where: { id: r.id } });
    return ficha;
  }
  async function gerir(id: string, intencao: PedidoGestaoClassificacao['intencao'], nivel: PedidoGestaoClassificacao['nivel'] = 'secao', nome?: string) {
    const registro = nivel === 'secao' ? await a.secaoFicha.findUniqueOrThrow({ where: { id } }) : await a.subsecaoFicha.findUniqueOrThrow({ where: { id } });
    return gerirClassificacao(a, { id, nivel, intencao, versao: registro.atualizadoEm.toISOString(), nome }, 'Gestor sintético');
  }

  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    for (const nome of ['A', 'B']) {
      const p = await db.parceiroFlow.create({ data: { nome: `Classificação sintética ${nome}`, slug: `secao-${nome}-${crypto.randomUUID()}`, status: 'ATIVO' } });
      parceiros.push(p.id);
    }
    a = doParceiro(parceiros[0], db); b = doParceiro(parceiros[1], db);
    const insumo = await cadastrarInsumoDeTeste(a, { nome: 'Insumo sintético', tipo: 'INGREDIENTE', unidade: 'KG', conteudo: '1', escala: 'base', preco: '20,00' });
    if (!insumo.ok) throw new Error(JSON.stringify(insumo));
    insumoId = insumo.id;
  });
  afterAll(async () => {
    if (db) { await limparParceiros(db, perfil, parceiros); await db.$disconnect(); }
  }, 120_000);

  it('omissão em nova ficha nasce nula; criação contextual grava par, histórico legível e identidade do tenant', async () => {
    expect(await criar('Sem seção')).toMatchObject({ secaoId: null, subsecaoId: null });
    const f = await criar('Com classificação', nova('Pratos quentes', 'Peixes'));
    const detalhe = (await obterFicha(a, f.id))!;
    expect(detalhe.classificacao).toMatchObject({ secao: { id: f.secaoId, nome: 'Pratos quentes', ativa: true }, subsecao: { id: f.subsecaoId, secaoId: f.secaoId, nome: 'Peixes' } });
    const historico = await a.historicoAlteracao.findMany({ where: { entidadeId: { in: [f.id, f.secaoId!, f.subsecaoId!] } } });
    expect(historico).toHaveLength(3);
    expect(historico.map(h => h.entidade).sort()).toEqual(['FichaTecnica', 'SecaoFicha', 'SubsecaoFicha']);
    expect(JSON.stringify(historico.find(h => h.entidade === 'FichaTecnica')!.depois)).toContain('Pratos quentes');
    expect(JSON.stringify(historico.find(h => h.entidade === 'FichaTecnica')!.depois)).toContain('Peixes');
    expect(await b.secaoFicha.findUnique({ where: { id: f.secaoId! } })).toBeNull();
  });

  it('mesma chave NFC/acentos/caixa/espaços reusa uma identidade e não repete auditoria de criação', async () => {
    const um = await criar('Nome normalizado 1', nova('  Sec\u0327a\u0303o\t  especial ', 'Frios'));
    const dois = await criar('Nome normalizado 2', nova('SECAO ESPECIAL', 'FRÍOS'));
    expect([dois.secaoId, dois.subsecaoId]).toEqual([um.secaoId, um.subsecaoId]);
    expect(await a.secaoFicha.count({ where: { nomeChave: chaveDoNome('Seção especial') } })).toBe(1);
    expect(await a.historicoAlteracao.count({ where: { entidade: 'SecaoFicha', entidadeId: um.secaoId!, acao: 'CRIOU' } })).toBe(1);
    expect(await a.historicoAlteracao.count({ where: { entidade: 'SubsecaoFicha', entidadeId: um.subsecaoId!, acao: 'CRIOU' } })).toBe(1);
  });

  it('falha de ficha e falha tardia de nome repetido revertem seção, subseção e auditoria', async () => {
    await criar('Nome da ficha já usado');
    const antes = await a.historicoAlteracao.count();
    const r = await cadastrarFicha(a, entrada('Nome da ficha já usado', nova('Órfã tardia', 'Filha órfã')));
    expect(r.ok).toBe(false);
    const invalida = await cadastrarFicha(a, { ...entrada('Receita inválida', nova('Órfã inicial', 'Filha inicial')), itens: [{ insumoId, quantidade: '0', unidade: 'g' }] });
    expect(invalida.ok).toBe(false);
    expect(await a.secaoFicha.count({ where: { nome: { contains: 'Órfã' } } })).toBe(0);
    expect(await a.subsecaoFicha.count({ where: { nome: { contains: 'órfã' } } })).toBe(0);
    expect(await a.historicoAlteracao.count()).toBe(antes);
  });

  it('nome Unicode aceito reusa a chave do próprio banco, mesmo quando lowercase do JavaScript diverge', async () => {
    const um = await criar('Unicode um', nova('İstanbul sintético', 'İçecek sintético'));
    const dois = await criar('Unicode dois', nova('İstanbul sintético', 'İçecek sintético'));
    expect([dois.secaoId, dois.subsecaoId]).toEqual([um.secaoId, um.subsecaoId]);
    expect(await a.secaoFicha.count({ where: { nome: 'İstanbul sintético' } })).toBe(1);
    expect(await a.subsecaoFicha.count({ where: { nome: 'İçecek sintético' } })).toBe(1);
    expect(await a.historicoAlteracao.count({ where: { entidade: 'SecaoFicha', entidadeId: um.secaoId!, acao: 'CRIOU' } })).toBe(1);
  });

  it('seção/filho de outro tenant ou pai incompatível são recusados sem mudança parcial', async () => {
    const f = await criar('Par válido', nova('Pai válido', 'Filho válido'));
    const outro = await criar('Outro pai', nova('Pai diferente', 'Filho diferente'));
    const alheia = await b.secaoFicha.create({ data: { parceiroId: b.parceiroId, nome: 'Exclusiva do B' } });
    const antes = await a.historicoAlteracao.count();
    for (const classificacao of [existente(alheia.id), existente(f.secaoId!, outro.subsecaoId!), { secao: { tipo: 'nenhuma' }, subsecao: { tipo: 'existente', id: f.subsecaoId! } } as ClassificacaoDigitada]) {
      expect((await editarFicha(a, f.id, { ...entrada(f.nome, classificacao), versao: f.atualizadoEm.toISOString(), descricao: 'Não deve entrar' })).ok).toBe(false);
    }
    expect(await a.fichaTecnica.findUnique({ where: { id: f.id } })).toMatchObject({ secaoId: f.secaoId, subsecaoId: f.subsecaoId, descricao: 'Descrição original', atualizadoEm: f.atualizadoEm });
    expect(await a.historicoAlteracao.count()).toBe(antes);
    const busca = await buscarClassificacao(a, { nivel: 'secao', contexto: 'filtro', selecionados: [alheia.id] });
    expect(busca.ok).toBe(true);
    if (busca.ok) expect(busca.pagina.selecionados).toEqual([]);
    expect(JSON.stringify(busca)).not.toContain('Exclusiva do B');
  });

  it('arquivar mantém associação e bloqueia novas escolhas; oldform e CSV preservam, limpeza é explícita', async () => {
    const f = await criar('Preservar importação', nova('Seção arquivada', 'Filha arquivada pelo pai'));
    const produto = await a.produtoVenda.create({ data: { parceiroId: a.parceiroId, nome: f.nome, fichaId: f.id } });
    await a.produtoCanal.create({ data: { parceiroId: a.parceiroId, produtoId: produto.id, canal: 'LOJA', precoManualCentavos: 9876 } });
    const precoAntes = await a.produtoCanal.findMany({ where: { produtoId: produto.id } });
    expect((await gerir(f.secaoId!, 'arquivar')).ok).toBe(true);
    const velha = await editarFicha(a, f.id, { ...entrada(f.nome), versao: f.atualizadoEm.toISOString(), descricao: 'Descrição atualizada' });
    expect(velha.ok).toBe(true);
    let atual = await a.fichaTecnica.findUniqueOrThrow({ where: { id: f.id } });
    expect(atual).toMatchObject({ secaoId: f.secaoId, subsecaoId: f.subsecaoId });
    const csv = `ficha;tipo;rende;insumo;quantidade;unidade\n${f.nome};prato;1;Insumo sintético;400;g`;
    expect((await previaDaImportacao(a, csv)).fichas[0].mudancas).toEqual(['insumos e quantidades']);
    expect(await importarFichas(a, csv, 'Importação sintética')).toMatchObject({ ok: true, alteradas: 1 });
    atual = await a.fichaTecnica.findUniqueOrThrow({ where: { id: f.id } });
    expect(atual).toMatchObject({ secaoId: f.secaoId, subsecaoId: f.subsecaoId, consumoImediato: true });
    expect((await obterFicha(a, f.id))!.classificacao.secao).toMatchObject({ id: f.secaoId, ativa: false });
    expect((await cadastrarFicha(a, entrada('Não pode atribuir arquivada', existente(f.secaoId!, f.subsecaoId!)))).ok).toBe(false);
    const duplicada = await cadastrarFicha(a, entrada('Não recria arquivada', nova('SEÇÃO ARQUIVADA')));
    expect(duplicada.ok).toBe(false);
    if (!duplicada.ok) expect(JSON.stringify(duplicada.erros)).toMatch(/Seção arquivada.*arquivada/);
    const formulario = await buscarClassificacao(a, { nivel: 'secao', contexto: 'formulario', q: 'Seção arquivada', selecionados: [f.secaoId!] });
    if (!formulario.ok) throw new Error(formulario.erro);
    expect(formulario.pagina.itens).toEqual([]);
    expect(formulario.pagina.selecionados).toMatchObject([{ registro: { id: f.secaoId, ativa: false } }]);
    const filhos = await buscarClassificacao(a, { nivel: 'subsecao', contexto: 'formulario', secaoId: f.secaoId! });
    if (filhos.ok) expect(filhos.pagina.itens).toEqual([]);
    expect((await listarFichas(a, { secao: f.secaoId, subsecao: f.subsecaoId })).linhas.map(l => l.id)).toContain(f.id);
    expect((await editarFicha(a, f.id, { ...entrada(f.nome, classificacaoVazia()), versao: atual.atualizadoEm.toISOString() })).ok).toBe(true);
    expect(await a.fichaTecnica.findUnique({ where: { id: f.id } })).toMatchObject({ secaoId: null, subsecaoId: null });
    expect(await a.produtoCanal.findMany({ where: { produtoId: produto.id } })).toEqual(precoAntes);
  });

  it('gestão preserva ID, versão e histórico antigo; restauração não duplica e exclusão exige ausência de dependências', async () => {
    const f = await criar('Ciclo da classificação', nova('Nome inicial', 'Filho inicial'));
    const historicoAntes = await a.historicoAlteracao.findMany({ where: { entidadeId: f.id } });
    const secao = await a.secaoFicha.findUniqueOrThrow({ where: { id: f.secaoId! } });
    expect((await gerir(f.secaoId!, 'renomear', 'secao', 'Nome novo')).ok).toBe(true);
    expect(await gerirClassificacao(a, { id: secao.id, nivel: 'secao', intencao: 'arquivar', versao: secao.atualizadoEm.toISOString() })).toMatchObject({ ok: false, conflito: true });
    expect((await gerir(f.secaoId!, 'arquivar')).ok).toBe(true);
    expect((await gerir(f.secaoId!, 'restaurar')).ok).toBe(true);
    expect(await a.secaoFicha.findUnique({ where: { id: secao.id } })).toMatchObject({ nome: 'Nome novo', ativa: true });
    expect(await a.historicoAlteracao.findMany({ where: { entidadeId: f.id } })).toEqual(historicoAntes);
    expect((await gerir(f.secaoId!, 'excluir')).ok).toBe(false);
    expect((await gerir(f.subsecaoId!, 'excluir', 'subsecao')).ok).toBe(false);
    const vazio = await a.secaoFicha.create({ data: { parceiroId: a.parceiroId, nome: 'Vazia para excluir' } });
    expect(await gerir(vazio.id, 'excluir')).toMatchObject({ ok: true, excluido: { nivel: 'secao', id: vazio.id } });
    expect(await a.secaoFicha.findUnique({ where: { id: vazio.id } })).toBeNull();
    const eventos = await listarHistorico(a, { de: [{ entidade: 'SecaoFicha', ids: [secao.id] }], verPrecos: false, verFichas: true });
    expect(eventos.length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(eventos)).toContain('Nome novo');
  });

  it('histórico de classificação fecha sem fichas.ver e permanece operacional quando autorizado', async () => {
    const f = await criar('Histórico operacional', nova('Histórico de seção', 'Histórico de filha'));
    const de = [{ entidade: 'SecaoFicha', ids: [f.secaoId!] }, { entidade: 'SubsecaoFicha', ids: [f.subsecaoId!] }];
    expect(await listarHistorico(a, { de, verPrecos: true })).toEqual([]);
    expect(await listarHistorico(a, { de, verPrecos: true, verFichas: false })).toEqual([]);
    const permitido = await listarHistorico(a, { de, verPrecos: false, verFichas: true });
    expect(permitido).toHaveLength(2);
    expect(JSON.stringify(permitido)).toContain('Histórico de seção');
    expect(JSON.stringify(permitido)).toContain('Histórico de filha');
    expect(JSON.stringify(permitido)).not.toMatch(/preco|cmv|centavos|custo|parceiroId/i);
    expect(permitido.flatMap(h => h.mudancas).map(m => m.campo)).not.toEqual(expect.arrayContaining(['id', 'secaoId', 'subsecaoId']));
  });

  it('dois cadastros concorrentes por nome convergem; duas versões concorrentes têm apenas um vencedor', async () => {
    const resultados = await Promise.all([
      cadastrarFicha(a, entrada('Corrida um', nova('Identidade concorrente', 'Filho concorrente'))),
      cadastrarFicha(a, entrada('Corrida dois', nova('IDENTIDADE CONCORRENTE', 'FILHO CONCORRENTE'))),
    ]);
    expect(resultados.map(r => r.ok)).toEqual([true, true]);
    const fichas = await a.fichaTecnica.findMany({ where: { nome: { in: ['Corrida um', 'Corrida dois'] } } });
    expect(new Set(fichas.map(f => f.secaoId)).size).toBe(1);
    expect(new Set(fichas.map(f => f.subsecaoId)).size).toBe(1);
    const registro = await a.secaoFicha.findUniqueOrThrow({ where: { id: fichas[0].secaoId! } });
    const corridas = await Promise.all(['Nome vencedor 1', 'Nome vencedor 2'].map(nome => gerirClassificacao(a, { id: registro.id, nivel: 'secao', intencao: 'renomear', nome, versao: registro.atualizadoEm.toISOString() })));
    expect(corridas.filter(r => r.ok)).toHaveLength(1);
    expect(corridas.filter(r => !r.ok && r.conflito)).toHaveLength(1);
  });

  it.each(['arquivar', 'excluir'] as const)('%s concorrente: salvamento espera a linha e recusa a seleção que deixou de estar disponível', async intencao => {
    const secao = await a.secaoFicha.create({ data: { parceiroId: a.parceiroId, nome: `Corrida ${intencao}` } });
    let liberar!: () => void, sinalizar!: (pid: number) => void;
    const libera = new Promise<void>(r => { liberar = r; });
    const pronta = new Promise<number>(r => { sinalizar = r; });
    const segura = a.transacao(async tx => {
      const [r] = await tx.sql<{ pid: number }>`SELECT pg_backend_pid() AS pid`;
      if (intencao === 'arquivar') await tx.secaoFicha.update({ where: { id: secao.id }, data: { ativa: false } });
      else await tx.secaoFicha.delete({ where: { id: secao.id } });
      sinalizar(r.pid);
      await libera;
    }, { timeout: 15_000 });
    const pid = await pronta;
    const salvando = cadastrarFicha(a, entrada(`Seleção durante ${intencao}`, existente(secao.id)));
    try {
      let bloqueado = false;
      for (let tentativa = 0; tentativa < 100 && !bloqueado; tentativa++) {
        const [r] = await db.$queryRaw<{ bloqueado: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))) AS bloqueado`;
        bloqueado = r.bloqueado;
        if (!bloqueado) await esperar(20);
      }
      expect(bloqueado, 'A seleção deve esperar a escrita concorrente na própria seção').toBe(true);
    } finally { liberar(); await segura; }
    expect((await salvando).ok).toBe(false);
    expect(await a.fichaTecnica.count({ where: { nome: `Seleção durante ${intencao}` } })).toBe(0);
  });

  it('busca paginada percorre mais de 50 sem truncar e fixa selecionado fora da página', async () => {
    await a.secaoFicha.createMany({ data: Array.from({ length: 67 }, (_, n) => ({ parceiroId: a.parceiroId, nome: `Busca sintética ${String(n).padStart(3, '0')}` })) });
    const selecionado = await a.secaoFicha.findFirstOrThrow({ where: { nome: 'Busca sintética 066' } });
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const r = await buscarClassificacao(a, { nivel: 'secao', contexto: 'gestao', q: 'Busca sintética', selecionados: [selecionado.id], cursor });
      if (!r.ok) throw new Error(r.erro);
      ids.push(...r.pagina.itens.map(i => i.registro.id));
      expect(r.pagina.selecionados.map(i => i.registro.id)).toEqual([selecionado.id]);
      cursor = r.pagina.proximoCursor ?? undefined;
    } while (cursor);
    expect(ids).toHaveLength(67);
    expect(new Set(ids).size).toBe(67);
    const outroPai = await a.secaoFicha.findFirstOrThrow({ where: { nome: 'Pai diferente' } });
    expect((await listarFichas(a, { secao: outroPai.id, subsecao: 'subsecao-inexistente' })).total).toBe(0);
    expect((await listarFichas(a, { secao: 'secao-inexistente' })).total).toBe(0);
  });
});
