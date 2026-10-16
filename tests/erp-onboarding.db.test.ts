/**
 * ERP 0.5 · onboarding no Postgres de verdade: o formulário da landing (resposta
 * única, armadilha, reenvio, limite por IP e teto global), o quadro, a ativação
 * (parceiro + dono + convite + pedido + histórico numa transação só, com trava),
 * a recusa, o parceiro em RASCUNHO que não entra (decisão 92) e o isolamento.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-onboarding.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { hashDoToken, ERRO_DE_ENTRADA } from '@/lib/erp/acesso';
import {
  ativarPedido,
  consultarLink,
  criarAcesso,
  definirSenhaPeloLink,
  entrarComSenha,
  ERRO_PARCEIRO_NAO_LIBERADO,
  gerarNovoLink,
  parceirosDoEmail,
  rascunhosComPessoasAtivas,
  validarSessao,
  atorNivel1,
} from '@/lib/erp/credenciais';
import {
  cadastrarPedidoManual,
  contarPedidosAbertos,
  excluirDadosDoPedido,
  listarQuadro,
  moverPedido,
  obterPedido,
  receberPedidoDaLanding,
  recusarPedido,
} from '@/lib/erp/pedidos';
import { prisma } from '@/lib/db';
import { criarParceiro, mudarStatusParceiro } from '@/lib/erp/parceiros';
import { doParceiro } from '@/lib/erp/tenant';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const SENHA = 'cozinha limpa 2026';
const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

describe.skipIf(!URL_TESTE)('ERP 0.5 · onboarding: pedido, quadro, ativação e recusa (Postgres real)', { timeout: 90_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const avisos = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const sufixo = Date.now().toString(36);
  const email = (n: string) => `${n}.${sufixo}@teste.flow`;
  const ipDe = (n: string) => `10.5.${n}-${sufixo}`;
  let contador = 0;
  const celular = () => `21 9${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`.replace(/^(\d\d) (\d)(\d{4})(\d{4})$/, '($1) $2$3-$4');
  /** Limite global lá em cima para os testes não dependerem do que já existe no banco. */
  const o = (extra: object = {}) => ({ base: db, limites: { globalPorDia: 1_000_000 }, ...extra });
  const ids: string[] = [];
  /** Pedidos de dados excluídos: o e-mail some, então a limpeza os acha pelo id. */
  const pedidosExcluidos: string[] = [];

  const formulario = (nome: string, extra: Record<string, unknown> = {}) => ({
    nomeGrupo: `Grupo ${nome}`,
    responsavel: `Resp ${nome}`,
    whatsapp: celular(),
    email: email(nome),
    lojas: '3',
    marcas: '2',
    cidade: 'Rio de Janeiro/RJ',
    consentimento: 'sim',
    ...extra,
  });
  const pedidoPorEmail = (e: string) => db.pedidoParceiro.findFirstOrThrow({ where: { email: e }, include: { eventos: { orderBy: { ocorridoEm: 'asc' } } } });
  const contarPedidos = (e: string) => db.pedidoParceiro.count({ where: { email: e } });
  const tentativasDe = (ip: string) => db.tentativaPedidoParceiro.findMany({ where: { ip }, orderBy: { criadoEm: 'asc' } });
  /** Pedido novo pronto para ativar (por IP próprio). */
  async function novoPedido(nome: string, extra: Record<string, unknown> = {}) {
    contador++;
    const r = await receberPedidoDaLanding(formulario(nome, extra), ipDe(`${nome}-${contador}`), o());
    expect(r).toEqual({ tipo: 'recebido' });
    return pedidoPorEmail(String(extra.email ?? email(nome)));
  }
  const ativacao = (p: { versao: number }, slug: string, dono = 'dono') => ({
    nomeParceiro: `Parceiro ${slug}`,
    slug,
    donoNome: 'Dona Maria',
    donoEmail: email(dono),
    versao: String(p.versao),
  });
  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
  });

  afterAll(async () => {
    avisos.mockRestore();
    if (!db) return;
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "teste_falha_convite" ON "ConviteAcesso"`);
    await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "teste_falha_convite"()`);
    const peds = await db.pedidoParceiro.findMany({
      where: { OR: [{ email: { endsWith: `.${sufixo}@teste.flow` } }, { id: { in: pedidosExcluidos } }] },
      select: { id: true, parceiroCriadoId: true },
    });
    for (const p of peds) if (p.parceiroCriadoId) ids.push(p.parceiroCriadoId);
    const todosIds = Array.from(new Set(ids));
    const usuarios = (
      await db.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM "UsuarioErp" WHERE email LIKE $1`, `%.${sufixo}@teste.flow`)
    ).map((u) => u.id);
    await db.$executeRawUnsafe(`DELETE FROM "TentativaPedidoParceiro" WHERE ip LIKE $1`, `%-${sufixo}`);
    await db.$executeRawUnsafe(`DELETE FROM "TentativaEntradaErp" WHERE email LIKE $1 OR ip LIKE $2`, `%.${sufixo}@teste.flow`, `%-${sufixo}`);
    await db.$executeRawUnsafe(`DELETE FROM "SessaoErp" WHERE "usuarioId" = ANY($1)`, usuarios);
    await db.$executeRawUnsafe(`DELETE FROM "ConviteAcesso" WHERE "usuarioId" = ANY($1)`, usuarios);
    await db.$executeRawUnsafe(`DELETE FROM "AcessoParceiro" WHERE "usuarioId" = ANY($1)`, usuarios);
    await db.$executeRawUnsafe(`DELETE FROM "UsuarioErp" WHERE id = ANY($1)`, usuarios);
    const doTeste = peds.map((p) => p.id);
    await db.$executeRawUnsafe(`DELETE FROM "PedidoParceiroEvento" WHERE "pedidoId" = ANY($1)`, doTeste);
    await db.$executeRawUnsafe(`DELETE FROM "PedidoParceiro" WHERE id = ANY($1)`, doTeste);
    if (todosIds.length) await limparParceiros(db, perfil, todosIds);
    await db.$disconnect();
  });

  // ------------------------------------------------------ o formulário público

  it('envio válido: 1 pedido NOVO + evento CRIOU + tentativa ACEITO, com o consentimento e a versão', async () => {
    const f = formulario('valido', { email: email('valido').toUpperCase() });
    const ip = ipDe('valido');
    expect(await receberPedidoDaLanding(f, ip, o())).toEqual({ tipo: 'recebido' });
    const p = await pedidoPorEmail(email('valido'));
    expect(p).toMatchObject({ origem: 'LANDING', status: 'NOVO', lojas: 3, marcas: 2, reenvios: 0, versao: 1, consentimentoVersao: 'v1', parceiroCriadoId: null });
    expect(p.consentimentoEm).toBeInstanceOf(Date);
    expect(p.whatsapp).toMatch(/^55219\d{8}$/);
    expect(p.eventos.map((e) => [e.acao, e.autorNome])).toEqual([['CRIOU', 'Formulário do site']]);
    expect((await tentativasDe(ip)).map((t) => t.resultado)).toEqual(['ACEITO']);
    // Nada de tenant nasce.
    expect(await db.parceiroFlow.count({ where: { nome: { contains: 'Grupo valido' } } })).toBe(0);
  });

  it('sem a caixa de consentimento: erro no campo, nenhum pedido, uma tentativa INVALIDO', async () => {
    const ip = ipDe('semcaixa');
    const r = await receberPedidoDaLanding(formulario('semcaixa', { consentimento: undefined }), ip, o());
    expect(r).toMatchObject({ tipo: 'erros', erros: { consentimento: expect.any(String) } });
    expect(await contarPedidos(email('semcaixa'))).toBe(0);
    expect((await tentativasDe(ip)).map((t) => t.resultado)).toEqual(['INVALIDO']);
  });

  it('armadilha preenchida: a MESMA resposta do sucesso, 0 pedidos, tentativa ARMADILHA', async () => {
    const ip = ipDe('robo');
    const robo = await receberPedidoDaLanding(formulario('robo', { site_da_empresa: 'http://spam.example' }), ip, o());
    const gente = await receberPedidoDaLanding(formulario('gente'), ipDe('gente'), o());
    expect(JSON.stringify(robo)).toBe(JSON.stringify(gente));
    expect(await contarPedidos(email('robo'))).toBe(0);
    expect((await tentativasDe(ip)).map((t) => t.resultado)).toEqual(['ARMADILHA']);
  });

  it('enumeração: e-mail de quem já tem acesso ao ERP, de pedido aberto e e-mail novo dão a resposta idêntica', async () => {
    const pA = await criarParceiro({ nome: 'Enum A', slug: `enum-a-${sufixo}`, status: 'ATIVO' }, 'Teste', db);
    if (!pA.ok) throw new Error('setup');
    ids.push(pA.id);
    const acesso = await criarAcesso(pA.id, { nome: 'Já Tenho', email: email('jatenho') }, 'Rodolfo', { base: db });
    expect(acesso.ok).toBe(true);
    await novoPedido('aberto');

    const comAcesso = await receberPedidoDaLanding(formulario('x1', { email: email('jatenho') }), ipDe('enum1'), o());
    const comPedido = await receberPedidoDaLanding(formulario('x2', { email: email('aberto') }), ipDe('enum2'), o());
    const novo = await receberPedidoDaLanding(formulario('x3'), ipDe('enum3'), o());
    expect(JSON.stringify(comAcesso)).toBe(JSON.stringify(novo));
    expect(JSON.stringify(comPedido)).toBe(JSON.stringify(novo));
    expect(novo).toEqual({ tipo: 'recebido' });
    // Quem já tem acesso vira um pedido comum (o nível 1 é quem vê a marca); nada em UsuarioErp mudou.
    expect(await contarPedidos(email('jatenho'))).toBe(1);
    expect(await parceirosDoEmail(email('jatenho'), { base: db })).toEqual(['Enum A']);
  });

  it('reenvio do mesmo e-mail ou do mesmo WhatsApp: 0 cartões novos, +1 evento REENVIOU, reenvios +1', async () => {
    const p = await novoPedido('reenvia');
    const r1 = await receberPedidoDaLanding(formulario('reenvia'), ipDe('reenvia-a'), o());
    const r2 = await receberPedidoDaLanding(formulario('outro-email', { whatsapp: p.whatsapp.slice(2) }), ipDe('reenvia-b'), o());
    expect(r1).toEqual({ tipo: 'recebido' });
    expect(r2).toEqual({ tipo: 'recebido' });
    const depois = await pedidoPorEmail(email('reenvia'));
    expect(depois.reenvios).toBe(2);
    expect(depois.eventos.map((e) => e.acao)).toEqual(['CRIOU', 'REENVIOU', 'REENVIOU']);
    expect(await contarPedidos(email('outro-email'))).toBe(0);
    expect(depois.nomeGrupo).toBe(p.nomeGrupo); // o reenvio não reescreve o cartão
    expect((await tentativasDe(ipDe('reenvia-b'))).map((t) => t.resultado)).toEqual(['REENVIO']);
  });

  it('20 envios paralelos do mesmo IP: exatamente 3 entram; do 4º em diante, bloqueado', async () => {
    const ip = ipDe('rajada');
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => receberPedidoDaLanding(formulario(`rajada${i}`), ip, o())));
    expect(rs.filter((r) => r.tipo === 'recebido')).toHaveLength(3);
    expect(rs.filter((r) => r.tipo === 'bloqueado')).toHaveLength(17);
    const t = await tentativasDe(ip);
    expect(t.filter((x) => x.resultado === 'ACEITO')).toHaveLength(3);
    expect(t.filter((x) => x.resultado === 'BLOQUEADO')).toHaveLength(17);
    expect(await db.pedidoParceiro.count({ where: { email: { startsWith: 'rajada', endsWith: `.${sufixo}@teste.flow` } } })).toBe(3);
    // Passada a hora, o IP volta a poder enviar (até 10 no dia).
    const depois = await receberPedidoDaLanding(formulario('rajada-depois'), ip, o({ agora: new Date(Date.now() + 61 * 60_000) }));
    expect(depois).toEqual({ tipo: 'recebido' });
  });

  it('10 por dia por IP: o 11º é bloqueado mesmo com a hora livre', async () => {
    const ip = ipDe('dia');
    const base = Date.now() - 20 * HORA;
    for (let i = 0; i < 10; i++) {
      // 3, 3, 3, 1 em horas diferentes: nunca passa de 3 numa hora.
      const quando = new Date(base + Math.floor(i / 3) * 2 * HORA + (i % 3) * 60_000);
      expect(await receberPedidoDaLanding(formulario(`dia${i}`), ip, o({ agora: quando })), `envio ${i}`).toEqual({ tipo: 'recebido' });
    }
    const onze = await receberPedidoDaLanding(formulario('dia10'), ip, o({ agora: new Date(base + 9 * HORA) }));
    expect(onze).toEqual({ tipo: 'bloqueado' });
    expect(await contarPedidos(email('dia10'))).toBe(0);
  });

  it('teto global por dia: passou, bloqueia IP novo; reenvio de quem já tem cartão continua entrando', async () => {
    await novoPedido('global0'); // o limite normal do teste está alto: este conta no teto de baixo
    const aceitos = await db.tentativaPedidoParceiro.count({ where: { resultado: 'ACEITO', criadoEm: { gte: new Date(Date.now() - DIA) } } });
    const teto = { limites: { globalPorDia: aceitos + 2 } };
    const ok1 = await receberPedidoDaLanding(formulario('global1'), ipDe('g1'), o(teto));
    const ok2 = await receberPedidoDaLanding(formulario('global2'), ipDe('g2'), o(teto));
    const bloq = await receberPedidoDaLanding(formulario('global3'), ipDe('g3'), o(teto));
    expect([ok1, ok2]).toEqual([{ tipo: 'recebido' }, { tipo: 'recebido' }]);
    expect(bloq).toEqual({ tipo: 'bloqueado' });
    expect(await contarPedidos(email('global3'))).toBe(0);
    const reenvio = await receberPedidoDaLanding(formulario('global1'), ipDe('g4'), o(teto));
    expect(reenvio).toEqual({ tipo: 'recebido' });
    expect((await pedidoPorEmail(email('global1'))).reenvios).toBe(1);
  });

  it('o IP que insiste além do ruído nem enche a tabela', async () => {
    const ip = ipDe('ruido');
    for (let i = 0; i < 6; i++) await receberPedidoDaLanding(formulario(`ru${i}`, { lojas: 'x' }), ip, o({ limites: { ruidoPorHora: 5, globalPorDia: 1_000_000 } }));
    expect(await tentativasDe(ip)).toHaveLength(5);
  });

  it('o limite do formulário não trava o login de quem divide o IP (tabelas separadas)', async () => {
    const ip = ipDe('login');
    for (let i = 0; i < 4; i++) await receberPedidoDaLanding(formulario(`lg${i}`), ip, o());
    expect(await db.tentativaEntradaErp.count({ where: { ip } })).toBe(0);
    expect(await entrarComSenha({ email: email('ninguem'), senha: 'x', ip }, { base: db })).toMatchObject({ bloqueado: false });
  });

  // ----------------------------------------------------------------- o quadro

  it('quadro: Novo há 3 dias = 1d de atraso; Em conversa há 9 dias = 2d; fechados só dos últimos 30 dias', async () => {
    const novo = await novoPedido('q-novo');
    const conversa = await novoPedido('q-conversa');
    const antigoAtivado = await novoPedido('q-ativado-antigo');
    await db.pedidoParceiro.update({ where: { id: novo.id }, data: { etapaDesde: new Date(Date.now() - 3 * DIA) } });
    const mov = await moverPedido(conversa.id, 'EM_CONVERSA', conversa.versao, 'Rodolfo', { base: db });
    expect(mov).toEqual({ ok: true, mensagem: 'Pedido em conversa.' });
    await db.pedidoParceiro.update({ where: { id: conversa.id }, data: { etapaDesde: new Date(Date.now() - 9 * DIA) } });
    const rec = await recusarPedido(antigoAtivado.id, 'fora do perfil', antigoAtivado.versao, 'Rodolfo', { base: db });
    expect(rec.ok).toBe(true);
    await db.pedidoParceiro.update({ where: { id: antigoAtivado.id }, data: { etapaDesde: new Date(Date.now() - 31 * DIA) } });

    const q = await listarQuadro({ base: db });
    expect(q.NOVO.find((c) => c.id === novo.id)?.atrasoDias).toBe(1);
    expect(q.EM_CONVERSA.find((c) => c.id === conversa.id)?.atrasoDias).toBe(2);
    expect(q.NOVO.find((c) => c.id === conversa.id)).toBeUndefined();
    expect(q.RECUSADO.find((c) => c.id === antigoAtivado.id)).toBeUndefined(); // passou de 30 dias
    const ab = await contarPedidosAbertos({ base: db });
    expect(ab.atrasados).toBeGreaterThanOrEqual(2);
    expect(ab.abertos).toBeGreaterThanOrEqual(ab.atrasados);
  });

  it('mover de etapa é condicional à versão: duas pessoas no mesmo cartão não se atropelam', async () => {
    const p = await novoPedido('mover');
    const a = await moverPedido(p.id, 'EM_CONVERSA', p.versao, 'Rodolfo', { base: db });
    const b = await moverPedido(p.id, 'EM_CONVERSA', p.versao, 'Outro', { base: db });
    expect(a.ok).toBe(true);
    expect(b).toMatchObject({ ok: false, erro: expect.stringContaining('Alguém mexeu') });
    const ev = (await pedidoPorEmail(email('mover'))).eventos.map((e) => e.acao);
    expect(ev).toEqual(['CRIOU', 'MOVEU']);
    const mov = (await pedidoPorEmail(email('mover'))).eventos[1];
    expect(mov).toMatchObject({ antes: { etapa: 'NOVO' }, depois: { etapa: 'EM_CONVERSA' }, autorNome: 'Rodolfo' });
  });

  it('cadastrar pedido manual: origem MANUAL, sem consentimento; contato igual a pedido aberto é recusado', async () => {
    const f = formulario('manual', { consentimento: undefined, etapa: 'EM_CONVERSA' });
    const r = await cadastrarPedidoManual(f, 'Rodolfo', { base: db });
    expect(r.ok).toBe(true);
    const p = await pedidoPorEmail(email('manual'));
    expect(p).toMatchObject({ origem: 'MANUAL', status: 'EM_CONVERSA', consentimentoEm: null });
    const de_novo = await cadastrarPedidoManual(f, 'Rodolfo', { base: db });
    expect(de_novo).toMatchObject({ ok: false, erros: { geral: expect.stringContaining('Já existe um pedido aberto') } });
  });

  it('o evento do pedido só se acrescenta: UPDATE é recusado pelo banco', async () => {
    const p = await novoPedido('imutavel');
    await expect(db.$executeRawUnsafe(`UPDATE "PedidoParceiroEvento" SET "autorNome" = 'x' WHERE "pedidoId" = $1`, p.id)).rejects.toThrow(/só aceita INSERT/);
  });

  it('o banco recusa ativado sem parceiro e recusado sem motivo', async () => {
    const p = await novoPedido('checks');
    await expect(db.$executeRawUnsafe(`UPDATE "PedidoParceiro" SET status = 'ATIVADO' WHERE id = $1`, p.id)).rejects.toThrow(/ativado_tem_parceiro/);
    await expect(db.$executeRawUnsafe(`UPDATE "PedidoParceiro" SET status = 'RECUSADO' WHERE id = $1`, p.id)).rejects.toThrow(/recusa_com_motivo/);
    await expect(
      db.$executeRawUnsafe(
        `INSERT INTO "PedidoParceiro"(id, origem, "nomeGrupo", responsavel, whatsapp, email, lojas, marcas, cidade, "atualizadoEm") VALUES ('x1', 'LANDING', 'Grupo', 'Resp', '5521999990000', $1, 1, 1, 'Rio', now())`,
        email('semconsent'),
      ),
    ).rejects.toThrow(/landing_com_consentimento/);
  });

  it('o prisma do portal recusa o pedido (só pedidos.ts e a ativação o tocam)', async () => {
    const lixo = prisma as unknown as Record<string, { findMany: () => Promise<unknown> }>;
    await expect(lixo.pedidoParceiro.findMany()).rejects.toThrow(/pedidos\.ts/);
    await expect(lixo.tentativaPedidoParceiro.findMany()).rejects.toThrow(/pedidos\.ts/);
  });

  // ------------------------------------------------------------------ ativar

  it('ativar: parceiro ATIVO, dono (rede inteira), convite do nível 1, pedido ATIVADO e histórico CRIOU/CRIOU/GEROU_LINK; o token não está em lugar nenhum', async () => {
    const p = await novoPedido('ativa');
    const slug = `ativa-${sufixo}`;
    const r = await ativarPedido(p.id, ativacao(p, slug), 'Rodolfo', { base: db });
    if (!r.ok) throw new Error(JSON.stringify(r.erros));
    ids.push(r.parceiro.id);
    expect(r.parceiro.slug).toBe(slug);
    expect(r.link).not.toBeNull();
    const token = r.link!.token;
    expect(r.link!.expiraEm.getTime() - Date.now()).toBeGreaterThan(71 * HORA);

    const parceiro = await db.parceiroFlow.findUniqueOrThrow({ where: { id: r.parceiro.id } });
    expect(parceiro).toMatchObject({ status: 'ATIVO', slug });
    const usuario = await db.usuarioErp.findUniqueOrThrow({ where: { email: email('dono') } });
    expect(usuario.senhaHash).toBeNull();
    const acesso = await db.acessoParceiro.findFirstOrThrow({ where: { parceiroId: parceiro.id } });
    expect(acesso).toMatchObject({ usuarioId: usuario.id, perfilBase: 'DONO', redeInteira: true, status: 'ATIVO' });
    const convites = await db.conviteAcesso.findMany({ where: { parceiroId: parceiro.id } });
    expect(convites).toHaveLength(1);
    expect(convites[0]).toMatchObject({ doNivel1: true, tokenHash: hashDoToken(token), usadoEm: null });
    expect(convites[0].expiraEm.getTime() - convites[0].criadoEm.getTime()).toBe(72 * HORA);
    const ped = await pedidoPorEmail(email('ativa'));
    expect(ped).toMatchObject({ status: 'ATIVADO', parceiroCriadoId: parceiro.id, versao: p.versao + 1 });
    expect(ped.eventos.map((e) => e.acao)).toEqual(['CRIOU', 'ATIVOU']);
    expect(ped.eventos[1]).toMatchObject({ autorNome: 'Rodolfo', antes: { etapa: 'NOVO' }, depois: { etapa: 'ATIVADO' } });

    const hist = await doParceiro(parceiro.id, db).historicoAlteracao.findMany({ orderBy: [{ ocorridoEm: 'asc' }, { id: 'asc' }] });
    expect(hist.map((h) => `${h.entidade}:${h.acao}`).sort()).toEqual(['AcessoParceiro:CRIOU', 'AcessoParceiro:GEROU_LINK', 'ParceiroFlow:CRIOU'].sort());
    expect(hist.find((h) => h.entidade === 'ParceiroFlow')?.depois).toMatchObject({ status: 'ATIVO', origem: `pedido ${p.id}` });

    // O token puro não aparece em tabela nenhuma (nem no histórico, nem no AuditLog, nem no pedido).
    for (const tabela of ['ConviteAcesso', 'UsuarioErp', 'AcessoParceiro', 'HistoricoAlteracao', 'PedidoParceiro', 'PedidoParceiroEvento', 'AuditLog', 'ParceiroFlow', 'SessaoErp']) {
      const [x] = await db.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${tabela}" t WHERE t::text LIKE $1`, `%${token}%`);
      expect(x.n, tabela).toBe(0);
    }

    // O link define a senha UMA vez; o segundo uso recebe a mesma frase de link vencido.
    expect(await consultarLink(token, { base: db })).toMatchObject({ valido: true, nome: 'Dona Maria', primeiraVez: true });
    expect((await definirSenhaPeloLink(token, SENHA, SENHA, { base: db })).ok).toBe(true);
    expect(await definirSenhaPeloLink(token, SENHA, SENHA, { base: db })).toMatchObject({ ok: false, linkInvalido: true });
    // A dona entra no ERP do parceiro novo, como dona.
    const e = await entrarComSenha({ email: email('dono'), senha: SENHA, ip: ipDe('entrada') }, { base: db });
    if (!e.ok) throw new Error('não entrou');
    const s = await validarSessao(e.token, { base: db });
    expect(s?.parceiro?.id).toBe(parceiro.id);
    expect(s?.perfilRotulo).toBe('Dono');
    expect(s?.alcance?.permissoes.has('acessos.gerir')).toBe(true);
  });

  it('ativar de novo o mesmo pedido: recebe a frase com quem ativou; nenhum parceiro, dono ou link a mais', async () => {
    const p = await novoPedido('duas-vezes');
    const slug = `duas-${sufixo}`;
    const a = await ativarPedido(p.id, ativacao(p, slug, 'dono-duas'), 'Rodolfo', { base: db });
    if (!a.ok) throw new Error();
    ids.push(a.parceiro.id);
    const b = await ativarPedido(p.id, { ...ativacao(p, `${slug}-b`, 'dono-duas-b'), versao: String(p.versao + 1) }, 'Outro', { base: db });
    expect(b).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/já foi ativado por Rodolfo/) } });
    expect(await db.parceiroFlow.count({ where: { slug: `${slug}-b` } })).toBe(0);
    expect(await db.usuarioErp.count({ where: { email: email('dono-duas-b') } })).toBe(0);
  });

  it('duas ativações SIMULTÂNEAS do mesmo pedido: 1 parceiro, 1 convite; a outra recebe a frase', async () => {
    const p = await novoPedido('corrida');
    const rs = await Promise.all([
      ativarPedido(p.id, ativacao(p, `corrida-a-${sufixo}`, 'dono-corrida-a'), 'Rodolfo', { base: db }),
      ativarPedido(p.id, ativacao(p, `corrida-b-${sufixo}`, 'dono-corrida-b'), 'Outro', { base: db }),
    ]);
    for (const r of rs) if (r.ok) ids.push(r.parceiro.id);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rs.filter((r) => !r.ok)).toHaveLength(1);
    expect(await db.parceiroFlow.count({ where: { slug: { startsWith: 'corrida-', endsWith: `-${sufixo}` } } })).toBe(1);
    expect(await db.usuarioErp.count({ where: { email: { in: [email('dono-corrida-a'), email('dono-corrida-b')] } } })).toBe(1);
    expect(await db.conviteAcesso.count({ where: { parceiro: { slug: { startsWith: 'corrida-', endsWith: `-${sufixo}` } } } })).toBe(1);
    const ev = (await pedidoPorEmail(email('corrida'))).eventos.map((e) => e.acao);
    expect(ev).toEqual(['CRIOU', 'ATIVOU']);
  });

  it('ativar × recusar simultâneos: só um vence, e recusa não deixa parceiro', async () => {
    for (let i = 0; i < 3; i++) {
      const p = await novoPedido(`ativrec${i}`);
      const [a, r] = await Promise.all([
        ativarPedido(p.id, ativacao(p, `ativrec${i}-${sufixo}`, `dono-ativrec${i}`), 'Rodolfo', { base: db }),
        recusarPedido(p.id, 'não é o perfil', p.versao, 'Outro', { base: db }),
      ]);
      if (a.ok) ids.push(a.parceiro.id);
      expect([a.ok, r.ok].filter(Boolean)).toHaveLength(1);
      const depois = await pedidoPorEmail(email(`ativrec${i}`));
      expect(depois.status).toBe(a.ok ? 'ATIVADO' : 'RECUSADO');
      expect(await db.parceiroFlow.count({ where: { slug: `ativrec${i}-${sufixo}` } })).toBe(a.ok ? 1 : 0);
      expect(depois.eventos.filter((e) => e.acao === 'ATIVOU' || e.acao === 'RECUSOU')).toHaveLength(1);
    }
  });

  it('falha no meio da ativação não deixa nada (parceiro, usuário, vínculo, convite, pedido)', async () => {
    const p = await novoPedido('atomica');
    await db.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION "teste_falha_convite"() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'falha forçada no convite'; END; $$ LANGUAGE plpgsql`);
    await db.$executeRawUnsafe(`CREATE TRIGGER "teste_falha_convite" BEFORE INSERT ON "ConviteAcesso" FOR EACH ROW EXECUTE FUNCTION "teste_falha_convite"()`);
    try {
      await expect(ativarPedido(p.id, ativacao(p, `atomica-${sufixo}`, 'dono-atomica'), 'Rodolfo', { base: db })).rejects.toThrow(/falha forçada/);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER "teste_falha_convite" ON "ConviteAcesso"`);
      await db.$executeRawUnsafe(`DROP FUNCTION "teste_falha_convite"()`);
    }
    expect(await db.parceiroFlow.count({ where: { slug: `atomica-${sufixo}` } })).toBe(0);
    expect(await db.usuarioErp.count({ where: { email: email('dono-atomica') } })).toBe(0);
    const depois = await pedidoPorEmail(email('atomica'));
    expect(depois).toMatchObject({ status: 'NOVO', parceiroCriadoId: null, versao: p.versao });
    expect(depois.eventos.map((e) => e.acao)).toEqual(['CRIOU']);
    // Sem a falha, o mesmo pedido ativa.
    const ok = await ativarPedido(p.id, ativacao(p, `atomica-${sufixo}`, 'dono-atomica'), 'Rodolfo', { base: db });
    expect(ok.ok).toBe(true);
    if (ok.ok) ids.push(ok.parceiro.id);
  });

  it('slug repetido vira frase (e não cria o dono); campos inválidos voltam por campo', async () => {
    const p = await novoPedido('slugrep');
    const dono = await criarParceiro({ nome: 'Ocupado', slug: `ocupado-${sufixo}`, status: 'ATIVO' }, 'Teste', db);
    if (!dono.ok) throw new Error();
    ids.push(dono.id);
    const r = await ativarPedido(p.id, ativacao(p, `ocupado-${sufixo}`, 'dono-slugrep'), 'Rodolfo', { base: db });
    expect(r).toMatchObject({ ok: false, erros: { slug: expect.stringContaining('outro parceiro') } });
    expect(await db.usuarioErp.count({ where: { email: email('dono-slugrep') } })).toBe(0);
    const ruim = await ativarPedido(p.id, { nomeParceiro: 'x', slug: '!!', donoNome: '', donoEmail: 'x', versao: String(p.versao) }, 'Rodolfo', { base: db });
    expect(ruim.ok).toBe(false);
    expect((await pedidoPorEmail(email('slugrep'))).status).toBe('NOVO');
  });

  it('ativar com a tela velha (versão antiga) é recusado: alguém mexeu no pedido', async () => {
    const p = await novoPedido('velha');
    await moverPedido(p.id, 'EM_CONVERSA', p.versao, 'Rodolfo', { base: db });
    const r = await ativarPedido(p.id, ativacao(p, `velha-${sufixo}`, 'dono-velha'), 'Rodolfo', { base: db });
    expect(r).toMatchObject({ ok: false, erros: { geral: expect.stringContaining('Alguém mexeu') } });
    expect(await db.parceiroFlow.count({ where: { slug: `velha-${sufixo}` } })).toBe(0);
  });

  it('dono que já tem senha em outro parceiro: ativa SEM link e com a frase da 0.4; senha criada por link de parceiro é revogada nos dois históricos', async () => {
    // Pessoa que já entra num parceiro A pelo nível 1 (senha vale em todos).
    const A = await criarParceiro({ nome: 'Dono Antigo A', slug: `antigo-a-${sufixo}`, status: 'ATIVO' }, 'Teste', db);
    if (!A.ok) throw new Error();
    ids.push(A.id);
    const c = await criarAcesso(A.id, { nome: 'Pessoa Antiga', email: email('antiga') }, 'Rodolfo', { base: db });
    if (!c.ok || !c.link) throw new Error();
    expect((await definirSenhaPeloLink(c.link.token, SENHA, SENHA, { base: db })).ok).toBe(true);
    const p = await novoPedido('semlink');
    const r = await ativarPedido(p.id, ativacao(p, `semlink-${sufixo}`, 'antiga'), 'Rodolfo', { base: db });
    if (!r.ok) throw new Error(JSON.stringify(r.erros));
    ids.push(r.parceiro.id);
    expect(r.link).toBeNull();
    expect(r.mensagem).toContain('já tem senha e entra em outro parceiro');
    expect(await db.acessoParceiro.count({ where: { usuario: { email: email('antiga') } } })).toBe(2);

    // Senha criada por link de administrador do parceiro (não do nível 1): não atravessa.
    const B = await criarParceiro({ nome: 'Dono Antigo B', slug: `antigo-b-${sufixo}`, status: 'ATIVO' }, 'Teste', db);
    if (!B.ok) throw new Error();
    ids.push(B.id);
    const adminB = await criarAcesso(B.id, { nome: 'Admin B', email: email('adminb'), perfil: 'DONO' }, 'Rodolfo', { base: db });
    if (!adminB.ok || !adminB.link) throw new Error();
    await definirSenhaPeloLink(adminB.link.token, SENHA, SENHA, { base: db });
    const ator = { nome: 'Admin B', acessoId: (await db.acessoParceiro.findFirstOrThrow({ where: { parceiroId: B.id } })).id, alcance: (await validarSessao((await entrarComSenha({ email: email('adminb'), senha: SENHA, ip: ipDe('adminb') }, { base: db }) as { token: string }).token, { base: db }))!.alcance! };
    const porParceiro = await criarAcesso(B.id, { nome: 'Pessoa Por Link', email: email('porlink'), perfil: 'GERENTE' }, ator, { base: db });
    if (!porParceiro.ok || !porParceiro.link) throw new Error();
    await definirSenhaPeloLink(porParceiro.link.token, SENHA, SENHA, { base: db });
    expect((await db.usuarioErp.findUniqueOrThrow({ where: { email: email('porlink') } })).senhaPorLinkDoParceiroId).toBe(B.id);

    const p2 = await novoPedido('comlink');
    const r2 = await ativarPedido(p2.id, ativacao(p2, `comlink-${sufixo}`, 'porlink'), 'Rodolfo', { base: db });
    if (!r2.ok) throw new Error(JSON.stringify(r2.erros));
    ids.push(r2.parceiro.id);
    expect(r2.link).not.toBeNull(); // a senha caiu: link novo, pelo nível 1
    expect(r2.mensagem).toContain('foram desligadas');
    const u = await db.usuarioErp.findUniqueOrThrow({ where: { email: email('porlink') } });
    expect(u.senhaHash).toBeNull();
    const deB = await doParceiro(B.id, db).historicoAlteracao.findMany({ where: { acao: 'PEDIU_SENHA_NOVA' } });
    const deNovo = await doParceiro(r2.parceiro.id, db).historicoAlteracao.findMany({ where: { acao: 'PEDIU_SENHA_NOVA' } });
    expect(deB).toHaveLength(1);
    expect(deNovo).toHaveLength(1);
  });

  // ------------------------------------------------------------------ recusar

  it('recusar sem motivo é recusado; com motivo: evento RECUSOU e nenhum parceiro; depois, ativar/recusar de novo dá a frase', async () => {
    const p = await novoPedido('recusa');
    expect(await recusarPedido(p.id, '', p.versao, 'Rodolfo', { base: db })).toMatchObject({ ok: false });
    expect(await recusarPedido(p.id, 'ab', p.versao, 'Rodolfo', { base: db })).toMatchObject({ ok: false });
    expect((await pedidoPorEmail(email('recusa'))).status).toBe('NOVO');
    const antes = await db.parceiroFlow.count();
    expect(await recusarPedido(p.id, 'fora da região', p.versao, 'Rodolfo', { base: db })).toEqual({ ok: true, mensagem: 'Pedido recusado.' });
    expect(await db.parceiroFlow.count()).toBe(antes);
    const depois = await pedidoPorEmail(email('recusa'));
    expect(depois).toMatchObject({ status: 'RECUSADO', motivoRecusa: 'fora da região', parceiroCriadoId: null });
    expect(depois.eventos.map((e) => [e.acao, e.motivo])).toEqual([['CRIOU', null], ['RECUSOU', 'fora da região']]);
    expect(await recusarPedido(p.id, 'outra vez', depois.versao, 'Outro', { base: db })).toMatchObject({ ok: false, erro: expect.stringMatching(/já foi recusado por Rodolfo/) });
    expect(await ativarPedido(p.id, ativacao(depois, `recusa-${sufixo}`, 'dono-recusa'), 'Rodolfo', { base: db })).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/já foi recusado/) } });
  });

  it('excluir dados (LGPD): só de recusado; some nome e contato, o cartão e o histórico ficam', async () => {
    const p = await novoPedido('lgpd');
    expect(await excluirDadosDoPedido(p.id, 'Rodolfo', { base: db })).toMatchObject({ ok: false });
    pedidosExcluidos.push(p.id);
    await recusarPedido(p.id, 'sem interesse', p.versao, 'Rodolfo', { base: db });
    expect((await excluirDadosDoPedido(p.id, 'Rodolfo', { base: db })).ok).toBe(true);
    const d = (await obterPedido(p.id, { base: db }))!;
    expect(d).toMatchObject({ nomeGrupo: '(dados excluídos)', responsavel: '(dados excluídos)', email: '', whatsapp: '', cidade: '', excluido: true, status: 'RECUSADO' });
    expect(d.eventos.map((e) => e.acao)).toEqual(['EXCLUIU_DADOS', 'RECUSOU', 'CRIOU']);
    expect(JSON.stringify(d.eventos)).not.toContain('Resp lgpd');
    // Uma segunda exclusão não faz nada; e o contato antigo já não bate com pedido aberto.
    expect(await excluirDadosDoPedido(p.id, 'Rodolfo', { base: db })).toMatchObject({ ok: true, mensagem: expect.stringContaining('já tinham') });
  });

  // ---------------------------------------------------------- RASCUNHO não entra

  it('parceiro em RASCUNHO: login, sessão aberta e link de convite não valem; ativar libera; suspenso entra e lê', async () => {
    const R = await criarParceiro({ nome: 'Rascunho', slug: `rasc-${sufixo}`, status: 'ATIVO' }, 'Teste', db);
    if (!R.ok) throw new Error();
    ids.push(R.id);
    // Pessoa com senha e sessão aberta enquanto o parceiro ainda está ativo.
    const c = await criarAcesso(R.id, { nome: 'Gente do Rascunho', email: email('rasc') }, 'Rodolfo', { base: db });
    if (!c.ok || !c.link) throw new Error();
    await definirSenhaPeloLink(c.link.token, SENHA, SENHA, { base: db });
    const e1 = await entrarComSenha({ email: email('rasc'), senha: SENHA, ip: ipDe('rasc1') }, { base: db });
    if (!e1.ok) throw new Error();
    expect(await validarSessao(e1.token, { base: db })).not.toBeNull();
    // Outra pessoa só com o link (ainda sem senha).
    const c2 = await criarAcesso(R.id, { nome: 'Só com link', email: email('rasc2') }, 'Rodolfo', { base: db });
    if (!c2.ok || !c2.link) throw new Error();

    // O parceiro "volta" a rascunho (legado: nasceu assim antes da 0.5).
    await db.$executeRawUnsafe(`UPDATE "ParceiroFlow" SET status = 'RASCUNHO' WHERE id = $1`, R.id);
    expect(await validarSessao(e1.token, { base: db })).toBeNull(); // a sessão morre na próxima requisição
    const e2 = await entrarComSenha({ email: email('rasc'), senha: SENHA, ip: ipDe('rasc2') }, { base: db });
    expect(e2).toEqual({ ok: false, erro: ERRO_DE_ENTRADA, bloqueado: false });
    expect(await consultarLink(c2.link.token, { base: db })).toEqual({ valido: false });
    expect(await definirSenhaPeloLink(c2.link.token, SENHA, SENHA, { base: db })).toMatchObject({ ok: false, linkInvalido: true });
    // Não se cria acesso nem link novo num parceiro que ainda não foi liberado.
    expect(await criarAcesso(R.id, { nome: 'Mais um', email: email('rasc3') }, 'Rodolfo', { base: db })).toMatchObject({ ok: false, erros: { geral: ERRO_PARCEIRO_NAO_LIBERADO } });
    const acessoId = (await db.acessoParceiro.findFirstOrThrow({ where: { parceiroId: R.id, usuario: { email: email('rasc') } } })).id;
    expect(await gerarNovoLink(R.id, acessoId, 'Rodolfo', { base: db })).toMatchObject({ ok: false, erro: ERRO_PARCEIRO_NAO_LIBERADO });
    // A lista do nível 1 enxerga quem está preso.
    expect((await rascunhosComPessoasAtivas({ base: db })).get(R.id)).toBe(2);

    // Ativar libera.
    expect((await mudarStatusParceiro(R.id, 'ATIVO', '', 'Rodolfo', db)).ok).toBe(true);
    expect((await entrarComSenha({ email: email('rasc'), senha: SENHA, ip: ipDe('rasc3') }, { base: db })).ok).toBe(true);
    expect((await rascunhosComPessoasAtivas({ base: db })).has(R.id)).toBe(false);
    // Suspenso entra (e só lê: a regra da 0.2/0.3 não mudou).
    expect((await mudarStatusParceiro(R.id, 'SUSPENSO', 'teste', 'Rodolfo', db)).ok).toBe(true);
    const e3 = await entrarComSenha({ email: email('rasc'), senha: SENHA, ip: ipDe('rasc4') }, { base: db });
    expect(e3.ok).toBe(true);
    if (e3.ok) expect((await validarSessao(e3.token, { base: db }))?.parceiro?.status).toBe('SUSPENSO');
  });

  // ------------------------------------------------------------ isolamento

  it('a pessoa do parceiro (N2) não alcança pedido: o papel do tenant é negado no banco, mesmo logada num parceiro', async (ctx) => {
    if (!perfil.rls) return ctx.skip();
    const par = await criarParceiro({ nome: 'N2 lê', slug: `n2-${sufixo}`, status: 'ATIVO' }, 'Teste', db);
    if (!par.ok) throw new Error();
    ids.push(par.id);
    const cliente = doParceiro(par.id, db);
    for (const t of ['PedidoParceiro', 'PedidoParceiroEvento', 'TentativaPedidoParceiro']) {
      const texto = `SELECT count(*) FROM "${t}"`;
      await expect(cliente.sql(Object.assign([texto], { raw: [texto] }) as unknown as TemplateStringsArray)).rejects.toThrow(/permission denied/i);
    }
  });

  it('a lista de ativação reaproveita o miolo do acesso: dono sem lojas ainda tem a rede inteira (lojas futuras)', async () => {
    const p = await novoPedido('rede');
    const r = await ativarPedido(p.id, ativacao(p, `rede-${sufixo}`, 'dono-rede'), 'Rodolfo', { base: db });
    if (!r.ok) throw new Error();
    ids.push(r.parceiro.id);
    const a = await db.acessoParceiro.findFirstOrThrow({ where: { parceiroId: r.parceiro.id } });
    expect(a.redeInteira).toBe(true);
    expect(a.lojaIds).toEqual([]);
    expect(atorNivel1('x').alcance.nivel).toBe('FLOWFOODS');
  });
});
