/**
 * ERP 2.2b (revisão de UX) · a tabela de metas no celular (sem banco): cada grupo traz as linhas dele recolhidas
 * (abrem sob demanda; de tablet para cima aparecem sempre), a linha filha sem meta diz "meta no grupo X" quando o
 * grupo tem meta, o botão "Salvar as metas" fica fixo embaixo, e linha filha com erro já vem aberta.
 */
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormMetas, type LinhaDoCampoDeMeta } from '@/components/erp/telas/dre/form-metas';

// O react-dom estável do vitest não traz os ganchos de formulário do Next: o estado inicial basta para ler o HTML.
let erros: Record<string, string> = {};
vi.mock('react-dom', async (orig) => ({ ...(await orig<typeof import('react-dom')>()), useFormState: (_a: unknown, inicial: unknown) => [Object.keys(erros).length ? { ok: false, erros } : inicial, undefined], useFormStatus: () => ({ pending: false }) }));

const linha = (chave: string, nome: string, nivel: 0 | 1, extra: Partial<LinhaDoCampoDeMeta> = {}): LinhaDoCampoDeMeta => ({ chave, nome, tipo: 'linha', nivel, aceita: true, oculta: false, campo: '', metaBp: null, desde: null, ...extra });
const linhas: LinhaDoCampoDeMeta[] = [
  linha('grupo:PESSOAL', 'Pessoal', 0, { campo: '24', metaBp: 2400, desde: '2026-09-01' }),
  linha('salarios', 'Salários', 1),
  linha('encargos', 'Encargos', 1, { campo: '6', metaBp: 600, desde: '2026-09-01' }),
  linha('grupo:OCUPACAO', 'Ocupação', 0),
  linha('aluguel', 'Aluguel', 1),
  linha('resultado-do-periodo', 'Resultado do período', 0, { tipo: 'resultado', campo: '10', metaBp: 1000, desde: '2026-09-01' }),
];
const html = () =>
  renderToStaticMarkup(createElement(FormMetas, { acao: async () => null, linhas, versao: 'v', valeDesde: '2026-10-01', periodoAtual: 'Outubro de 2026', bloqueio: null })).replace(/ /g, ' ');

describe('ERP 2.2b · a tabela de metas no celular', () => {
  it('cada grupo com filhas tem o botão de abrir (só no celular), e as filhas vêm recolhidas no celular e visíveis de sm para cima', () => {
    erros = {};
    const h = html();
    expect(h).toContain('Abrir as 2 linhas');
    expect(h).toContain('Abrir a linha');
    expect(h).toContain('· 1 com meta'); // Encargos já tem meta própria
    expect(h.match(/aria-expanded="false"/g)).toHaveLength(2);
    expect(h.match(/hidden sm:table-row/g)).toHaveLength(3); // salários, encargos, aluguel
    expect(h).toContain('sm:hidden'); // o botão só existe no celular
    // O resultado do período não tem filhas: sem botão.
    expect(h.match(/aria-controls/g)).toHaveLength(2);
  });

  it('a linha filha sem meta diz "meta no grupo X" quando o grupo tem meta; sem meta no grupo, não diz; filha com meta própria mostra desde quando vale', () => {
    erros = {};
    const h = html();
    expect(h.match(/meta no grupo Pessoal/g)).toHaveLength(1); // só Salários (Encargos tem a dela)
    expect(h).not.toContain('meta no grupo Ocupação'); // o grupo Ocupação não tem meta
    expect(h).toContain('vale desde 01/09/2026');
  });

  it('o botão de salvar fica fixo embaixo e linha filha com erro já vem aberta', () => {
    erros = {};
    expect(html()).toMatch(/sticky bottom-0[^"]*"[^>]*>\s*<button[^>]*>\s*Salvar as metas/);
    erros = { aluguel: 'Digite um número de 0 a 100.' };
    const h = html();
    expect(h).toContain('Digite um número de 0 a 100.');
    expect(h).toContain('Recolher as linhas');
    expect(h.match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(h.match(/hidden sm:table-row/g)).toHaveLength(2); // só as de Pessoal continuam recolhidas
    erros = {};
  });
});
