/**
 * Decisão 523 — custo de agora no formulário de nota só para quem vê custo de compra, e as frases depois de lançar sem prometer o
 * que não acontece (sem banco; a prova pelas páginas e actions reais está em `erp-compra-custo-523.db.test.ts`).
 *
 *  - a régua `veCustoDeCompra`: `compras.ver` (não `insumos.ver`, nem `compras.lancar`), todo-ou-nada nas lojas em jogo;
 *  - a linha do item do formulário: com o custo de agora, "· hoje R$ …"; sem ele (o campo nem existe), só a conta do que se digita;
 *  - a prévia sem custo: total e estoque, sem a lista antes → depois e sem as fichas; com custo, a mesma de antes;
 *  - as frases de "lançada", "alterada", "cancelada" e "conciliada" seguem a regra do último preço (`ultimaCompraDaLista`): o custo
 *    só muda onde a nota é (ou era) a compra mais recente do insumo.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/erp/compras/nova',
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('react-dom', async (orig) => ({ ...(await orig<typeof import('react-dom')>()), useFormState: (_acao: unknown, inicial: unknown) => [inicial, () => {}], useFormStatus: () => ({ pending: false }) }));

import { veCustoDeCompra, type FormularioDeNota, type InsumoDoFormularioDeNota, type PreviaDaNota } from '@/lib/erp/compras';
import { ultimaCompraDaLista, type InsumoDaCompra } from '@/lib/erp/compra-campos';
import { resolverAlcance, ALCANCE_FLOWFOODS, type VinculoDePermissao } from '@/lib/erp/permissoes';
import { FormNota } from '@/components/erp/telas/compras/form-nota';
import { PreviaDoImpacto } from '@/components/erp/telas/compras/previa';
import { fraseDaNota } from '@/components/erp/telas/compras/estado';
import { fraseDoDocumento } from '@/components/erp/telas/compras/documentos-estado';
import { entradaPorChave } from '@/lib/erp/ajuda';
import { relogioDoCenario } from './relogio-do-cenario';

relogioDoCenario('2026-10-17T12:00:00-03:00');

const vinculo = (v: Partial<VinculoDePermissao>): VinculoDePermissao => ({
  perfilBase: null,
  perfilProprio: null,
  permissoesExtras: [],
  permissoesRemovidas: [],
  redeInteira: true,
  lojaIds: [],
  ...v,
});
const DONO = resolverAlcance(vinculo({ perfilBase: 'DONO' }));
const SO_LANCA = resolverAlcance(vinculo({ perfilProprio: ['compras.lancar', 'lojas.ver'] }));
const OPERADOR_QUE_LANCA = resolverAlcance(vinculo({ perfilBase: 'OPERADOR', permissoesExtras: ['compras.lancar'] }));
const VE_E_LANCA = resolverAlcance(vinculo({ perfilProprio: ['compras.ver', 'compras.lancar', 'lojas.ver'] }));
/** Gerente de uma loja só (vê compras na Penha). */
const GERENTE_DA_PENHA = resolverAlcance(vinculo({ perfilBase: 'GERENTE', redeInteira: false, lojaIds: ['loja-vp'] }));
const sp = (t: string) => t.replace(/&nbsp;| | /g, ' ');
const texto = (h: string) => sp(h.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ');

describe('Decisão 523 · a régua do custo de compra', () => {
  it('é `compras.ver`: lançar nota não dá custo, e `insumos.ver` (o operador) também não', () => {
    expect(veCustoDeCompra(SO_LANCA, ['loja-vp'])).toBe(false);
    expect(veCustoDeCompra(OPERADOR_QUE_LANCA, ['loja-vp'])).toBe(false);
    expect(veCustoDeCompra(SO_LANCA, [])).toBe(false);
    expect(veCustoDeCompra(VE_E_LANCA, ['loja-vp', 'loja-meier'])).toBe(true);
    expect(veCustoDeCompra(DONO, ['loja-vp'])).toBe(true);
    expect(veCustoDeCompra(ALCANCE_FLOWFOODS, ['loja-vp'])).toBe(true);
  });

  it('acesso de uma loja só: vale a permissão (as lojas em jogo já vêm do acesso: o todo-ou-nada é defensivo, hoje é `compras.ver`)', () => {
    // Loja fora do acesso nunca chega à régua (`lojasParaLancar`, `lerNota` e `notaVisivel` filtram antes), e a permissão vale para
    // o acesso inteiro: por isso não há caso real em que a checagem por loja dê outra resposta que `compras.ver`.
    expect(veCustoDeCompra(GERENTE_DA_PENHA, ['loja-vp'])).toBe(true);
    expect(veCustoDeCompra(resolverAlcance(vinculo({ perfilProprio: ['compras.lancar', 'lojas.ver'], redeInteira: false, lojaIds: ['loja-vp'] })), ['loja-vp'])).toBe(false);
  });
});

// ------------------------------------------------------------------ a linha do item

const CHEDDAR: InsumoDaCompra = { id: 'i-ched', nome: 'Cheddar', unidade: 'KG', ativo: true, produzidoPor: null, conteudoMilesimos: 1000, embalagens: [{ id: 'v-cx', nome: 'Caixa', conteudoMilesimos: 5000, ativo: true }] };
const opcoes = (insumo: InsumoDoFormularioDeNota): FormularioDeNota => ({
  lojas: [{ id: 'loja-vp', nome: 'Vila da Penha', ativa: true }],
  fornecedores: [{ id: 'f-lat', nome: 'Laticínios Rio', ativo: true, raizCnpj: null }],
  insumos: [insumo],
});
const formulario = (o: FormularioDeNota) =>
  sp(
    renderToStaticMarkup(
      createElement(FormNota, {
        acao: async () => null,
        modo: 'lancar',
        base: '/erp/compras',
        aqui: '/erp/compras/nova',
        cancelar: '/erp/compras',
        opcoes: o,
        inicial: { lojaId: 'loja-vp', fornecedorId: 'f-lat', numero: '9', serie: '', data: '2026-10-17', frete: '6,00', total: '275,70', itens: [{ insumoId: 'i-ched', embalagem: 'v:v-cx', quantidade: '3', valor: '269,70' }] },
        hoje: '2026-10-17',
        periodos: { fechados: [], emCurso: 'Outubro', href: '/erp/dre/periodos' },
      }),
    ),
  );

describe('Decisão 523 · a linha do item do formulário', () => {
  it('com o custo de agora (quem vê compras): a conta do que se digita e o "hoje", como antes', () => {
    const h = texto(formulario(opcoes({ ...CHEDDAR, custo: { centavos: 4000, milesimos: 1000 } })));
    expect(h).toContain('15 kg · R$ 18,38/kg com frete · hoje R$ 40,00/kg');
    // Sem preço nenhum (nem compra nem cadastro): diz que não há, para quem vê.
    expect(texto(formulario(opcoes({ ...CHEDDAR, custo: null })))).toContain('com frete · hoje sem custo informado');
  });

  it('sem o custo de agora (o campo nem existe): só a conta do que se digita, sem "hoje" nem "sem custo informado"', () => {
    const h = texto(formulario(opcoes({ ...CHEDDAR })));
    expect(h).toContain('15 kg · R$ 18,38/kg com frete');
    expect(h).not.toMatch(/· hoje|sem custo informado|R\$ 40,00/);
    expect(h).toContain('R$ 269,70 + R$ 6,00 de frete = R$ 275,70');
  });
});

// ------------------------------------------------------------------ a prévia

const BASE_DA_PREVIA = {
  itens: [{ nome: 'Cheddar', embalagem: 'Caixa · 5 kg', quantidade: '3 = 15 kg', valorCentavos: 30_000, freteRateadoCentavos: 0, custo: 'R$ 20,00/kg' }],
  somaItensCentavos: 30_000,
  freteCentavos: 0,
  totalCentavos: 30_000,
  estoque: { movimenta: false, frase: 'Não mexe no estoque: o estoque da Vila da Penha ainda não foi aberto.' },
  orcamento: null,
};

describe('Decisão 523 · a prévia do "Conferir o impacto"', () => {
  it('sem custo de compra: total e estoque; sem a lista antes → depois e sem "Fichas que mudam junto"', () => {
    const previa: PreviaDaNota = { ...BASE_DA_PREVIA, veCusto: false, custos: [], fichas: [], maisFichas: 0 };
    const h = sp(renderToStaticMarkup(createElement(PreviaDoImpacto, { previa })));
    expect(h).toContain('aria-label="Prévia: total e estoque"');
    expect(h).toContain('>Prévia: total e estoque</h2>');
    expect(h).toContain('confere com o total da nota');
    expect(h).toContain('Não mexe no estoque: o estoque da Vila da Penha ainda não foi aberto.');
    expect(h).not.toMatch(/o que muda no custo|Fichas que mudam junto|Nenhuma ficha usa|<ul class="mt-3/);
  });

  it('com custo de compra: a mesma prévia de antes (título, antes → depois e fichas)', () => {
    const previa: PreviaDaNota = {
      ...BASE_DA_PREVIA,
      veCusto: true,
      custos: [{ insumoId: 'i-ched', nome: 'Cheddar', antes: 'R$ 18,78/kg', depois: 'R$ 20,00/kg', efeito: 'sobe' }],
      fichas: [{ id: 'f1', nome: 'Molho cheddar', tipo: 'Pré-preparo', porQue: 'usa Cheddar', antes: 'R$ 9,39 por kg', depois: 'R$ 10,00 por kg', sobe: true, variacaoCentavos: 61 }],
      maisFichas: 0,
    };
    const h = sp(renderToStaticMarkup(createElement(PreviaDoImpacto, { previa })));
    expect(h).toContain('aria-label="Prévia: o que muda no custo"');
    expect(texto(h)).toContain('R$ 18,78/kg → passa a R$ 20,00/kg');
    expect(h).toContain('Fichas que mudam junto');
    expect(texto(h)).toContain('R$ 9,39 por kg → passa a R$ 10,00 por kg');
  });
});

// ------------------------------------------------------------------ as frases depois de lançar

describe('Decisão 523 · as frases depois de lançar, alterar, cancelar e conciliar', () => {
  /** Duas notas do mesmo insumo: a desta frase (de 14/10, lançada por último) e uma mais nova (16/10, lançada antes). */
  const item = (notaId: string, entradaEm: string, lancadaEm: number, status = 'LANCADA') => ({ notaId, entradaEm, lancadaEm, status, valorCentavos: 28_170, freteRateadoCentavos: 0, quantidadeMilesimos: 15_000 });

  it('a regra que as frases contam: a nota lançada agora, de data mais velha, não é a que vale; cancelar a que não vale não muda nada', () => {
    const lista = [item('meier', '2026-10-16', 1), item('penha', '2026-10-14', 2)];
    expect(ultimaCompraDaLista(lista)!.compra.notaId).toBe('meier');
    expect(ultimaCompraDaLista([item('meier', '2026-10-16', 1), item('penha', '2026-10-14', 2, 'CANCELADA')])!.compra.notaId).toBe('meier');
    // Cancelar a que vale: volta à anterior.
    expect(ultimaCompraDaLista([item('meier', '2026-10-16', 1, 'CANCELADA'), item('penha', '2026-10-14', 2)])!.compra.notaId).toBe('penha');
  });

  it('dizem onde o custo muda (a compra mais recente do insumo), sem prometer que mudou', () => {
    expect(fraseDaNota('lancada')).toBe('Nota lançada. Onde ela é a compra mais recente do insumo, o custo dela já vale nas fichas.');
    expect(fraseDaNota('editada')).toBe('Nota alterada. O antes e o depois estão em Alterações; o custo de cada insumo segue a compra mais recente dele.');
    expect(fraseDaNota('cancelada')).toBe('Nota cancelada. Ela não vale mais para o custo: onde era a compra mais recente do insumo, ele voltou à compra anterior (ou ao preço cadastrado).');
    expect(fraseDoDocumento('conciliada')).toBe('Nota conciliada: a nota de compra foi lançada. Onde ela é a compra mais recente do insumo, o custo dela já vale nas fichas.');
    // As de antes prometiam o custo novo para todos os insumos da nota.
    for (const f of [fraseDaNota('lancada'), fraseDaNota('editada'), fraseDaNota('cancelada'), fraseDoDocumento('conciliada')]) {
      expect(f).not.toMatch(/O custo dos insumos dela já vale|o custo dos insumos já vale|o custo já acompanha|cada insumo voltou/);
      expect(f).toContain('compra mais recente');
    }
    // "Ligada" já era exata (nada foi lançado de novo) e não muda.
    expect(fraseDoDocumento('ligada')).toBe('Nota ligada à que você já tinha lançado. Nada foi lançado de novo: o estoque e o custo ficaram como estavam.');
  });
});

describe('Decisão 523 · a ajuda não promete o custo a quem não o vê nem o custo novo para todo insumo', () => {
  it('a aula de "Lançar nota" para todos não fala de custo na prévia; a do detalhe diz onde editar e cancelar mudam o custo', () => {
    const lancar = entradaPorChave('compra-nova')!;
    expect(lancar.versao).toBe(7);
    const paraTodos = lancar.aula.filter((b) => !b.para).map((b) => b.texto);
    expect(paraTodos.join(' ')).not.toMatch(/custo/);
    expect(paraTodos).toContain('“Conferir o impacto” mostra o que a nota faz antes de lançar, sem gravar nada: passar do orçamento de compra da loja é aviso, a nota entra igual.');
    const detalhe = entradaPorChave('compra')!;
    expect(detalhe.versao).toBe(7);
    const errou = detalhe.aula.find((b) => b.texto.startsWith('Com acesso para ver e lançar'))!;
    expect(errou.texto).toBe('Com acesso para ver e lançar compras na loja, você pode editar ou cancelar com o motivo: o que a nota pôs no estoque é corrigido por estorno, e o custo só muda nos insumos em que ela é ou era a compra mais recente.');
    expect(errou.para).toEqual(['compras.lancar']);
  });
});
