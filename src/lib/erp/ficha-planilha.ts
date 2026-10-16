/**
 * Planilha de fichas técnicas (1.2) — a parte PURA: ler o CSV, agrupar as
 * linhas por ficha e casar cada linha com um insumo do parceiro. Nada aqui
 * grava; quem grava é `ficha-importar.ts`, que usa o MESMO leitor do
 * formulário (`lerFormFicha`).
 *
 * Formato (o modelo para baixar está em `public/modelos/fichas-tecnicas.csv`):
 * UMA LINHA POR INSUMO; as colunas da ficha (tipo, rende, descrição, modo de
 * preparo) basta preencher numa linha da ficha.
 *
 *   ficha;tipo;rende;unidade_rende;descricao;modo_de_preparo;insumo;quantidade;unidade
 *
 * Aceita `;` (Excel em português) ou `,`, aspas no padrão CSV (modo de
 * preparo com quebra de linha), cabeçalho com ou sem acento, UTF-8 ou
 * Windows-1252 (o "CSV" do Excel brasileiro). Linha vazia é pulada.
 */

import { RENDE_DO_PREPARO, type EntradaDaFicha, type RendeEm, type TipoFicha } from './ficha-campos';

/**
 * 256 KB: ~5000 linhas de ficha. Também mantém o envio da confirmação (o
 * texto, em UTF-8, até o dobro) abaixo do limite padrão de 1 MB das server
 * actions — o limite global de 9 MB saiu na 1.3 (a foto tem rota própria).
 */
export const LIMITE_DA_PLANILHA = 256 * 1024;
export const LIMITE_DE_LINHAS = 5000;
/**
 * Fichas por arquivo (herança da 1.2): a importação grava tudo numa transação
 * com os insumos travados; 5000 fichas levavam ~26 s de 30. Com 300, fica na
 * casa de 2 s e a planilha grande é dividida, com a mensagem dizendo isso.
 */
export const LIMITE_DE_FICHAS = 300;

export interface ErroDeLinha {
  linha: number;
  mensagem: string;
}

/** Bytes do arquivo → texto: UTF-8 se for válido, senão Windows-1252. Tira o BOM. */
export function decodificarPlanilha(bytes: Uint8Array): string {
  let t: string;
  try {
    t = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    t = new TextDecoder('windows-1252').decode(bytes);
  }
  return t.replace(/^﻿/, '');
}

/** Registros do CSV, cada um com a linha do arquivo em que começa (1 = cabeçalho). */
export function lerCsv(texto: string): { linha: number; campos: string[] }[] {
  const primeira = texto.split(/\r?\n/, 1)[0] ?? '';
  const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ';' : ',';
  const registros: { linha: number; campos: string[] }[] = [];
  let campos: string[] = [];
  let campo = '';
  let aspas = false;
  let linha = 1;
  let inicio = 1;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else aspas = false;
      } else {
        if (c === '\n') linha++;
        campo += c;
      }
      continue;
    }
    if (c === '"' && campo === '') aspas = true;
    else if (c === sep) {
      campos.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      campos.push(campo);
      registros.push({ linha: inicio, campos });
      campos = [];
      campo = '';
      linha++;
      inicio = linha;
    } else campo += c;
  }
  if (campo !== '' || campos.length > 0) {
    campos.push(campo);
    registros.push({ linha: inicio, campos });
  }
  return registros;
}

const semAcento = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const COLUNAS = {
  ficha: ['ficha', 'nome da ficha', 'receita', 'prato'],
  tipo: ['tipo'],
  rende: ['rende', 'rendimento'],
  unidadeRende: ['unidade rende', 'unidade do rendimento', 'rende em', 'unidade rendimento'],
  descricao: ['descricao'],
  modoPreparo: ['modo de preparo', 'modo preparo', 'preparo'],
  insumo: ['insumo', 'ingrediente'],
  quantidade: ['quantidade', 'qtd', 'qtde'],
  unidade: ['unidade', 'medida'],
} as const;
type Coluna = keyof typeof COLUNAS;
const OBRIGATORIAS: Coluna[] = ['ficha', 'insumo', 'quantidade', 'unidade'];

export const CABECALHO_DO_MODELO = 'ficha;tipo;rende;unidade_rende;descricao;modo_de_preparo;insumo;quantidade;unidade';

/** Uma ficha como veio na planilha, ainda com nomes de insumo (texto). */
export interface FichaDaPlanilha {
  nome: string;
  primeiraLinha: number;
  linhas: number[];
  tipo: TipoFicha;
  rende: string;
  rendeEm: RendeEm | '';
  descricao: string;
  modoPreparo: string;
  itens: { linha: number; insumo: string; quantidade: string; unidade: string }[];
  erros: ErroDeLinha[];
}

export interface LeituraDaPlanilha {
  fichas: FichaDaPlanilha[];
  /** Erros que não são de uma ficha (cabeçalho, linha sem nome de ficha). */
  erros: ErroDeLinha[];
  linhasLidas: number;
}

function lerTipo(v: string): TipoFicha | null {
  const t = semAcento(v).replace(/[-_]/g, ' ');
  if (t === '' || t === 'prato') return 'PRATO';
  if (t === 'pre preparo' || t === 'preparo' || t === 'prepreparo') return 'PRE_PREPARO';
  return null;
}

function lerRendeEm(v: string, tipo: TipoFicha): RendeEm | '' | null {
  const t = semAcento(v);
  if (tipo === 'PRATO') return ['', 'porcao', 'porcoes', 'un', 'porc'].includes(t) ? 'porcao' : null;
  if (t === '') return '';
  const mapa: Record<string, RendeEm> = { kg: 'kg', quilo: 'kg', g: 'g', grama: 'g', gramas: 'g', l: 'L', litro: 'L', litros: 'L', ml: 'ml', un: 'un', unidade: 'un', unidades: 'un' };
  const r = mapa[t];
  return r && RENDE_DO_PREPARO.includes(r) ? r : null;
}

/** Sigla da quantidade do item, como o leitor da ficha entende (g, kg, ml, L, un). */
function siglaDaPlanilha(v: string): string {
  const t = semAcento(v).replace(/\.$/, '');
  const mapa: Record<string, string> = {
    g: 'g', gr: 'g', grama: 'g', gramas: 'g',
    kg: 'kg', quilo: 'kg', quilos: 'kg', kilo: 'kg',
    ml: 'ml', mililitro: 'ml', mililitros: 'ml',
    l: 'L', lt: 'L', litro: 'L', litros: 'L',
    un: 'un', und: 'un', unid: 'un', unidade: 'un', unidades: 'un', u: 'un',
  };
  return mapa[t] ?? v.trim();
}

const limpo = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/**
 * CSV → fichas agrupadas pelo nome (as linhas de uma ficha não precisam vir
 * juntas). Campo da ficha preenchido em duas linhas com valores diferentes é
 * erro na segunda. Ficha com qualquer erro não entra na importação.
 */
export function lerPlanilhaDeFichas(texto: string): LeituraDaPlanilha {
  const registros = lerCsv(texto);
  const erros: ErroDeLinha[] = [];
  if (registros.length === 0) return { fichas: [], erros: [{ linha: 1, mensagem: 'A planilha está vazia.' }], linhasLidas: 0 };
  if (registros.length > LIMITE_DE_LINHAS + 1) {
    return { fichas: [], erros: [{ linha: 1, mensagem: `Mais de ${LIMITE_DE_LINHAS} linhas: divida em arquivos menores.` }], linhasLidas: 0 };
  }

  const [cabecalho, ...corpo] = registros;
  const posicao = new Map<Coluna, number>();
  cabecalho.campos.forEach((nome, i) => {
    const n = semAcento(nome).replace(/[_]+/g, ' ').replace(/\s+/g, ' ');
    for (const [col, nomes] of Object.entries(COLUNAS) as [Coluna, readonly string[]][]) {
      if (nomes.includes(n) && !posicao.has(col)) posicao.set(col, i);
    }
  });
  const faltam = OBRIGATORIAS.filter((c) => !posicao.has(c));
  if (faltam.length > 0) {
    return {
      fichas: [],
      erros: [{ linha: 1, mensagem: `Faltam as colunas ${faltam.join(', ')} no cabeçalho. Use o modelo para baixar.` }],
      linhasLidas: 0,
    };
  }

  const porNome = new Map<string, FichaDaPlanilha>();
  // Tipo e unidade do rendimento já vistos por ficha (a primeira linha que preenche vale).
  const tipoVisto = new Map<string, TipoFicha>();
  const emVisto = new Map<string, string>();
  let linhasLidas = 0;
  for (const r of corpo) {
    const val = (c: Coluna) => (posicao.has(c) ? (r.campos[posicao.get(c)!] ?? '') : '');
    if (r.campos.every((x) => x.trim() === '')) continue;
    linhasLidas++;
    const nome = limpo(val('ficha'));
    if (!nome) {
      erros.push({ linha: r.linha, mensagem: 'Linha sem o nome da ficha (coluna “ficha”).' });
      continue;
    }
    let f = porNome.get(nome);
    if (!f) {
      f = { nome, primeiraLinha: r.linha, linhas: [], tipo: 'PRATO', rende: '', rendeEm: '', descricao: '', modoPreparo: '', itens: [], erros: [] };
      porNome.set(nome, f);
    }
    f.linhas.push(r.linha);

    // Campos da ficha: valem os da primeira linha que os preenche; divergência é erro.
    const tipoTxt = limpo(val('tipo'));
    if (tipoTxt) {
      const tipo = lerTipo(tipoTxt);
      if (!tipo) f.erros.push({ linha: r.linha, mensagem: `Tipo “${tipoTxt}” não existe: use prato ou pré-preparo.` });
      else if (tipoVisto.has(nome) && tipoVisto.get(nome) !== tipo) {
        f.erros.push({ linha: r.linha, mensagem: `Tipo diferente do que veio antes para “${nome}”.` });
      } else {
        f.tipo = tipo;
        tipoVisto.set(nome, tipo);
      }
    }
    for (const [col, chave, rotulo] of [
      ['rende', 'rende', 'rende'],
      ['descricao', 'descricao', 'descrição'],
      ['modoPreparo', 'modoPreparo', 'modo de preparo'],
    ] as const) {
      const v = col === 'modoPreparo' ? val(col).trim() : limpo(val(col));
      if (!v) continue;
      if (f[chave] && f[chave] !== v) f.erros.push({ linha: r.linha, mensagem: `${rotulo[0].toUpperCase()}${rotulo.slice(1)} diferente do que veio antes para “${nome}”.` });
      else f[chave] = v;
    }
    const emTxt = limpo(val('unidadeRende'));
    if (emTxt) {
      if (emVisto.has(nome) && emVisto.get(nome) !== emTxt) {
        f.erros.push({ linha: r.linha, mensagem: `Unidade do rendimento diferente do que veio antes para “${nome}”.` });
      } else emVisto.set(nome, emTxt);
    }

    const insumo = limpo(val('insumo'));
    const quantidade = limpo(val('quantidade'));
    const unidade = limpo(val('unidade'));
    if (!insumo) f.erros.push({ linha: r.linha, mensagem: 'Falta o nome do insumo.' });
    else f.itens.push({ linha: r.linha, insumo, quantidade, unidade: siglaDaPlanilha(unidade) });
  }

  // Unidade do rendimento: depende do tipo, que pode ter vindo depois.
  for (const f of porNome.values()) {
    const em = lerRendeEm(emVisto.get(f.nome) ?? '', f.tipo);
    if (em === null) {
      f.erros.push({
        linha: f.primeiraLinha,
        mensagem: f.tipo === 'PRATO' ? 'Prato rende em porções: deixe “unidade_rende” vazia ou escreva porção.' : 'Pré-preparo rende em kg, g, L, ml ou un.',
      });
    } else f.rendeEm = em;
  }
  if (porNome.size > LIMITE_DE_FICHAS) {
    return {
      fichas: [],
      erros: [{ linha: 1, mensagem: `A planilha tem ${porNome.size} fichas: importe até ${LIMITE_DE_FICHAS} por vez. Divida o arquivo e envie as partes uma de cada vez (reimportar não duplica).` }],
      linhasLidas,
    };
  }
  return { fichas: Array.from(porNome.values()), erros, linhasLidas };
}

/** Chave de busca de nome: sem diferença de maiúscula nem de espaço sobrando. */
export const chaveDeNome = (s: string) => s.replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');

/**
 * Casa os insumos da ficha com o cadastro (por nome, sem diferenciar
 * maiúscula). Não encontrado vira erro na linha e entra em `faltam` (a tela
 * sugere cadastrar). Devolve a entrada no formato do formulário e, para cada
 * item, a linha da planilha (o erro do leitor volta para a linha certa).
 */
export function casarComInsumos(
  f: FichaDaPlanilha,
  insumosPorNome: ReadonlyMap<string, { id: string }[]>,
): { entrada: EntradaDaFicha; linhaDoItem: number[]; faltam: string[]; erros: ErroDeLinha[] } {
  const erros: ErroDeLinha[] = [];
  const faltam: string[] = [];
  const itens: EntradaDaFicha['itens'] = [];
  const linhaDoItem: number[] = [];
  for (const i of f.itens) {
    const achados = insumosPorNome.get(chaveDeNome(i.insumo)) ?? [];
    if (achados.length === 0) {
      faltam.push(i.insumo);
      erros.push({ linha: i.linha, mensagem: `Insumo “${i.insumo}” não está cadastrado.` });
      continue;
    }
    if (achados.length > 1) {
      erros.push({ linha: i.linha, mensagem: `Há mais de um insumo chamado “${i.insumo}” (com maiúsculas diferentes): renomeie um deles.` });
      continue;
    }
    itens.push({ insumoId: achados[0].id, quantidade: i.quantidade, unidade: i.unidade });
    linhaDoItem.push(i.linha);
  }
  return {
    entrada: {
      nome: f.nome,
      tipo: f.tipo,
      rendimento: f.rende,
      rendimentoUnidade: f.rendeEm,
      descricao: f.descricao,
      modoPreparo: f.modoPreparo,
      itens,
    },
    linhaDoItem,
    faltam,
    erros,
  };
}
