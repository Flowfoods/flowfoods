/**
 * Ajuda contextual (0.6) — o registro, a resolução por permissão e o lint.
 *
 * O CONTEÚDO mora no código (`ajuda-textos.ts`), versionado junto com a tela:
 * muda no mesmo diff e é revisado com ele (decisão 110). A aula é filtrada pela
 * PERMISSÃO efetiva de quem lê, não por setor nem por nome de perfil (decisão
 * 113): o operador nem recebe o bloco sobre preço. Isso é conforto, não
 * segurança: o texto é documentação do produto, sem dado de nenhum parceiro, e
 * quem decide o que a pessoa pode continua sendo a página.
 *
 * Puro (sem Next, sem banco). O teste `tests/erp-ajuda.test.ts` reprova rota
 * sem ajuda, chave órfã, permissão inexistente, texto com jargão e texto
 * alterado sem subir a versão.
 */

import { pode, TODAS_AS_PERMISSOES, type Alcance, type Permissao } from './permissoes';
import { FORMATO_ID_DO_PONTO, type AreaDaAjuda, type EntradaParaATela } from './ajuda-rota';
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

/**
 * Ponto de ajuda (prioridade nº 1 de 23/10/2026): explicação curta que mora
 * JUNTO do campo, seção ou ação, aberta num card flutuante pelo botão do
 * próprio campo. Substitui o texto didático fixo embaixo do campo; o que é
 * indispensável para agir (unidade, obrigatório, erro, alerta) continua na tela.
 */
export interface Ponto {
  /** Kebab, único na entrada. O id completo é "chave.ponto": nunca renomear sem necessidade. */
  id: string;
  titulo: string;
  /** 1 a 3 blocos curtos (até 3 frases para todos). */
  blocos: Bloco[];
  /** Seção desta entrada que o "Ver passo a passo" abre na gaveta. */
  secao?: string;
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
  /**
   * A caixa nasce recolhida (uma linha "Como funciona" que abre): telas de contar, onde a lista precisa
   * ficar à vista no celular. Só muda o desenho; a lista de fechadas e a versão valem igual.
   */
  recolhida?: true;
  /** Pontos de ajuda junto de campos e seções (card flutuante). */
  pontos?: Ponto[];
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
    recolhida: e.recolhida === true,
    rotas: e.rotas,
    aula: e.aula.filter((b) => lido(b, alcance)).map((b) => b.texto),
    secoes: (e.secoes ?? [])
      .map((s) => ({ id: s.id, titulo: s.titulo, blocos: s.blocos.filter((b) => lido(b, alcance)).map((b) => b.texto) }))
      .filter((s) => s.blocos.length > 0),
    pontos: (e.pontos ?? [])
      .map((p) => ({ id: `${e.chave}.${p.id}`, titulo: p.titulo, blocos: p.blocos.filter((b) => lido(b, alcance)).map((b) => b.texto), secao: p.secao ?? null }))
      .filter((p) => p.blocos.length > 0),
  }));
}

/** "chave.ponto" de um ponto que existe no registro AGORA (lista branca do "visto" e do "não mostrar"). Outra coisa: null. */
export function pontoValido(item: unknown): string | null {
  if (typeof item !== 'string' || item.length > 101 || !FORMATO_ID_DO_PONTO.test(item)) return null;
  const [chave, ponto] = item.split('.');
  const e = entradaPorChave(chave);
  return e?.pontos?.some((p) => p.id === ponto) ? item : null;
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
    const idsDosPontos = new Set<string>();
    for (const p of e.pontos ?? []) {
      const ondeP = `${onde} ponto "${p.id}"`;
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id) || p.id.length > 40 || idsDosPontos.has(p.id)) erros.push(`${ondeP} com id inválido ou repetido`);
      idsDosPontos.add(p.id);
      if (p.blocos.length === 0 || p.blocos.length > 3) erros.push(`${ondeP} precisa de 1 a 3 blocos`);
      const livresP = p.blocos.filter((b) => !b.para);
      const frasesP = livresP.reduce((n, b) => n + contarFrases(b.texto), 0);
      if (livresP.length === 0 || frasesP < 1 || frasesP > 3) erros.push(`${ondeP} tem ${frasesP} frases para todos (de 1 a 3)`);
      if (p.secao && !ids.has(p.secao)) erros.push(`${ondeP} aponta para a seção "${p.secao}", que não existe nesta entrada`);
      for (const t of [p.titulo, ...p.blocos.map((b) => b.texto)]) for (const m of problemasDoTexto(t)) erros.push(`${ondeP} "${t.slice(0, 40)}": ${m}`);
      if (p.titulo.length > 60) erros.push(`${ondeP} título com mais de 60 caracteres`);
    }
    for (const b of [...e.aula, ...(e.secoes ?? []).flatMap((s) => s.blocos), ...(e.pontos ?? []).flatMap((p) => p.blocos)]) {
      for (const p of b.para ?? []) if (!TODAS_AS_PERMISSOES.includes(p)) erros.push(`${onde} permissão inexistente: ${p}`);
    }
  }
  return erros;
}

// ------------------------------------------------------------- a cobertura

/**
 * Toda rota do ERP tem exatamente uma entrada, e toda rota declarada existe.
 * `doParceiro` = páginas de `src/app/erp`; `doNivel1` = páginas de
 * `src/app/rodolfo/(painel)/erp/[slug]` (as duas relativas à base, no padrão do Next).
 * Entrada `soNivel1` só vale para rota que existe só no nível 1; as demais,
 * para rota que existe no /erp.
 */
export function coberturaDasRotas(
  doParceiro: readonly string[],
  doNivel1: readonly string[],
  entradas: readonly EntradaDeAjuda[] = ENTRADAS,
): { semAjuda: string[]; orfas: string[] } {
  const parceiro = new Set(doParceiro);
  const nivel1 = new Set(doNivel1);
  const declaradas = new Map<string, EntradaDeAjuda>();
  for (const e of entradas) for (const r of e.rotas) declaradas.set(r, e);
  const semAjuda = [...new Set([...parceiro, ...nivel1])].filter((r) => !declaradas.has(r)).sort();
  const orfas: string[] = [];
  for (const [r, e] of declaradas) {
    const existe = e.soNivel1 ? nivel1.has(r) && !parceiro.has(r) : parceiro.has(r);
    if (!existe) orfas.push(`${r} (${e.chave})`);
  }
  return { semAjuda, orfas: orfas.sort() };
}
