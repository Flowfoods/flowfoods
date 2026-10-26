/**
 * Decisão 477 — cadastrar cliente no Portal pela tela: o endereço sai do nome, o formulário é conferido no servidor (com a
 * confirmação da marca do questionário, porque as perguntas citam a marca) e a ação abre a página do cliente; nada é
 * gravado com nome, questionário ou confirmação inválidos, sem sessão, nem com nome repetido; erro do banco não quebra a tela.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const banco = vi.hoisted(() => ({
  criados: [] as unknown[],
  auditorias: [] as unknown[],
  redirecionou: '',
  sessao: { user: { id: 'rodolfo' } } as null | { user: { id: string } },
  falhaAoCriar: null as null | Error,
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    banco.redirecionou = url;
    throw new Error('REDIRECT');
  },
}));
vi.mock('next-auth', () => ({ getServerSession: async () => banco.sessao }));
vi.mock('@/lib/rodolfo/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => {
  const prisma: Record<string, unknown> = {
    portalCliente: {
      findUnique: async ({ where }: { where: { slug: string } }) => (where.slug === 'grupo-teste' ? { id: 'portal_grupo-teste' } : null),
      findMany: async () => [{ nome: "Grupo Valentin's" }],
      create: async ({ data }: { data: { id: string; slug: string; token: string } }) => {
        if (banco.falhaAoCriar) throw banco.falhaAoCriar;
        banco.criados.push(data);
        return { id: data.id, slug: data.slug, token: data.token };
      },
    },
    auditLog: { create: async ({ data }: { data: unknown }) => banco.auditorias.push(data) },
  };
  prisma.$transaction = async (fn: (tx: unknown) => unknown) => fn(prisma);
  return { prisma };
});

import { lerNovoCliente, slugDoNome } from '@/lib/portal/cadastro';
import { acaoCadastrarCliente } from '@/app/rodolfo/(painel)/portal/actions';

const form = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.append(k, v);
  return f;
};
const rodar = async (f: FormData) => {
  banco.redirecionou = '';
  try {
    return await acaoCadastrarCliente(null, f);
  } catch (e) {
    if ((e as Error).message !== 'REDIRECT') throw e;
    return 'redirecionou';
  }
};
const VALIDO = { nome: 'Grupo Teste', questionario: 'valentins', confirmaMarca: 'on' };

describe('decisão 477 · o endereço e a conferência', () => {
  it('o endereço sai do nome, sem acento, apóstrofo nem símbolo', () => {
    expect(slugDoNome("Grupo Valentin's")).toBe('grupo-valentins');
    expect(slugDoNome('  Bar do Zé & Cia.  ')).toBe('bar-do-ze-cia');
    expect(slugDoNome('Pão de Açúcar — Méier')).toBe('pao-de-acucar-meier');
    expect(slugDoNome('🍔🍔')).toBe('');
    expect(slugDoNome('x'.repeat(100))).toHaveLength(60);
  });

  it('nome, questionário, confirmação da marca e nome repetido', () => {
    const disponiveis = [{ chave: 'valentins', marca: "Grupo Valentin's" }];
    const ler = (e: Partial<typeof VALIDO> & Record<string, unknown>, existentes: string[] = []) => lerNovoCliente({ ...VALIDO, ...e }, disponiveis, existentes);
    expect(ler({ nome: '  Grupo   Teste ' })).toEqual({ ok: true, nome: 'Grupo Teste', questionario: 'valentins' });
    // Caractere de controle sai (o nulo o banco recusaria).
    expect(ler({ nome: 'Bar\u0000 do\tZé' })).toEqual({ ok: true, nome: 'Bar do Zé', questionario: 'valentins' });
    expect(ler({ nome: 'A' })).toMatchObject({ ok: false, erro: expect.stringMatching(/pelo menos 2/) });
    expect(ler({ nome: 'x '.repeat(41) })).toMatchObject({ ok: false, erro: expect.stringMatching(/até 80/) });
    expect(ler({ nome: '🍔🍔🍔' })).toMatchObject({ ok: false, erro: expect.stringMatching(/letra ou número/) });
    expect(ler({ nome: 'PizzariaDonaFlorDeliveryDaPenha' })).toMatchObject({ ok: false, erro: expect.stringMatching(/uma palavra vai até 24/) });
    expect(ler({ questionario: 'outro' })).toMatchObject({ ok: false, erro: expect.stringMatching(/questionários da lista/) });
    expect(ler({ confirmaMarca: undefined })).toMatchObject({ ok: false, erro: "O questionário cita o Grupo Valentin's nas perguntas. Confirme que este cliente é do Grupo Valentin's." });
    // Nome repetido sem contar acento, caixa, espaço e apóstrofo (o curvo é o que o teclado do celular digita).
    for (const nome of ["grupo  VALENTIN'S", 'Grupo Valentin’s', 'Grupo Valentins', 'Grupo Valêntin‘s']) {
      expect(ler({ nome }, ["Grupo Valentin's"]), nome).toMatchObject({ ok: false, erro: `Já existe um cliente com o nome "Grupo Valentin's". Para um segundo link, use um nome que diferencie (ex.: "${nome.replace(/\s+/g, ' ')} · sócio 2").` });
    }
    expect(ler({ nome: 'Grupo Valentin’s · sócio 2' }, ["Grupo Valentin's"])).toMatchObject({ ok: true });
    // O hífen também separa palavras (quebra linha no título).
    expect(ler({ nome: 'Hamburgueria-Artesanal-da-Penha-Delivery' })).toMatchObject({ ok: true });
  });
});

describe('decisão 477 · a ação', () => {
  beforeEach(() => {
    banco.criados = [];
    banco.auditorias = [];
    banco.sessao = { user: { id: 'rodolfo' } };
    banco.falhaAoCriar = null;
  });

  it('cadastra com endereço livre e link novo, registra quem fez (com o nome) e abre a página do cliente', async () => {
    expect(await rodar(form(VALIDO))).toBe('redirecionou');
    // "grupo-teste" já existe: fica "grupo-teste-2".
    expect(banco.criados).toEqual([{ id: 'portal_grupo-teste-2', nome: 'Grupo Teste', slug: 'grupo-teste-2', token: expect.stringMatching(/^[0-9a-f]{32}$/), questionario: 'valentins' }]);
    expect(banco.auditorias).toEqual([{ userId: 'rodolfo', evento: 'portal_cadastrado', dados: { clienteId: 'portal_grupo-teste-2', nome: 'Grupo Teste', slug: 'grupo-teste-2', questionario: 'valentins' } }]);
    expect(banco.redirecionou).toBe('/rodolfo/portal/portal_grupo-teste-2?feito=cadastrado');
  });

  it('inválido, sem confirmar a marca ou com nome repetido: diz o motivo e não grava nada', async () => {
    expect(await rodar(form({ ...VALIDO, nome: 'A' }))).toMatchObject({ ok: false });
    expect(await rodar(form({ ...VALIDO, questionario: '../../etc' }))).toMatchObject({ ok: false, mensagem: 'Escolha um dos questionários da lista.' });
    expect(await rodar(form({ nome: 'Grupo Teste', questionario: 'valentins' }))).toMatchObject({ ok: false, mensagem: expect.stringMatching(/^O questionário cita o Grupo Valentin's/) });
    expect(await rodar(form({ ...VALIDO, nome: "Grupo Valentin's" }))).toMatchObject({ ok: false, mensagem: expect.stringMatching(/Já existe um cliente/) });
    expect(banco.criados).toEqual([]);
  });

  it('sem sessão não cadastra', async () => {
    banco.sessao = null;
    await expect(acaoCadastrarCliente(null, form(VALIDO))).rejects.toThrow('Sem sessão.');
    expect(banco.criados).toEqual([]);
  });

  it('erro do banco: devolve a mensagem em vez de quebrar a tela', async () => {
    banco.falhaAoCriar = new Error('invalid byte sequence');
    expect(await rodar(form(VALIDO))).toEqual({ ok: false, mensagem: 'Não deu para cadastrar agora. Tente de novo em instantes.' });
    expect(banco.redirecionou).toBe('');
  });
});
