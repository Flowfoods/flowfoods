/**
 * Pontos de ajuda (prioridade nº 1 de 23/10/2026) — regras puras:
 *
 * - abre sozinho na 1ª visita; volta a ficar elegível 7 dias depois da última
 *   abertura automática (semanal); "não mostrar novamente" corta; dicas
 *   desligadas ou nível 1 (sem preferência) nunca abrem sozinho;
 * - o dia vira à meia-noite de Brasília, não de Londres;
 * - a lista guardada é saneada (um item por ponto, formato fixo, teto 300);
 * - lista branca: só ponto que existe no registro; texto dos pontos passa no lint;
 * - todo <PontoDeAjuda ponto="..."> do código tem texto no registro (senão o
 *   botão some em silêncio e o campo fica sem explicação).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ajudaParaATela, ENTRADAS, pontoValido, problemasDoRegistro, type EntradaDeAjuda } from '@/lib/erp/ajuda';
import { DIAS_PARA_VOLTAR, diaDe, estadoDoPonto, itemDoPonto, normalizarPontos, type PreferenciaDeAjuda } from '@/lib/erp/ajuda-rota';
import { ALCANCE_FLOWFOODS, resolverAlcance } from '@/lib/erp/permissoes';

const PREF = (p: Partial<PreferenciaDeAjuda> = {}): PreferenciaDeAjuda => ({ dicasLigadas: true, escolhida: true, fechadas: [], pontos: [], ...p });
const ID = 'insumo-novo.marca';

describe('pontos · quando o card abre sozinho', () => {
  const hoje = 20_000;

  it('primeira visita: elegível', () => {
    expect(estadoDoPonto(ID, PREF(), hoje)).toBe('elegivel');
  });

  it('abriu sozinho hoje: não abre de novo até completar 7 dias; no 7º dia volta', () => {
    const p = PREF({ pontos: [itemDoPonto(ID, hoje)] });
    expect(estadoDoPonto(ID, p, hoje)).toBe('visto');
    expect(estadoDoPonto(ID, p, hoje + DIAS_PARA_VOLTAR - 1)).toBe('visto');
    expect(estadoDoPonto(ID, p, hoje + DIAS_PARA_VOLTAR)).toBe('elegivel');
    expect(estadoDoPonto(ID, p, hoje + 40)).toBe('elegivel');
    expect(DIAS_PARA_VOLTAR).toBe(7);
  });

  it('"Não mostrar novamente" corta para sempre; outro ponto segue elegível', () => {
    const p = PREF({ pontos: [itemDoPonto(ID, 'x')] });
    expect(estadoDoPonto(ID, p, hoje + 365)).toBe('nunca');
    expect(estadoDoPonto('insumo-novo.tipo', p, hoje)).toBe('elegivel');
  });

  it('dicas desligadas ou sem preferência (nível 1): nunca abre sozinho', () => {
    expect(estadoDoPonto(ID, PREF({ dicasLigadas: false }), hoje)).toBe('nunca');
    expect(estadoDoPonto(ID, null, hoje)).toBe('nunca');
  });

  it('item de outro ponto com prefixo parecido não conta', () => {
    expect(estadoDoPonto('insumo-novo.marca', PREF({ pontos: ['insumo-novo.marca-x=1', 'insumo-novo.marc=x'] }), hoje)).toBe('elegivel');
  });
});

describe('pontos · o dia é o de Brasília', () => {
  it('23h59 de Brasília ainda é o mesmo dia; meia-noite de Brasília vira', () => {
    // 24/10 02:59 UTC = 23/10 23:59 em Brasília (UTC-3)
    expect(diaDe(new Date('2026-10-24T02:59:00Z'))).toBe(diaDe(new Date('2026-10-23T12:00:00Z')));
    expect(diaDe(new Date('2026-10-24T03:00:00Z'))).toBe(diaDe(new Date('2026-10-23T12:00:00Z')) + 1);
  });

  it('é o número de dias corridos desde 1970', () => {
    expect(diaDe(new Date('1970-01-02T12:00:00Z'))).toBe(1);
  });
});

describe('pontos · a lista guardada é saneada', () => {
  it('um item por ponto (o último vence), formato fixo, lixo fora', () => {
    expect(
      normalizarPontos(['a.b=1', 'a.b=5', 'a.c=x', 'lixo', 'A.B=1', 'a.b=-1', 'a.b=1234567', 42, null, `${'a'.repeat(61)}.b=1`, 'a.d=x']),
    ).toEqual(['a.b=5', 'a.c=x', 'a.d=x']);
  });

  it('teto de 300: os mais novos ficam', () => {
    const muitos = Array.from({ length: 320 }, (_, i) => `p.n${i}=1`);
    const r = normalizarPontos(muitos);
    expect(r).toHaveLength(300);
    expect(r[0]).toBe('p.n20=1');
    expect(r.at(-1)).toBe('p.n319=1');
  });
});

describe('pontos · lista branca e registro', () => {
  it('só aceita ponto que existe agora', () => {
    expect(pontoValido('insumo-novo.marca')).toBe('insumo-novo.marca');
    expect(pontoValido('insumo-novo.inexistente')).toBeNull();
    expect(pontoValido('nada.marca')).toBeNull();
    expect(pontoValido('insumo-novo.marca=x')).toBeNull();
    expect(pontoValido("insumo-novo.marca'; DROP TABLE")).toBeNull();
    expect(pontoValido(`insumo-novo.${'a'.repeat(200)}`)).toBeNull();
    expect(pontoValido(42)).toBeNull();
  });

  it('o registro de verdade passa no lint (pontos inclusos)', () => {
    expect(problemasDoRegistro()).toEqual([]);
  });

  it('o lint reprova ponto mal feito', () => {
    const base = ENTRADAS.find((e) => e.chave === 'insumo-novo')!;
    const ruim: EntradaDeAjuda = {
      ...base,
      chave: 'teste-ruim',
      rotas: ['teste-ruim'],
      pontos: [
        { id: 'Maiusculo', titulo: 'Ok', blocos: [{ texto: 'Uma frase.' }] },
        { id: 'dup', titulo: 'Ok', blocos: [{ texto: 'Uma frase.' }] },
        { id: 'dup', titulo: 'Ok', blocos: [{ texto: 'Uma frase.' }] },
        { id: 'muitos', titulo: 'Ok', blocos: [{ texto: 'A.' }, { texto: 'B.' }, { texto: 'C.' }, { texto: 'D.' }] },
        { id: 'secao', titulo: 'Ok', blocos: [{ texto: 'Uma frase.' }], secao: 'nao-existe' },
        { id: 'jargao', titulo: 'Ok', blocos: [{ texto: 'O servidor calcula!' }] },
        { id: 'longo', titulo: 'Ok', blocos: [{ texto: 'Uma. Duas. Três. Quatro.' }] },
      ],
    };
    const erros = problemasDoRegistro([ruim]).join('\n');
    expect(erros).toContain('ponto "Maiusculo" com id inválido');
    expect(erros).toContain('ponto "dup" com id inválido ou repetido');
    expect(erros).toContain('ponto "muitos" precisa de 1 a 3 blocos');
    expect(erros).toContain('seção "nao-existe", que não existe');
    expect(erros).toContain('ponto "jargao"');
    expect(erros).toContain('ponto "longo" tem 4 frases (de 1 a 3)');
  });

  it('ponto só de quem vê preços: o operador nem recebe (o botão some); quem vê, recebe', () => {
    const op = resolverAlcance({ perfilBase: 'OPERADOR', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
    const fichasOp = ajudaParaATela(op).find((e) => e.chave === 'fichas')!;
    const fichasN1 = ajudaParaATela(ALCANCE_FLOWFOODS).find((e) => e.chave === 'fichas')!;
    expect(fichasOp.pontos.map((p) => p.id)).not.toContain('fichas.conta');
    expect(fichasN1.pontos.map((p) => p.id)).toContain('fichas.conta');
  });

  it('a tela recebe o id completo "chave.ponto" e a seção do passo a passo', () => {
    const insumo = ajudaParaATela(ALCANCE_FLOWFOODS).find((e) => e.chave === 'insumo-novo')!;
    expect(insumo.pontos.map((p) => p.id)).toContain('insumo-novo.marca');
    expect(insumo.pontos.find((p) => p.id === 'insumo-novo.tipo')!.secao).toBe('campos');
    expect(insumo.pontos.find((p) => p.id === 'insumo-novo.marca')!.secao).toBeNull();
  });
});

describe('pontos · todo botão do código tem texto no registro', () => {
  function arquivos(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const c = join(dir, n);
      return statSync(c).isDirectory() ? arquivos(c) : c.endsWith('.tsx') ? [c] : [];
    });
  }
  const usados = arquivos(join(process.cwd(), 'src')).flatMap((f) =>
    Array.from(readFileSync(f, 'utf8').matchAll(/<(?:PontoDeAjuda|ExplicacaoNoPonto)\s+ponto="([a-z0-9-]+)"/g)).map((m) => ({ f, id: m[1] })),
  );
  const ids = new Set(ENTRADAS.flatMap((e) => (e.pontos ?? []).map((p) => p.id)));

  it('há pontos em uso', () => {
    expect(usados.length).toBeGreaterThanOrEqual(10);
  });

  it.each(usados.map((u) => [u.id, u.f.replace(process.cwd() + '/', '')]))('"%s" (%s) existe no registro', (id) => {
    expect(ids.has(id)).toBe(true);
  });
});
