/**
 * Etiquetas (3.4) — o DESENHO da etiqueta, puro (sem banco, sem Next, serve ao servidor e ao navegador): um modelo só, em
 * pontos da impressora, que vira o ZPL (o arquivo que a Zebra entende) e a prévia na tela (SVG). Prévia e papel nascem do
 * MESMO layout: a quebra de linha é decidida aqui, não pela fonte do navegador nem pela impressora.
 *
 * Decisão 408:
 * - 203 dpi é o padrão (8 pontos por mm: 60 × 40 mm = 480 × 320 pontos; 60 × 60 = 480 × 480); 300 dpi (12 por mm) é escala;
 * - `^CI28`: o texto vai em UTF-8 (acentos do português na fonte 0 da Zebra);
 * - todo texto que veio de gente (nome do produto, lote, marca, responsável, loja) passa por `paraCampoZpl`: caracteres de
 *   controle e de formato saem, quebras viram espaço, pontuação tipográfica vira a simples, emoji e símbolos saem, e `^`, `~` e
 *   `_` vão em hexadecimal dentro de `^FH` (`_5E`, `_7E`, `_5F`). Nenhum dado abre comando na impressora;
 * - nada é cortado calado: o texto quebra em linhas; o que não cabe é ERRO (campo essencial: "não cabe na 60 × 40, use a
 *   60 × 60") ou fica de fora DITO na tela (campo opcional, como a marca);
 * - `^PQ` = quantas cópias; o resto do documento é o mesmo na primeira impressão e na reimpressão (vem da emissão).
 */

import { CONSERVACOES, type Conservacao } from './validade';
import { dataHoraDaEtiqueta, diaDaEtiqueta, RESOLUCOES, type Formato, type Resolucao } from './etiqueta-campos';

// ================================================================ o conteúdo

export type ValidadeNaEtiqueta = { tipo: 'instante'; em: Date } | { tipo: 'dia'; dia: string } | { tipo: 'nao-informada' };

/** O que vai no papel, já decidido (vem da emissão gravada: nada aqui consulta ficha, insumo ou relógio). */
export interface ConteudoDaEtiqueta {
  origem: 'LOTE' | 'ABERTA';
  produto: string;
  conservacao: Conservacao | null;
  /** "500 g" (por etiqueta); null = sem quantidade. */
  quantidade: string | null;
  /** Lote produzido: a conclusão (a manipulação). */
  manipuladoEm: Date | null;
  /** Item comprado: a abertura. */
  abertoEm: Date | null;
  validade: ValidadeNaEtiqueta;
  /** Item aberto: o vencimento do lote do fornecedor (aaaa-mm-dd); null = não informado. */
  vencimentoLote: string | null;
  /** Lote produzido: o código (261023-01). Item aberto: o lote do fornecedor (null = não informado). */
  lote: string | null;
  marca: string | null;
  /** Quem manipulou (lote) ou abriu (item); null = não registrado. */
  responsavel: string | null;
  loja: string;
  /** O código da etiqueta (E261023-0007). */
  codigo: string;
  mostrarHora: boolean;
}

// ================================================================ o texto que entra no ZPL

const TIPOGRAFICOS: Readonly<Record<string, string>> = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201A': "'",
  '\u201C': '"',
  '\u201D': '"',
  '\u201E': '"',
  '\u2013': '-',
  '\u2014': '-',
  '\u2212': '-',
  '\u2026': '...',
  '\u00A0': ' ',
  '\u2022': '-',
};

/**
 * O texto como pode ir para a etiqueta: forma composta (NFC); quebras e tabulações viram espaço; controle (Cc), formato (Cf,
 * largura zero, bidi), substitutos soltos e uso privado saem; pontuação tipográfica vira a simples; emoji e símbolos saem;
 * espaços repetidos viram um. Letras com acento ficam.
 */
export function textoDaEtiqueta(bruto: string): string {
  return bruto
    .normalize('NFC')
    .replace(/[\t\n\r\f\v\u2028\u2029\u0085]/g, ' ')
    .replace(/[\u2018\u2019\u201A\u201C\u201D\u201E\u2013\u2014\u2212\u2026\u00A0\u2022]/g, (c) => TIPOGRAFICOS[c] ?? '')
    .replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/gu, '')
    // `^` e o acento grave são "símbolos modificadores" (Sk): ficam (o `^` vai em hexadecimal); o grau também fica.
    .replace(/[\p{Extended_Pictographic}\p{So}\p{Sk}]/gu, (c) => (c === '^' || c === '`' || c === '°' ? c : ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Dentro de `^FH^FD...^FS`: `^`, `~` e o próprio indicador `_` em hexadecimal; o resto do texto já limpo. */
export function paraCampoZpl(t: string): string {
  return textoDaEtiqueta(t).replace(/[\^~_]/g, (c) => `_${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Nome de arquivo seguro: "etiqueta-E261023-0007.zpl". */
export function nomeDoArquivo(codigo: string): string {
  const limpo = codigo.replace(/[^A-Za-z0-9-]/g, '').slice(0, 40) || 'etiqueta';
  return `etiqueta-${limpo}.zpl`;
}

// ================================================================ medir e quebrar

/** Largura aproximada de um caractere na fonte 0 da Zebra, em frações da altura (conservadora: o real é mais estreito). */
function larguraDoCaractere(c: string): number {
  const base = c.normalize('NFD').charAt(0);
  if (base === ' ') return 0.3;
  if ('iljI.,:;!|\'`'.includes(base)) return 0.3;
  if ('ftr()[]/-'.includes(base)) return 0.42;
  if ('mwMW@%'.includes(base)) return 0.88;
  if (/[0-9]/.test(base)) return 0.58;
  if (/[A-Z]/.test(base)) return 0.66;
  if (/[a-z]/.test(base)) return 0.56;
  return 0.7;
}

export function larguraDoTexto(t: string, altura: number): number {
  let soma = 0;
  for (const c of t) soma += larguraDoCaractere(c);
  return Math.ceil(soma * altura);
}

/** Quebra em linhas que cabem em `largura` (pontos) na altura dada; palavra maior que a linha é partida (nunca cortada). */
export function quebrarEmLinhas(t: string, altura: number, largura: number): string[] {
  const linhas: string[] = [];
  let atual = '';
  const cabe = (s: string) => larguraDoTexto(s, altura) <= largura;
  for (const palavra of t.split(' ').filter(Boolean)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (cabe(tentativa)) {
      atual = tentativa;
      continue;
    }
    if (atual) linhas.push(atual);
    atual = '';
    if (cabe(palavra)) {
      atual = palavra;
      continue;
    }
    let pedaco = '';
    for (const c of palavra) {
      if (cabe(pedaco + c)) pedaco += c;
      else {
        linhas.push(pedaco);
        pedaco = c;
      }
    }
    atual = pedaco;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

// ================================================================ o layout

export type ElementoDaEtiqueta =
  | { tipo: 'texto'; x: number; y: number; altura: number; texto: string; campo: string }
  | { tipo: 'filete'; x: number; y: number; largura: number; espessura: number };

export interface LayoutDaEtiqueta {
  formato: Formato;
  resolucao: Resolucao;
  larguraPontos: number;
  alturaPontos: number;
  elementos: ElementoDaEtiqueta[];
  /** Campos opcionais que não couberam neste formato (ditos na tela). */
  fora: string[];
  /** Campo essencial que não coube: a etiqueta não sai neste formato. */
  erro: string | null;
}

interface Medidas {
  margem: number;
  /** O produto em destaque; nome grande desce para a altura mínima (legível) antes de recusar o formato. */
  produto: { altura: number; passo: number; linhas: number; alturaMinima: number; passoMinimo: number };
  filete: { antes: number; espessura: number; depois: number };
  info: { altura: number; passo: number };
  destaque: { altura: number; passo: number };
}

/** Em pontos a 203 dpi (8 por mm); a 300 dpi tudo é multiplicado por 1,5. */
const MEDIDAS: Record<Formato, Medidas> = {
  E60X40: { margem: 16, produto: { altura: 32, passo: 36, linhas: 2, alturaMinima: 26, passoMinimo: 30 }, filete: { antes: 4, espessura: 2, depois: 6 }, info: { altura: 22, passo: 26 }, destaque: { altura: 28, passo: 32 } },
  E60X60: { margem: 16, produto: { altura: 40, passo: 46, linhas: 3, alturaMinima: 32, passoMinimo: 37 }, filete: { antes: 6, espessura: 3, depois: 8 }, info: { altura: 26, passo: 31 }, destaque: { altura: 34, passo: 40 } },
};

interface Linha {
  campo: string;
  /** Nome do campo para a tela ("a marca"). */
  nome: string;
  texto: string;
  /** Onde a linha quebra, quando o texto inteiro encostaria na borda (cada parte ainda pode quebrar se não couber). */
  quebra?: string[];
  essencial: boolean;
  destaque?: boolean;
  maxLinhas: number;
}

/** As linhas da etiqueta, na ordem do papel. */
export function linhasDoConteudo(c: ConteudoDaEtiqueta): Linha[] {
  const quando = (d: Date) => dataHoraDaEtiqueta(d, c.mostrarHora);
  const conservacao = c.conservacao ? CONSERVACOES[c.conservacao].toUpperCase() : 'CONSERVAÇÃO NÃO INFORMADA';
  const linhas: Linha[] = [{ campo: 'conservacao', nome: 'a conservação', texto: c.quantidade ? `${conservacao} · ${c.quantidade}` : conservacao, essencial: true, maxLinhas: 2 }];
  const validade =
    c.validade.tipo === 'instante' ? quando(c.validade.em) : c.validade.tipo === 'dia' ? diaDaEtiqueta(c.validade.dia) : null;
  if (c.origem === 'LOTE') {
    linhas.push({ campo: 'manipulacao', nome: 'a manipulação', texto: `MANIPULADO ${c.manipuladoEm ? quando(c.manipuladoEm) : 'SEM DATA'}`, essencial: true, maxLinhas: 1 });
    linhas.push({ campo: 'validade', nome: 'a validade', texto: validade ? `VALIDADE ${validade}` : 'VALIDADE NÃO INFORMADA', essencial: true, destaque: !!validade, maxLinhas: 2 });
    linhas.push({ campo: 'lote', nome: 'o lote', texto: `LOTE ${c.lote ?? 'NÃO INFORMADO'}`, essencial: true, maxLinhas: 1 });
  } else {
    linhas.push({ campo: 'abertura', nome: 'a abertura', texto: `ABERTO ${c.abertoEm ? quando(c.abertoEm) : 'SEM DATA'}`, essencial: true, maxLinhas: 1 });
    // Sem prazo: o termo da tela, em duas linhas (inteiro numa só encostava na borda da 60 × 40 com Arial; rodada final, UX 4).
    linhas.push(
      validade
        ? { campo: 'validade', nome: 'a validade', texto: `USAR ATÉ ${validade}`, essencial: true, destaque: true, maxLinhas: 2 }
        : { campo: 'validade', nome: 'a validade', texto: 'PRAZO APÓS ABERTURA NÃO INFORMADO', quebra: ['PRAZO APÓS ABERTURA', 'NÃO INFORMADO'], essencial: true, maxLinhas: 2 },
    );
    linhas.push({ campo: 'vencimento', nome: 'o vencimento do lote', texto: `VENC. LOTE ${c.vencimentoLote ? diaDaEtiqueta(c.vencimentoLote) : 'NÃO INFORMADO'}`, essencial: true, maxLinhas: 1 });
    linhas.push({ campo: 'lote', nome: 'o lote do fornecedor', texto: `LOTE FORN. ${c.lote ?? 'NÃO INFORMADO'}`, essencial: true, maxLinhas: 2 });
  }
  linhas.push({ campo: 'responsavel', nome: 'o responsável', texto: `RESP. ${c.responsavel ?? 'NÃO REGISTRADO'}`, essencial: true, maxLinhas: 2 });
  if (c.marca) linhas.push({ campo: 'marca', nome: 'a marca', texto: `MARCA ${c.marca}`, essencial: false, maxLinhas: 1 });
  linhas.push({ campo: 'loja', nome: 'a loja', texto: `${c.loja} · ${c.codigo}`, essencial: true, maxLinhas: 2 });
  return linhas.map((l) => ({ ...l, texto: textoDaEtiqueta(l.texto), quebra: l.quebra?.map(textoDaEtiqueta) }));
}

/**
 * Monta a etiqueta no formato e na resolução: o produto em destaque (até 2 linhas na 60 × 40, 3 na 60 × 60), um filete, e as
 * linhas de informação (a validade maior). Campo essencial que não cabe = `erro`; opcional = `fora` (as linhas depois dele
 * sobem). A marca, opcional, sai antes do que é essencial.
 */
export function montarEtiqueta(c: ConteudoDaEtiqueta, formato: Formato, resolucao: Resolucao = 203): LayoutDaEtiqueta {
  // Rodada 1 (Guardião M3): o que entra e o que sai é decidido UMA vez, a 203 dpi (o que a prévia mostra); a 300 dpi o mesmo
  // desenho é ampliado com arredondamento para baixo (cabe sempre, e a marca não some calada a 300).
  if (resolucao !== 203) return ampliar(montarA203(c, formato), resolucao);
  return montarA203(c, formato);
}

function ampliar(l: LayoutDaEtiqueta, resolucao: Resolucao): LayoutDaEtiqueta {
  const k = RESOLUCOES[resolucao] / 8;
  const f = (n: number) => Math.floor(n * k);
  return {
    ...l,
    resolucao,
    larguraPontos: f(l.larguraPontos),
    alturaPontos: f(l.alturaPontos),
    elementos: l.elementos.map((e) =>
      e.tipo === 'filete' ? { ...e, x: f(e.x), y: f(e.y), largura: f(e.largura), espessura: Math.max(1, f(e.espessura)) } : { ...e, x: f(e.x), y: f(e.y), altura: f(e.altura) },
    ),
  };
}

function montarA203(c: ConteudoDaEtiqueta, formato: Formato): LayoutDaEtiqueta {
  const resolucao: Resolucao = 203;
  const escala = 1;
  const m = MEDIDAS[formato];
  const p = (n: number) => Math.round(n * escala);
  const larguraPontos = p(480);
  const alturaPontos = p(formato === 'E60X40' ? 320 : 480);
  const margem = p(m.margem);
  const util = larguraPontos - 2 * margem;
  const fundo = alturaPontos - margem;
  const elementos: ElementoDaEtiqueta[] = [];
  const fora: string[] = [];
  const nomeDoFormato = formato === 'E60X40' ? '60 × 40' : '60 × 60';
  const falha = (erro: string): LayoutDaEtiqueta => ({ formato, resolucao, larguraPontos, alturaPontos, elementos: [], fora: [], erro });

  const produto = textoDaEtiqueta(c.produto) || 'SEM NOME';
  // Na altura normal; se passar das linhas, na mínima legível; se ainda passar, o formato não serve (nunca corta).
  let fonte = { altura: p(m.produto.altura), passo: p(m.produto.passo) };
  let linhasDoProduto = quebrarEmLinhas(produto, fonte.altura, util);
  if (linhasDoProduto.length > m.produto.linhas) {
    fonte = { altura: p(m.produto.alturaMinima), passo: p(m.produto.passoMinimo) };
    linhasDoProduto = quebrarEmLinhas(produto, fonte.altura, util);
  }
  if (linhasDoProduto.length > m.produto.linhas) {
    return falha(`O nome do produto não cabe na ${nomeDoFormato}${formato === 'E60X40' ? ': use a 60 × 60' : ': encurte o nome na ficha ou no cadastro'}.`);
  }
  let y = margem;
  for (const t of linhasDoProduto) {
    elementos.push({ tipo: 'texto', x: margem, y, altura: fonte.altura, texto: t, campo: 'produto' });
    y += fonte.passo;
  }
  y += p(m.filete.antes) - (fonte.passo - fonte.altura);
  elementos.push({ tipo: 'filete', x: margem, y, largura: util, espessura: p(m.filete.espessura) });
  y += p(m.filete.espessura) + p(m.filete.depois);

  // Quanto cada linha ocupa; a opcional sai se não couber (e as essenciais depois dela ainda precisam caber).
  const linhas = linhasDoConteudo(c).map((l) => {
    const med = l.destaque ? m.destaque : m.info;
    return { ...l, altura: p(med.altura), passo: p(med.passo), partes: (l.quebra ?? [l.texto]).flatMap((t) => quebrarEmLinhas(t, p(med.altura), util)) };
  });
  for (const l of linhas) {
    if (l.partes.length > l.maxLinhas && l.essencial) return falha(`${primeiraMaiuscula(l.nome)} não cabe na ${nomeDoFormato}${formato === 'E60X40' ? ': use a 60 × 60' : ''}.`);
  }
  const ocupa = (l: (typeof linhas)[number]) => l.partes.length * l.passo;
  const essenciais = linhas.filter((l) => l.essencial).reduce((s, l) => s + ocupa(l), 0);
  // A última linha não precisa do respiro do passo inteiro: só da altura dela.
  const ultima = linhas[linhas.length - 1];
  const respiroFinal = ultima ? ultima.passo - ultima.altura : 0;
  if (y + essenciais - respiroFinal > fundo) return falha(`As informações não cabem na ${nomeDoFormato}${formato === 'E60X40' ? ': use a 60 × 60' : ''}.`);
  let sobra = fundo - (y + essenciais - respiroFinal);
  const entram = linhas.filter((l) => {
    if (l.essencial) return true;
    if (l.partes.length <= l.maxLinhas && ocupa(l) <= sobra) {
      sobra -= ocupa(l);
      return true;
    }
    fora.push(l.nome);
    return false;
  });
  for (const l of entram) {
    for (const t of l.partes) {
      elementos.push({ tipo: 'texto', x: margem, y, altura: l.altura, texto: t, campo: l.campo });
      y += l.passo;
    }
  }
  return { formato, resolucao, larguraPontos, alturaPontos, elementos, fora, erro: null };
}

const primeiraMaiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ================================================================ o ZPL

/**
 * A versão do desenho (gravada na emissão): mudar posições, fontes ou textos fixos sobe o número, e o desenho antigo continua
 * existindo para as emissões dele (`DESENHOS` em etiquetas.ts). A 1 é a primeira que vai para produção (decisão 427): as
 * mudanças das rodadas da 3.4 aconteceram antes de qualquer emissão real.
 */
export const VERSAO_DO_LAYOUT = 1;

/**
 * O documento ZPL de um layout, com `copias` (`^PQ`). Uma etiqueta por documento: as cópias saem iguais. `^CI28` antes de
 * qualquer campo; todo texto em `^FH` (hexadecimal com `_`).
 */
export function zplDoLayout(l: LayoutDaEtiqueta, copias: number): string {
  if (l.erro) throw new Error(`[etiqueta] ${l.erro}`);
  if (!Number.isInteger(copias) || copias < 1 || copias > 999) throw new Error('[etiqueta] cópias fora da faixa.');
  const linhas = ['^XA', '^CI28', `^PW${l.larguraPontos}`, `^LL${l.alturaPontos}`, '^LH0,0', '^PON'];
  for (const e of l.elementos) {
    if (e.tipo === 'filete') linhas.push(`^FO${e.x},${e.y}^GB${e.largura},${e.espessura},${e.espessura}^FS`);
    else linhas.push(`^FO${e.x},${e.y}^A0N,${e.altura},${e.altura}^FH_^FD${paraCampoZpl(e.texto)}^FS`);
  }
  linhas.push(`^PQ${copias},0,1,Y`, '^XZ');
  return `${linhas.join('\n')}\n`;
}

/** A etiqueta de TESTE (dados fictícios), para conferir a impressora sem gravar nada. */
export function conteudoDeTeste(formato: Formato, agora: Date): ConteudoDaEtiqueta {
  return {
    origem: 'LOTE',
    produto: formato === 'E60X40' ? 'TESTE · Molho fictício' : 'TESTE · Molho fictício de demonstração (não é alimento)',
    conservacao: 'REFRIGERADO',
    quantidade: '500 g',
    manipuladoEm: agora,
    abertoEm: null,
    validade: { tipo: 'instante', em: new Date(agora.getTime() + 3 * 86_400_000) },
    vencimentoLote: null,
    lote: 'TESTE-01',
    marca: null,
    responsavel: 'Teste de impressora',
    loja: 'Teste',
    codigo: 'E000000-0000',
    mostrarHora: true,
  };
}
