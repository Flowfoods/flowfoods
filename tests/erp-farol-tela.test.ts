/**
 * ERP 2.4 · o farol na tela, SEM banco: a régua + a palavra + o aria-label (a cor nunca sozinha), o teste-guarda de que a cor
 * só mora no indicador (nenhum `border-farol-*`/`bg-farol-*`… no código), e a página do período fechado antigo (v1/v2),
 * que diz "não apurado neste fechamento" onde a fotografia não tem o CMV (herança do fiscal pós-deploy da 2.3).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Farol } from '@/components/erp/telas/dre/farol';
import { TelaDoFechamento } from '@/components/erp/telas/dre/periodo-fechamento';
import type { SituacaoDoFechamento } from '@/lib/erp/dre-fechamento';
import type { LinhaGravada } from '@/lib/erp/dre-fechamento-campos';
import type { FotografiaLida } from '@/lib/erp/dre-fotografia';
import type { FarolDaLinha } from '@/lib/erp/farol-dre-campos';

vi.mock('react-dom', async (orig) => ({ ...(await orig<typeof import('react-dom')>()), useFormState: (_a: unknown, inicial: unknown) => [inicial, undefined], useFormStatus: () => ({ pending: false }) }));

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el).replace(/ /g, ' ');

describe('2.4 · o glifo: régua de 5 casas + palavra + aria-label', () => {
  const vermelho: FarolDaLinha = { tipo: 'cor', escala: 'receita', cor: 'VERMELHO', posicao: 5, palavra: 'muito pior que a meta', confira: null, desvioTexto: '−23,0 pp', rotulo: 'Farol: muito pior que a meta, −23,0 pp, faixa 5 de 5' };
  it('a casa cheia é a da faixa (as outras são só contorno), a palavra está na tela e o rótulo vai no glifo', () => {
    const h = html(createElement(Farol, { f: vermelho }));
    expect(h).toContain('aria-label="Farol: muito pior que a meta, −23,0 pp, faixa 5 de 5"');
    expect(h).toContain('muito pior que a meta');
    expect(h.match(/fill="currentColor"/g)).toHaveLength(1);
    expect(h.match(/<rect/g)).toHaveLength(5);
    expect(h).toContain('x="40"'); // a quinta casa
    expect(h).toContain('text-farol-vermelho');
  });
  it('azul enche a primeira casa e traz o "confira se está tudo lançado"', () => {
    const h = html(createElement(Farol, { f: { tipo: 'cor', escala: 'custo', cor: 'AZUL', posicao: 1, palavra: 'bem melhor que a meta', confira: 'confira se está tudo lançado', desvioTexto: '−3,5 pp', rotulo: 'x' } }));
    expect(h).toContain('x="0" y="0" width="8"');
    expect(h).toContain('confira se está tudo lançado');
    expect(h).toContain('text-farol-azul');
  });
  it('sem cor: a régua vem vazia (nenhuma casa cheia, sem cor de faixa) e o motivo está escrito', () => {
    const h = html(createElement(Farol, { f: { tipo: 'sem', motivo: 'sem contar o CMV de Centro', desvioTexto: '+1,2 pp' } }));
    expect(h).not.toContain('fill="currentColor"');
    expect(h).not.toMatch(/text-farol-/);
    expect(h).toContain('sem cor: sem contar o CMV de Centro');
  });
});

describe('2.4 · cor só no indicador (critério 11): nenhuma borda, fundo ou gradiente com a cor do farol', () => {
  const arquivos = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? arquivos(p) : /\.(tsx?|css)$/.test(n) ? [p] : [];
    });
  it('o código não usa farol-* como border, bg, ring, divide, outline, shadow, from, via ou to', () => {
    const proibido = /\b(?:border|bg|ring|divide|outline|shadow|from|via|to|fill|stroke|decoration|accent|caret)(?:-[trblxyse])?-farol-/;
    const achados = arquivos(join(process.cwd(), 'src')).filter((p) => proibido.test(readFileSync(p, 'utf8')));
    expect(achados).toEqual([]);
  });
  it('o único lugar que usa a cor do farol é o texto (text-farol-*) e o token', () => {
    const usos = arquivos(join(process.cwd(), 'src'))
      .filter((p) => /farol-(azul|verde|amarelo|laranja|vermelho)/.test(readFileSync(p, 'utf8')))
      .map((p) => p.replace(process.cwd() + '/', ''))
      .sort();
    expect(usos).toEqual(['src/components/erp/telas/dre/farol.tsx', 'src/components/erp/tokens.css']);
  });
});

describe('2.4 · fotografia de antes do CMV (herança do fiscal da 2.3): a página do período diz "não apurado neste fechamento"', () => {
  const linha = (extra: Partial<LinhaGravada> & Pick<LinhaGravada, 'chave' | 'nome' | 'tipo'>): LinhaGravada => ({
    lojaId: null, lojaNome: null, ordem: 0, codigo: extra.chave, linhaId: null, grupo: 'RESULTADO', nivel: 0, sentido: 'MENOR_MELHOR', valorCentavos: null, percentualBp: null, metaBp: null, semContar: [], nota: null, oculta: false, ...extra,
  });
  const foto = (versaoDaConta: number, versao: number, substituida: boolean): FotografiaLida => ({
    id: `f${versao}`, periodoId: 'p', versao, inicio: '2026-09-01', fim: '2026-09-30', nomeDoPeriodo: 'Setembro de 2026', criadoEm: new Date('2026-10-02T12:00:00Z'), fechadoPorNome: 'Ana Dona',
    taxa: null, versaoDaConta, ressalvas: [], totalDeRessalvas: 0, justificativa: null, substituidaEm: substituida ? new Date('2026-10-05T12:00:00Z') : null, reabertaPorNome: substituida ? 'Rodolfo' : null, motivoReabertura: substituida ? 'corrigir' : null,
    linhas: [
      linha({ ordem: 0, chave: 'grupo:RECEITA', nome: 'Receita bruta', tipo: 'subtotal', valorCentavos: 1_000_000, percentualBp: 10_000 }),
      linha({ ordem: 1, chave: 'cmv', nome: 'CMV', tipo: 'cmv', valorCentavos: null, nota: 'Em breve' }),
      linha({ ordem: 2, chave: 'resultado-do-periodo', nome: 'Resultado do período', tipo: 'resultado', sentido: 'MAIOR_MELHOR', valorCentavos: 400_000, percentualBp: 4_000, semContar: ['o CMV'] }),
    ],
  });
  const situacao = (versoes: FotografiaLida[], vigente: FotografiaLida): SituacaoDoFechamento => ({
    periodo: { inicio: '2026-09-01', fim: '2026-09-30', nome: 'Setembro de 2026' } as SituacaoDoFechamento['periodo'],
    hoje: '2026-10-17',
    registro: { id: 'p', status: 'FECHADO', fechadoEm: new Date('2026-10-02T12:00:00Z'), fechadoPorNome: 'Ana Dona' },
    condicoes: null,
    fotografia: vigente,
    versoes,
    podeReabrir: false,
  });
  const tela = (s: SituacaoDoFechamento) => html(createElement(TelaDoFechamento, { s, raiz: '/erp', contexto: 'Casa Alfa', feito: null, acoes: { fechar: async () => null }, bloqueio: null }));

  it('v1: o resumo diz "não apurado neste fechamento (fechado antes do CMV)" e não "sem contar o CMV"', () => {
    const v1 = foto(1, 1, false);
    const h = tela(situacao([v1], v1));
    expect(h).toContain('CMV: não apurado neste fechamento (fechado antes do CMV)');
    expect(h).not.toContain('sem contar o CMV');
  });
  it('v2 (com CMV): o resumo continua dizendo o que ficou de fora, sem a frase de antes do CMV', () => {
    const v2 = foto(2, 2, false);
    const h = tela(situacao([v2], v2));
    expect(h).toContain('sem contar o CMV');
    expect(h).not.toContain('fechado antes do CMV');
  });
  it('"Ver o DRE desta versão" da v1 substituída mostra a frase na linha do CMV, não um traço', () => {
    const v1 = foto(1, 1, true);
    const v2 = foto(2, 2, false);
    const h = tela(situacao([v2, v1], v2));
    const dentro = h.slice(h.indexOf('DRE da versão 1'));
    expect(dentro).toContain('não apurado neste fechamento (fechado antes do CMV)');
    // A versão 2 vigente não é listada com DRE; e a linha do CMV da v1 não é um traço mudo.
    expect(dentro).not.toMatch(/CMV<\/th><td[^>]*><span[^>]*>—<\/span>/);
  });
});
