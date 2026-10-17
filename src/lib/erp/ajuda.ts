/**
 * Ajuda contextual (0.6) — o registro, a resolução por permissão e o lint.
 *
 * O CONTEÚDO mora no código (`ajuda-textos.ts`), versionado junto com a tela:
 * muda no mesmo diff e é revisado com ele (decisão 110). A aula é filtrada pela
 * PERMISSÃO efetiva de quem lê, não por setor nem por nome de perfil (decisão
 * 112): o operador nem recebe o bloco sobre preço. Isso é conforto, não
 * segurança: o texto é documentação do produto, sem dado de nenhum parceiro, e
 * quem decide o que a pessoa pode continua sendo a página.
 *
 * Puro (sem Next, sem banco). O teste `tests/erp-ajuda.test.ts` reprova rota
 * sem ajuda, chave órfã, permissão inexistente, texto com jargão e texto
 * alterado sem subir a versão.
 */

import { pode, TODAS_AS_PERMISSOES, type Alcance, type Permissao } from './permissoes';
import type { AreaDaAjuda, EntradaParaATela } from './ajuda-rota';
import { ENTRADAS } from './ajuda-textos';

export interface Bloco {
  texto: string;
  /** Só quem tem QUALQUER uma destas permissões lê o bloco. Sem `para`: todos. */
  para?: readonly Permissao[];
}

export interface Secao {
  id: string;
  titulo: string;
  blocos: Bloco[];
}

export interface EntradaDeAjuda {
  /** Identidade estável (kebab). É o que a pessoa "fechou": nunca renomear sem necessidade. */
  chave: string;
  area: AreaDaAjuda;
  /** Padrões do Next, relativos à base: `estoque/[lojaId]`; '' é o hub. */
  rotas: string[];
  titulo: string;
  /** Sobe quando o texto muda de verdade: a caixa volta (com "MUDOU") para quem tinha fechado. */
  versao: number;
  aula: Bloco[];
  secoes?: Secao[];
  /** Tela que só existe no nível 1 (Cadastro do parceiro): o parceiro nem recebe o texto. */
  soNivel1?: true;
}

export { ENTRADAS };

export function entradaPorChave(chave: string): EntradaDeAjuda | undefined {
  return ENTRADAS.find((e) => e.chave === chave);
}

function lido(b: Bloco, alcance: Alcance): boolean {
  return !b.para || b.para.some((p) => pode(alcance, p));
}

/**
 * O registro como a pessoa pode lê-lo: blocos fora do alcance dela saem (e
 * seção sem bloco some). É o que o layout entrega ao shell.
 */
export function ajudaParaATela(alcance: Alcance): EntradaParaATela[] {
  const nivel1 = alcance.nivel === 'FLOWFOODS';
  return ENTRADAS.filter((e) => !e.soNivel1 || nivel1).map((e) => ({
    chave: e.chave,
    titulo: e.titulo,
    versao: e.versao,
    area: e.area,
    rotas: e.rotas,
    aula: e.aula.filter((b) => lido(b, alcance)).map((b) => b.texto),
    secoes: (e.secoes ?? [])
      .map((s) => ({ id: s.id, titulo: s.titulo, blocos: s.blocos.filter((b) => lido(b, alcance)).map((b) => b.texto) }))
      .filter((s) => s.blocos.length > 0),
  }));
}

/** "chave@versão" de uma caixa que existe no registro AGORA (lista branca do "fechar"). Qualquer outra coisa: null. */
export function fechamentoValido(item: unknown): string | null {
  if (typeof item !== 'string' || item.length > 120) return null;
  const m = /^([a-z0-9-]{1,60})@([1-9][0-9]{0,3})$/.exec(item);
  if (!m) return null;
  const e = entradaPorChave(m[1]);
  return e && e.versao === Number(m[2]) ? item : null;
}

/** Lê a lista guardada: só texto no formato, sem repetição, no máximo 300. Lixo no banco não chega à tela. */
export function normalizarFechadas(lista: readonly unknown[] | null | undefined): string[] {
  const vistos = new Set<string>();
  for (const x of lista ?? []) {
    if (typeof x === 'string' && x.length <= 120 && /^[a-z0-9-]{1,60}@[1-9][0-9]{0,3}$/.test(x)) vistos.add(x);
  }
  return Array.from(vistos).slice(-300);
}

// ------------------------------------------------------------------ o lint

/** O que o texto de ajuda NÃO pode ter (jargão, tom de manual, marcação). */
const PROIBIDOS: { regex: RegExp; motivo: string }[] = [
  { regex: /\bservidor\b/i, motivo: 'jargão (diga "a conta é refeita na hora de salvar")' },
  { regex: /sistema calcula/i, motivo: 'jargão' },
  { regex: /\btenant\b/i, motivo: 'jargão' },
  { regex: /\bbanco\b/i, motivo: 'jargão' },
  { regex: /\bbigint\b/i, motivo: 'jargão' },
  { regex: /\bfra[çc][ãa]o\b/i, motivo: 'jargão' },
  { regex: /pontos?-base/i, motivo: 'jargão' },
  { regex: /\brls\b/i, motivo: 'jargão' },
  { regex: /clique aqui/i, motivo: 'link sem nome' },
  { regex: /!/, motivo: 'sem exclamação' },
  { regex: /\p{Extended_Pictographic}/u, motivo: 'sem emoji' },
  { regex: /[<>]/, motivo: 'sem HTML' },
  { regex: /\*\*|__|`/, motivo: 'sem markdown (o texto é puro)' },
];

export function problemasDoTexto(texto: string): string[] {
  const p: string[] = [];
  for (const { regex, motivo } of PROIBIDOS) if (regex.test(texto)) p.push(`${motivo}: ${regex}`);
  if (texto.length > 320) p.push(`bloco com ${texto.length} caracteres (máximo 320)`);
  if (texto.trim() !== texto || texto.length === 0) p.push('texto vazio ou com espaço nas pontas');
  return p;
}

/** Frases = pontuação final seguida de espaço ou do fim (decimal "1,18" e "R$ 5,00" não contam). */
export function contarFrases(texto: string): number {
  return (texto.match(/[.?…](?=\s|$)/g) ?? []).length;
}

/** Tudo o que o registro precisa cumprir, em frases. Vazio = ok. */
export function problemasDoRegistro(entradas: readonly EntradaDeAjuda[] = ENTRADAS): string[] {
  const erros: string[] = [];
  const chaves = new Set<string>();
  const rotas = new Map<string, string>();
  for (const e of entradas) {
    const onde = `[${e.chave}]`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.chave) || e.chave.length > 60) erros.push(`${onde} chave fora do padrão kebab`);
    if (chaves.has(e.chave)) erros.push(`${onde} chave repetida`);
    chaves.add(e.chave);
    if (!Number.isInteger(e.versao) || e.versao < 1 || e.versao > 9999) erros.push(`${onde} versão inválida`);
    if (e.rotas.length === 0) erros.push(`${onde} sem rota`);
    for (const r of e.rotas) {
      const dono = rotas.get(r);
      if (dono) erros.push(`${onde} rota "${r}" já é de [${dono}]`);
      rotas.set(r, e.chave);
    }
    for (const t of [e.titulo, ...e.aula.map((b) => b.texto), ...(e.secoes ?? []).flatMap((s) => [s.titulo, ...s.blocos.map((b) => b.texto)])]) {
      for (const m of problemasDoTexto(t)) erros.push(`${onde} "${t.slice(0, 40)}": ${m}`);
    }
    const livres = e.aula.filter((b) => !b.para);
    const frasesLivres = livres.reduce((n, b) => n + contarFrases(b.texto), 0);
    if (livres.length === 0) erros.push(`${onde} a aula precisa de ao menos um bloco para todos`);
    if (frasesLivres < 1 || frasesLivres > 4) erros.push(`${onde} a aula para todos tem ${frasesLivres} frases (de 1 a 4)`);
    const frasesTodas = e.aula.reduce((n, b) => n + contarFrases(b.texto), 0);
    if (frasesTodas > 7) erros.push(`${onde} a aula inteira tem ${frasesTodas} frases (máximo 7)`);
    const ids = new Set<string>();
    for (const s of e.secoes ?? []) {
      if (!/^[a-z0-9-]+$/.test(s.id) || ids.has(s.id)) erros.push(`${onde} seção "${s.id}" com id inválido ou repetido`);
      ids.add(s.id);
      if (s.blocos.length === 0 || s.blocos.length > 6) erros.push(`${onde} seção "${s.id}" precisa de 1 a 6 blocos`);
    }
    for (const b of [...e.aula, ...(e.secoes ?? []).flatMap((s) => s.blocos)]) {
      for (const p of b.para ?? []) if (!TODAS_AS_PERMISSOES.includes(p)) erros.push(`${onde} permissão inexistente: ${p}`);
    }
  }
  return erros;
}
