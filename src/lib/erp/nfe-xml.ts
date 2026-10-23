/**
 * NF-e por XML (F.1b) — o leitor SEGURO do arquivo, puro (sem banco, sem Next). Recebe os bytes que a pessoa enviou e devolve a nota
 * já em centavos e milésimos, ou uma frase em português dizendo por que não entra. Nada daqui grava.
 *
 * A ordem importa (cada passo barra o que o seguinte não deveria ver):
 *  1. ANTES do leitor de XML: tamanho (900 KB, abaixo do 1 MB que o Next aceita no corpo da requisição), formato do arquivo (zip e PDF não são XML), UTF-8, declaração de codificação, nada de
 *     `<!DOCTYPE`, `<!ENTITY`, instrução de processamento (`<?xml-stylesheet`), entidade que não seja uma das cinco do XML ou número,
 *     nome de tag perigoso, contagem de tags e profundidade (200 itens × ~60 tags cabem folgados). Sem DTD e sem entidade externa
 *     não há XXE nem "billion laughs": o arquivo com isso é recusado antes de qualquer leitura.
 *  2. O leitor (`fast-xml-parser`, versão fixa) com `processEntities: false` (nenhuma entidade é expandida: as cinco do XML são
 *     decodificadas aqui, à mão, em texto) e `parseTagValue: false` (tudo é TEXTO: "00123" continua "00123" e nenhum número vira
 *     float). Valor em dinheiro com até 2 casas e quantidade com até 4 são lidos como texto → inteiros, sem float.
 *  3. DEPOIS: só vale `nfeProc` (versão 4.00) com protocolo de autorização (cStat 100 ou 150), modelo 55, ambiente de produção,
 *     saída do emitente (tpNF 1), finalidade normal, chave de 44 dígitos com dígito verificador e coerente com o resto do documento.
 *     NFe sem protocolo, NFC-e (65), resumo (resNFe), evento e nota denegada ou cancelada têm frase própria.
 *
 * A assinatura digital (XMLDSig) NÃO é verificada nesta fase: risco aceito e registrado (decisão 316). O que protege é o protocolo
 * coerente com a chave, o dígito verificador e, principalmente, a conferência humana antes de lançar.
 */

import { createHash } from 'node:crypto';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { documentoValido, normalizarCodigo, normalizarInscricao, UFS } from './compra-campos';
import { limparTexto } from './insumo-campos';
import { LIMITES_DO_XML } from './nfe-limites';

export { LIMITES_DO_XML };

const NAMESPACE_DA_NFE = 'http://www.portalfiscal.inf.br/nfe';
const TETO = 2_000_000_000;

export interface ItemDoXml {
  nItem: number;
  codigoProduto: string;
  gtin: string | null;
  descricao: string;
  ncm: string | null;
  cfop: string | null;
  unidadeComercial: string;
  qComTexto: string;
  qComMilesimos: number;
  vProdCentavos: number;
  vDescCentavos: number;
  vOutroCentavos: number;
  vSegCentavos: number;
  vIpiCentavos: number;
  vStCentavos: number;
  vFreteCentavos: number;
  /** vProd − vDesc + vOutro + vSeg + vIPI + vST: o que o item custa de verdade (o frete vai à parte). */
  liquidoCentavos: number;
}

export interface NotaDoXml {
  chaveAcesso: string;
  modelo: 55;
  serie: string;
  numero: string;
  /** Data de emissão no relógio do Rio ("2026-10-21"). */
  emitidaEm: string;
  protocolo: { cStat: string; nProt: string | null };
  emitente: {
    documento: string;
    razao: string;
    fantasia: string | null;
    inscricaoEstadual: string | null;
    uf: string | null;
    municipio: string | null;
    endereco: string | null;
    cep: string | null;
  };
  destinatarioDocumento: string;
  totais: {
    vProdCentavos: number;
    vDescCentavos: number;
    vFreteCentavos: number;
    vSegCentavos: number;
    vOutroCentavos: number;
    vIpiCentavos: number;
    /** vST + vFCPST. */
    vStCentavos: number;
    vNfCentavos: number;
    /** vICMSDeson, vII ou vIPIDevol diferente de zero: a conta do total tem peças que o sistema não lança. */
    temAjusteQueNaoLanca: boolean;
  };
  duplicatas: { numero: string; vencimento: string; valorCentavos: number }[];
  itens: ItemDoXml[];
}

export type ResultadoDoXml = { ok: true; nota: NotaDoXml; sha256: string; texto: string } | { ok: false; erro: string };

const recusa = (erro: string): { ok: false; erro: string } => ({ ok: false, erro });

// ------------------------------------------------------------ números como texto

/** "149.70" → 14970. Só ponto, até 2 casas, sem sinal, sem expoente, sem separador de milhar. Fora disso: null. */
export function lerCentavosDoXml(t: unknown): number | null {
  if (typeof t !== 'string') return null;
  const m = /^(\d{1,11})(?:\.(\d{1,2}))?$/.exec(t.trim());
  if (!m) return null;
  const v = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return v <= TETO ? v : null;
}

/** "3.0000" → 3000 (milésimos). Até 4 casas; a quarta arredonda a terceira (metade para cima). Zero ou fora da faixa: null. */
export function lerMilesimosDoXml(t: unknown): number | null {
  if (typeof t !== 'string') return null;
  const m = /^(\d{1,11})(?:\.(\d{1,4}))?$/.exec(t.trim());
  if (!m) return null;
  const decimais = (m[2] ?? '').padEnd(4, '0');
  const v = Number(m[1]) * 1000 + Math.floor((Number(decimais) + 5) / 10);
  return v >= 1 && v <= TETO ? v : null;
}

// ------------------------------------------------------------ a chave de acesso

/** Dígito verificador da chave (módulo 11, pesos 2 a 9 da direita para a esquerda sobre os 43 primeiros). */
export function digitoDaChave(corpo43: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = corpo43.length - 1; i >= 0; i--) {
    soma += Number(corpo43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const r = soma % 11;
  return r < 2 ? 0 : 11 - r;
}

export function chaveValida(chave: string): boolean {
  return /^\d{44}$/.test(chave) && digitoDaChave(chave.slice(0, 43)) === Number(chave[43]);
}

// ------------------------------------------------------------ antes do leitor de XML

const ENTIDADES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** As cinco entidades do XML e referências numéricas, em texto. Já foi conferido antes que não há outra. */
function decodificar(s: string): string {
  return s.replace(/&(?:(amp|lt|gt|quot|apos)|#(\d{1,7})|#x([0-9a-fA-F]{1,6}));/g, (_m, nome?: string, dec?: string, hex?: string) => {
    if (nome) return ENTIDADES[nome];
    const cod = dec !== undefined ? Number(dec) : parseInt(hex!, 16);
    return cod >= 0x20 && cod <= 0x10ffff && !(cod >= 0xd800 && cod <= 0xdfff) ? String.fromCodePoint(cod) : '';
  });
}

/** Tags e profundidade, numa varredura só (sem regex que volte atrás). */
function medirEstrutura(t: string): { tags: number; profundidade: number } {
  let tags = 0;
  let prof = 0;
  let max = 0;
  let i = t.indexOf('<');
  while (i !== -1) {
    const c = t[i + 1];
    const fim = t.indexOf('>', i + 1);
    if (c === '!' || c === '?') {
      // Comentário, CDATA ou declaração: não é elemento.
      if (t.startsWith('<![CDATA[', i)) {
        const f = t.indexOf(']]>', i);
        i = f === -1 ? -1 : t.indexOf('<', f + 3);
        continue;
      }
      if (t.startsWith('<!--', i)) {
        const f = t.indexOf('-->', i);
        i = f === -1 ? -1 : t.indexOf('<', f + 3);
        continue;
      }
    } else if (c === '/') {
      prof--;
    } else {
      tags++;
      if (fim !== -1 && t[fim - 1] !== '/') {
        prof++;
        if (prof > max) max = prof;
      }
      if (tags > LIMITES_DO_XML.tags) return { tags, profundidade: max };
    }
    if (fim === -1) break;
    i = t.indexOf('<', fim + 1);
  }
  return { tags, profundidade: max };
}

const FRASE_PERIGO =
  'Este arquivo traz instruções extras que uma nota fiscal de verdade não tem. Por segurança ele foi recusado e nada foi gravado. Baixe o XML da nota de novo, direto do e-mail ou do portal do fornecedor.';

function conferirAntes(bytes: Uint8Array): { ok: true; texto: string } | { ok: false; erro: string } {
  if (bytes.length === 0) return recusa('O arquivo está vazio. Escolha o XML da nota.');
  if (bytes.length > LIMITES_DO_XML.bytes) {
    const kb = Math.ceil(bytes.length / 1000).toLocaleString('pt-BR');
    return recusa(`O arquivo tem ${kb} KB e o limite é 900 KB. Uma NF-e costuma ter poucas dezenas de KB: confira se é o XML da nota (e não um arquivo compactado ou outra coisa).`);
  }
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return recusa('Este arquivo parece compactado (zip). Descompacte e envie o arquivo .xml da nota.');
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return recusa('Isto é um PDF. Envie o XML da nota; o PDF é só a impressão dela.');
  if (bytes.includes(0)) return recusa('Este arquivo não é um XML de texto. Envie o arquivo .xml da nota.');
  let texto: string;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return recusa('O arquivo não está em UTF-8 (a NF-e é sempre UTF-8). Baixe o XML da nota de novo, sem abrir e salvar em outro programa.');
  }
  const declarada = /^\s*<\?xml[^>]*\sencoding\s*=\s*["']([^"']+)["']/i.exec(texto);
  if (declarada && !/^utf-?8$/i.test(declarada[1])) {
    return recusa('O arquivo diz que usa outra codificação de texto (a NF-e é sempre UTF-8). Baixe o XML da nota de novo, sem abrir e salvar em outro programa.');
  }
  if (!texto.trimStart().startsWith('<')) return recusa('Isto não parece um XML. Envie o arquivo .xml da nota.');
  if (/<!\s*(?:DOCTYPE|ENTITY|ELEMENT|ATTLIST|NOTATION)/i.test(texto) || /<\?(?!xml\s)/i.test(texto)) return recusa(FRASE_PERIGO);
  // Toda entidade tem de ser uma das cinco do XML ou uma referência numérica; qualquer outra (inclusive "&xxe;") é recusada.
  for (const m of texto.matchAll(/&([^;&<>\s]{0,40});?/g)) {
    if (!/^(?:amp|lt|gt|quot|apos|#\d{1,7}|#x[0-9a-fA-F]{1,6});$/.test(`${m[1]};`) || !m[0].endsWith(';')) return recusa(FRASE_PERIGO);
  }
  if (/<\/?\s*(?:__proto__|constructor|prototype)[\s/>]/i.test(texto)) return recusa(FRASE_PERIGO);
  const { tags, profundidade } = medirEstrutura(texto);
  if (tags > LIMITES_DO_XML.tags || profundidade > LIMITES_DO_XML.profundidade) {
    return recusa('Este XML é complicado demais para uma NF-e (elementos demais ou aninhados demais). Se é mesmo uma nota, baixe o arquivo de novo.');
  }
  return { ok: true, texto };
}

// ------------------------------------------------------------ navegar no que o leitor devolveu

type Nó = Record<string, unknown>;
const ehNó = (v: unknown): v is Nó => typeof v === 'object' && v !== null && !Array.isArray(v);
const filho = (n: unknown, nome: string): unknown => (ehNó(n) && Object.hasOwn(n, nome) ? n[nome] : undefined);
const caminho = (n: unknown, ...nomes: string[]): unknown => nomes.reduce<unknown>((acc, nome) => filho(acc, nome), n);
/** Texto do elemento ou do atributo (decodificado e limpo); vazio ou ausente = undefined. */
function texto(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = limparTexto(decodificar(v)).trim().replace(/\s+/g, ' ');
  return t || undefined;
}
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]);

/** Quando o leitor devolve um array onde esperávamos um elemento só (a nota repetida), o arquivo tem mais de uma nota. */
const unico = (v: unknown): unknown => (Array.isArray(v) ? (v.length === 1 ? v[0] : '__varios__') : v);

function dinheiro(n: unknown, campo: string, obrigatorio: boolean, onde: string): { ok: true; v: number } | { ok: false; erro: string } {
  const t = texto(filho(n, campo));
  if (t === undefined) return obrigatorio ? { ok: false, erro: `${onde}: falta o valor ${campo}.` } : { ok: true, v: 0 };
  const v = lerCentavosDoXml(t);
  if (v === null) return { ok: false, erro: `${onde}: o valor ${campo} (“${t.slice(0, 20)}”) não está no formato esperado (número com ponto e até 2 casas, como 149.70).` };
  return { ok: true, v };
}

const dataLocal = (iso: string) => iso.slice(0, 10);
const FORMATO_DHEMI = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Data no relógio do Rio ("2026-10-21") de um dhEmi com fuso; null se não for data. */
function dataNoRio(dh: string): string | null {
  const m = FORMATO_DHEMI.exec(dh);
  if (!m) return null;
  const instante = new Date(dh);
  if (Number.isNaN(instante.getTime())) return null;
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instante);
}

// ------------------------------------------------------------ o leitor

/** A abertura de `nfeProc` ou de `NFe` (com ou sem prefixo) declara o esquema oficial da NF-e. */
function declaraOEsquemaDaNfe(t: string): boolean {
  const declara = new RegExp(`\\sxmlns(?::[\\w.-]+)?\\s*=\\s*["']${NAMESPACE_DA_NFE.replace(/[./]/g, '\\$&')}["']`);
  for (const abertura of [/<(?:[\w.-]+:)?nfeProc\b[^>]*>/, /<(?:[\w.-]+:)?NFe\b[^>]*>/]) {
    const m = abertura.exec(t);
    if (m && declara.test(m[0])) return true;
  }
  return false;
}

const PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  processEntities: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  allowBooleanAttributes: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
  isArray: (nome) => nome === 'det' || nome === 'dup',
});

/**
 * Lê o XML de uma NF-e autorizada. `agora`: o relógio (os testes o fixam). Qualquer problema vira uma frase; nada é lançado.
 */
export function lerNfeXml(bytes: Uint8Array, agora: Date = new Date()): ResultadoDoXml {
  const antes = conferirAntes(bytes);
  if (!antes.ok) return antes;
  const validacao = XMLValidator.validate(antes.texto);
  if (validacao !== true) {
    return recusa(`O arquivo não é um XML bem formado (linha ${validacao.err.line}). Baixe o XML da nota de novo, sem abrir e salvar em outro programa.`);
  }
  let bruto: unknown;
  try {
    bruto = PARSER.parse(antes.texto);
  } catch {
    return recusa('Não consegui ler este XML. Baixe o XML da nota de novo, sem abrir e salvar em outro programa.');
  }
  const r = extrair(bruto, agora, antes.texto);
  if (!r.ok) return r;
  return { ok: true, nota: r.nota, sha256: createHash('sha256').update(bytes).digest('hex'), texto: antes.texto };
}

function extrair(bruto: unknown, agora: Date, original: string): { ok: true; nota: NotaDoXml } | { ok: false; erro: string } {
  if (!ehNó(bruto)) return recusa('Este XML não é uma NF-e.');
  const raizes = Object.keys(bruto).filter((k) => !k.startsWith('?'));
  if (raizes.length !== 1) return recusa('Este XML não é uma NF-e: esperava uma nota só no arquivo.');
  const nomeDaRaiz = raizes[0];
  if (nomeDaRaiz === 'resNFe') return recusa('Este arquivo é só o resumo da nota, não a nota completa. Peça ao fornecedor o XML completo, com a autorização.');
  if (nomeDaRaiz === 'procEventoNFe' || nomeDaRaiz === 'evento' || nomeDaRaiz === 'retEvento' || nomeDaRaiz === 'envEvento') {
    return recusa('Isto é um evento da nota (cancelamento, ciência ou carta de correção), não a nota. Envie o XML da nota autorizada.');
  }
  if (nomeDaRaiz === 'NFe') {
    return recusa('Este XML é de uma nota que ainda não foi autorizada pela Receita. Peça ao fornecedor o XML da nota já autorizada.');
  }
  if (nomeDaRaiz !== 'nfeProc') return recusa('Este XML não é de uma nota fiscal eletrônica (NF-e) autorizada. Envie o XML da nota que o fornecedor emitiu.');

  const proc = bruto.nfeProc;
  const nfe = unico(filho(proc, 'NFe'));
  const prot = unico(filho(proc, 'protNFe'));
  if (nfe === '__varios__' || prot === '__varios__') return recusa('Este arquivo tem mais de uma nota. Envie um XML por nota.');
  if (!ehNó(nfe)) return recusa('Este XML não traz a nota dentro dele. Baixe o arquivo de novo.');
  if (!ehNó(prot)) {
    return recusa('Este XML não traz a autorização da Receita: é a nota antes de ser autorizada. Peça ao fornecedor o XML da nota já autorizada.');
  }
  // O leitor descarta os atributos xmlns: o esquema se confere no texto, na abertura do nfeProc ou da NFe.
  if (!declaraOEsquemaDaNfe(original)) return recusa('Este XML não é de uma nota fiscal eletrônica (NF-e) do padrão brasileiro.');
  if (texto(filho(proc, '@_versao')) !== '4.00') return recusa('Só leio NF-e na versão 4.00. Este arquivo é de outra versão.');
  const inf = filho(nfe, 'infNFe');
  if (!ehNó(inf) || texto(filho(inf, '@_versao')) !== '4.00') return recusa('Só leio NF-e na versão 4.00. Este arquivo é de outra versão.');
  const id = texto(filho(inf, '@_Id'));
  const chaveDoId = id && /^NFe(\d{44})$/.exec(id)?.[1];
  if (!chaveDoId) return recusa('A chave de acesso da nota está torta: precisa ter 44 números.');

  // O protocolo.
  const infProt = filho(prot, 'infProt');
  const cStat = texto(caminho(infProt, 'cStat'));
  if (cStat !== '100' && cStat !== '150') {
    return recusa('Esta nota não está com o uso autorizado (pode ter sido denegada, cancelada ou rejeitada pela Receita). Só entra nota autorizada: confira com o fornecedor.');
  }
  if (texto(caminho(infProt, 'chNFe')) !== chaveDoId) return recusa('A chave do protocolo não é a chave da nota. O arquivo foi alterado ou está misturado com outra nota.');
  if (texto(caminho(infProt, 'tpAmb')) === '2') return recusa('Esta é uma nota de HOMOLOGAÇÃO (teste), sem valor fiscal. Ela não entra como compra.');

  // A identificação.
  const ide = filho(inf, 'ide');
  const modelo = texto(caminho(ide, 'mod'));
  if (modelo === '65') return recusa('Isto é uma NFC-e (cupom fiscal de consumidor). Aqui entra só NF-e, modelo 55.');
  if (modelo !== '55') return recusa(`Aqui entra só NF-e, modelo 55. Este documento é do modelo ${modelo ?? 'ausente'}.`);
  if (texto(caminho(ide, 'tpAmb')) !== '1') return recusa('Esta nota não é do ambiente de produção. Ela não entra como compra.');
  if (texto(caminho(ide, 'tpNF')) !== '1') return recusa('Esta nota é de ENTRADA do próprio emitente (não é uma venda dele para você). Ela não entra como compra do fornecedor.');
  if (texto(caminho(ide, 'finNFe')) !== '1') return recusa('Esta nota é complementar, de ajuste ou de devolução (não é uma venda normal). Lance à mão, com o que combinou com o fornecedor.');
  const serieTxt = texto(caminho(ide, 'serie'));
  const nNF = texto(caminho(ide, 'nNF'));
  if (!serieTxt || !/^\d{1,3}$/.test(serieTxt) || !nNF || !/^\d{1,9}$/.test(nNF)) return recusa('A série ou o número da nota estão fora do formato.');
  const serie = normalizarCodigo(serieTxt, 10);
  const numero = normalizarCodigo(nNF, 20);
  if (!serie || !numero) return recusa('A série ou o número da nota estão fora do formato.');
  const dhEmi = texto(caminho(ide, 'dhEmi'));
  const emitidaEm = dhEmi ? dataNoRio(dhEmi) : null;
  if (!dhEmi || !emitidaEm) return recusa('A data de emissão da nota está ausente ou fora do formato.');
  if (new Date(dhEmi).getTime() > agora.getTime() + 24 * 3600 * 1000) return recusa('A data de emissão da nota é futura. Confira o arquivo.');

  // Emitente e destinatário.
  const emit = filho(inf, 'emit');
  const dest = filho(inf, 'dest');
  const emitCnpj = texto(filho(emit, 'CNPJ'));
  const emitCpf = texto(filho(emit, 'CPF'));
  const emitDoc = emitCnpj ?? emitCpf;
  if (!emitDoc || !/^(\d{14}|\d{11})$/.test(emitDoc) || !documentoValido(emitDoc)) return recusa('O CNPJ (ou CPF) do emitente está ausente ou não passa na conferência dos dígitos verificadores.');
  const razao = texto(filho(emit, 'xNome'));
  if (!razao) return recusa('A nota não traz o nome (razão social) do emitente.');
  if (texto(filho(dest, 'CPF'))) return recusa('Esta nota é para uma pessoa física (CPF), não para uma loja. Ela não entra como compra.');
  const destDoc = texto(filho(dest, 'CNPJ'));
  if (!destDoc || !/^\d{14}$/.test(destDoc) || !documentoValido(destDoc)) return recusa('O CNPJ do destinatário da nota está ausente ou não passa na conferência dos dígitos verificadores.');

  // A chave: dígito verificador e coerência com o resto do documento.
  if (!chaveValida(chaveDoId)) return recusa('A chave de acesso da nota não passa na conferência do dígito verificador. O arquivo foi alterado ou está incompleto.');
  const aamm = `${dhEmi.slice(2, 4)}${dhEmi.slice(5, 7)}`;
  const coerente =
    chaveDoId.slice(0, 2) === (texto(caminho(ide, 'cUF')) ?? '') &&
    chaveDoId.slice(2, 6) === aamm &&
    chaveDoId.slice(6, 20) === emitDoc.padStart(14, '0') &&
    chaveDoId.slice(20, 22) === '55' &&
    Number(chaveDoId.slice(22, 25)) === Number(serieTxt) &&
    Number(chaveDoId.slice(25, 34)) === Number(nNF);
  if (!coerente) return recusa('A chave de acesso não combina com os dados da nota (estado, mês, CNPJ, série ou número). O arquivo foi alterado.');

  // Os itens.
  const dets = lista(filho(inf, 'det'));
  if (dets.length === 0) return recusa('A nota não tem nenhum item.');
  if (dets.length > LIMITES_DO_XML.itens) return recusa(`Esta nota tem ${dets.length} itens e o limite da importação é ${LIMITES_DO_XML.itens}. Lance à mão, em partes.`);
  const itens: ItemDoXml[] = [];
  const vistos = new Set<number>();
  for (const det of dets) {
    const nItem = Number(texto(filho(det, '@_nItem')));
    if (!Number.isInteger(nItem) || nItem < 1 || nItem > 990 || vistos.has(nItem)) return recusa('Os itens da nota estão numerados de um jeito inesperado.');
    vistos.add(nItem);
    const item = lerItem(det, nItem);
    if (!item.ok) return item;
    itens.push(item.item);
  }

  // Os totais.
  const tot = caminho(inf, 'total', 'ICMSTot');
  if (!ehNó(tot)) return recusa('A nota não traz os totais (ICMSTot).');
  const v: Record<string, number> = {};
  for (const [campo, obrigatorio] of [['vProd', true], ['vDesc', false], ['vFrete', false], ['vSeg', false], ['vOutro', false], ['vIPI', false], ['vST', false], ['vFCPST', false], ['vICMSDeson', false], ['vII', false], ['vIPIDevol', false], ['vNF', true]] as const) {
    const d = dinheiro(tot, campo, obrigatorio, 'Nos totais da nota');
    if (!d.ok) return recusa(d.erro);
    v[campo] = d.v;
  }

  // As duplicatas: só guardadas.
  const dups = lista(caminho(inf, 'cobr', 'dup'));
  if (dups.length > LIMITES_DO_XML.duplicatas) return recusa('A nota tem parcelas demais na cobrança.');
  const duplicatas: NotaDoXml['duplicatas'] = [];
  for (const d of dups) {
    const venc = texto(filho(d, 'dVenc'));
    const valor = lerCentavosDoXml(texto(filho(d, 'vDup')));
    if (!venc || !/^\d{4}-\d{2}-\d{2}$/.test(venc) || valor === null) return recusa('Uma das parcelas da cobrança está fora do formato.');
    duplicatas.push({ numero: (texto(filho(d, 'nDup')) ?? '').slice(0, 20), vencimento: venc, valorCentavos: valor });
  }

  const cep = texto(caminho(emit, 'enderEmit', 'CEP'));
  const ufTxt = texto(caminho(emit, 'enderEmit', 'UF'))?.toUpperCase();
  const ieTxt = texto(filho(emit, 'IE'));
  const endereco = [texto(caminho(emit, 'enderEmit', 'xLgr')), texto(caminho(emit, 'enderEmit', 'nro')), texto(caminho(emit, 'enderEmit', 'xBairro'))].filter(Boolean).join(', ');
  return {
    ok: true,
    nota: {
      chaveAcesso: chaveDoId,
      modelo: 55,
      serie,
      numero,
      emitidaEm,
      protocolo: { cStat, nProt: texto(caminho(infProt, 'nProt')) ?? null },
      emitente: {
        documento: emitDoc,
        razao: razao.slice(0, 120),
        fantasia: texto(filho(emit, 'xFant'))?.slice(0, 120) ?? null,
        inscricaoEstadual: ieTxt ? normalizarInscricao(ieTxt) : null,
        uf: ufTxt && (UFS as readonly string[]).includes(ufTxt) ? ufTxt : null,
        municipio: texto(caminho(emit, 'enderEmit', 'xMun'))?.slice(0, 60) ?? null,
        endereco: endereco ? endereco.slice(0, 200) : null,
        cep: cep && /^\d{8}$/.test(cep) ? cep : null,
      },
      destinatarioDocumento: destDoc,
      totais: {
        vProdCentavos: v.vProd,
        vDescCentavos: v.vDesc,
        vFreteCentavos: v.vFrete,
        vSegCentavos: v.vSeg,
        vOutroCentavos: v.vOutro,
        vIpiCentavos: v.vIPI,
        vStCentavos: v.vST + v.vFCPST,
        vNfCentavos: v.vNF,
        temAjusteQueNaoLanca: v.vICMSDeson > 0 || v.vII > 0 || v.vIPIDevol > 0,
      },
      duplicatas,
      itens,
    },
  };
}

function lerItem(det: unknown, nItem: number): { ok: true; item: ItemDoXml } | { ok: false; erro: string } {
  const onde = `Item ${nItem}`;
  const prod = filho(det, 'prod');
  if (!ehNó(prod)) return recusa(`${onde}: faltam os dados do produto.`);
  const codigo = texto(filho(prod, 'cProd'));
  const descricao = texto(filho(prod, 'xProd'));
  const unidade = texto(filho(prod, 'uCom'));
  if (!codigo || codigo.length > 60) return recusa(`${onde}: o código do produto está ausente ou longo demais.`);
  if (!descricao) return recusa(`${onde}: falta a descrição do produto.`);
  if (!unidade || unidade.length > 10) return recusa(`${onde}: a unidade comercial está ausente ou fora do formato.`);
  if (texto(filho(prod, 'indTot')) === '0') return recusa(`${onde}: este item não entra no total da nota. Lance à mão.`);
  const qTxt = texto(filho(prod, 'qCom'));
  const qCom = lerMilesimosDoXml(qTxt);
  if (qCom === null) return recusa(`${onde}: a quantidade (“${(qTxt ?? '').slice(0, 20)}”) não está no formato esperado (número com ponto, até 4 casas, maior que zero).`);
  const campos: Record<string, number> = {};
  for (const [campo, obrigatorio] of [['vProd', true], ['vDesc', false], ['vOutro', false], ['vSeg', false], ['vFrete', false]] as const) {
    const d = dinheiro(prod, campo, obrigatorio, onde);
    if (!d.ok) return recusa(d.erro);
    campos[campo] = d.v;
  }
  // IPI e ICMS ST estão dentro de "imposto": a pasta do ICMS tem UM filho (ICMS00, ICMS10, ICMSSN201...).
  const imposto = filho(det, 'imposto');
  const ipi = dinheiro(caminho(imposto, 'IPI', 'IPITrib'), 'vIPI', false, onde);
  if (!ipi.ok) return recusa(ipi.erro);
  const icms = filho(imposto, 'ICMS');
  const grupo = ehNó(icms) ? Object.values(icms).find(ehNó) : undefined;
  const st = dinheiro(grupo, 'vICMSST', false, onde);
  if (!st.ok) return recusa(st.erro);
  const fcpst = dinheiro(grupo, 'vFCPST', false, onde);
  if (!fcpst.ok) return recusa(fcpst.erro);
  const vSt = st.v + fcpst.v;
  const liquido = campos.vProd - campos.vDesc + campos.vOutro + campos.vSeg + ipi.v + vSt;
  if (liquido < 0) return recusa(`${onde}: o desconto é maior que o valor do item.`);
  if (liquido > TETO) return recusa(`${onde}: o valor passa do limite do sistema.`);
  const gtin = texto(filho(prod, 'cEAN'));
  const ncm = texto(filho(prod, 'NCM'));
  const cfop = texto(filho(prod, 'CFOP'));
  return {
    ok: true,
    item: {
      nItem,
      codigoProduto: codigo,
      gtin: gtin && /^\d{8}(\d{4,6})?$/.test(gtin) ? gtin : null,
      descricao: descricao.slice(0, 120),
      ncm: ncm && /^(\d{2}|\d{8})$/.test(ncm) ? ncm : null,
      cfop: cfop && /^\d{4}$/.test(cfop) ? cfop : null,
      unidadeComercial: unidade,
      qComTexto: (qTxt ?? '').slice(0, 20),
      qComMilesimos: qCom,
      vProdCentavos: campos.vProd,
      vDescCentavos: campos.vDesc,
      vOutroCentavos: campos.vOutro,
      vSegCentavos: campos.vSeg,
      vIpiCentavos: ipi.v,
      vStCentavos: vSt,
      vFreteCentavos: campos.vFrete,
      liquidoCentavos: liquido,
    },
  };
}

// ------------------------------------------------------------ 3.4: o rastro (lote e validade do fornecedor)

/** Um lote que o fornecedor declarou no item da NF-e (grupo `rastro`: nLote, qLote, dFab, dVal). */
export interface RastroDoXml {
  nLote: string;
  /** Quantidade do lote em milésimos da unidade comercial (null = ausente ou fora do formato). */
  qLoteMilesimos: number | null;
  /** aaaa-mm-dd; null = ausente ou data impossível. */
  dFab: string | null;
  dVal: string | null;
}

const DATA_DO_XML = /^(\d{4})-(\d{2})-(\d{2})$/;
function dataDoXml(t: string | undefined): string | null {
  const m = t ? DATA_DO_XML.exec(t) : null;
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? t!.slice(0, 10) : null;
}

/**
 * 3.4 (decisão 407): os lotes de cada item (por `nItem`) do XML que a F.1b JÁ guardou. É só SUGESTÃO para quem registra o lote
 * no recebimento: nada é lançado sozinho. O arquivo passa de novo pela conferência de antes do leitor (o mesmo limite e as
 * mesmas recusas); qualquer coisa estranha devolve vazio (sem sugestão), nunca erro. Lote sem número é ignorado.
 */
export function rastrosDoXmlGuardado(xml: string): Map<number, RastroDoXml[]> {
  const fora = new Map<number, RastroDoXml[]>();
  const antes = conferirAntes(new TextEncoder().encode(xml));
  if (!antes.ok) return fora;
  let bruto: unknown;
  try {
    bruto = PARSER.parse(antes.texto);
  } catch {
    return fora;
  }
  const nfe = unico(caminho(bruto, 'nfeProc', 'NFe'));
  for (const det of lista(caminho(nfe, 'infNFe', 'det'))) {
    const nItem = Number(texto(filho(det, '@_nItem')));
    if (!Number.isInteger(nItem) || nItem < 1 || nItem > 990) continue;
    const rastros: RastroDoXml[] = [];
    for (const r of lista(caminho(det, 'prod', 'rastro')).slice(0, 50)) {
      const nLote = texto(filho(r, 'nLote'))?.slice(0, 40);
      if (!nLote) continue;
      const q = texto(filho(r, 'qLote'));
      rastros.push({ nLote, qLoteMilesimos: q ? lerMilesimosDoXml(q) : null, dFab: dataDoXml(texto(filho(r, 'dFab'))), dVal: dataDoXml(texto(filho(r, 'dVal'))) });
    }
    if (rastros.length) fora.set(nItem, rastros);
  }
  return fora;
}
