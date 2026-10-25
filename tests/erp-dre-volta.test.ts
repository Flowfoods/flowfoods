/**
 * Decisão 474 — DRE: a rede no subtítulo e o caminho de volta depois de pagar ou editar uma despesa.
 *  - sem loja aberta, a tela diz a rede (não a loja escolhida no topo); no nível 1, o parceiro vem na frente;
 *  - pagar, desfazer, "não repete mais" e editar devolvem para a despesa com o mesmo "voltar" (a composição da linha);
 *    um caminho de fora da área, forjado no formulário, é ignorado.
 */
import { describe, expect, it, vi } from 'vitest';

const chamadas = vi.hoisted(() => ({ redirecionou: '' }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    chamadas.redirecionou = url;
    throw new Error('REDIRECT');
  },
}));
vi.mock('@/lib/erp/despesas', () => ({
  pagarDespesa: async () => ({ ok: true, mudou: true }),
  desfazerPagamento: async () => ({ ok: true, mudou: true }),
  pararDeRepetir: async () => ({ ok: true, mudou: false }),
  editarDespesa: async () => ({ ok: true, mudou: true }),
  lancarDespesa: async () => ({ ok: true, id: 'd1' }),
  lancarDoMesPassado: async () => ({ ok: true, criadas: 0 }),
  removerDespesa: async () => ({ ok: true }),
}));

import { executarEditarDespesa, executarMudancaSemDre } from '@/components/erp/telas/dre/executar';
import { rotuloDoEscopo, ROTULO_REDE } from '@/lib/erp/visao';

const form = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.append(k, v);
  return f;
};
const rodar = async (fn: () => Promise<unknown>) => {
  chamadas.redirecionou = '';
  await fn().catch((e: Error) => {
    if (e.message !== 'REDIRECT') throw e;
  });
  return chamadas.redirecionou;
};

describe('Decisão 474 · a rede no subtítulo', () => {
  it('loja aberta: o nome dela; sem loja: a rede; nível 1: o parceiro na frente', () => {
    expect(rotuloDoEscopo('Vila da Penha')).toBe('Vila da Penha');
    expect(rotuloDoEscopo(null)).toBe(ROTULO_REDE);
    expect(rotuloDoEscopo(undefined, 'Casa Alfa')).toBe(`Casa Alfa · ${ROTULO_REDE}`);
    expect(rotuloDoEscopo('Méier', 'Casa Alfa')).toBe('Casa Alfa · Méier');
  });
});

describe('Decisão 474 · depois de pagar ou editar, a despesa abre com o mesmo "voltar"', () => {
  const composicao = '/erp/dre/despesas?linha=cl123&de=2026-09-01&ate=2026-09-30';
  const cliente = {} as never;
  const alcance = {} as never;

  it('pagar, desfazer e "não repete mais" levam a volta da composição', async () => {
    for (const [qual, feito] of [['pagar', 'paga'], ['desfazer', 'nao-paga'], ['parar', 'igual']] as const) {
      const url = await rodar(() => executarMudancaSemDre(qual, cliente, alcance, 'Ana', 'd1', null, form({ versao: 'v', data: '01/10/2026', volta: composicao }), '/erp'));
      expect(url, qual).toBe(`/erp/dre/despesas/d1?feito=${feito}&volta=${encodeURIComponent(composicao)}`);
    }
  });

  it('editar leva a volta; sem volta, como antes', async () => {
    expect(await rodar(() => executarEditarDespesa(cliente, alcance, 'Ana', 'd1', null, form({ versao: 'v', volta: composicao }), '/erp'))).toBe(`/erp/dre/despesas/d1?feito=salva&volta=${encodeURIComponent(composicao)}`);
    expect(await rodar(() => executarEditarDespesa(cliente, alcance, 'Ana', 'd1', null, form({ versao: 'v' }), '/erp'))).toBe('/erp/dre/despesas/d1?feito=salva');
  });

  it('caminho de fora da área, forjado no formulário, é ignorado', async () => {
    for (const fora of ['https://mal.example/erp/dre', '//mal.example/x', '/rodolfo/erp/outro/dre', '/erp/../rodolfo/x']) {
      expect(await rodar(() => executarMudancaSemDre('pagar', cliente, alcance, 'Ana', 'd1', null, form({ versao: 'v', data: '01/10/2026', volta: fora }), '/erp')), fora).toBe('/erp/dre/despesas/d1?feito=paga');
    }
    // No nível 1, a volta precisa estar dentro da raiz do parceiro.
    const raizN1 = '/rodolfo/erp/casa-alfa';
    expect(await rodar(() => executarMudancaSemDre('pagar', cliente, alcance, 'Ana', 'd1', null, form({ versao: 'v', data: '01/10/2026', volta: composicao }), raizN1))).toBe(`${raizN1}/dre/despesas/d1?feito=paga`);
    const daRaiz = `${raizN1}/dre/despesas?linha=cl123&de=2026-09-01&ate=2026-09-30`;
    expect(await rodar(() => executarMudancaSemDre('pagar', cliente, alcance, 'Ana', 'd1', null, form({ versao: 'v', data: '01/10/2026', volta: daRaiz }), raizN1))).toBe(`${raizN1}/dre/despesas/d1?feito=paga&volta=${encodeURIComponent(daRaiz)}`);
  });
});
