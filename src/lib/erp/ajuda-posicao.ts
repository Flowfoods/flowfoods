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
 *  - nem assim (alvo maior que a tela): fica à vista o começo do alvo (até o cabeçalho do painel e o botão) acima do card;
 *    se ele já está à vista, a página não se mexe; se não, o topo do alvo vai para logo abaixo da barra do topo — ou, quando
 *    nem o começo cabe, o botão termina logo acima do card (o botão nunca sai da tela);
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
  /** O botão do ponto: nunca sai da tela nem fica sob o card. */
  botao: Faixa;
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
  // O alvo não cabe: o começo dele (até o cabeçalho e o botão) à vista, acima do card; o card encolhe só o que o começo pedir.
  const fimDoComeco = Math.min(Math.max(m.comeco, m.botao.bottom, alvo.top), alvo.bottom);
  const alturaDoComeco = fimDoComeco - alvo.top;
  const card = naColuna ? Math.min(m.card, Math.max(minimo, baixo - m.margem - topo - alturaDoComeco)) : m.card;
  const limite = naColuna ? baixo - card - m.margem : baixo;
  const teto = card < m.card ? Math.floor(card) : null;
  // Já à vista: a página não se mexe. Cabe: o topo do alvo vai para logo abaixo da barra do topo. Não cabe (o botão longe do
  // topo da região): o botão termina logo acima do card — ele nunca sai da tela (revisão da 521).
  if (alvo.top >= topo && fimDoComeco <= limite) return { teto, rolar: 0, mostra: 'comeco' };
  if (alturaDoComeco <= limite - topo) return { teto, rolar: Math.ceil(alvo.top - topo), mostra: 'comeco' };
  return { teto, rolar: Math.ceil(m.botao.bottom - limite), mostra: 'comeco' };
}

/** `compareDocumentPosition`: o outro nó vem antes (2) ou depois (4) deste. */
const OUTRO_VEM_ANTES = 2;
const OUTRO_VEM_DEPOIS = 4;

/** Um nó que sabe dizer onde outro está na página (o `Node` do navegador). */
export interface NaOrdemDaPagina<T> {
  compareDocumentPosition(outro: T): number;
}

/** `a` vem antes de `b` na ordem da página (e não é `b`). Quem contém `b` vem antes dele. */
export function vemAntes<T extends NaOrdemDaPagina<T>>(a: T, b: T): boolean {
  return a !== b && (a.compareDocumentPosition(b) & OUTRO_VEM_DEPOIS) !== 0;
}

/** Quantos `itens` vêm antes e depois de `foco` na ordem da página (o foco, se estiver entre eles, não conta). */
export function antesEDepois<T extends NaOrdemDaPagina<T>>(itens: readonly T[], foco: T): { antes: number; depois: number } {
  let antes = 0;
  let depois = 0;
  for (const it of itens) {
    if (it === foco) continue;
    const pos = it.compareDocumentPosition(foco);
    if (pos & OUTRO_VEM_DEPOIS) antes++;
    else if (pos & OUTRO_VEM_ANTES) depois++;
  }
  return { antes, depois };
}

/** Um elemento dentro de um nível acima do botão, como o navegador o vê. */
export interface Descendente {
  /** Tag em maiúsculas ("INPUT", "OL"). */
  tag: string;
  /** O atributo `type` (só importa nos `input`). */
  tipo: string | null;
  /** Vem antes do botão do ponto na ordem da página. */
  antesDoBotao: boolean;
  /** É um botão de ponto (`data-ponto`) que não é o deste ponto. */
  outroPonto: boolean;
}

/** Um nível acima do botão do ponto: a tag e, só quando a regra precisar, o que há dentro dele. */
export interface NivelAcima {
  /** A tag em maiúsculas, como o navegador dá ("HEADER", "SECTION", "DIV"). */
  tag: string;
  dentro: () => readonly Descendente[];
}

/** Campo de verdade: o que se preenche ou escolhe (o `input` escondido não conta). */
export function ehCampo(d: Pick<Descendente, 'tag' | 'tipo'>): boolean {
  return d.tag === 'SELECT' || d.tag === 'TEXTAREA' || (d.tag === 'INPUT' && (d.tipo ?? '').toLowerCase() !== 'hidden');
}

/** Por onde veio a região do ponto: o `data-alvo` (480), o cabeçalho de um painel, a legenda de um grupo ou o rótulo. */
export type OrigemDaRegiao = 'alvo' | 'cabecalho' | 'legenda' | 'rotulo';

/** Um elemento entre o ponto tocado e a região (do tocado para cima), como o navegador o vê. */
export interface Tocado {
  tag: string;
  /** Link de verdade (`a` com `href`). */
  temHref: boolean;
  /** O atributo `role`. */
  papel: string | null;
}

const TAGS_DE_CONTROLE = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'LABEL', 'SUMMARY', 'OPTION']);
const PAPEIS_DE_CONTROLE = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'option']);

/** O toque caiu num campo, botão, link ou rótulo (algum elemento da cadeia, do tocado até a região). */
export function tocouEmControle(cadeia: readonly Tocado[]): boolean {
  return cadeia.some((t) => TAGS_DE_CONTROLE.has(t.tag) || (t.tag === 'A' && t.temHref) || (t.papel !== null && PAPEIS_DE_CONTROLE.has(t.papel)));
}

/**
 * Tocar dentro da região do ponto mantém o card aberto (decisão 521, revisão)? Na do `data-alvo` (480) e na do rótulo (o
 * campo com o rótulo), sim: tocar nela é fazer o que o card pede. Na de um painel inteiro (cabeçalho) ou de um grupo
 * (legenda), só no que se usa — campo, botão, link ou rótulo; o texto e o fundo do painel fecham, como tocar fora.
 */
export function toqueMantemAberto(por: OrigemDaRegiao, emControle: boolean): boolean {
  return por === 'alvo' || por === 'rotulo' || emControle;
}

/** Um elemento que recebe foco (o `HTMLElement` do navegador). */
export interface Focavel<T> extends NaOrdemDaPagina<T> {
  focus(): void;
}

/**
 * Leva o foco no Tab dentro do card (decisão 521, revisão): nas bordas, ao botão do ponto (`origem`, null quando ele não
 * pode receber foco); se o foco não pegou nele (botão dentro de um grupo desligado, que não tem o atributo `disabled` mas não
 * recebe foco), circula no card. `focoDeAgora`: quem está com o foco depois de tentar. Devolve quem recebeu o foco, ou null
 * quando a tecla segue com o navegador (o próximo, na direção da tecla, ainda é do card).
 */
export function tabNoCard<T extends Focavel<T>>(botoes: readonly T[], foco: T, origem: T | null, paraTras: boolean, focoDeAgora: () => unknown): T | null {
  const { antes, depois } = antesEDepois(botoes, foco);
  const passo = proximoFocoNoCard(botoes.length, antes, depois, paraTras, origem !== null);
  if (passo === null) return null;
  if (passo === 'origem' && origem) {
    origem.focus();
    if (focoDeAgora() === origem) return origem;
  }
  const noCard = proximoFocoNoCard(botoes.length, antes, depois, paraTras, false);
  if (typeof noCard !== 'number') return null;
  botoes[noCard].focus();
  return botoes[noCard];
}

/** Blocos que juntam vários campos: sendo um deles, ou com um deles dentro, o nível não é "o campo do rótulo". */
const JUNTAM_VARIOS = new Set(['SECTION', 'FORM', 'TABLE', 'OL', 'UL']);
/** Blocos que encerram a busca: subir além deles pegaria a tela inteira. */
const BLOCOS = new Set(['SECTION', 'FORM', 'FIELDSET', 'MAIN', 'TABLE', 'UL', 'OL', 'DIALOG', 'BODY']);

/**
 * A região que o ponto explica quando o botão não diz (`data-alvo`), pela posição dele (decisão 521). `subindo`: os níveis
 * acima do botão, do pai para cima (até quatro). Devolve o índice da região em `subindo` e por onde ela veio, ou null (vale
 * só o botão):
 *  - no cabeçalho de um painel: o painel (`header` dentro de `section`);
 *  - na legenda de um grupo de campos: o grupo (`legend` dentro de `fieldset`);
 *  - junto do rótulo de um campo: o primeiro nível, até o terceiro, que tem campo — se os campos dele vêm todos DEPOIS do
 *    botão (o rótulo e o "?" em cima, o campo embaixo) e ele não junta vários (outro ponto, painel, formulário, tabela ou
 *    lista dentro). Botão depois do campo (a frase embaixo de uma lista de etapas, a caixa de marcar): só o botão;
 *  - nada disso até um bloco (painel, formulário, lista): nenhuma.
 */
export function regiaoPelaPosicao(subindo: readonly NivelAcima[]): { indice: number; por: OrigemDaRegiao } | null {
  for (let i = 0; i < Math.min(3, subindo.length); i++) {
    const nivel = subindo[i];
    if (nivel.tag === 'HEADER') return subindo[i + 1]?.tag === 'SECTION' ? { indice: i + 1, por: 'cabecalho' } : null;
    if (nivel.tag === 'LEGEND') return subindo[i + 1]?.tag === 'FIELDSET' ? { indice: i + 1, por: 'legenda' } : null;
    const dentro = nivel.dentro();
    const campos = dentro.filter(ehCampo);
    if (campos.length > 0) {
      const juntaVarios = JUNTAM_VARIOS.has(nivel.tag) || dentro.some((d) => JUNTAM_VARIOS.has(d.tag) || d.outroPonto);
      return juntaVarios || campos.some((c) => c.antesDoBotao) ? null : { indice: i, por: 'rotulo' };
    }
    if (BLOCOS.has(nivel.tag)) return null;
  }
  return null;
}

/**
 * Ajuda fechada: quanto da folga do fim do conteúdo fica (revisão da 521). Sai a parte abaixo da tela, o que não mexe na
 * página; a que está à vista fica (tirá-la faria a página saltar). Página que nem rola: sai tudo. 0 = tirar a folga.
 */
export function folgaQueFica(atual: number, alturaDoDocumento: number, rolagem: number, janela: number): number {
  if (atual <= 0 || alturaDoDocumento <= janela) return 0;
  const abaixoDaTela = Math.max(0, Math.floor(alturaDoDocumento - rolagem - janela));
  return atual - Math.min(atual, abaixoDaTela);
}

/** A união das faixas (null sem nenhuma). */
export function uniao(faixas: readonly Faixa[]): Faixa | null {
  if (faixas.length === 0) return null;
  return { top: Math.min(...faixas.map((f) => f.top)), bottom: Math.max(...faixas.map((f) => f.bottom)) };
}

/**
 * O Tab no card (revisão da 521): o card é não modal, então o foco não fica preso nele. Depois do último botão do card, e
 * antes do primeiro (inclusive do título, que recebe o foco ao abrir), o foco vai para o botão do ponto, junto do campo
 * explicado — dali a pessoa segue a página e faz o que o card pede. Só sem esse botão (desligado ou fora da página) o Tab
 * circula no card. `antes` e `depois`: quantos dos `total` botões do card vêm antes e depois do foco de agora. Devolve
 * 'origem' (o botão do ponto), o índice do botão do card a focar, ou null quando o navegador segue sozinho (o próximo, na
 * direção da tecla, ainda é do card).
 */
export function proximoFocoNoCard(total: number, antes: number, depois: number, paraTras: boolean, temOrigem: boolean): number | 'origem' | null {
  if (total <= 0) return temOrigem ? 'origem' : null;
  const naBorda = paraTras ? antes === 0 : depois === 0;
  if (!naBorda) return null;
  if (temOrigem) return 'origem';
  return paraTras ? total - 1 : 0;
}
