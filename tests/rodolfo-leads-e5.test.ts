/**
 * E5.1 · fatia 2 — a lista de Leads (`/rodolfo/leads`):
 *  - status ou canal inventado na URL não chega ao banco (antes o Prisma recusava o enum e a página caía);
 *  - o vazio diz o que fazer: sem leads, importar (a importação tem tela própria); com busca ou filtro, limpar;
 *  - busca de texto não casa mais com todo lead que tem telefone (o "contém vazio" do telefone entrava em toda busca);
 *  - Lead 360: "Enviar agora" só quando o servidor deixaria sair (`envioNoLead360`), com o motivo quando não.
 */
import { describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';

const consultas = vi.hoisted(() => ({ wheres: [] as unknown[] }));
vi.mock('@/lib/erp/contexto', () => ({ exigirNivel1: async () => ({}) }));
vi.mock('@/lib/db', () => ({
  prisma: {
    lead: {
      findMany: async ({ where }: { where: unknown }) => {
        consultas.wheres.push(where);
        return [];
      },
      count: async () => 0,
      groupBy: async () => [],
    },
  },
}));

import LeadsPage from '@/app/rodolfo/(painel)/leads/page';
import { envioNoLead360 } from '@/lib/rodolfo/cadencia-tela';

/** Todos os elementos da árvore devolvida pela página (sem renderizar os componentes). */
function elementos(n: ReactNode, saida: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(n)) n.forEach((x) => elementos(x, saida));
  else if (isValidElement(n)) {
    saida.push(n);
    const p = n.props as Record<string, unknown>;
    for (const v of Object.values(p)) if (v && typeof v === 'object') elementos(v as ReactNode, saida);
  }
  return saida;
}
const titulos = (arvore: ReactNode) => elementos(arvore).map((e) => (e.props as { titulo?: unknown }).titulo).filter((t) => typeof t === 'string');
const links = (arvore: ReactNode) => elementos(arvore).map((e) => (e.props as { href?: unknown }).href).filter(Boolean);

describe('E5.1 · lista de Leads', () => {
  it('status e canal inventados na URL não chegam ao banco', async () => {
    consultas.wheres = [];
    await LeadsPage({ searchParams: Promise.resolve({ status: 'INVENTADO', canal: 'FAX' }) });
    expect(consultas.wheres[0]).toEqual({});
    consultas.wheres = [];
    await LeadsPage({ searchParams: Promise.resolve({ status: 'NOVO', canal: 'VISITA' }) });
    expect(consultas.wheres[0]).toEqual({ status: 'NOVO', canal: 'VISITA' });
  });

  it('sem leads: o vazio leva à importação, que é a ação principal do cabeçalho', async () => {
    const arvore = await LeadsPage({ searchParams: Promise.resolve({}) });
    expect(titulos(arvore)).toContain('Nenhum lead ainda.');
    expect(links(arvore).filter((h) => h === '/rodolfo/leads/importar').length).toBeGreaterThanOrEqual(2);
  });

  it('busca de texto não usa o telefone; busca com número usa os dígitos', async () => {
    consultas.wheres = [];
    await LeadsPage({ searchParams: Promise.resolve({ q: 'pizza' }) });
    const ou = (consultas.wheres[0] as { OR: Record<string, unknown>[] }).OR;
    expect(ou.map((o) => Object.keys(o)[0])).toEqual(['nome', 'restaurante', 'bairro']);
    consultas.wheres = [];
    await LeadsPage({ searchParams: Promise.resolve({ q: '(21) 99000' }) });
    const ou2 = (consultas.wheres[0] as { OR: Record<string, unknown>[] }).OR;
    expect(ou2[3]).toEqual({ telefoneNormalizado: { contains: '2199000' } });
  });

  it('com busca: "Nada para …" e limpar a busca', async () => {
    const arvore = await LeadsPage({ searchParams: Promise.resolve({ q: 'pizza' }) });
    expect(titulos(arvore)).toContain('Nada para “pizza”.');
    expect(links(arvore)).toContain('/rodolfo/leads');
  });
});

describe('E5.1 · "Enviar agora" no Lead 360 (decisão 468)', () => {
  const pode = { permitido: true, tetoDiaVigente: 10 } as const;
  const base = { temCelular: true, canal: 'WHATSAPP', status: 'NOVO', pediuParaSair: false, loteDeHoje: 'APROVADO', jaRecebeuHoje: false, manual: pode };
  it('só aparece quando o servidor deixaria sair; senão, o motivo', () => {
    expect(envioNoLead360(base)).toEqual({ pode: true, motivo: null });
    // Lote aguardando aprovação: o lead escolhido à mão sai (quem escolhe o lead aprova aquele envio, decisão 467).
    expect(envioNoLead360({ ...base, loteDeHoje: 'PROPOSTO' }).pode).toBe(true);
    const casos: [Partial<typeof base>, RegExp][] = [
      [{ temCelular: false }, /Sem celular válido/],
      [{ canal: 'VISITA' }, /Visita e Instagram/],
      [{ pediuParaSair: true }, /Pediu para sair/],
      [{ status: 'CONFLITO' }, /Conflito/],
      [{ status: 'RESPONDEU' }, /Inbox/],
      [{ loteDeHoje: null as unknown as string }, /Não está no lote de hoje/],
      [{ loteDeHoje: 'CANCELADO' }, /cancelado/],
      [{ jaRecebeuHoje: true }, /Já recebeu/],
      [{ manual: { permitido: false, motivo: 'DISPARO_DESLIGADO', explicacao: 'Disparo desligado.', tetoDiaVigente: 10 } as never }, /Disparo desligado/],
    ];
    for (const [mudanca, motivo] of casos) {
      const r = envioNoLead360({ ...base, ...mudanca } as never);
      expect(r.pode, JSON.stringify(mudanca)).toBe(false);
      expect(r.motivo).toMatch(motivo);
    }
  });
});
