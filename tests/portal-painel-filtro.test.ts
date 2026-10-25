/**
 * E5.1 · decisão 472 — as respostas de um cliente no painel (`/rodolfo/portal/[id]`) e os números de Leads:
 *  - cada bloco diz quantos itens chegaram ("3 de 7 recebidos, 1 pulado"), com a mesma régua do formulário;
 *  - o filtro da URL (`?estado=`) mostra só os itens daquela situação; o bloco sem nenhum some; valor inventado mostra tudo;
 *  - filtro sem resultado: o vazio diz qual e volta para todos;
 *  - em Leads, cada número abre a lista que conta, e "Visita e Instagram" conta com a régua da tela Visitas.
 */
import { describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';

const banco = vi.hoisted(() => ({
  respostas: [] as { itemId: string; texto: string | null; marcacao: string | null }[],
  contagensDeLead: [] as unknown[],
}));
vi.mock('@/lib/erp/contexto', () => ({ exigirNivel1: async () => ({}) }));
vi.mock('@/app/rodolfo/(painel)/portal/actions', () => ({ acaoZerarPortal: async () => ({}) }));
vi.mock('@/lib/db', () => ({
  prisma: {
    portalCliente: {
      findUnique: async () => ({
        id: 'c1',
        nome: 'Grupo Teste',
        token: 'tok',
        slug: 'grupo-teste',
        questionario: 'valentins',
        respostas: banco.respostas,
        arquivos: [],
        finalizadoEm: null,
        ultimaAtividadeEm: null,
        avisoEnviadoEm: null,
        avisoErro: null,
      }),
    },
    lead: {
      findMany: async () => [],
      count: async ({ where }: { where: unknown }) => {
        banco.contagensDeLead.push(where);
        return 0;
      },
      groupBy: async () => [],
    },
  },
}));

import PortalClientePage from '@/app/rodolfo/(painel)/portal/[id]/page';
import LeadsPage from '@/app/rodolfo/(painel)/leads/page';
import { questionario } from '@/lib/portal/questionario';
import { calcularProgresso } from '@/lib/portal/progresso';
import { blocosNoPainel, contagemDoBloco, lerFiltroDeItem, vazioDoFiltro } from '@/lib/portal/painel';
import { NA_LISTA_DE_VISITA } from '@/lib/rodolfo/visitas';
import { Metrica } from '@/components/erp/ui/superficies';

function elementos(n: ReactNode, saida: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(n)) n.forEach((x) => elementos(x, saida));
  else if (isValidElement(n)) {
    saida.push(n);
    const p = n.props as Record<string, unknown>;
    for (const v of Object.values(p)) if (v && typeof v === 'object') elementos(v as ReactNode, saida);
  }
  return saida;
}
const props = (e: ReactElement) => e.props as Record<string, unknown>;
const texto = (n: ReactNode): string =>
  typeof n === 'string' || typeof n === 'number' ? String(n) : Array.isArray(n) ? n.map(texto).join('') : isValidElement(n) ? texto(props(n).children as ReactNode) : '';

const q = questionario('valentins')!;
const [a1, a2, a3] = q.blocos[0].itens;

describe('E5.1 · contagem e filtro por bloco (funções puras)', () => {
  const respostas = [
    { itemId: a1.id, texto: 'CNPJ 00.000.000/0001-00', marcacao: null },
    { itemId: a2.id, texto: null, marcacao: 'NAO_SEI' as const },
    // Conteúdo vence marcação: marcou e depois respondeu conta como recebido.
    { itemId: a3.id, texto: 'respondi depois', marcacao: 'NAO_TENHO' as const },
  ];
  const p = calcularProgresso(q.itens, respostas, []);

  it('cada bloco com a contagem inteira, na ordem do questionário', () => {
    const blocos = blocosNoPainel(q.blocos, p.situacoes, null);
    expect(blocos.map((b) => b.bloco)).toEqual(q.blocos.map((b) => b.bloco));
    expect(blocos[0]).toMatchObject({ total: q.blocos[0].itens.length, recebidos: 2, marcados: 1, pendentes: q.blocos[0].itens.length - 3 });
    expect(contagemDoBloco(blocos[0])).toBe(`2 de ${q.blocos[0].itens.length} recebidos, 1 pulado`);
    expect(contagemDoBloco(blocos[1])).toBe(`0 de ${q.blocos[1].itens.length} recebidos`);
    expect(contagemDoBloco({ total: 5, recebidos: 1, marcados: 2 })).toBe('1 de 5 recebidos, 2 pulados');
    // A soma dos blocos bate com a Situação do topo.
    expect(blocos.reduce((s, b) => s + b.recebidos, 0)).toBe(p.recebidos);
    expect(blocos.reduce((s, b) => s + b.pendentes, 0)).toBe(p.pendentes);
  });

  it('com filtro: só os itens daquela situação; o bloco sem nenhum sai; a contagem do bloco não muda', () => {
    const recebidos = blocosNoPainel(q.blocos, p.situacoes, 'RECEBIDO');
    expect(recebidos.map((b) => b.bloco)).toEqual([q.blocos[0].bloco]);
    expect(recebidos[0].situacoes.map((s) => s.item.id)).toEqual([a1.id, a3.id]);
    expect(recebidos[0].total).toBe(q.blocos[0].itens.length);
    const pulados = blocosNoPainel(q.blocos, p.situacoes, 'MARCADO');
    expect(pulados.flatMap((b) => b.situacoes.map((s) => s.item.id))).toEqual([a2.id]);
    const pendentes = blocosNoPainel(q.blocos, p.situacoes, 'PENDENTE');
    expect(pendentes).toHaveLength(q.blocos.length);
    expect(pendentes.flatMap((b) => b.situacoes).every((s) => s.estado === 'PENDENTE')).toBe(true);
  });

  it('só valor conhecido vira filtro', () => {
    expect(lerFiltroDeItem('PENDENTE')).toBe('PENDENTE');
    expect(lerFiltroDeItem('MARCADO')).toBe('MARCADO');
    for (const v of [undefined, '', 'pendente', 'TODOS', "PENDENTE' OR 1=1"]) expect(lerFiltroDeItem(v)).toBeNull();
    expect(vazioDoFiltro('MARCADO')).toBe('Nenhum item pulado com motivo.');
  });
});

describe('E5.1 · a tela do cliente no painel', () => {
  const pagina = (estado?: string) => PortalClientePage({ params: { id: 'c1' }, searchParams: estado === undefined ? {} : { estado } });

  it('sem filtro: todos os blocos, cada um com a contagem; o filtro com o total de cada situação e descendo até a lista', async () => {
    banco.respostas = [{ itemId: a1.id, texto: 'ok', marcacao: null }];
    const arvore = elementos(await pagina());
    const blocos = arvore.filter((e) => typeof props(e).titulo === 'string' && props(e).acessorio);
    expect(blocos.map((e) => props(e).titulo)).toEqual(q.blocos.map((b) => b.titulo));
    expect(texto(props(blocos[0]).acessorio as ReactNode)).toBe(`1 de ${q.blocos[0].itens.length} recebidos`);
    const filtro = arvore.find((e) => props(e).rotulo === 'Filtrar itens por situação')!;
    const opcoes = props(filtro).opcoes as { href: string; rotulo: string; ativo: boolean }[];
    expect(opcoes.map((o) => o.rotulo)).toEqual([`Todos (${q.itens.length})`, 'Recebidos (1)', 'Pulados com motivo (0)', `Pendentes (${q.itens.length - 1})`]);
    expect(opcoes.map((o) => o.href)).toEqual(['/rodolfo/portal/c1#itens', '/rodolfo/portal/c1?estado=RECEBIDO#itens', '/rodolfo/portal/c1?estado=MARCADO#itens', '/rodolfo/portal/c1?estado=PENDENTE#itens']);
    expect(opcoes.filter((o) => o.ativo).map((o) => o.rotulo)).toEqual([`Todos (${q.itens.length})`]);
  });

  it('com filtro: só os itens daquela situação; valor inventado mostra tudo', async () => {
    banco.respostas = [{ itemId: a1.id, texto: 'ok', marcacao: null }];
    const itens = (arvore: ReactElement[]) => arvore.filter((e) => e.type === 'li' && props(e).className === 'py-3').map((e) => e.key);
    expect(itens(elementos(await pagina('RECEBIDO')))).toEqual([a1.id]);
    expect(itens(elementos(await pagina('PENDENTE')))).toHaveLength(q.itens.length - 1);
    expect(itens(elementos(await pagina('INVENTADO')))).toHaveLength(q.itens.length);
  });

  it('filtro sem resultado: o vazio diz qual e volta para todos os itens', async () => {
    banco.respostas = [];
    const arvore = elementos(await pagina('MARCADO'));
    expect(arvore.map((e) => props(e).titulo)).toContain('Nenhum item pulado com motivo.');
    expect(arvore.map((e) => props(e).href)).toContain('/rodolfo/portal/c1#itens');
  });
});

describe('E5.1 · números de Leads como filtro', () => {
  it('cada card abre a lista que conta; Visita e Instagram conta com a régua da tela Visitas', async () => {
    banco.contagensDeLead = [];
    const arvore = elementos(await LeadsPage({ searchParams: Promise.resolve({}) }));
    const cards = arvore.filter((e) => e.type === Metrica);
    expect(cards.map((e) => [props(e).rotulo, props(e).href])).toEqual([
      ['Novos', '/rodolfo/leads?status=NOVO'],
      ['Em cadência', '/rodolfo/leads?status=EM_CADENCIA'],
      ['Responderam', '/rodolfo/leads?status=RESPONDEU'],
      ['Visita e Instagram', '/rodolfo/visitas'],
    ]);
    expect(banco.contagensDeLead).toContainEqual(NA_LISTA_DE_VISITA);
    expect(NA_LISTA_DE_VISITA.status.notIn).toEqual(['OPT_OUT', 'CONFLITO']);
  });
});
