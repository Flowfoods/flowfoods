/**
 * Decisão 521 — o card de ajuda não cobre o que explica (celular, tablet e computador) e o Tab não salta para o topo da
 * página. Regras puras de `ajuda-posicao.ts`, com as medidas que o navegador daria (px na janela). O navegador de verdade
 * (Chromium em 390, 820 e 1440) é conferido no QA; teclado virtual de verdade, aparelho real e leitor de tela real não.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  antesEDepois,
  ehCampo,
  folgaQueFica,
  posicaoDoCard,
  proximoFocoNoCard,
  regiaoPelaPosicao,
  uniao,
  vemAntes,
  type Descendente,
  type Faixa,
  type MedidasDoCard,
  type NivelAcima,
} from '@/lib/erp/ajuda-posicao';

/** Celular em pé (390 × 844): barra do topo de 72 px, respiro de 12, card de 351 px na largura toda. */
const celular = (alvo: Faixa, extra: Partial<MedidasDoCard> = {}): MedidasDoCard => ({
  janela: 844,
  topoLivre: 72,
  margem: 12,
  card: 351,
  cardMinimo: 210,
  alvo,
  botao: { top: alvo.top, bottom: Math.min(alvo.bottom, alvo.top + 44) },
  naColuna: alvo,
  comeco: alvo.top + 65,
  ...extra,
});

/** Onde o botão fica depois de rolar, e se está entre a barra do topo e o card (com o respiro dos dois lados). */
function botaoAVista(m: MedidasDoCard) {
  const p = posicaoDoCard(m);
  const cardTopo = m.janela - m.margem - (p.teto ?? m.card);
  const limite = m.naColuna ? cardTopo - m.margem : m.janela - m.margem;
  const top = m.botao.top - p.rolar;
  const bottom = m.botao.bottom - p.rolar;
  return { p, top, bottom, limite, ok: top >= m.topoLivre + m.margem - 0.5 && bottom <= limite + 0.5 };
}

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
  const longo = (top: number) => celular({ top, bottom: top + 1200 }, { comeco: top + 65, botao: { top: top + 10, bottom: top + 54 } });

  it('o começo (cabeçalho) já à vista acima do card: a página não se mexe e o card fica com a altura de sempre', () => {
    expect(posicaoDoCard(longo(300))).toEqual({ teto: null, rolar: 0, mostra: 'comeco' });
  });

  it('cabeçalho sob o card ou acima da tela: o topo do alvo vai para logo abaixo da barra do topo', () => {
    expect(posicaoDoCard(longo(600))).toEqual({ teto: null, rolar: 516, mostra: 'comeco' });
    expect(posicaoDoCard(longo(-200))).toEqual({ teto: null, rolar: -284, mostra: 'comeco' });
  });

  it('tela baixa (celular deitado) com cabeçalho alto que não cabe: card no mínimo e o botão logo acima do card', () => {
    // Janela de 500: espaço de 404 px; cabeçalho de 200 px com o botão no fim (256–300); card no mínimo (210, em 278–488).
    const m: MedidasDoCard = { janela: 500, topoLivre: 72, margem: 12, card: 250, cardMinimo: 210, alvo: { top: 100, bottom: 700 }, botao: { top: 256, bottom: 300 }, naColuna: { top: 100, bottom: 700 }, comeco: 300 };
    const v = botaoAVista(m);
    expect(v.p).toEqual({ teto: 210, rolar: 34, mostra: 'comeco' });
    // O botão termina exatamente 12 px acima do card (antes, a regra aceitava o começo 18 px sob o card).
    expect(v.bottom).toBe(500 - 12 - 210 - 12);
    expect(v.ok).toBe(true);
  });

  it('começo longe do topo do alvo (o botão no fim de uma região alta): o botão fica acima do card, nunca fora da tela', () => {
    // Revisão da 521: região de −600 a 800, botão terminando em 330. Antes: rolar −684, botão em 970–1014, fora da tela.
    const m = celular({ top: -600, bottom: 800 }, { botao: { top: 286, bottom: 330 }, comeco: 330 });
    const v = botaoAVista(m);
    expect(v.p).toEqual({ teto: 210, rolar: -280, mostra: 'comeco' });
    expect(v.bottom).toBe(844 - 12 - 210 - 12);
    expect(v.ok).toBe(true);
  });

  it('começo longe do topo do alvo, mas que cabe: o topo do alvo vai ao topo livre e o botão fica acima do card', () => {
    // Região de 1200 px com o botão 300 px abaixo do topo dela (o começo tem 344 px; cabe com o card de 351).
    const aVista = celular({ top: 100, bottom: 1300 }, { botao: { top: 400, bottom: 444 }, comeco: 444 });
    expect(posicaoDoCard(aVista)).toEqual({ teto: null, rolar: 0, mostra: 'comeco' });
    const abaixo = celular({ top: 500, bottom: 1700 }, { botao: { top: 800, bottom: 844 }, comeco: 844 });
    const v = botaoAVista(abaixo);
    expect(v.p).toEqual({ teto: null, rolar: 416, mostra: 'comeco' });
    expect(v.ok).toBe(true);
  });

  it('cabeçalho curto e botão mais abaixo: o começo vai até o botão (ele não fica sob o card)', () => {
    // Região com data-alvo: cabeçalho até 165, botão em 600–644. Só o cabeçalho à vista deixaria o botão sob o card (481).
    const v = botaoAVista(celular({ top: 100, bottom: 1300 }, { comeco: 165, botao: { top: 600, bottom: 644 } }));
    expect(v.p).toEqual({ teto: 210, rolar: 34, mostra: 'comeco' });
    expect(v.ok).toBe(true);
  });

  it('nada do alvo na coluna do card: o começo só precisa estar na tela', () => {
    expect(posicaoDoCard({ ...longo(300), naColuna: null })).toEqual({ teto: null, rolar: 0, mostra: 'comeco' });
    expect(posicaoDoCard({ ...longo(900), naColuna: null })).toEqual({ teto: null, rolar: 816, mostra: 'comeco' });
  });

  it('em qualquer posição e tamanho, o botão termina entre a barra do topo e o card', () => {
    let casos = 0;
    for (const janela of [390, 500, 844]) {
      for (const altura of [44, 200, 500, 900, 1400, 2400]) {
        for (const top of [-1500, -600, -100, 0, 90, 300, 700, 1200]) {
          for (const desvio of [0, 0.25, 0.5, 0.9]) {
            for (const card of [195, 351, 448]) {
              const b = top + Math.round((altura - 44) * desvio);
              const m: MedidasDoCard = { janela, topoLivre: 72, margem: 12, card, cardMinimo: 210, alvo: { top, bottom: top + altura }, botao: { top: b, bottom: b + 44 }, naColuna: { top, bottom: top + altura }, comeco: b + 44 };
              const v = botaoAVista(m);
              // Só não dá quando nem o botão cabe entre a barra e o card no mínimo (janela de 390 com card de 210).
              if (v.limite - (m.topoLivre + m.margem) >= 44) expect(v.ok, JSON.stringify({ m, v })).toBe(true);
              casos++;
            }
          }
        }
      }
    }
    expect(casos).toBeGreaterThan(1000);
  });
});

describe('decisão 521 · computador e tablet (card à direita, 380 px)', () => {
  const computador = (alvo: Faixa, naColuna: Faixa | null, card = 297): MedidasDoCard => ({
    janela: 900,
    topoLivre: 72,
    margem: 12,
    card,
    cardMinimo: 210,
    alvo,
    botao: { top: alvo.top + 14, bottom: alvo.top + 42 },
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
  const nivel = (tag: string, dentro: Descendente[] = []): NivelAcima => ({ tag, dentro: () => dentro });
  const el = (tag: string, antesDoBotao = false): Descendente => ({ tag, tipo: null, antesDoBotao, outroPonto: false });
  const campo = (tag: 'INPUT' | 'SELECT' | 'TEXTAREA', antesDoBotao = false, tipo: string | null = null): Descendente => ({ tag, tipo, antesDoBotao, outroPonto: false });
  const outroPonto: Descendente = { tag: 'BUTTON', tipo: 'button', antesDoBotao: false, outroPonto: true };

  it('no cabeçalho de um painel: o painel', () => {
    expect(regiaoPelaPosicao([nivel('SPAN'), nivel('HEADER'), nivel('SECTION', [campo('INPUT')]), nivel('FIELDSET')])).toBe(2);
    expect(regiaoPelaPosicao([nivel('HEADER'), nivel('SECTION'), nivel('DIV')])).toBe(1);
    // Um header que não é de painel (o topo da página): nenhuma.
    expect(regiaoPelaPosicao([nivel('HEADER'), nivel('DIV', [campo('INPUT')])])).toBeNull();
  });

  it('na legenda de um grupo: o grupo', () => {
    expect(regiaoPelaPosicao([nivel('SPAN'), nivel('LEGEND'), nivel('FIELDSET', [campo('INPUT', false, 'radio')]), nivel('DIV')])).toBe(2);
  });

  it('junto do rótulo, com o campo embaixo do botão: o campo com o rótulo', () => {
    // "Data" em Lançar o dia: a linha do rótulo (sem campo) e, acima, o rótulo com o campo depois do botão.
    expect(regiaoPelaPosicao([nivel('DIV', [el('LABEL', true)]), nivel('DIV', [el('DIV', true), el('LABEL', true), campo('INPUT', false, 'text')]), nivel('FORM')])).toBe(1);
    expect(regiaoPelaPosicao([nivel('DIV'), nivel('DIV', [campo('SELECT')])])).toBe(1);
  });

  it('botão depois do campo (a frase embaixo das etapas, a caixa de marcar): só o botão, como antes', () => {
    // Ficha › Modo de preparo: "Etapa em branco não é gravada." mora embaixo da lista de etapas (revisão da 521).
    const etapas = [el('OL', true), el('LI', true), campo('TEXTAREA', true), el('LI', true), campo('TEXTAREA', true), el('BUTTON', true), el('P', true)];
    expect(regiaoPelaPosicao([nivel('DIV', [el('P', true)]), nivel('DIV', etapas), nivel('SECTION')])).toBeNull();
    // Mesmo sem a lista: campo antes do botão não vira região.
    expect(regiaoPelaPosicao([nivel('DIV', [el('P', true)]), nivel('DIV', [campo('TEXTAREA', true)])])).toBeNull();
    // "Repete todo mês": a caixa vem antes do botão.
    expect(regiaoPelaPosicao([nivel('SPAN', [campo('INPUT', true, 'checkbox'), el('LABEL', true)]), nivel('DIV', [campo('INPUT', true, 'checkbox')])])).toBeNull();
    // Campo dos dois lados do botão: nenhuma.
    expect(regiaoPelaPosicao([nivel('DIV', [campo('INPUT', true), campo('INPUT', false)])])).toBeNull();
  });

  it('nível que junta vários (lista, tabela, painel, formulário, outro ponto) ou longe demais: nenhuma', () => {
    for (const bloco of ['OL', 'UL', 'TABLE', 'SECTION', 'FORM']) expect(regiaoPelaPosicao([nivel('DIV'), nivel('DIV', [el(bloco), campo('INPUT')])]), bloco).toBeNull();
    expect(regiaoPelaPosicao([nivel('DIV'), nivel('DIV', [campo('INPUT'), outroPonto])])).toBeNull();
    expect(regiaoPelaPosicao([nivel('DIV'), nivel('SECTION', [campo('INPUT')])])).toBeNull();
    expect(regiaoPelaPosicao([nivel('DIV'), nivel('DIV'), nivel('DIV'), nivel('DIV', [campo('INPUT')])])).toBeNull();
    expect(regiaoPelaPosicao([nivel('DETAILS'), nivel('SECTION')])).toBeNull();
    expect(regiaoPelaPosicao([])).toBeNull();
  });

  it('o campo escondido não conta; a busca para no bloco sem ler o que há dentro dos níveis de cima', () => {
    expect(regiaoPelaPosicao([nivel('DIV', [campo('INPUT', false, 'hidden')]), nivel('SECTION', [campo('INPUT')])])).toBeNull();
    const naoLer: NivelAcima = {
      tag: 'MAIN',
      dentro: () => {
        throw new Error('não precisava ler');
      },
    };
    expect(regiaoPelaPosicao([nivel('DIV', [campo('SELECT')]), naoLer])).toBe(0);
    expect(regiaoPelaPosicao([nivel('HEADER'), nivel('SECTION'), naoLer])).toBe(1);
  });

  it('o que é campo', () => {
    expect(ehCampo({ tag: 'INPUT', tipo: null })).toBe(true);
    expect(ehCampo({ tag: 'INPUT', tipo: 'checkbox' })).toBe(true);
    expect(ehCampo({ tag: 'INPUT', tipo: 'hidden' })).toBe(false);
    expect(ehCampo({ tag: 'INPUT', tipo: 'HIDDEN' })).toBe(false);
    expect(ehCampo({ tag: 'SELECT', tipo: null })).toBe(true);
    expect(ehCampo({ tag: 'TEXTAREA', tipo: null })).toBe(true);
    expect(ehCampo({ tag: 'BUTTON', tipo: 'button' })).toBe(false);
    expect(ehCampo({ tag: 'LABEL', tipo: null })).toBe(false);
  });

  it('união de faixas', () => {
    expect(uniao([])).toBeNull();
    expect(uniao([{ top: 10, bottom: 20 }, { top: 5, bottom: 15 }])).toEqual({ top: 5, bottom: 20 });
  });
});

/** Nós de mentira com a mesma resposta do `compareDocumentPosition` do navegador (2 antes, 4 depois, 8 contém, 16 contido). */
class No {
  filhos: No[] = [];
  constructor(
    readonly nome: string,
    readonly pai: No | null = null,
  ) {
    pai?.filhos.push(this);
  }
  private ordem(): No[] {
    let raiz: No = this;
    while (raiz.pai) raiz = raiz.pai;
    const lista: No[] = [];
    const andar = (n: No) => {
      lista.push(n);
      n.filhos.forEach(andar);
    };
    andar(raiz);
    return lista;
  }
  private contem(o: No): boolean {
    for (let p = o.pai; p; p = p.pai) if (p === this) return true;
    return false;
  }
  compareDocumentPosition(o: No): number {
    if (o === this) return 0;
    if (this.contem(o)) return 16 | 4;
    if (o.contem(this)) return 8 | 2;
    const lista = this.ordem();
    return lista.indexOf(o) > lista.indexOf(this) ? 4 : 2;
  }
}

describe('decisão 521 · a ordem da página (Tab e região)', () => {
  // O card: topo (título, X), texto que rola (com "Ver passo a passo" e "Não mostrar novamente") e rodapé (Encerrar, Continuar).
  const card = new No('card');
  const topo = new No('topo', card);
  const titulo = new No('título', topo);
  const x = new No('X', topo);
  const texto = new No('texto', card);
  const passo = new No('Ver passo a passo', texto);
  const nunca = new No('Não mostrar novamente', texto);
  const rodape = new No('rodapé', card);
  const encerrar = new No('Encerrar ajuda', rodape);
  const continuar = new No('Continuar', rodape);
  const botoes = [x, passo, nunca, encerrar, continuar];

  it('vem antes: pela ordem da página; quem contém vem antes; o próprio nó não', () => {
    expect(vemAntes(x, passo)).toBe(true);
    expect(vemAntes(passo, x)).toBe(false);
    expect(vemAntes(texto, nunca)).toBe(true);
    expect(vemAntes(nunca, texto)).toBe(false);
    expect(vemAntes(x, x)).toBe(false);
  });

  it('antes e depois do foco, contando só os botões do card', () => {
    expect(antesEDepois(botoes, titulo)).toEqual({ antes: 0, depois: 5 });
    expect(antesEDepois(botoes, x)).toEqual({ antes: 0, depois: 4 });
    expect(antesEDepois(botoes, nunca)).toEqual({ antes: 2, depois: 2 });
    expect(antesEDepois(botoes, continuar)).toEqual({ antes: 4, depois: 0 });
    // O texto que rola, com foco: os botões de dentro dele vêm depois.
    expect(antesEDepois(botoes, texto)).toEqual({ antes: 1, depois: 4 });
  });
});

describe('decisão 521 · o Tab no card (não modal)', () => {
  it('depois do último botão e antes do primeiro, o foco vai ao botão do ponto (junto do campo)', () => {
    expect(proximoFocoNoCard(5, 4, 0, false, true)).toBe('origem');
    expect(proximoFocoNoCard(5, 0, 4, true, true)).toBe('origem');
    // Do título (foco ao abrir): Shift+Tab sai para o botão do ponto; Tab segue para o X sozinho.
    expect(proximoFocoNoCard(5, 0, 5, true, true)).toBe('origem');
    expect(proximoFocoNoCard(5, 0, 5, false, true)).toBeNull();
  });

  it('no meio, o navegador segue sozinho (o próximo ainda é do card)', () => {
    expect(proximoFocoNoCard(5, 2, 2, false, true)).toBeNull();
    expect(proximoFocoNoCard(5, 2, 2, true, true)).toBeNull();
    expect(proximoFocoNoCard(5, 1, 4, false, false)).toBeNull();
  });

  it('sem o botão do ponto (desligado ou fora da página): circula no card', () => {
    expect(proximoFocoNoCard(5, 4, 0, false, false)).toBe(0);
    expect(proximoFocoNoCard(5, 0, 4, true, false)).toBe(4);
    expect(proximoFocoNoCard(0, 0, 0, false, false)).toBeNull();
    expect(proximoFocoNoCard(0, 0, 0, false, true)).toBe('origem');
  });
});

describe('decisão 521 · a folga do fim depois de fechar', () => {
  it('sai a parte abaixo da tela; a que está à vista fica; página que não rola fica sem folga', () => {
    expect(folgaQueFica(0, 3000, 0, 844)).toBe(0);
    expect(folgaQueFica(400, 800, 0, 844)).toBe(0);
    expect(folgaQueFica(400, 844, 0, 844)).toBe(0);
    // No alto de uma página longa: a folga está toda abaixo da tela.
    expect(folgaQueFica(400, 3000, 0, 844)).toBe(0);
    // No fim: a folga está toda à vista.
    expect(folgaQueFica(400, 3000, 2156, 844)).toBe(400);
    // Subindo 156 px: sai o que desceu para baixo da tela, sem mexer na rolagem.
    expect(folgaQueFica(400, 3000, 2000, 844)).toBe(244);
    expect(folgaQueFica(400, 3000, 1999.6, 844)).toBe(244);
  });

  it('aparar nunca encurta a página abaixo do que está à vista (sem salto)', () => {
    for (const rolagem of [0, 500, 1800, 2000, 2100, 2156]) {
      const fica = folgaQueFica(400, 3000, rolagem, 844);
      expect(3000 - (400 - fica)).toBeGreaterThanOrEqual(rolagem + 844);
    }
  });
});

describe('decisão 521 · o componente usa as regras (guardas)', () => {
  const pontos = readFileSync('src/components/erp/shell/pontos.tsx', 'utf8');

  it('o alvo é a região do data-alvo ou, sem ela, a da posição do botão; tocar nela não encerra', () => {
    expect(pontos).toContain('const regiao = regiaoDoPonto(botao) ?? regiaoImplicita(botao);');
    expect(pontos).toContain('const i = regiaoPelaPosicao(');
    expect(pontos).toContain('antesDoBotao: vemAntes<Node>(d, botao),');
    expect(pontos).toMatch(/const fora = \(e: MouseEvent\) => \{[\s\S]{0,700}?const regiao = origem\.current\?\.isConnected \? regiaoParaVer\(origem\.current\) : null;/);
  });

  it('rolagem sem animação para quem pediu menos movimento; folga para rolar com o card aberto, aparada ao fechar e ao rolar', () => {
    const posicionar = pontos.slice(pontos.indexOf('const posicionar = useCallback('), pontos.indexOf('const manterCampoAVista'));
    expect(posicionar).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'");
    expect(posicionar).toContain('garantirFolga(c.getBoundingClientRect().height + 2 * MARGEM_DO_CARD);');
    expect(posicionar).toContain('...medirAlvo(botao, rc),');
    expect(posicionar).not.toMatch(/behavior: 'smooth'/);
    expect(pontos).toContain('const fica = folgaQueFica(atual, raiz.scrollHeight, window.scrollY, window.innerHeight);');
    expect(pontos).toMatch(/if \(comCardAberto\) return;\s*if \(!apararFolga\(\)\) return;/);
  });

  it('o card segue diálogo não modal; o Tab nas bordas vai ao botão do ponto; o texto que rola entra no Tab com nome', () => {
    expect(pontos).toContain('role="dialog"');
    expect(pontos).toContain('aria-modal="false"');
    expect(pontos).toContain('onKeyDown={aoTeclar}');
    expect(pontos).toContain('const { antes, depois } = antesEDepois<Node>(botoes, foco);');
    expect(pontos).toContain('const i = proximoFocoNoCard(botoes.length, antes, depois, e.shiftKey, temOrigem);');
    expect(pontos).toContain("if (i === 'origem') botaoDoPonto?.focus();");
    expect(pontos).toContain('tabIndex={rolavel ? 0 : undefined}');
    expect(pontos).toContain("role={rolavel ? 'region' : undefined}");
    expect(pontos).toContain('aria-label={rolavel ? `Texto da ajuda: ${ponto.titulo}` : undefined}');
    // Nada esconde a página do leitor de tela nem a desliga.
    expect(pontos).not.toMatch(/\binert\b|aria-hidden=\{?true|setAttribute\('aria-hidden'/);
  });
});
