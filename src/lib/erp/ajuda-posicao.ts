/**
 * Onde o card de ajuda fica em relação ao que ele explica (decisão 521; vale para todos os pontos, `shell/pontos.tsx`).
 *
 * O card mora embaixo da tela (na largura toda no celular em pé; à direita, 380 px, no resto). O que precisa ficar à vista
 * junto dele é o ALVO do ponto: o botão e a região que ele explica (o campo, o painel). A regra, pura, decide quanto a página
 * rola e se o card encolhe; o navegador mede (posições na janela, em px) e aplica.
 *
 *  - o alvo cabe acima do card com a altura de sempre: o card não muda e a página rola só o necessário;
 *  - não cabe, mas cabe com o card encolhido até o mínimo (topo com o X, umas três linhas e o rodapé): o card encolhe e o
 *    texto rola dentro dele;
 *  - nem assim (alvo maior que a tela): fica à vista o começo do alvo (o cabeçalho do painel, ou até o botão) acima do card;
 *    se ele já está à vista, a página não se mexe; se não, o topo do alvo vai para logo abaixo da barra do topo;
 *  - nada do alvo na coluna do card (o card fica ao lado, no computador): basta o alvo dentro da tela.
 *
 * Rolar para baixo além do fim da página é com quem aplica (uma folga no fim do conteúdo); rolar para cima além do topo, o
 * navegador limita.
 */

export interface Faixa {
  top: number;
  bottom: number;
}

export interface MedidasDoCard {
  /** Altura útil da janela: a da janela menos o teclado virtual aberto. */
  janela: number;
  /** Altura da barra fixa do topo: nada do alvo fica atrás dela. */
  topoLivre: number;
  /** Respiro entre o card e a borda de baixo, entre o alvo e o card e abaixo da barra do topo. */
  margem: number;
  /** Altura do card sem teto (o que o texto pede, até o máximo do CSS). */
  card: number;
  /** O card nunca encolhe abaixo disto. */
  cardMinimo: number;
  /** O alvo inteiro (botão + região), na posição de agora. */
  alvo: Faixa;
  /** As partes do alvo que ficam na coluna do card (que ele cobriria); null quando o card fica ao lado do alvo. */
  naColuna: Faixa | null;
  /** Onde termina o começo do alvo (o cabeçalho, o botão): o mínimo à vista quando o alvo não cabe. */
  comeco: number;
}

export interface PosicaoDoCard {
  /** Teto da altura do card; null = a altura de sempre. */
  teto: number | null;
  /** Quanto a página rola: positivo = o conteúdo sobe; negativo = desce. */
  rolar: number;
  /** O que fica à vista: o alvo inteiro ou só o começo dele. */
  mostra: 'inteiro' | 'comeco';
}

export function posicaoDoCard(m: MedidasDoCard): PosicaoDoCard {
  const topo = m.topoLivre + m.margem;
  const baixo = m.janela - m.margem;
  const { alvo, naColuna } = m;
  const minimo = Math.min(m.cardMinimo, m.card);
  // O maior card que deixa o alvo inteiro à vista: da barra do topo até o fim da parte que o card cobriria, mais o respiro.
  const cardQueDeixaOInteiro = naColuna ? baixo - m.margem - topo - (naColuna.bottom - alvo.top) : Infinity;
  if (alvo.bottom - alvo.top <= baixo - topo && cardQueDeixaOInteiro >= minimo) {
    const card = Math.min(m.card, cardQueDeixaOInteiro);
    // A menor rolagem que põe o alvo entre a barra do topo e o fim da tela, e a parte da coluna acima do card.
    const subirAoMenos = Math.max(alvo.bottom - baixo, naColuna ? naColuna.bottom - (baixo - card - m.margem) : -Infinity);
    const subirNoMaximo = alvo.top - topo;
    const rolar = subirAoMenos > 0 ? subirAoMenos : subirNoMaximo < 0 ? subirNoMaximo : 0;
    return { teto: card < m.card ? Math.floor(card) : null, rolar: Math.ceil(rolar), mostra: 'inteiro' };
  }
  // O alvo não cabe: o começo dele à vista, acima do card; o card encolhe só o que o começo pedir.
  const fimDoComeco = Math.min(Math.max(m.comeco, alvo.top), alvo.bottom);
  const card = naColuna ? Math.min(m.card, Math.max(minimo, baixo - m.margem - topo - (fimDoComeco - alvo.top))) : m.card;
  const limite = naColuna ? baixo - card - m.margem : baixo;
  const aVista = alvo.top >= topo && fimDoComeco <= limite;
  return { teto: card < m.card ? Math.floor(card) : null, rolar: aVista ? 0 : Math.ceil(alvo.top - topo), mostra: 'comeco' };
}

/** Um nível acima do botão do ponto, como a regra da região precisa vê-lo. */
export interface NivelAcima {
  /** A tag em maiúsculas, como o navegador dá ("HEADER", "SECTION", "DIV"). */
  tag: string;
  /** Tem um campo de verdade dentro (o que se preenche ou escolhe). */
  temCampo: boolean;
  /** Junta vários campos: outro ponto, um painel, um formulário ou uma tabela dentro dele. */
  juntaVarios: boolean;
}

/** Blocos que encerram a busca: subir além deles pegaria a tela inteira. */
const BLOCOS = new Set(['SECTION', 'FORM', 'FIELDSET', 'MAIN', 'TABLE', 'UL', 'OL', 'DIALOG', 'BODY']);

/**
 * A região que o ponto explica quando o botão não diz (`data-alvo`), pela posição dele (decisão 521). `subindo`: os níveis
 * acima do botão, do pai para cima (até quatro). Devolve o índice da região em `subindo`, ou null (vale só o botão):
 *  - no cabeçalho de um painel: o painel (`header` dentro de `section`);
 *  - na legenda de um grupo de campos: o grupo (`legend` dentro de `fieldset`);
 *  - junto do rótulo de um campo ou da caixa de marcar: o primeiro nível, até o terceiro, que tem o campo — se ele não junta
 *    vários campos;
 *  - nada disso até um bloco (painel, formulário, lista): nenhuma.
 */
export function regiaoPelaPosicao(subindo: readonly NivelAcima[]): number | null {
  for (let i = 0; i < Math.min(3, subindo.length); i++) {
    const nivel = subindo[i];
    if (nivel.tag === 'HEADER') return subindo[i + 1]?.tag === 'SECTION' ? i + 1 : null;
    if (nivel.tag === 'LEGEND') return subindo[i + 1]?.tag === 'FIELDSET' ? i + 1 : null;
    if (nivel.temCampo) return nivel.juntaVarios ? null : i;
    if (BLOCOS.has(nivel.tag)) return null;
  }
  return null;
}

/** A união das faixas (null sem nenhuma). */
export function uniao(faixas: readonly Faixa[]): Faixa | null {
  if (faixas.length === 0) return null;
  return { top: Math.min(...faixas.map((f) => f.top)), bottom: Math.max(...faixas.map((f) => f.bottom)) };
}

/**
 * O Tab dentro do card (decisão 521): enquanto o foco está no card, Tab e Shift+Tab circulam nele — depois do último botão
 * vem o primeiro (o X), antes do primeiro vem o último; do título (que recebe o foco ao abrir), Shift+Tab vai ao último.
 * `antes` e `depois`: quantos dos `total` botões do card vêm antes e depois do foco de agora, na ordem da página. Devolve o
 * índice do botão a focar, ou null quando o navegador segue sozinho (o próximo, na direção da tecla, ainda é do card).
 */
export function proximoFocoNoCard(total: number, antes: number, depois: number, paraTras: boolean): number | null {
  if (total <= 0) return null;
  if (paraTras) return antes === 0 ? total - 1 : null;
  return depois === 0 ? 0 : null;
}
