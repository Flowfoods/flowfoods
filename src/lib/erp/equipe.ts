/**
 * Equipe (0.4) — regras puras dos formulários de pessoa e de perfil, e o
 * "retrato" que vai para o histórico. Sem banco: quem grava é
 * `credenciais.ts` (único módulo das tabelas de acesso).
 *
 * O navegador manda texto e listas; aqui vira o que o banco guarda, só com
 * nomes do catálogo. Quem pode conceder o quê (sem escalada) é conferido no
 * servidor, com `cobre` (permissoes.ts), na transação da gravação.
 */

import { z } from 'zod';
import {
  normalizarPermissoes,
  normalizarSetores,
  PERFIS_BASE,
  rotuloDasLojas,
  rotuloDasPermissoes,
  rotuloDosSetores,
  TODAS_AS_PERMISSOES,
  type Permissao,
  type PerfilBase,
  type Setor,
} from './permissoes';

/** Valor do campo "perfil" do formulário: um base, ou `p:<id>` para perfil próprio. */
export const PREFIXO_PERFIL_PROPRIO = 'p:';

export interface PermissoesDaPessoa {
  perfil: { base: PerfilBase } | { proprioId: string };
  setores: Setor[];
  redeInteira: boolean;
  lojaIds: string[];
  extras: Permissao[];
  removidas: Permissao[];
}

/** Campo de formulário que pode vir uma vez (string) ou várias (lista). */
export function lista(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  return typeof v === 'string' && v !== '' ? [v] : [];
}

export type Lido<T> = { ok: true; dados: T } | { ok: false; erros: Partial<Record<string, string>> };

/**
 * Perfil, setores, lojas e ajustes de uma pessoa. Sem perfil: OPERADOR (menor
 * privilégio). Sem escolha de lojas: rede inteira (parceiro sem loja ainda).
 */
export function lerPermissoesDaPessoa(bruto: Record<string, unknown>): Lido<PermissoesDaPessoa> {
  const erros: Record<string, string> = {};
  const p = typeof bruto.perfil === 'string' && bruto.perfil ? bruto.perfil : 'OPERADOR';
  let perfil: PermissoesDaPessoa['perfil'];
  if (p.startsWith(PREFIXO_PERFIL_PROPRIO) && p.length > PREFIXO_PERFIL_PROPRIO.length && p.length < 80) {
    perfil = { proprioId: p.slice(PREFIXO_PERFIL_PROPRIO.length) };
  } else if (p in PERFIS_BASE) {
    perfil = { base: p as PerfilBase };
  } else {
    erros.perfil = 'Escolha um perfil.';
    perfil = { base: 'OPERADOR' };
  }

  const modo = bruto.lojas === 'escolhidas' ? 'escolhidas' : 'rede';
  const lojaIds = modo === 'escolhidas' ? Array.from(new Set(lista(bruto.lojaIds))).slice(0, 200) : [];
  if (modo === 'escolhidas' && lojaIds.length === 0) {
    erros.lojas = 'Marque pelo menos uma loja, ou escolha a rede inteira.';
  }

  if (Object.keys(erros).length) return { ok: false, erros };
  return {
    ok: true,
    dados: {
      perfil,
      setores: normalizarSetores(lista(bruto.setores)),
      redeInteira: modo === 'rede',
      lojaIds,
      extras: normalizarPermissoes(lista(bruto.extras)),
      removidas: normalizarPermissoes(lista(bruto.removidas)),
    },
  };
}

/**
 * Extras só o que o perfil NÃO dá; removidas só o que o perfil dá. Assim o
 * vínculo guarda o ajuste mínimo, e trocar de perfil não deixa lixo.
 */
export function ajusteMinimo(
  doPerfil: readonly Permissao[],
  extras: readonly Permissao[],
  removidas: readonly Permissao[],
): { extras: Permissao[]; removidas: Permissao[] } {
  const base = new Set(doPerfil);
  const tirar = new Set(removidas);
  return {
    extras: normalizarPermissoes(extras.filter((p) => !base.has(p) && !tirar.has(p))),
    removidas: normalizarPermissoes(removidas.filter((p) => base.has(p))),
  };
}

// ------------------------------------------------------------- perfil próprio

const NOMES_RESERVADOS = new Set(Object.values(PERFIS_BASE).map((b) => b.rotulo.toLowerCase()));

export const formPerfil = z.object({
  nome: z
    .string()
    .trim()
    .min(2, 'Dê um nome com pelo menos 2 letras. Ex.: Cozinha, Caixa da noite.')
    .max(40, 'Nome longo demais (máx. 40).')
    .transform((s) => s.replace(/\s+/g, ' '))
    .refine((s) => !NOMES_RESERVADOS.has(s.toLowerCase()), 'Esse nome já é de um perfil pronto. Use outro.'),
  base: z.enum(['DONO', 'GERENTE', 'OPERADOR'], { message: 'Escolha de qual perfil copiar.' }),
});

export interface DadosDoPerfil {
  nome: string;
  base: PerfilBase;
  permissoes: Permissao[];
  setores: Setor[];
}

export function lerPerfil(bruto: Record<string, unknown>): Lido<DadosDoPerfil> {
  const r = formPerfil.safeParse({ nome: bruto.nome, base: bruto.base });
  const erros: Record<string, string> = {};
  if (!r.success) for (const i of r.error.issues) erros[String(i.path[0] ?? 'geral')] ??= i.message;
  const permissoes = normalizarPermissoes(lista(bruto.permissoes));
  if (permissoes.length === 0) erros.permissoes = 'Marque pelo menos uma coisa que esse perfil pode fazer.';
  if (!r.success || Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, dados: { ...r.data, permissoes, setores: normalizarSetores(lista(bruto.setores)) } };
}

// --------------------------------------------------------- para o histórico

/**
 * Fotografia legível do acesso de uma pessoa (vai para o antes/depois do
 * histórico): nomes, não ids — o histórico não muda se a loja for renomeada.
 */
export function retratoDaPessoa(
  v: {
    perfilRotulo: string;
    setores: readonly string[];
    redeInteira: boolean;
    lojaIds: readonly string[];
    extras: readonly string[];
    removidas: readonly string[];
  },
  nomesDasLojas: ReadonlyMap<string, string>,
): Record<string, string> {
  const r: Record<string, string> = {
    perfil: v.perfilRotulo,
    setores: rotuloDosSetores(v.setores),
    lojas: rotuloDasLojas(v.redeInteira ? 'todas' : v.lojaIds, nomesDasLojas),
  };
  if (v.extras.length) r.permissoesExtras = rotuloDasPermissoes(v.extras);
  if (v.removidas.length) r.permissoesRemovidas = rotuloDasPermissoes(v.removidas);
  return r;
}

export function retratoDoPerfil(v: {
  nome: string;
  base: PerfilBase;
  permissoes: readonly string[];
  setores: readonly string[];
}) {
  return {
    nome: v.nome,
    base: PERFIS_BASE[v.base].rotulo,
    permissoes: `${normalizarPermissoes(v.permissoes).length} de ${TODAS_AS_PERMISSOES.length}`,
    setores: rotuloDosSetores(v.setores),
  };
}

/** O que entrou e o que saiu de uma lista de permissões (histórico de perfil). */
export function diferencaDePermissoes(antes: readonly string[], depois: readonly string[]) {
  const a = new Set(normalizarPermissoes(antes));
  const d = new Set(normalizarPermissoes(depois));
  const incluiu = TODAS_AS_PERMISSOES.filter((p) => d.has(p) && !a.has(p));
  const tirou = TODAS_AS_PERMISSOES.filter((p) => a.has(p) && !d.has(p));
  const r: Record<string, string> = {};
  if (incluiu.length) r.incluiu = rotuloDasPermissoes(incluiu);
  if (tirou.length) r.tirou = rotuloDasPermissoes(tirou);
  return r;
}

// --------------------------------------------------------- do formulário

/**
 * FormData → entrada das regras acima. `Object.fromEntries` perderia as listas
 * (setores, lojas, permissões marcadas): aqui elas vêm com `getAll`.
 */
export function entradaDoFormulario(form: FormData): Record<string, unknown> {
  const um = (k: string) => {
    const v = form.get(k);
    return typeof v === 'string' ? v : undefined;
  };
  const todos = (k: string) => form.getAll(k).filter((v): v is string => typeof v === 'string');
  return {
    id: um('id'),
    nome: um('nome'),
    email: um('email'),
    perfil: um('perfil'),
    base: um('base'),
    lojas: um('lojas'),
    lojaIds: todos('lojaIds'),
    setores: todos('setores'),
    extras: todos('extras'),
    removidas: todos('removidas'),
    permissoes: todos('permissoes'),
  };
}
