/**
 * Decisão 521 — o card de ajuda não cobre o que explica (celular, tablet e computador) e o Tab circula nele. Regras puras de
 * `ajuda-posicao.ts`, com as medidas que o navegador daria (px na janela). O navegador de verdade (Chromium em 390, 820 e
 * 1440) é conferido no QA; teclado virtual de verdade, aparelho real e leitor de tela real não.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { posicaoDoCard, proximoFocoNoCard, regiaoPelaPosicao, uniao, type MedidasDoCard } from '@/lib/erp/ajuda-posicao';

/** Celular em pé (390 × 844): barra do topo de 72 px, respiro de 12, card de 351 px na largura toda. */
const celular = (alvo: { top: number; bottom: number }, extra: Partial<MedidasDoCard> = {}): MedidasDoCard => ({
  janela: 844,
  topoLivre: 72,
  margem: 12,
  card: 351,
  cardMinimo: 210,
  alvo,
  naColuna: alvo,
  comeco: alvo.top + 65,
  ...extra,
});

describe('decisão 521 · onde o card fica (alvo pequeno)', () => {
  it('alvo já acima do card: nada rola e o card fica como está', () => {
    expect(posicaoDoCard(celular({ top: 300, bottom: 344 }))).toEqual({ teto: null, rolar: 0, mostra: 'inteiro' });
  });

  it('alvo sob o card (o "Conta a pagar" de Lançar despesa no fim da página): rola só até ele ficar 12 px acima do card', () => {
    // Painel de 169 px em 403–572; o card ocupa 481–832. Rolar 103 põe o painel em 300–469, e o card começa em 481.
    const p = posicaoDoCard(celular({ top: 403, bottom: 572 }));
    expect(p).toEqual({ teto: null, rolar: 103, mostra: 'inteiro' });
    expect(572 - p.rolar).toBe(844 - 12 - 351 - 12);
  });

  it('pouco espaço acima (alvo atrás da barra do topo): a página desce até ele aparecer abaixo da barra', () => {
    expect(posicaoDoCard(celular({ top: 20, bottom: 64 }))).toEqual({ teto: null, rolar: -64, mostra: 'inteiro' });
  });

  it('pouco espaço abaixo, alvo que só cabe com o card menor: o card encolhe o necessário (nunca abaixo do mínimo)', () => {
    // Painel de 400 px; card de 448. Espaço útil 736 (84 até 820): sobram 336 para o card.
    const p = posicaoDoCard(celular({ top: 500, bottom: 900 }, { card: 448 }));
    expect(p).toEqual({ teto: 336, rolar: 416, mostra: 'inteiro' });
    // Depois de rolar: painel em 84–484, card de 336 em 496–832.
    expect(500 - p.rolar).toBe(84);
    expect(900 - p.rolar).toBe(844 - 12 - 336 - 12);
  });

  it('no limite: alvo + card cabem exatamente sem encolher; 1 px a mais encolhe 1 px', () => {
    expect(posicaoDoCard(celular({ top: 84, bottom: 84 + 385 })).teto).toBeNull();
    expect(posicaoDoCard(celular({ top: 84, bottom: 84 + 386 })).teto).toBe(350);
  });

  it('card mais curto que o mínimo: o mínimo não estica o card', () => {
    expect(posicaoDoCard(celular({ top: 300, bottom: 344 }, { card: 180 })).teto).toBeNull();
    expect(posicaoDoCard(celular({ top: 100, bottom: 700 }, { card: 180, comeco: 165 }))).toEqual({ teto: null, rolar: 0, mostra: 'comeco' });
  });
});

describe('decisão 521 · alvo maior que a tela', () => {
  const longo = (top: number) => celular({ top, bottom: top + 1200 }, { comeco: top + 65 });

  it('o começo (cabeçalho) já à vista acima do card: a página não se mexe e o card fica com a altura de sempre', () => {
    expect(posicaoDoCard(longo(300))).toEqual({ teto: null, rolar: 0, mostra: 'comeco' });
  });

  it('cabeçalho sob o card ou acima da tela: o topo do alvo vai para logo abaixo da barra do topo', () => {
    expect(posicaoDoCard(longo(600))).toEqual({ teto: null, rolar: 516, mostra: 'comeco' });
    expect(posicaoDoCard(longo(-200))).toEqual({ teto: null, rolar: -284, mostra: 'comeco' });
  });

  it('tela baixa (celular deitado) com cabeçalho alto: o card fica no mínimo e o cabeçalho sobe ao topo', () => {
    const p = posicaoDoCard({ janela: 500, topoLivre: 72, margem: 12, card: 250, cardMinimo: 210, alvo: { top: 100, bottom: 700 }, naColuna: { top: 100, bottom: 700 }, comeco: 300 });
    expect(p).toEqual({ teto: 210, rolar: 16, mostra: 'comeco' });
  });

  it('nada do alvo na coluna do card: o começo só precisa estar na tela', () => {
    expect(posicaoDoCard({ ...longo(300), naColuna: null })).toEqual({ teto: null, rolar: 0, mostra: 'comeco' });
    expect(posicaoDoCard({ ...longo(900), naColuna: null })).toEqual({ teto: null, rolar: 816, mostra: 'comeco' });
  });
});

describe('decisão 521 · computador e tablet (card à direita, 380 px)', () => {
  const computador = (alvo: { top: number; bottom: number }, naColuna: { top: number; bottom: number } | null, card = 297): MedidasDoCard => ({
    janela: 900,
    topoLivre: 72,
    margem: 12,
    card,
    cardMinimo: 210,
    alvo,
    naColuna,
    comeco: alvo.top + 50,
  });

  it('card ao lado do alvo: o card não muda; só rola se o alvo estiver fora da tela', () => {
    expect(posicaoDoCard(computador({ top: 200, bottom: 250 }, null))).toEqual({ teto: null, rolar: 0, mostra: 'inteiro' });
    expect(posicaoDoCard(computador({ top: 950, bottom: 1000 }, null))).toEqual({ teto: null, rolar: 112, mostra: 'inteiro' });
  });

  it('painel na largura toda com só o botão na coluna do card (o campo à esquerda): o botão acima do card basta', () => {
    // "Conta a pagar" no 1440: painel 525–694, botão 539–567, card 591–888.
    expect(posicaoDoCard(computador({ top: 525, bottom: 694 }, { top: 539, bottom: 567 }))).toEqual({ teto: null, rolar: 0, mostra: 'inteiro' });
    // O botão sob o card: rola o mínimo.
    expect(posicaoDoCard(computador({ top: 586, bottom: 755 }, { top: 600, bottom: 628 })).rolar).toBe(49);
  });

  it('campos sob o card (o 3º campo do canal no 1440): rola até eles ficarem acima do card, sem encolher o card', () => {
    // Canal em 372–642, campos da coluna do card até 524; card de 417 (471–888).
    const p = posicaoDoCard(computador({ top: 372, bottom: 642 }, { top: 383, bottom: 524 }, 417));
    expect(p).toEqual({ teto: null, rolar: 65, mostra: 'inteiro' });
  });
});

describe('decisão 521 · teclado virtual (só a conta; o teclado de verdade não é simulado)', () => {
  it('com o teclado aberto, a altura útil encolhe e o mesmo alvo pede rolagem', () => {
    // Sem teclado: nada rola (1º caso). Com 300 px de teclado, a janela útil é 544 e o card fica acima dele.
    const p = posicaoDoCard(celular({ top: 300, bottom: 344 }, { janela: 844 - 300 }));
    expect(p).toEqual({ teto: null, rolar: 175, mostra: 'inteiro' });
    expect(300 - p.rolar).toBeGreaterThanOrEqual(84);
  });
});

describe('decisão 521 · a região de um ponto sem data-alvo', () => {
  const n = (tag: string, temCampo = false, juntaVarios = false) => ({ tag, temCampo, juntaVarios });

  it('no cabeçalho de um painel: o painel', () => {
    expect(regiaoPelaPosicao([n('SPAN'), n('HEADER'), n('SECTION', true, true), n('FIELDSET', true, true)])).toBe(2);
    expect(regiaoPelaPosicao([n('HEADER'), n('SECTION'), n('DIV', true, true)])).toBe(1);
    // Um header que não é de painel (o topo da página): nenhuma.
    expect(regiaoPelaPosicao([n('HEADER'), n('DIV', true, true)])).toBeNull();
  });

  it('na legenda de um grupo: o grupo', () => {
    expect(regiaoPelaPosicao([n('SPAN'), n('LEGEND'), n('FIELDSET', true), n('DIV', true)])).toBe(2);
  });

  it('junto do rótulo ou da caixa de marcar: o campo com o rótulo', () => {
    // "Data" em Lançar o dia: a linha do rótulo (sem campo) e, acima, o rótulo com o campo.
    expect(regiaoPelaPosicao([n('DIV'), n('DIV', true), n('FORM', true, true)])).toBe(1);
    // "Repete todo mês": o botão mora junto da caixa.
    expect(regiaoPelaPosicao([n('SPAN', true), n('DIV', true, true)])).toBe(0);
  });

  it('bloco que junta vários campos, painel sem cabeçalho ou campo longe demais: nenhuma (vale só o botão, como antes)', () => {
    expect(regiaoPelaPosicao([n('DIV'), n('DIV', true, true)])).toBeNull();
    expect(regiaoPelaPosicao([n('DIV'), n('SECTION', true, true)])).toBeNull();
    expect(regiaoPelaPosicao([n('DIV'), n('DIV'), n('DIV'), n('DIV', true)])).toBeNull();
    expect(regiaoPelaPosicao([n('DETAILS'), n('SECTION')])).toBeNull();
    expect(regiaoPelaPosicao([])).toBeNull();
  });

  it('união de faixas', () => {
    expect(uniao([])).toBeNull();
    expect(uniao([{ top: 10, bottom: 20 }, { top: 5, bottom: 15 }])).toEqual({ top: 5, bottom: 20 });
  });
});

describe('decisão 521 · o Tab dentro do card', () => {
  it('depois do último botão vem o primeiro (o X); antes do primeiro, o último', () => {
    expect(proximoFocoNoCard(3, 2, 0, false)).toBe(0);
    expect(proximoFocoNoCard(3, 0, 2, true)).toBe(2);
  });

  it('do título (foco ao abrir, antes de todos os botões): Shift+Tab vai ao último; Tab segue para o X sozinho', () => {
    expect(proximoFocoNoCard(4, 0, 4, true)).toBe(3);
    expect(proximoFocoNoCard(4, 0, 4, false)).toBeNull();
  });

  it('no meio, o navegador segue sozinho (o próximo ainda é do card); do texto que rola, sem botão depois, volta ao X', () => {
    expect(proximoFocoNoCard(3, 1, 1, false)).toBeNull();
    expect(proximoFocoNoCard(3, 1, 1, true)).toBeNull();
    expect(proximoFocoNoCard(1, 1, 0, false)).toBe(0);
    expect(proximoFocoNoCard(0, 0, 0, false)).toBeNull();
  });
});

describe('decisão 521 · o componente usa as regras (guardas)', () => {
  const pontos = readFileSync('src/components/erp/shell/pontos.tsx', 'utf8');

  it('o alvo é a região do data-alvo ou, sem ela, a da posição do botão; tocar fora continua olhando só o data-alvo', () => {
    expect(pontos).toContain('const regiao = regiaoDoPonto(botao) ?? regiaoImplicita(botao);');
    expect(pontos).toContain('const i = regiaoPelaPosicao(');
    expect(pontos).toMatch(/const fora = \(e: MouseEvent\) => \{[\s\S]{0,700}?const regiao = regiaoDoPonto\(origem\.current\);/);
  });

  it('rolagem sem animação para quem pediu menos movimento; folga para rolar com o card aberto, aparada ao fechar', () => {
    const posicionar = pontos.slice(pontos.indexOf('const posicionar = useCallback('), pontos.indexOf('const manterCampoAVista'));
    expect(posicionar).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'");
    expect(posicionar).toContain('garantirFolga(c.getBoundingClientRect().height + 2 * MARGEM_DO_CARD);');
    expect(posicionar).not.toMatch(/behavior: 'smooth'/);
    expect(pontos).toMatch(/if \(!comCardAberto\) apararFolga\(\);/);
  });

  it('o card segue diálogo não modal e o Tab circula nele só com o foco dentro dele', () => {
    expect(pontos).toContain('role="dialog"');
    expect(pontos).toContain('aria-modal="false"');
    expect(pontos).toContain('onKeyDown={aoTeclar}');
    expect(pontos).toContain('const i = proximoFocoNoCard(botoes.length, antes, depois, e.shiftKey);');
    // Nada esconde a página do leitor de tela nem a desliga.
    expect(pontos).not.toMatch(/\binert\b|aria-hidden=\{?true|setAttribute\('aria-hidden'/);
  });
});
