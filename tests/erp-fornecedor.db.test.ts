/**
 * ERP F.1a · cadastro do fornecedor evoluído e CNPJ da loja no Postgres de verdade, pelas actions de verdade.
 *
 * Os 10 critérios da F.1a (a migração com dado antigo está em `erp-fornecedor-migracao.db.test.ts`):
 *  1. salvar sem e-mail ou sem WhatsApp = recusa, nada gravado;           2. CNPJ com dígito errado = "CNPJ inválido";
 *  3. WhatsApp sem DDD recusa, com DDD grava só os dígitos;                4. "Compras sem nota fiscal" salva só com nome e WhatsApp;
 *  5. o mesmo CNPJ recusa (com link); a filial (outro CNPJ) grava;        6. a migração dos antigos (arquivo da migração);
 *  7. CNPJ repetido no banco antigo (arquivo da migração);                 8. UF "XX" recusa, IE "ISENTO" grava;
 *  9. duas abas editando: a segunda recebe o conflito;                     10. o CNPJ da loja só por quem tem `lojas.gerir`.
 * Mais: idempotência do cadastro (clique repetido e 5 pedidos paralelos), cadastro "a completar" que só se edita completando,
 * nota de compra com fornecedor antigo e novo, isolamento entre parceiros, permissões e as barreiras do próprio banco.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-fornecedor.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const atual = vi.hoisted(() => ({ ctx: null as null | (() => unknown) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`REDIRECT ${url}`), { url });
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('@/lib/erp/sessao', () => ({
  aparelhoAtual: () => 'Teste',
  linkDePrimeiroAcesso: (t: string) => `http://teste/entrar/primeiro-acesso/${t}`,
}));
vi.mock('@/lib/erp/contexto', async () => {
  const { recusaDaAcao, exigirPermissao, pode } = await import('@/lib/erp/permissoes');
  return { exigirParceiroDaSessao: async () => atual.ctx!(), exigirParceiro: async () => atual.ctx!(), recusaDaAcao, exigirPermissao, pode };
});
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarLoja, listarEstrutura, salvarCnpjDaLoja } from '@/lib/erp/estrutura';
import { cadastrarFornecedor, editarFornecedor, lancarNota, listarFornecedores, mudarSituacaoFornecedor, obterFornecedor } from '@/lib/erp/compras';
import { listarHistorico } from '@/lib/erp/historico';
import { resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import * as comprasDaSessao from '@/app/erp/compras/actions';
import { acaoSalvarCnpjDaLojaDaSessao } from '@/app/erp/actions';
import { conferirMigracao, relatorioDeFornecedores } from '../scripts/erp-conferir-migracao';
import { cadastrarInsumoDeTeste as cadastrarInsumo, cru, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;

/** Um CNPJ com os dígitos verificadores certos a partir dos 12 primeiros dígitos (cada cenário usa o seu: o documento é único). */
function cnpjDe(base12: string): string {
  const dv = (d: string, pesos: number[]) => {
    const r = pesos.reduce((s, p, i) => s + p * Number(d[i]), 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(base12 + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base12}${d1}${d2}`;
}

describe.skipIf(!URL_TESTE)('ERP F.1a · fornecedor evoluído e CNPJ da loja (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `f${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string; slug: string; nome: string; status: string };
  let B: { id: string; slug: string; nome: string; status: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};

  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', lojaIds: string[] | 'rede'): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const ctxDe = (parceiro: typeof A, alcance: Alcance, autorNome: string, userId = 'u-dona') => ({
    parceiro,
    alcance,
    cliente: doParceiro(parceiro.id, db),
    bloqueio: null,
    podeEscrever: true,
    sessao: { userId, autorNome },
  });
  const DONA = () => alcanceDe('DONO', 'rede');
  const comoDona = (userId = 'u-dona') => (atual.ctx = () => ctxDe(A, DONA(), 'Marina Dona', userId));
  const rodar = async <T,>(fn: () => Promise<T>): Promise<T | { redirect: string }> => {
    try {
      return await fn();
    } catch (e) {
      const url = (e as { url?: string }).url;
      if (url) return { redirect: url };
      throw e;
    }
  };
  const idDo = (r: unknown) => (r as { redirect: string }).redirect.split('?')[0].split('/').pop()!;
  const feitoDo = (r: unknown) => new URL((r as { redirect: string }).redirect, 'http://x').searchParams.get('feito');

  /** O cadastro completo do roteiro, com o que mudar por cima. */
  const formDe = (extra: Record<string, string> = {}, tirar: string[] = []) => {
    const f = new FormData();
    const campos: Record<string, string> = {
      nome: 'Laticínios Exemplo',
      razaoSocial: 'Laticínios Exemplo Ltda',
      documento: '11.222.333/0001-81',
      inscricaoEstadual: '12345678',
      endereco: 'Rua das Flores, 100',
      municipio: 'Rio de Janeiro',
      uf: 'RJ',
      cep: '21020-000',
      contatoComercial: 'Seu Jorge',
      whatsapp: '(21) 99641-6060',
      email: 'Vendas@Exemplo.com.br',
      prazoPagamentoDias: '28',
      ...extra,
    };
    for (const [k, v] of Object.entries(campos)) if (!tirar.includes(k)) f.set(k, v);
    return f;
  };
  const quantos = () => a.fornecedor.count();
  const cadastrar = (f: FormData) => rodar(() => comprasDaSessao.acaoCadastrarFornecedor(null, f));

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Fornecedores A', slug: `forn-a-${sufixo}`, status: 'ATIVO' } });
    B = await db.parceiroFlow.create({ data: { nome: 'Fornecedores B', slug: `forn-b-${sufixo}`, status: 'ATIVO' } });
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    for (const [chave, nome] of [['vp', 'Vila da Penha'], ['centro', 'Centro']] as const) {
      const r = await cadastrarLoja(a, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
    }
    const lb = await cadastrarLoja(b, { nome: 'Loja B' }, 'Bia');
    if (!lb.ok) throw new Error(JSON.stringify(lb));
    ids.lojaB = lb.id;
    const ins = await cadastrarInsumo(a, { nome: 'Muçarela', tipo: 'INGREDIENTE', unidade: 'KG', escala: 'base', conteudo: '1', preco: '40,00' });
    if (!ins.ok) throw new Error(JSON.stringify(ins));
    ids.mucarela = ins.id;
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
  });

  it('critério 1: sem e-mail ou sem WhatsApp (ou razão social) a action recusa, o formulário volta preenchido e NADA é gravado', async () => {
    comoDona();
    expect(await quantos()).toBe(0);
    expect(await cadastrar(formDe({}, ['email']))).toMatchObject({ ok: false, erros: { email: expect.stringMatching(/e-mail/) } });
    expect(await cadastrar(formDe({}, ['whatsapp']))).toMatchObject({ ok: false, erros: { whatsapp: expect.stringMatching(/WhatsApp com DDD/) } });
    expect(await cadastrar(formDe({}, ['razaoSocial']))).toMatchObject({ ok: false, erros: { razaoSocial: expect.stringMatching(/razão social/) } });
    expect(await cadastrar(formDe({}, ['documento']))).toMatchObject({ ok: false, erros: { documento: expect.stringMatching(/Informe o CNPJ ou CPF/) } });
    const varios = await cadastrar(formDe({ nome: '' }, ['email', 'whatsapp']));
    expect(Object.keys((varios as { erros: object }).erros).sort()).toEqual(['email', 'nome', 'whatsapp']);
    expect(await quantos()).toBe(0);
  });

  it('critérios 2 e 3: CNPJ com dígito errado e WhatsApp sem DDD são recusados', async () => {
    comoDona();
    expect(await cadastrar(formDe({ documento: '11.222.333/0001-82' }))).toMatchObject({ erros: { documento: expect.stringMatching(/CNPJ ou CPF inválido/) } });
    expect(await cadastrar(formDe({ whatsapp: '99641-6060' }))).toMatchObject({ erros: { whatsapp: expect.stringMatching(/DDD/) } });
    expect(await quantos()).toBe(0);
  });

  it('o cadastro completo grava normalizado, nasce COMPLETO, confirma com o nome e deixa o histórico', async () => {
    comoDona();
    const r = await cadastrar(formDe());
    expect(r).toMatchObject({ redirect: expect.stringMatching(/^\/erp\/compras\/fornecedores\/.+\?feito=criado$/) });
    ids.matriz = idDo(r);
    const f = (await a.fornecedor.findUnique({ where: { id: ids.matriz } }))!;
    expect(f).toMatchObject({
      nome: 'Laticínios Exemplo',
      razaoSocial: 'Laticínios Exemplo Ltda',
      documento: '11222333000181',
      inscricaoEstadual: '12345678',
      uf: 'RJ',
      cep: '21020000',
      email: 'vendas@exemplo.com.br',
      whatsapp: '21996416060',
      contatoComercial: 'Seu Jorge',
      prazoPagamentoDias: 28,
      semNotaFiscal: false,
      situacaoCadastro: 'COMPLETO',
    });
    const [h] = await listarHistorico(a, { de: [{ entidade: 'Fornecedor', ids: [ids.matriz] }], verPrecos: true });
    const campo = (nome: string) => h.mudancas.find((m) => m.campo === nome)?.depois;
    expect(campo('CNPJ/CPF')).toBe('11.222.333/0001-81');
    expect(campo('WhatsApp')).toBe('(21) 99641-6060');
    expect(campo('e-mail')).toBe('vendas@exemplo.com.br');
    expect(campo('prazo de pagamento')).toBe('28 dias');
    const d = (await obterFornecedor(a, DONA(), ids.matriz))!;
    expect(d).toMatchObject({ situacaoCadastro: 'COMPLETO', falta: [], documentoAConferir: false, mesmaEmpresa: [] });
  });

  it('critério 4: "Compras sem nota fiscal" salva só com nome e WhatsApp, fica sem documento e entra na lista como tal', async () => {
    comoDona();
    const f = new FormData();
    f.set('nome', 'Feira do Seu Zé');
    f.set('semNotaFiscal', 'on');
    f.set('whatsapp', '(21) 98888-7777');
    const r = await cadastrar(f);
    expect(feitoDo(r)).toBe('criado');
    ids.feira = idDo(r);
    expect(await a.fornecedor.findUnique({ where: { id: ids.feira } })).toMatchObject({ documento: null, email: null, razaoSocial: null, semNotaFiscal: true, situacaoCadastro: 'COMPLETO', whatsapp: '21988887777' });
    // Sem o WhatsApp, nem a exceção salva.
    const sem = new FormData();
    sem.set('nome', 'Outra feira');
    sem.set('semNotaFiscal', 'on');
    expect(await cadastrar(sem)).toMatchObject({ erros: { whatsapp: expect.any(String) } });
  });

  it('critério 5: o mesmo CNPJ é recusado com o link do que já existe; a filial (outro CNPJ) é gravada e as duas se avisam, sem fusão', async () => {
    comoDona();
    const repetido = await cadastrar(formDe({ nome: 'Laticínios Exemplo Centro' }));
    expect(repetido).toMatchObject({ ok: false, erros: { documento: expect.stringMatching(/Já existe “Laticínios Exemplo” com este CNPJ/) }, existenteId: ids.matriz });
    // Escrito com máscara ou sem, é o mesmo documento.
    expect(await cadastrar(formDe({ nome: 'Outro nome', documento: '11222333000181' }))).toMatchObject({ existenteId: ids.matriz });
    const quantosAntes = await quantos();
    const filial = await cadastrar(formDe({ nome: 'Laticínios Exemplo - Penha', razaoSocial: 'Laticínios Exemplo Ltda', documento: '11.222.333/0002-62', email: 'penha@exemplo.com.br' }));
    expect(feitoDo(filial)).toBe('criado');
    ids.filial = idDo(filial);
    expect(await quantos()).toBe(quantosAntes + 1);
    // Cada um enxerga o outro como "mesma empresa, outro estabelecimento"; nada foi unido.
    expect((await obterFornecedor(a, DONA(), ids.filial))!.mesmaEmpresa.map((o) => o.nome)).toEqual(['Laticínios Exemplo']);
    expect((await obterFornecedor(a, DONA(), ids.matriz))!.mesmaEmpresa.map((o) => o.nome)).toEqual(['Laticínios Exemplo - Penha']);
    expect((await obterFornecedor(a, DONA(), ids.feira))!.mesmaEmpresa).toEqual([]);
    // Desativado também segura o documento, mas com o caminho de reativar.
    const des = await mudarSituacaoFornecedor(a, ids.filial, false, 'fechou', 'Marina');
    expect(des.ok).toBe(true);
    expect(await cadastrar(formDe({ nome: 'Laticínios Exemplo - Penha 2', documento: '11222333000262' }))).toMatchObject({ erros: { documento: expect.stringMatching(/desativado/) }, desativadoId: ids.filial });
    expect((await mudarSituacaoFornecedor(a, ids.filial, true, null, 'Marina')).ok).toBe(true);
  });

  it('nome repetido (também escrito de outro jeito) é recusado; o mesmo nome em OUTRO parceiro pode', async () => {
    comoDona();
    expect(await cadastrar(formDe({ nome: 'Laticínios Exemplo', documento: '52998224725' }))).toMatchObject({
      erros: { nome: expect.stringMatching(/Já existe um fornecedor com esse nome.*bairro ou a cidade/) },
      existenteId: ids.matriz,
    });
    expect(await cadastrar(formDe({ nome: 'LATICINIOS  EXEMPLO', documento: '52998224725' }))).toMatchObject({
      erros: { nome: expect.stringMatching(/o mesmo nome, escrito de outro jeito/) },
      existenteId: ids.matriz,
    });
    const emB = await cadastrarFornecedor(b, { nome: 'Laticínios Exemplo', razaoSocial: 'Outro Ltda', documento: '11.222.333/0001-81', email: 'b@b.com', whatsapp: '(21) 99641-6060' }, 'Bia');
    expect(emB.ok).toBe(true); // o mesmo CNPJ e o mesmo nome, em outro parceiro: são mundos separados
    if (emB.ok) ids.fornB = emB.id;
  });

  it('critério 8: UF "XX" é recusada e a IE "ISENTO" grava', async () => {
    comoDona();
    expect(await cadastrar(formDe({ nome: 'Distribuidora UF', documento: '52998224725', uf: 'XX' }))).toMatchObject({ erros: { uf: expect.stringMatching(/UF inválida/) } });
    const r = await cadastrar(formDe({ nome: 'Distribuidora Isenta', documento: '52998224725', inscricaoEstadual: 'ISENTO' }));
    expect(feitoDo(r)).toBe('criado');
    ids.isenta = idDo(r);
    expect(await a.fornecedor.findUnique({ where: { id: ids.isenta } })).toMatchObject({ inscricaoEstadual: 'ISENTO', documento: '52998224725' });
  });

  it('idempotência: o mesmo envio duas vezes (e cinco ao mesmo tempo) cadastra UM fornecedor; a mesma chave com outro conteúdo é recusada', async () => {
    comoDona();
    const envio = `envio-${sufixo}-1`;
    const pedido = () => formDe({ envio, nome: 'Hortifruti Penha', razaoSocial: 'Hortifruti Penha ME', documento: '45.723.174/0001-10', email: 'h@h.com.br' });
    const antes = await quantos();
    const primeiro = await cadastrar(pedido());
    expect(feitoDo(primeiro)).toBe('criado');
    ids.horti = idDo(primeiro);
    const segundo = await cadastrar(pedido());
    expect(feitoDo(segundo)).toBe('criado-repetido');
    expect(idDo(segundo)).toBe(ids.horti);
    expect(await quantos()).toBe(antes + 1);

    const paralelos = await Promise.all(
      Array.from({ length: 5 }, () => cadastrar(formDe({ envio: `envio-${sufixo}-2`, nome: 'Padaria Penha', razaoSocial: 'Padaria Penha ME', documento: '07.526.557/0001-00', email: 'p@p.com.br' }))),
    );
    expect(paralelos.every((r) => 'redirect' in (r as object))).toBe(true);
    expect(new Set(paralelos.map(idDo)).size).toBe(1);
    expect(await quantos()).toBe(antes + 2);

    // Mesma chave, conteúdo diferente: não é reenvio.
    const diferente = await cadastrar(formDe({ envio, nome: 'Hortifruti Penha', razaoSocial: 'Hortifruti Penha ME', documento: '45.723.174/0001-10', email: 'outro@h.com.br' }));
    expect(diferente).toMatchObject({ ok: false, conflito: true, erros: { geral: expect.stringMatching(/dados diferentes/) } });
    // Chave torta é recusada; a chave de OUTRA pessoa não reconhece o envio desta.
    expect(await cadastrar(formDe({ envio: 'x y', nome: 'Torta' }))).toMatchObject({ erros: { geral: expect.stringMatching(/chave válida/) } });
    comoDona('u-outra-pessoa');
    const deOutra = await cadastrar(formDe({ envio, nome: 'Hortifruti Penha 2', razaoSocial: 'Hortifruti Penha ME', documento: '45.723.174/0001-10', email: 'h@h.com.br' }));
    expect(deOutra).toMatchObject({ existenteId: ids.horti }); // é outro envio: cai na regra do CNPJ repetido
    comoDona();
  });

  it('cinco cadastros ao mesmo tempo do MESMO CNPJ (envios diferentes): exatamente um entra', async () => {
    comoDona();
    const antes = await quantos();
    const rs = await Promise.all(
      Array.from({ length: 5 }, (_, n) => cadastrar(formDe({ envio: `corrida-${sufixo}-${n}`, nome: `Corrida ${n}`, razaoSocial: 'Corrida Ltda', documento: '33.000.167/0001-01', email: 'c@c.com.br' }))),
    );
    expect(rs.filter((r) => 'redirect' in (r as object))).toHaveLength(1);
    expect(rs.filter((r) => (r as { erros?: { documento?: string } }).erros?.documento)).toHaveLength(4);
    expect(await quantos()).toBe(antes + 1);
  });

  it('cadastro "a completar" (dos antigos): lista e detalhe dizem o que falta, recebe nota, e só se edita completando', async () => {
    comoDona();
    // O fornecedor de ANTES da F.1a: nome, um contato em texto livre e um documento que não passa nos dígitos verificadores.
    const antigo = await a.fornecedor.create({ data: { parceiroId: A.id, nome: 'Frigorífico Antigo', documento: '11222333000199', contato: 'Seu Jorge (21) 99999-0000' } });
    const semDoc = await a.fornecedor.create({ data: { parceiroId: A.id, nome: 'Atacarejo Antigo' } });
    ids.antigo = antigo.id;
    ids.semDoc = semDoc.id;
    expect(antigo.situacaoCadastro).toBe('A_COMPLETAR');

    const d = (await obterFornecedor(a, DONA(), antigo.id))!;
    expect(d).toMatchObject({ situacaoCadastro: 'A_COMPLETAR', falta: ['razão social', 'e-mail', 'WhatsApp'], documentoAConferir: true, contato: 'Seu Jorge (21) 99999-0000' });
    expect((await obterFornecedor(a, DONA(), semDoc.id))!.falta).toEqual(['razão social', 'CNPJ ou CPF', 'e-mail', 'WhatsApp']);
    const lista = await listarFornecedores(a, DONA(), { cadastro: 'a-completar' });
    expect(lista.map((f) => f.nome).sort()).toEqual(['Atacarejo Antigo', 'Frigorífico Antigo']);
    expect((await listarFornecedores(a, DONA(), { cadastro: 'completos' })).some((f) => f.nome === 'Frigorífico Antigo')).toBe(false);
    expect((await listarFornecedores(a, DONA(), { q: 'antigo' })).map((f) => f.nome).sort()).toEqual(['Atacarejo Antigo', 'Frigorífico Antigo']);

    // Recebe nota normalmente, como qualquer outro (o antigo e o novo na mesma conferência).
    for (const [forn, numero] of [[antigo.id, '501'], [ids.matriz, '502'], [ids.feira, '503']] as const) {
      const n = await lancarNota(a, DONA(), { lojaId: ids.vp, fornecedorId: forn, numero, serie: '', data: '2026-10-14', frete: '', total: '40,00', itens: [{ insumoId: ids.mucarela, embalagem: 'padrao', quantidade: '1', valor: '40,00' }] }, 'Marina');
      expect(n.ok, numero).toBe(true);
    }
    expect((await obterFornecedor(a, DONA(), antigo.id))!.notas).toHaveLength(1);

    // Editar é completar: o servidor exige tudo, também no "a completar", e o documento inválido não passa.
    const versao = d.versao;
    const incompleto = new FormData();
    incompleto.set('versao', versao);
    incompleto.set('nome', 'Frigorífico Antigo');
    incompleto.set('documento', '11222333000199');
    const ruim = await rodar(() => comprasDaSessao.acaoEditarFornecedor(antigo.id, null, incompleto));
    expect(Object.keys((ruim as { erros: object }).erros).sort()).toEqual(['documento', 'email', 'razaoSocial', 'whatsapp']);
    expect((await a.fornecedor.findUnique({ where: { id: antigo.id } }))!.situacaoCadastro).toBe('A_COMPLETAR');

    const completo = formDe({ versao, nome: 'Frigorífico Antigo', razaoSocial: 'Frigorífico Antigo Ltda', documento: cnpjDe('123456780001'), email: 'f@f.com.br' });
    const ok = await rodar(() => comprasDaSessao.acaoEditarFornecedor(antigo.id, null, completo));
    expect(feitoDo(ok)).toBe('editado');
    expect(await a.fornecedor.findUnique({ where: { id: antigo.id } })).toMatchObject({ situacaoCadastro: 'COMPLETO', contato: 'Seu Jorge (21) 99999-0000', documento: cnpjDe('123456780001') });
    const [h] = await listarHistorico(a, { de: [{ entidade: 'Fornecedor', ids: [antigo.id] }], verPrecos: true });
    const cad = h.mudancas.find((m) => m.campo === 'cadastro');
    expect(cad).toMatchObject({ antes: 'a completar', depois: 'completo' });
    // As notas, os ids e o vínculo continuam: nada foi trocado de lugar.
    expect((await obterFornecedor(a, DONA(), antigo.id))!.notas).toHaveLength(1);
  });

  it('o antigo "sem documento" completa como "Compras sem nota fiscal" (só o WhatsApp falta)', async () => {
    comoDona();
    const d = (await obterFornecedor(a, DONA(), ids.semDoc))!;
    const f = new FormData();
    f.set('versao', d.versao);
    f.set('nome', 'Atacarejo Antigo');
    f.set('semNotaFiscal', 'on');
    f.set('whatsapp', '(21) 3333-4444');
    expect(feitoDo(await rodar(() => comprasDaSessao.acaoEditarFornecedor(ids.semDoc, null, f)))).toBe('editado');
    expect(await a.fornecedor.findUnique({ where: { id: ids.semDoc } })).toMatchObject({ situacaoCadastro: 'COMPLETO', semNotaFiscal: true, whatsapp: '2133334444' });
  });

  it('critério 9: duas abas editando o mesmo fornecedor — a segunda recebe o conflito e nada é sobrescrito', async () => {
    comoDona();
    const lido = (await obterFornecedor(a, DONA(), ids.horti))!.versao;
    const aba1 = formDe({ versao: lido, nome: 'Hortifruti Penha', razaoSocial: 'Hortifruti Penha ME', documento: '45.723.174/0001-10', email: 'h@h.com.br', prazoPagamentoDias: '15' });
    const aba2 = formDe({ versao: lido, nome: 'Hortifruti Penha', razaoSocial: 'Hortifruti Penha ME', documento: '45.723.174/0001-10', email: 'h@h.com.br', prazoPagamentoDias: '45' });
    expect(feitoDo(await rodar(() => comprasDaSessao.acaoEditarFornecedor(ids.horti, null, aba1)))).toBe('editado');
    const segunda = await rodar(() => comprasDaSessao.acaoEditarFornecedor(ids.horti, null, aba2));
    expect(segunda).toMatchObject({ ok: false, conflito: true, erros: { geral: expect.stringMatching(/Alguém alterou/) } });
    expect((await a.fornecedor.findUnique({ where: { id: ids.horti } }))!.prazoPagamentoDias).toBe(15);
    // Nada mudou = sem gravar, sem histórico novo.
    const novaVersao = (await obterFornecedor(a, DONA(), ids.horti))!.versao;
    const completoIgual = formDe({ versao: novaVersao, nome: 'Hortifruti Penha', razaoSocial: 'Hortifruti Penha ME', documento: '45.723.174/0001-10', email: 'h@h.com.br', prazoPagamentoDias: '15' });
    expect(feitoDo(await rodar(() => comprasDaSessao.acaoEditarFornecedor(ids.horti, null, completoIgual)))).toBe('igual');
  });

  it('editar para o CNPJ de outro fornecedor é recusado; para o do próprio, passa', async () => {
    comoDona();
    const v = (await obterFornecedor(a, DONA(), ids.horti))!.versao;
    const roubando = formDe({ versao: v, nome: 'Hortifruti Penha', razaoSocial: 'Hortifruti Penha ME', documento: '11.222.333/0001-81', email: 'h@h.com.br' });
    expect(await rodar(() => comprasDaSessao.acaoEditarFornecedor(ids.horti, null, roubando))).toMatchObject({ existenteId: ids.matriz, erros: { documento: expect.stringMatching(/Já existe/) } });
  });

  it('permissões: operador não cadastra nem edita (nada gravado); o gerente cadastra (cadastro da rede); ver o cadastro sai com a nota só nas lojas dele', async () => {
    const antes = await quantos();
    atual.ctx = () => ctxDe(A, alcanceDe('OPERADOR', [ids.vp]), 'Op', 'u-op');
    expect(await cadastrar(formDe({ nome: 'Do operador', documento: '52998224725' }))).toMatchObject({ erros: { geral: expect.stringMatching(/cadastrar fornecedores/) } });
    expect(await quantos()).toBe(antes);
    atual.ctx = () => ctxDe(A, alcanceDe('GERENTE', [ids.centro]), 'Gerente do Centro', 'u-ger');
    const r = await cadastrar(formDe({ nome: 'Do gerente', razaoSocial: 'Do Gerente ME', documento: cnpjDe('223456780001') }));
    expect(feitoDo(r)).toBe('criado');
    ids.doGerente = idDo(r);
    comoDona();
    // O gerente do Centro vê o cadastro, mas as notas do fornecedor só das lojas dele (a nota 501–503 é da Vila da Penha).
    const gerente = alcanceDe('GERENTE', [ids.centro]);
    expect((await obterFornecedor(a, gerente, ids.antigo))!.notas).toEqual([]);
    expect((await obterFornecedor(a, DONA(), ids.antigo))!.notas).toHaveLength(1);
    // Sem "ver compras" (operador): o cadastro vem, as notas e os preços não.
    const operador = alcanceDe('OPERADOR', [ids.vp]);
    expect((await obterFornecedor(a, operador, ids.antigo))!.notas).toEqual([]);
  });

  it('isolamento: B não lê, não edita nem usa fornecedor de A; cada um só lista os seus', async () => {
    expect(await obterFornecedor(b, alcanceDe('DONO', 'rede'), ids.matriz)).toBeNull();
    const editar = await editarFornecedor(b, ids.matriz, { versao: new Date().toISOString(), nome: 'x' }, 'Bia');
    expect(editar).toMatchObject({ ok: false });
    expect((await listarFornecedores(b, alcanceDe('DONO', 'rede'))).map((f) => f.nome)).toEqual(['Laticínios Exemplo']);
    expect((await listarFornecedores(b, alcanceDe('DONO', 'rede')))[0].id).toBe(ids.fornB);
    expect((await listarFornecedores(a, DONA(), { q: '11222333000181' })).map((f) => f.nome)).toEqual(['Laticínios Exemplo']);
  });

  it('o banco também segura: documento repetido por SQL cru, "completo" sem o básico e formato fora da regra', async () => {
    const dup = cru(db, perfil, A.id, `INSERT INTO "Fornecedor"(id,"parceiroId",nome,documento,"atualizadoEm") VALUES ('fx1',$1,'Duplicado cru','11222333000181',now())`, A.id);
    await expect(dup).rejects.toThrow(/23505|already exists/);
    const semBasico = cru(db, perfil, A.id, `INSERT INTO "Fornecedor"(id,"parceiroId",nome,"situacaoCadastro","atualizadoEm") VALUES ('fx2',$1,'Completo sem nada','COMPLETO',now())`, A.id);
    await expect(semBasico).rejects.toThrow(/Fornecedor_completo_tem_o_basico/);
    for (const [col, valor, check] of [
      ['whatsapp', '996416060', 'Fornecedor_whatsapp_formato'],
      ['uf', 'XX', 'Fornecedor_uf_valida'],
      ['cep', '123', 'Fornecedor_cep_formato'],
      ['email', 'sem-arroba', 'Fornecedor_email_formato'],
      ['inscricaoEstadual', 'ABC', 'Fornecedor_inscricao_formato'],
      ['documento', '123', 'Fornecedor_documento_formato'],
    ] as const) {
      await expect(cru(db, perfil, A.id, `INSERT INTO "Fornecedor"(id,"parceiroId",nome,"${col}","atualizadoEm") VALUES ('fx3',$1,'Torto ${col}',$2,now())`, A.id, valor), col).rejects.toThrow(new RegExp(check));
    }
    await expect(cru(db, perfil, A.id, `INSERT INTO "Fornecedor"(id,"parceiroId",nome,"prazoPagamentoDias","atualizadoEm") VALUES ('fx4',$1,'Prazo torto',181,now())`, A.id)).rejects.toThrow(/Fornecedor_prazo_faixa/);
  });

  it('o conferidor pós-deploy não acha pendência e conta os "a completar" e o documento a conferir', async () => {
    expect(await conferirMigracao(db)).toEqual([]);
    const rel = await relatorioDeFornecedores(db);
    expect(rel.repetidos).toEqual([]);
    expect(rel.documentosAConferir.filter((d) => d.parceiro === A.slug)).toEqual([]); // o antigo já foi completado acima
    expect(rel.aCompletar).toBeGreaterThanOrEqual(0);
  });

  // ------------------------------------------------------------------------------------------------ CNPJ da loja

  describe('o CNPJ da loja', () => {
    const formCnpj = (cnpj: string, lido = '') => {
      const f = new FormData();
      f.set('cnpj', cnpj);
      f.set('lido', lido);
      return f;
    };

    it('critério 10: só quem tem `lojas.gerir` (rede inteira) grava; o gerente é negado e nada muda', async () => {
      atual.ctx = () => ctxDe(A, alcanceDe('GERENTE', [ids.vp]), 'Gerente', 'u-ger');
      const negado = await acaoSalvarCnpjDaLojaDaSessao(ids.vp, null, formCnpj('11.444.777/0001-61'));
      expect(negado).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/cadastrar lojas|Sem permissão|permiss/i) } });
      expect((await a.loja.findUnique({ where: { id: ids.vp } }))!.cnpj).toBeNull();
      comoDona();
      const ok = await acaoSalvarCnpjDaLojaDaSessao(ids.vp, null, formCnpj('11.444.777/0001-61'));
      expect(ok).toMatchObject({ ok: true, mensagem: 'CNPJ da loja salvo com sucesso: 11.444.777/0001-61.' });
      expect((await a.loja.findUnique({ where: { id: ids.vp } }))!.cnpj).toBe('11444777000161');
      const { lojas } = await listarEstrutura(a, DONA());
      expect(lojas.find((l) => l.id === ids.vp)!.cnpj).toBe('11444777000161');
      const [h] = await listarHistorico(a, { de: [{ entidade: 'Loja', ids: [ids.vp] }], verPrecos: true });
      expect(h.mudancas.find((m) => m.campo === 'CNPJ')).toMatchObject({ antes: '—', depois: '11.444.777/0001-61' });
    });

    it('CNPJ com dígito errado, CPF e lixo são recusados; o mesmo valor diz "nada mudou"; vazio remove', async () => {
      comoDona();
      expect(await acaoSalvarCnpjDaLojaDaSessao(ids.vp, null, formCnpj('11.444.777/0001-62', '11444777000161'))).toMatchObject({ ok: false, erros: { cnpj: expect.stringMatching(/CNPJ inválido/) } });
      expect(await acaoSalvarCnpjDaLojaDaSessao(ids.vp, null, formCnpj('529.982.247-25', '11444777000161'))).toMatchObject({ ok: false, erros: { cnpj: expect.any(String) } });
      expect((await a.loja.findUnique({ where: { id: ids.vp } }))!.cnpj).toBe('11444777000161');
      expect(await acaoSalvarCnpjDaLojaDaSessao(ids.vp, null, formCnpj('11444777000161', '11444777000161'))).toMatchObject({ ok: true, mensagem: 'Nada mudou: o CNPJ já era esse.' });
      expect(await acaoSalvarCnpjDaLojaDaSessao(ids.vp, null, formCnpj('', '11444777000161'))).toMatchObject({ ok: true, mensagem: 'CNPJ da loja removido.' });
      expect((await a.loja.findUnique({ where: { id: ids.vp } }))!.cnpj).toBeNull();
    });

    it('não é único: a segunda loja pode ter o mesmo CNPJ, e a frase avisa qual; a versão lida protege contra duas abas', async () => {
      comoDona();
      expect(await acaoSalvarCnpjDaLojaDaSessao(ids.vp, null, formCnpj('11.444.777/0001-61', ''))).toMatchObject({ ok: true });
      const segunda = await acaoSalvarCnpjDaLojaDaSessao(ids.centro, null, formCnpj('11.444.777/0001-61', ''));
      expect(segunda).toMatchObject({ ok: true, mensagem: expect.stringMatching(/A loja Vila da Penha usa o mesmo CNPJ/) });
      // A aba que leu "vazio" quando já havia CNPJ recebe o conflito.
      expect(await acaoSalvarCnpjDaLojaDaSessao(ids.vp, null, formCnpj('11.222.333/0001-81', ''))).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/Alguém mudou/) } });
      expect((await a.loja.findUnique({ where: { id: ids.vp } }))!.cnpj).toBe('11444777000161');
    });

    it('isolamento: a loja de outro parceiro não existe para a sessão de A, e o CHECK do banco recusa CNPJ torto', async () => {
      comoDona();
      expect(await acaoSalvarCnpjDaLojaDaSessao(ids.lojaB, null, formCnpj('11.444.777/0001-61', ''))).toMatchObject({ ok: false, erros: { geral: 'Loja não encontrada.' } });
      expect((await b.loja.findUnique({ where: { id: ids.lojaB } }))!.cnpj).toBeNull();
      expect(await salvarCnpjDaLoja(b, ids.vp, '11.444.777/0001-61', '', 'Bia')).toMatchObject({ ok: false });
      await expect(cru(db, perfil, A.id, `UPDATE "Loja" SET cnpj = '123' WHERE id = $1`, ids.vp)).rejects.toThrow(/Loja_cnpj_formato/);
    });
  });
});
