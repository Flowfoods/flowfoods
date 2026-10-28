/**
 * Decisão 479 — ajuda em sequência guiada (decisão vigente de Rodolfo em 25/10/2026), as regras puras:
 *  - a sequência são os pontos visíveis na ordem da página, sem os de "Não mostrar novamente" (fora o que a pessoa abriu);
 *  - fechar a etapa abre a seguinte; no último passo, conclui (não recomeça); se o alvo da etapa sumiu, vale a ordem de antes;
 *  - o progresso ("2 de 5") conta só a sequência de agora e não aparece com um ponto só;
 *  - ao começar sozinha, a sequência marca como vistos o primeiro passo e os que vêm depois.
 * O comportamento na tela (foco, rolagem, Escape, tocar fora) é conferido no navegador.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { marcadosAoComecarSozinha, passosDaSequencia, pontosComOQueAAbaGravou, progressoDoPasso, proximoPasso } from '@/lib/erp/ajuda-sequencia';
import { estadoDoPonto, itemDoPonto } from '@/lib/erp/ajuda-rota';

const p = (id: string, optouFora = false) => ({ id, optouFora });

describe('decisão 479 · a sequência', () => {
  it('pontos visíveis na ordem da página; "não mostrar novamente" fica de fora, a menos que seja o aberto; repetido conta uma vez', () => {
    const visiveis = [p('t.tela'), p('t.tipo'), p('t.marca', true), p('t.unidade'), p('t.tipo')];
    expect(passosDaSequencia(visiveis, null)).toEqual(['t.tela', 't.tipo', 't.unidade']);
    expect(passosDaSequencia(visiveis, 't.marca')).toEqual(['t.tela', 't.tipo', 't.marca', 't.unidade']);
    expect(passosDaSequencia([], null)).toEqual([]);
  });

  it('ao avançar, quem já estava na sequência continua nela: o progresso não muda de conta no meio (card da tela aberto à mão)', () => {
    // No nível 1 (sem preferência), o card da tela não entra sozinho; aberto à mão, entra e fica até o fim.
    const visiveis = [p('t.tela', true), p('t.tipo'), p('t.marca')];
    const inicio = passosDaSequencia(visiveis, 't.tela');
    expect(inicio).toEqual(['t.tela', 't.tipo', 't.marca']);
    const depois = passosDaSequencia(visiveis, inicio);
    expect(proximoPasso(depois, inicio, 't.tela')).toBe('t.tipo');
    expect(progressoDoPasso(depois, 't.tipo')).toEqual({ n: 2, de: 3 });
  });

  it('fechar a etapa abre a seguinte; no último, conclui', () => {
    const passos = ['a', 'b', 'c'];
    expect(proximoPasso(passos, passos, 'a')).toBe('b');
    expect(proximoPasso(passos, passos, 'b')).toBe('c');
    expect(proximoPasso(passos, passos, 'c')).toBeNull();
  });

  it('o alvo da etapa sumiu (campo condicional escondido): segue a ordem de quando ela abriu, pulando o que também sumiu', () => {
    expect(proximoPasso(['a', 'd'], ['a', 'b', 'c', 'd'], 'b')).toBe('d');
    expect(proximoPasso(['a'], ['a', 'b', 'c'], 'b')).toBeNull();
    expect(proximoPasso(['a', 'b'], ['x'], 'z')).toBeNull();
  });

  it('um ponto que aparece depois (seção aberta) entra no lugar dele na ordem', () => {
    expect(proximoPasso(['a', 'b', 'novo', 'c'], ['a', 'b', 'c'], 'b')).toBe('novo');
  });

  it('progresso só da sequência de agora, e nada com um ponto só', () => {
    expect(progressoDoPasso(['a', 'b', 'c'], 'b')).toEqual({ n: 2, de: 3 });
    expect(progressoDoPasso(['a'], 'a')).toBeNull();
    expect(progressoDoPasso(['a', 'b'], 'z')).toBeNull();
  });

  it('ao começar sozinha: o primeiro passo e os seguintes contam como vistos (encerrar cedo não faz recomeçar na próxima visita)', () => {
    expect(marcadosAoComecarSozinha(['a', 'b', 'c', 'd'], 'b')).toEqual(['b', 'c', 'd']);
    expect(marcadosAoComecarSozinha(['a', 'b'], 'a')).toEqual(['a', 'b']);
    expect(marcadosAoComecarSozinha([], 'a')).toEqual(['a']);
  });
});

describe('decisão 479 · o que a aba gravou vale mais que o servidor', () => {
  const PREF = { dicasLigadas: true, escolhida: true, fechadas: [] as string[] };
  it('"visto" de 10 dias atrás no servidor + "visto" de hoje nesta aba: visto (não recomeça ao voltar pela navegação do app)', () => {
    const hoje = 20_000;
    const servidor = [itemDoPonto('t.tipo', hoje - 10)];
    expect(estadoDoPonto('t.tipo', { ...PREF, pontos: servidor }, hoje)).toBe('elegivel');
    expect(estadoDoPonto('t.tipo', { ...PREF, pontos: pontosComOQueAAbaGravou(servidor, [itemDoPonto('t.tipo', hoje)]) }, hoje)).toBe('visto');
    // O mais novo da aba vence ("visto" e depois "não mostrar").
    expect(estadoDoPonto('t.tipo', { ...PREF, pontos: pontosComOQueAAbaGravou(servidor, [itemDoPonto('t.tipo', hoje), itemDoPonto('t.tipo', 'x')]) }, hoje)).toBe('nunca');
    expect(pontosComOQueAAbaGravou(['a=1'], [])).toEqual(['a=1']);
  });
});

describe('decisão 479 · o card', () => {
  const pontos = readFileSync('src/components/erp/shell/pontos.tsx', 'utf8');

  it('separa fechar a etapa (avança) de encerrar (sai), sem tempo mínimo e sem gravar nada ao avançar', () => {
    expect(pontos).toContain("aria-label={temProximo ? 'Fechar etapa e continuar' : 'Fechar ajuda'}");
    expect(pontos).toContain('Encerrar ajuda');
    expect(pontos).toContain("{temProximo ? 'Continuar' : 'Concluir'}");
    // Tocar fora e Escape saem da sequência (nunca avançam).
    expect(pontos).toMatch(/const fora = \(e: MouseEvent\) => \{[\s\S]{0,400}?encerrar\(false\);/);
    expect(pontos).toMatch(/e\.key !== 'Escape'[\s\S]{0,500}?aoEncerrar\(/);
    // Nenhum temporizador avança etapa (os que há: a abertura automática, a espera da rolagem e o foco depois de "Manter as dicas").
    const temporizadores = pontos.split('setTimeout(').slice(1);
    expect(temporizadores.length).toBeGreaterThan(0);
    for (const t of temporizadores) expect(t.slice(0, 500)).not.toMatch(/avancar\(|aoContinuar\(/);
  });

  it('as correções da revisão continuam ligadas (guardas)', () => {
    // O que a aba gravou vem antes do servidor.
    expect(pontos).toContain('pontos: pontosComOQueAAbaGravou(preferencia.pontos, gravados)');
    // Os passos vão numa ida ao servidor só; nada de um pedido por passo.
    expect(pontos).toContain('void acoes.pontosVistos(marcados)');
    expect(pontos).not.toMatch(/pontoVisto\(/);
    // O progresso é a descrição do card.
    expect(pontos).toContain('aria-describedby={progresso ? `${id}-p` : undefined}');
    // Escape só devolve o foco se ele estava no card (ou em lugar nenhum).
    expect(pontos).toContain('aoEncerrar(dentro || semFoco)');
    expect(pontos).not.toMatch(/dentro \|\| !automatico/);
    // "Desligar" encerra a sequência.
    expect(pontos).toMatch(/dicasAntes\.current === true && dicasLigadas === false && ativo\) encerrar\(true\)/);
    // Início automático: uma tentativa; com alguém digitando, só com o botão livre e sem rolar; sem escutar a rolagem.
    expect(pontos).toContain('if (digitando && !livreDoCard(escolhido.el)) return;');
    expect(pontos).toContain('rolar: !digitando');
    expect(pontos).not.toMatch(/addEventListener\('scroll'/);
    // A folga mora no fim do conteúdo (não depois da grade) e soma à que já existe.
    expect(readFileSync('src/components/erp/tokens.css', 'utf8')).toMatch(/#conteudo::after \{[^}]*var\(--ff-folga-da-ajuda, 0px\)/);
    expect(pontos).toContain('parseFloat(raiz.style.getPropertyValue(VARIAVEL_DA_FOLGA))');
    // A lista de lojas abre em posição fixa (dentro da tela no celular).
    expect(readFileSync('src/components/erp/shell/SeletorVisao.tsx', 'utf8')).toMatch(/classeDoWrapper="min-w-0 max-w-\[11rem\] sm:max-w-\[16rem\] sm:shrink-0"[\s\S]{0,200}fixo/);
    // O lote no servidor é tudo ou nada.
    const cred = readFileSync('src/lib/erp/credenciais.ts', 'utf8');
    expect(cred.slice(cred.indexOf("mudanca.tipo === 'pontos-vistos'"), cred.indexOf("mudanca.tipo === 'ponto-visto' ||"))).toContain('db.$transaction(');
  });
});
