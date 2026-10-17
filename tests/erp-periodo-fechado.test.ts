/**
 * ERP 2.2b (revisão de UX) · o aviso de período fechado é UM só e diz o que fazer (sem banco):
 *  - a frase do servidor traz a saída ("peça à FlowFoods para reabrir o período") em faturamento, despesa, nota e estoque;
 *  - a tela lê de volta o nome do período da frase e sabe, por data, se cai num período fechado (dia, intervalo);
 *  - o componente diz o período, a saída, a alternativa de quem lança e leva a Períodos; sem acesso a Períodos, sem link;
 *  - o formulário da nota e o da despesa avisam ANTES de enviar quando a data/competência já cai num fechado, e de novo
 *    quando o servidor recusa (e nada do aviso aparece num período aberto).
 */
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fechadoNaData, fechadoNoIntervalo, fraseDoPeriodoFechado, periodoDaFraseDeRecusa, saidaDoPeriodoFechado, type AvisoDePeriodos } from '@/lib/erp/periodo-fechado-campos';
import { AvisoDoPeriodoFechado } from '@/components/erp/ui/aviso-periodo-fechado';
import { FormNota } from '@/components/erp/telas/compras/form-nota';
import { FormDespesa } from '@/components/erp/telas/dre/form-despesa';

// O react-dom estável do vitest não traz os ganchos de formulário do Next: o estado inicial basta para ler o HTML.
vi.mock('react-dom', async (orig) => ({ ...(await orig<typeof import('react-dom')>()), useFormState: (_acao: unknown, inicial: unknown) => [inicial, undefined], useFormStatus: () => ({ pending: false }) }));

const nbsp = (t: string) => t.replace(/ /g, ' ');
const SETEMBRO = { nome: 'Setembro de 2026', inicio: '2026-09-01', fim: '2026-09-30' };
const periodos: AvisoDePeriodos = { fechados: [SETEMBRO, { nome: 'Agosto de 2026', inicio: '2026-08-01', fim: '2026-08-31' }], emCurso: 'Outubro de 2026', href: '/erp/dre/periodos' };

describe('ERP 2.2b · a frase de período fechado e a leitura de volta', () => {
  it('a frase diz o que não dá e o que fazer', () => {
    const f = fraseDoPeriodoFechado('Setembro de 2026');
    expect(f).toContain('já foi fechado no DRE');
    expect(f).toContain('não dá para lançar, corrigir nem remover');
    expect(f).toContain(saidaDoPeriodoFechado('Setembro de 2026'));
    expect(saidaDoPeriodoFechado('Setembro de 2026')).toBe('Para mexer em Setembro de 2026, peça à FlowFoods para reabrir o período.');
  });

  it('o nome do período volta da frase do servidor (faturamento, despesa, nota, estoque); outro texto não é período fechado', () => {
    expect(periodoDaFraseDeRecusa(fraseDoPeriodoFechado('Setembro de 2026'))).toBe('Setembro de 2026');
    expect(periodoDaFraseDeRecusa(fraseDoPeriodoFechado('01/09/2026 a 15/09/2026'))).toBe('01/09/2026 a 15/09/2026');
    expect(periodoDaFraseDeRecusa(`O período Agosto de 2026 já foi fechado no DRE: o estoque dele não muda mais. ${saidaDoPeriodoFechado('Agosto de 2026')}`)).toBe('Agosto de 2026');
    for (const t of [undefined, null, '', 'A data não pode ser futura.', 'Seu acesso não inclui isso.']) expect(periodoDaFraseDeRecusa(t)).toBeNull();
  });

  it('por data e por intervalo: o primeiro fechado que encosta, nenhum fora', () => {
    expect(fechadoNaData(periodos.fechados, '2026-09-30')?.nome).toBe('Setembro de 2026');
    expect(fechadoNaData(periodos.fechados, '2026-08-01')?.nome).toBe('Agosto de 2026');
    expect(fechadoNaData(periodos.fechados, '2026-10-01')).toBeNull();
    expect(fechadoNaData(periodos.fechados, '')).toBeNull();
    expect(fechadoNoIntervalo(periodos.fechados, '2026-08-25', '2026-09-05')?.nome).toBe('Agosto de 2026');
    expect(fechadoNoIntervalo(periodos.fechados, '2026-09-30', '2026-10-02')?.nome).toBe('Setembro de 2026');
    expect(fechadoNoIntervalo(periodos.fechados, '2026-10-01', '2026-10-31')).toBeNull();
  });
});

describe('ERP 2.2b · o componente do aviso', () => {
  it('diz o período, a saída, a alternativa e leva a Períodos', () => {
    const html = nbsp(renderToStaticMarkup(createElement(AvisoDoPeriodoFechado, { periodo: 'Setembro de 2026', href: '/erp/dre/periodos', alternativa: 'Ou lance com a data de hoje.' })));
    expect(html).toContain('O período Setembro de 2026 já foi fechado no DRE.');
    expect(html).toContain('Para mexer em Setembro de 2026, peça à FlowFoods para reabrir o período. Ou lance com a data de hoje.');
    expect(html).toMatch(/href="\/erp\/dre\/periodos"[^>]*>Ver os períodos</);
  });

  it('sem acesso a Períodos o aviso não leva a lugar nenhum (sem link), e a frase pode ser trocada', () => {
    const html = renderToStaticMarkup(createElement(AvisoDoPeriodoFechado, { periodo: 'Setembro de 2026', href: null, frase: 'Este dia só pode ser consultado.' }));
    expect(html).not.toContain('<a');
    expect(html).toContain('Este dia só pode ser consultado.');
    expect(html).not.toContain('não dá para lançar, corrigir nem remover nele');
    expect(html).toContain('peça à FlowFoods para reabrir o período');
  });
});

describe('ERP 2.2b · os formulários avisam antes de enviar', () => {
  const nota = (data: string, p = periodos) =>
    nbsp(
      renderToStaticMarkup(
        createElement(FormNota, {
          acao: async () => null,
          modo: 'lancar',
          base: '/erp/compras',
          aqui: '/erp/compras/nova',
          cancelar: '/erp/compras',
          opcoes: { lojas: [], fornecedores: [], insumos: [] } as never,
          inicial: { lojaId: '', fornecedorId: '', numero: '', serie: '', data, frete: '', total: '', itens: [] },
          hoje: '2026-10-17',
          periodos: p,
        }),
      ),
    );

  it('nota com data em período fechado: o aviso sai com a saída e "lance com a data de hoje"; em período aberto, nada', () => {
    const html = nota('15/09/2026');
    expect(html).toContain('O período Setembro de 2026 já foi fechado no DRE.');
    expect(html).toContain('Para mexer em Setembro de 2026, peça à FlowFoods para reabrir o período.');
    expect(html).toContain('Ou lance com a data de hoje, se a compra entrou agora.');
    expect(html).toContain('Ver os períodos');
    const aberto = nota('2026-10-16');
    expect(aberto).not.toContain('já foi fechado no DRE');
    expect(aberto).not.toContain('peça à FlowFoods');
    // Sem acesso a Períodos: o aviso continua, sem o link.
    expect(nota('2026-09-15', { ...periodos, href: null })).not.toContain('Ver os períodos');
  });

  const despesa = (mes: string, p = periodos) =>
    nbsp(
      renderToStaticMarkup(
        createElement(FormDespesa, {
          acao: async () => null,
          linhas: [],
          lojas: [],
          podeRede: true,
          inicial: { lojaId: '', linha: '', descricao: '', valor: '', tipo: 'mes', dia: '', mes, de: '', ate: '', recorrente: false, vencimento: '' },
          hoje: '2026-10-17',
          envio: 'a'.repeat(32),
          versao: '',
          voltar: '/erp/dre/despesas',
          rotuloDoBotao: 'Lançar despesa',
          bloqueio: null,
          periodos: p,
        }),
      ),
    );

  it('despesa com competência em período fechado: o aviso sai com a saída e o período aberto onde lançar; em período aberto, nada', () => {
    const html = despesa('2026-09');
    expect(html).toContain('O período Setembro de 2026 já foi fechado no DRE.');
    expect(html).toContain('Para mexer em Setembro de 2026, peça à FlowFoods para reabrir o período.');
    expect(html).toContain('Ou lance com competência em Outubro de 2026.');
    expect(html).toContain('Ver os períodos');
    const aberto = despesa('2026-10');
    expect(aberto).not.toContain('já foi fechado no DRE');
    expect(aberto).not.toContain('peça à FlowFoods');
  });
});
