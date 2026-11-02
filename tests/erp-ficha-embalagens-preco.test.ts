import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => null, useSearchParams: () => null }));
vi.mock('react-dom', async (orig) => ({ ...(await orig<typeof import('react-dom')>()), useFormState: (_acao: unknown, inicial: unknown) => [inicial, undefined], useFormStatus: () => ({ pending: false }) }));
import { FormEmbalagens } from '@/components/erp/telas/fichas/form-embalagens';
import { contaDasEmbalagensNaTela, precosDasEmbalagens, type EmbalagemNaTela, type PrecoDoCanalNaFicha } from '@/components/erp/telas/fichas/conta-das-embalagens';
import { cmvDoCanal } from '@/lib/erp/cmv-produto-campos';
import { custoDaEmbalagem } from '@/lib/erp/unidades';

/**
 * Ficha primeiro (02/11/2026): na tela de embalagens por canal, meta de CMV, sugestão pela meta, preço escolhido e CMV ao
 * vivo, pela mesma conta do detalhe. Receita R$ 10,00 por porção (matriz da especificação: Loja 10, Delivery +2 = 12,
 * iFood +3 = 13). Taxa do iFood fora do custo físico, da sugestão e do CMV; previsto não é uso real.
 */
const RECEITA = { num: 1000n, den: 1n }; // R$ 10,00 por porção
const CAIXA = custoDaEmbalagem(200, 0, 1000)!; // R$ 2,00 a unidade
const SACOLA = custoDaEmbalagem(300, 0, 1000)!; // R$ 3,00 a unidade
const un = (nome: string, custo: EmbalagemNaTela['custo'], q = 1): EmbalagemNaTela => ({ nome, unidade: 'UN', quantidadeMilesimos: q * 1000, custo });
const preco = (p: Partial<PrecoDoCanalNaFicha> = {}): PrecoDoCanalNaFicha => ({ metaBp: 2500, precoCentavos: 5000, ofertado: true, ...p });
const conta = (canal: 'DELIVERY_PROPRIO' | 'IFOOD', embalagens: EmbalagemNaTela[], p: Partial<PrecoDoCanalNaFicha> = {}, faltaPreco: string[] = []) =>
  contaDasEmbalagensNaTela({ canal, porcao: RECEITA, faltaPreco, embalagens, preco: preco(p) });
const reais = (f: { num: bigint; den: bigint }) => Number(f.num) / Number(f.den) / 100;

describe('embalagens → preço: a conta ao vivo é a mesma do detalhe', () => {
  it('Delivery: receita 10 + caixa 2 = 12; meta 25% sugere R$ 48,00; ao preço de R$ 50,00, CMV 24% dentro da meta', () => {
    const x = conta('DELIVERY_PROPRIO', [un('Caixa', CAIXA)]);
    expect(reais(x.fisico.valor)).toBe(12);
    expect(x.sugerido).toMatchObject({ tipo: 'ok', centavos: 4800 });
    expect(x.cmvBp && Number(x.cmvBp.num) / Number(x.cmvBp.den)).toBe(2400);
    expect(x.status).toBe('dentro');
  });

  it('iFood: receita 10 + sacola 3 = 13; sugestão R$ 52,00; ao preço de R$ 50,00, CMV 26% acima da meta', () => {
    const x = conta('IFOOD', [un('Sacola', SACOLA)]);
    expect(reais(x.fisico.valor)).toBe(13);
    expect(x.sugerido).toMatchObject({ tipo: 'ok', centavos: 5200 });
    expect(x.status).toBe('acima');
  });

  it('é idêntica à conta do servidor com o custo de referência do insumo (preço da embalagem ÷ conteúdo)', () => {
    const tela = conta('DELIVERY_PROPRIO', [un('Caixa', CAIXA), un('Sacola', SACOLA, 2)]);
    const servidor = cmvDoCanal(
      {
        canal: 'DELIVERY_PROPRIO',
        custoDaFicha: { porRendimento: RECEITA, faltaPreco: [] },
        embalagens: [
          { insumoId: 'caixa', nome: 'Caixa', unidade: 'UN', quantidadeMilesimos: 1000, insumo: { precoEmbalagemCentavos: 200, taxaEntregaCentavos: 0, conteudoMilesimos: 1000, ultimaCompra: null } },
          { insumoId: 'sacola', nome: 'Sacola', unidade: 'UN', quantidadeMilesimos: 2000, insumo: { precoEmbalagemCentavos: 300, taxaEntregaCentavos: 0, conteudoMilesimos: 1000, ultimaCompra: null } },
        ],
        taxa: null,
      },
      { metaBp: 2500, precoCentavos: 5000 },
    );
    expect(tela.fisico).toEqual(servidor.fisico);
    expect(tela.sugerido).toEqual(servidor.sugerido);
    expect(tela.cmvBp).toEqual(servidor.cmvBp);
    expect(tela.status).toBe(servidor.status);
  });

  it('sacola é embalagem normal com quantidade por produto/canal: 2 por porção prevê R$ 6,00 (previsto, não uso real)', () => {
    const uma = conta('IFOOD', [un('Sacola', SACOLA, 1)]);
    const duas = conta('IFOOD', [un('Sacola', SACOLA, 2)]);
    expect(reais(duas.fisico.embalagens) - reais(uma.fisico.embalagens)).toBe(3);
    expect(duas.sugerido).toMatchObject({ tipo: 'ok', centavos: 6400 }); // 16 ÷ 25%
  });

  it('taxa do iFood fora do numerador: a sugestão e o CMV não mudam com taxa; o resultado (P − C − tP) não sai daqui', () => {
    const x = conta('IFOOD', [un('Sacola', SACOLA)]);
    const comTaxa = cmvDoCanal(
      { canal: 'IFOOD', custoDaFicha: { porRendimento: RECEITA, faltaPreco: [] }, embalagens: [{ insumoId: 's', nome: 'Sacola', unidade: 'UN', quantidadeMilesimos: 1000, insumo: { precoEmbalagemCentavos: 300, taxaEntregaCentavos: 0, conteudoMilesimos: 1000, ultimaCompra: null } }], taxa: { comissaoBp: 2300, pagamentoBp: 320 } },
      { metaBp: 2500, precoCentavos: 5000 },
    );
    expect(x.sugerido).toEqual(comTaxa.sugerido);
    expect(x.cmvBp).toEqual(comTaxa.cmvBp);
    expect('resultado' in x).toBe(false);
  });

  it('custo ausente não é zero: embalagem sem custo ou receita incompleta não sugerem preço nem acendem farol', () => {
    const semCusto = conta('IFOOD', [un('Sacola', null)]);
    expect(semCusto.fisico.completo).toBe(false);
    expect(semCusto.sugerido).toEqual({ tipo: 'incompleto', falta: ['Sacola'] });
    expect(semCusto.status).toBe('semDados');
    expect(semCusto.motivo).toContain('“Sacola”');
    const receitaIncompleta = conta('DELIVERY_PROPRIO', [un('Caixa', CAIXA)], {}, ['Molho da casa']);
    expect(receitaIncompleta.sugerido).toMatchObject({ tipo: 'incompleto' });
    expect(receitaIncompleta.cmvBp).toBeNull();
  });

  it('nenhuma embalagem é diferente de custo ausente: só a receita, conta completa', () => {
    const x = conta('DELIVERY_PROPRIO', []);
    expect(x.fisico.completo).toBe(true);
    expect(reais(x.fisico.valor)).toBe(10);
    expect(x.sugerido).toMatchObject({ tipo: 'ok', centavos: 4000 });
  });

  it('sem meta: sem sugestão; sem preço: sem CMV, com o motivo; preço manual é o que vale (a sugestão não o troca)', () => {
    const semMeta = conta('DELIVERY_PROPRIO', [un('Caixa', CAIXA)], { metaBp: null });
    expect(semMeta.sugerido).toEqual({ tipo: 'semMeta' });
    expect(semMeta.status).toBe('semDados');
    expect(semMeta.motivo).toContain('sem meta de CMV');
    const semPreco = conta('DELIVERY_PROPRIO', [un('Caixa', CAIXA)], { precoCentavos: null });
    expect(semPreco.cmvBp).toBeNull();
    expect(semPreco.motivo).toContain('preço de venda não definido');
    const manual = conta('DELIVERY_PROPRIO', [un('Caixa', CAIXA)], { precoCentavos: 3990 });
    expect(manual.precoCentavos).toBe(3990);
    expect(manual.sugerido).toMatchObject({ centavos: 4800 });
  });

  it('canal não ofertado: sem farol (diferente de sem dados)', () => {
    expect(conta('IFOOD', [un('Sacola', SACOLA)], { ofertado: false }).status).toBe('naoOfertado');
  });

  it('precosDasEmbalagens: só Delivery e iFood, a partir da conta já lida; faltando canal, nada', () => {
    const cmv = [
      { canal: 'LOJA' as const, metaBp: 3000, precoCentavos: 4000, ofertado: true },
      { canal: 'DELIVERY_PROPRIO' as const, metaBp: 2500, precoCentavos: 5000, ofertado: true },
      { canal: 'IFOOD' as const, metaBp: null, precoCentavos: null, ofertado: false },
    ];
    expect(precosDasEmbalagens(cmv)).toEqual({
      DELIVERY_PROPRIO: { metaBp: 2500, precoCentavos: 5000, ofertado: true },
      IFOOD: { metaBp: null, precoCentavos: null, ofertado: false },
    });
    expect(precosDasEmbalagens(cmv.slice(0, 2))).toBeNull();
  });
});

type Props = ComponentProps<typeof FormEmbalagens>;
const opcoes: Props['opcoes'] = [
  { id: 'caixa', nome: 'Caixa', unidade: 'UN', ativo: true, embalagem: true, custo: CAIXA },
  { id: 'sacola', nome: 'Sacola', unidade: 'UN', ativo: true, embalagem: true, custo: SACOLA },
];
const base: Props = {
  acao: async () => null,
  aqui: '/erp/fichas/teste/canais',
  cancelar: '/erp/fichas/teste',
  opcoes,
  inicial: [
    { canal: 'DELIVERY_PROPRIO', insumoId: 'caixa', quantidade: '1', unidade: 'un' },
    { canal: 'IFOOD', insumoId: 'sacola', quantidade: '1', unidade: 'un' },
  ],
  impressao: '',
  porcao: { num: '1000', den: '1' },
  faltaPreco: [],
  podeConferirPrecos: true,
  bloqueio: null,
  precos: { DELIVERY_PROPRIO: preco(), IFOOD: preco() },
};
const html = (p: Partial<Props> = {}) => renderToStaticMarkup(createElement(FormEmbalagens, { ...base, ...p })).replace(/\s/g, ' ');

describe('tela de embalagens: meta, sugestão, preço escolhido e CMV em cada canal', () => {
  it('mostra os quatro, por canal, só para leitura, sem campo de preço e sem "lucro"', () => {
    const h = html();
    expect(h.match(/Com estas embalagens/g)).toHaveLength(2);
    expect(h).toContain('Preço sugerido');
    expect(h).toContain('R$ 48,00'); // Delivery: 12 ÷ 25%
    expect(h).toContain('R$ 52,00'); // iFood: 13 ÷ 25%
    expect(h).toContain('R$ 12,00 ÷ 25%');
    expect(h).toContain('Seu preço');
    expect(h).toContain('R$ 50,00');
    expect(h).toContain('dentro da meta');
    expect(h).toContain('acima da meta');
    expect(h).toContain('A taxa do iFood fica fora do custo físico e do CMV.');
    expect(h).not.toMatch(/name="preco|lucro/i);
    // O envio das embalagens continua o mesmo (nenhum campo novo no formulário).
    expect([...h.matchAll(/name="(emb_[a-z]+)"/g)].map((m) => m[1]).sort()).toEqual(['emb_canal', 'emb_canal', 'emb_insumo', 'emb_insumo', 'emb_quantidade', 'emb_quantidade', 'emb_unidade', 'emb_unidade']);
  });

  it('linha pela metade não vira canal completo: nada de sugestão ou CMV até completar', () => {
    const h = html({ inicial: [...base.inicial, { canal: 'DELIVERY_PROPRIO', insumoId: '', quantidade: '2', unidade: 'un' }] });
    expect(h).toContain('Complete as embalagens para ver o preço sugerido e o CMV.');
    expect(h).not.toContain('R$ 48,00');
    expect(h).toContain('R$ 52,00'); // o iFood segue independente
  });

  it('sem meta, sem preço e não ofertado aparecem como tal', () => {
    const h = html({ precos: { DELIVERY_PROPRIO: preco({ metaBp: null, precoCentavos: null }), IFOOD: preco({ ofertado: false }) } });
    expect(h).toContain('sem meta');
    expect(h).toContain('não definido');
    expect(h).toContain('preço de venda não definido');
    expect(h).toContain('Não ofertado: este prato não está marcado como vendido neste canal.');
  });

  it('sem os preços da ficha (DTO antigo), a tela continua como antes', () => {
    const h = html({ precos: undefined });
    expect(h).not.toContain('Com estas embalagens');
    expect(h).toContain('Custo físico da receita e embalagens: R$ 12,00 por porção');
  });
});

describe('tela de embalagens: a prévia segue a regra do servidor e a unidade da embalagem', () => {
  const linha = (canal: 'DELIVERY_PROPRIO' | 'IFOOD', insumoId: string, quantidade = '1', unidade = 'un') => ({ canal, insumoId, quantidade, unidade });
  it('embalagem repetida no canal: o servidor recusaria, então nada de preço sugerido nem farol', () => {
    const h = html({ inicial: [linha('DELIVERY_PROPRIO', 'caixa'), linha('DELIVERY_PROPRIO', 'caixa'), linha('IFOOD', 'sacola')] });
    expect(h).toContain('Corrija antes de ver o preço sugerido e o CMV: “Caixa” já está neste canal (linha 1).');
    expect(h).not.toContain('R$ 56,00');
    expect(h).toContain('R$ 52,00'); // o iFood segue independente
  });
  it('quantidade acima do limite por porção: recusa, sem sugestão de milhares de reais', () => {
    const h = html({ inicial: [linha('DELIVERY_PROPRIO', 'caixa', '2000'), linha('IFOOD', 'sacola')] });
    expect(h).toContain('Mais de 1.000 un por porção? Confira o número.');
    expect(h).not.toContain('R$ 16.040,00');
  });
  it('embalagem desativada que já estava gravada no canal continua valendo, como no servidor (jaNoCanal)', () => {
    const desativada = [...opcoes, { id: 'velha', nome: 'Caixa antiga', unidade: 'UN' as const, ativo: false, embalagem: true, custo: CAIXA }];
    const gravada = html({ opcoes: desativada, inicial: [linha('DELIVERY_PROPRIO', 'velha'), linha('IFOOD', 'sacola')] });
    expect(gravada).not.toContain('está desativada');
    expect(gravada).toContain('R$ 48,00');
  });
  it('embalagem medida em kg, digitada em g: 20 g de R$ 50,00/kg = R$ 1,00; receita 10 + 1 = 11 ÷ 25% = R$ 44,00', () => {
    const filme = { id: 'filme', nome: 'Filme', unidade: 'KG' as const, ativo: true, embalagem: true, custo: custoDaEmbalagem(5000, 0, 1000)! };
    const h = html({ opcoes: [...opcoes, filme], inicial: [linha('DELIVERY_PROPRIO', 'filme', '20', 'g'), linha('IFOOD', 'sacola')] });
    expect(h).toContain('R$ 11,00 ÷ 25%');
    expect(h).toContain('R$ 44,00');
  });
  it('embalagem sem custo: o bloco diz "Custo incompleto" e "sem dados" com o motivo, sem número', () => {
    const semCusto = [...opcoes, { id: 'semcusto', nome: 'Sacola sem custo', unidade: 'UN' as const, ativo: true, embalagem: true, custo: null }];
    const h = html({ opcoes: semCusto, inicial: [linha('DELIVERY_PROPRIO', 'caixa'), linha('IFOOD', 'semcusto')] });
    expect(h).toContain('Custo incompleto');
    expect(h).toContain('falta preço em “Sacola sem custo”');
    expect(h).not.toContain('R$ 52,00');
  });
});

describe('Kairu (31/10): aviso de embalagem que também está na receita', () => {
  it('avisa no canal onde se repete, sem bloquear o salvar; o outro canal fica quieto', () => {
    const h = html({ naReceita: ['caixa', 'carne'] });
    expect(h).toContain('“Caixa” também está na receita: se for o mesmo uso, o custo entra duas vezes no Delivery próprio.');
    expect(h).not.toContain('no iFood. Usos diferentes');
    // O aviso não bloqueia: nenhum botão de envio fica desativado.
    expect(h).toContain('Salvar embalagens');
    expect(h).not.toContain('disabled=""');
  });
  it('sem repetição, ou sem a lista da receita, nenhum aviso', () => {
    expect(html({ naReceita: ['carne'] })).not.toContain('também está na receita');
    expect(html({})).not.toContain('também está na receita');
  });
});
