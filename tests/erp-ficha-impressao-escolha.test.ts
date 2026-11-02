import { describe, expect, it } from 'vitest';
import {
  estadoInicialDaImpressao,
  SEM_PERMISSAO_FINANCEIRA,
  transicaoDaImpressao,
  type EstadoDaImpressao,
  type EventoDaImpressao,
} from '@/components/erp/telas/fichas/impressao-escolha';

/**
 * Impressão da Ficha — escolha explícita de preços e custos (decisão de 31/10/2026). Máquina de estados pura: cancelar
 * não imprime, "Sem" é o padrão a cada pedido, "Com" só sai depois da resposta do servidor e os valores são descartados
 * ao fim da impressão ou numa impressão que a tela não abriu (Ctrl+P).
 */
type D = { valores: string };
const passos = (...eventos: EventoDaImpressao<D>[]) =>
  eventos.reduce<EstadoDaImpressao<D>[]>((acc, e) => [...acc, transicaoDaImpressao(acc[acc.length - 1], e)], [estadoInicialDaImpressao<D>()]);
const ultimo = (...eventos: EventoDaImpressao<D>[]) => passos(...eventos).at(-1)!;
const imprimiu = (estados: EstadoDaImpressao<D>[]) => estados.some((e) => e.fase === 'imprimir' || e.fase === 'imprimindo');
const DADOS: D = { valores: 'R$ 7,37' };

describe('Impressão da Ficha · escolha de preços e custos', () => {
  it('começa parada e sem valores; abrir pergunta, com "Sem preços e custos" marcado', () => {
    expect(estadoInicialDaImpressao()).toEqual({ fase: 'parado', dados: null });
    expect(ultimo({ tipo: 'abrir' })).toEqual({ fase: 'escolhendo', escolha: 'sem', erro: null, dados: null });
  });

  it('cancelar não imprime, nem depois de escolher "Com"; resposta que chega depois de cancelar é ignorada', () => {
    const sem = passos({ tipo: 'abrir' }, { tipo: 'cancelar' });
    expect(imprimiu(sem)).toBe(false);
    expect(sem.at(-1)).toEqual({ fase: 'parado', dados: null });
    const com = passos(
      { tipo: 'abrir' },
      { tipo: 'escolher', escolha: 'com', podeFinanceiro: true },
      { tipo: 'confirmar', podeFinanceiro: true },
      { tipo: 'cancelar' },
      { tipo: 'carregou', dados: DADOS },
    );
    expect(com.map((e) => e.fase)).toEqual(['parado', 'escolhendo', 'escolhendo', 'carregando', 'parado', 'parado']);
    expect(imprimiu(com)).toBe(false);
    expect(com.at(-1)!.dados).toBeNull();
  });

  it('"Sem preços e custos" imprime direto, sem pedir valores ao servidor', () => {
    const r = passos({ tipo: 'abrir' }, { tipo: 'confirmar', podeFinanceiro: true });
    expect(r.some((e) => e.fase === 'carregando')).toBe(false);
    expect(r.at(-1)).toEqual({ fase: 'imprimir', dados: null });
  });

  it('"Com preços e custos": espera o servidor, imprime com os valores e os descarta no afterprint', () => {
    const r = passos(
      { tipo: 'abrir' },
      { tipo: 'escolher', escolha: 'com', podeFinanceiro: true },
      { tipo: 'confirmar', podeFinanceiro: true },
      { tipo: 'carregou', dados: DADOS },
      { tipo: 'chamouImpressao' },
      { tipo: 'terminouImpressao' },
    );
    expect(r.map((e) => e.fase)).toEqual(['parado', 'escolhendo', 'escolhendo', 'carregando', 'imprimir', 'imprimindo', 'parado']);
    expect(r[4].dados).toEqual(DADOS);
    expect(r[5].dados).toEqual(DADOS);
    expect(r.at(-1)!.dados).toBeNull();
  });

  it('nova solicitação depois de imprimir com valores volta a perguntar, em "Sem", e sem valores na tela', () => {
    const r = ultimo(
      { tipo: 'abrir' },
      { tipo: 'escolher', escolha: 'com', podeFinanceiro: true },
      { tipo: 'confirmar', podeFinanceiro: true },
      { tipo: 'carregou', dados: DADOS },
      { tipo: 'chamouImpressao' },
      { tipo: 'terminouImpressao' },
      { tipo: 'abrir' },
    );
    expect(r).toEqual({ fase: 'escolhendo', escolha: 'sem', erro: null, dados: null });
  });

  it('sem permissão: "Com" não fica marcado nem é confirmado; nunca chega a carregar', () => {
    const r = passos({ tipo: 'abrir' }, { tipo: 'escolher', escolha: 'com', podeFinanceiro: false }, { tipo: 'confirmar', podeFinanceiro: false });
    expect(r.at(-1)).toEqual({ fase: 'imprimir', dados: null }); // seguiu em "Sem"
    expect(r.some((e) => e.fase === 'carregando')).toBe(false);
    expect(r[2]).toMatchObject({ fase: 'escolhendo', escolha: 'sem', erro: SEM_PERMISSAO_FINANCEIRA });
  });

  it('permissão revogada entre a escolha e a confirmação: não carrega e explica', () => {
    const r = ultimo({ tipo: 'abrir' }, { tipo: 'escolher', escolha: 'com', podeFinanceiro: true }, { tipo: 'confirmar', podeFinanceiro: false });
    expect(r).toEqual({ fase: 'escolhendo', escolha: 'sem', erro: SEM_PERMISSAO_FINANCEIRA, dados: null });
  });

  it('servidor recusa ou falha: volta à escolha com a mensagem e não imprime', () => {
    const r = passos(
      { tipo: 'abrir' },
      { tipo: 'escolher', escolha: 'com', podeFinanceiro: true },
      { tipo: 'confirmar', podeFinanceiro: true },
      { tipo: 'falhou', erro: 'A ficha foi alterada.' },
    );
    expect(r.at(-1)).toEqual({ fase: 'escolhendo', escolha: 'com', erro: 'A ficha foi alterada.', dados: null });
    expect(imprimiu(r)).toBe(false);
  });

  it('Ctrl+P que a tela não abriu nunca leva valores: descarta antes do papel', () => {
    const comValores = ultimo(
      { tipo: 'abrir' },
      { tipo: 'escolher', escolha: 'com', podeFinanceiro: true },
      { tipo: 'confirmar', podeFinanceiro: true },
      { tipo: 'carregou', dados: DADOS },
      { tipo: 'chamouImpressao' },
    );
    // Se o afterprint não chegar, a próxima impressão nativa descarta assim mesmo.
    expect(transicaoDaImpressao(comValores, { tipo: 'impressaoNativa' })).toEqual({ fase: 'parado', dados: null });
    const parado = estadoInicialDaImpressao<D>();
    expect(transicaoDaImpressao(parado, { tipo: 'impressaoNativa' })).toBe(parado);
  });

  it('"Voltar à versão sem valores" descarta; abrir durante o carregamento ou a impressão não reinicia', () => {
    const carregando = ultimo({ tipo: 'abrir' }, { tipo: 'escolher', escolha: 'com', podeFinanceiro: true }, { tipo: 'confirmar', podeFinanceiro: true });
    expect(transicaoDaImpressao(carregando, { tipo: 'abrir' })).toBe(carregando);
    const pronto = transicaoDaImpressao(carregando, { tipo: 'carregou', dados: DADOS });
    expect(transicaoDaImpressao(pronto, { tipo: 'descartar' })).toEqual({ fase: 'parado', dados: null });
    const imprimindo = transicaoDaImpressao(pronto, { tipo: 'chamouImpressao' });
    expect(transicaoDaImpressao(imprimindo, { tipo: 'abrir' })).toBe(imprimindo);
  });
});
