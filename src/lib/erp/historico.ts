/**
 * Leitura do `HistoricoAlteracao` para a tela: o que mudou, de quanto para
 * quanto, quem e quando. Puro na formatação (testável sem banco).
 */

import type { Prisma } from '@prisma/client';
import type { ClienteDoParceiro } from './tenant';
import { UNIDADES, formatarDinheiro, formatarQuantidade, type Unidade } from './unidades';

const ENTIDADE: Record<string, string> = {
  ParceiroFlow: 'Parceiro',
  Loja: 'Loja',
  Marca: 'Marca',
  Insumo: 'Insumo',
  AcessoParceiro: 'Acesso',
  PerfilAcesso: 'Perfil',
};

const ACAO: Record<string, string> = {
  CRIOU: 'Criou',
  ALTEROU: 'Alterou',
  ATIVOU: 'Ativou',
  SUSPENDEU: 'Suspendeu',
  CANCELOU: 'Cancelou',
  CORTOU: 'Cortou',
  DESATIVOU: 'Desativou',
  REATIVOU: 'Reativou',
  GEROU_LINK: 'Gerou link de',
  DEFINIU_SENHA: 'Definiu a senha do',
  TROCOU_SENHA: 'Trocou a senha do',
  ATIVOU_ROSTO: 'Ativou o rosto no',
  REMOVEU_ROSTO: 'Tirou o rosto do',
  EXCLUIU: 'Excluiu',
  LIBEROU_ENTRADA: 'Liberou a entrada do',
  PEDIU_SENHA_NOVA: 'Pediu senha nova no',
};

const CAMPO: Record<string, string> = {
  nome: 'nome',
  slug: 'link',
  status: 'status',
  unidade: 'unidade',
  conteudoMilesimos: 'embalagem',
  precoEmbalagemCentavos: 'preço',
  email: 'e-mail',
  linkValeAte: 'link vale até',
  senha: 'senha',
  aparelho: 'aparelho',
  perfil: 'perfil',
  setores: 'setores',
  lojas: 'lojas',
  permissoesExtras: 'pode a mais',
  permissoesRemovidas: 'tirado do perfil',
  permissoes: 'permissões',
  base: 'copiado de',
  incluiu: 'incluiu',
  tirou: 'tirou',
  tentativas: 'tentativas',
};

const STATUS: Record<string, string> = {
  ATIVO: 'Ativo',
  RASCUNHO: 'Aguardando liberação',
  SUSPENSO: 'Suspenso',
  DESATIVADO: 'Desativado',
};

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

export function rotuloEntidade(entidade: string): string {
  return ENTIDADE[entidade] ?? entidade;
}

export function rotuloAcao(acao: string): string {
  return ACAO[acao] ?? acao.charAt(0) + acao.slice(1).toLowerCase();
}

function valor(campo: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (campo === 'status' && typeof v === 'string') return STATUS[v] ?? v;
  if (campo.endsWith('Ate') && typeof v === 'string' && !Number.isNaN(Date.parse(v))) {
    return DATA_HORA.format(new Date(v)).replace(',', ' às');
  }
  if (campo.endsWith('Centavos') && typeof v === 'number') return formatarDinheiro(v);
  if (campo.endsWith('Milesimos') && typeof v === 'number') {
    return (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  }
  return String(v);
}

function objeto(j: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
}

export interface Mudanca {
  campo: string;
  antes: string | null;
  depois: string;
}

/** Só os campos que mudaram (ou, numa criação, o que nasceu). */
export function descreverMudancas(antesJ: Prisma.JsonValue | null, depoisJ: Prisma.JsonValue | null): Mudanca[] {
  const antes = objeto(antesJ);
  const depois = objeto(depoisJ);
  const campos = Array.from(new Set([...Object.keys(antes), ...Object.keys(depois)]));
  const criacao = Object.keys(antes).length === 0;
  // Quantidade com unidade junto ("1,5 kg") quando a linha diz a unidade; aí a
  // unidade não precisa de linha própria.
  const unidade = (o: Record<string, unknown>) =>
    typeof o.unidade === 'string' && o.unidade in UNIDADES ? (o.unidade as Unidade) : null;
  const juntarUnidade = campos.includes('conteudoMilesimos') && !!unidade(depois);
  const fmt = (c: string, o: Record<string, unknown>) =>
    c === 'conteudoMilesimos' && juntarUnidade && typeof o[c] === 'number' && unidade(o)
      ? formatarQuantidade(o[c] as number, unidade(o)!)
      : valor(c, o[c]);
  const out: Mudanca[] = [];
  for (const c of campos) {
    if (!criacao && JSON.stringify(antes[c]) === JSON.stringify(depois[c])) continue;
    if (c === 'unidade' && juntarUnidade && criacao) continue;
    out.push({
      campo: CAMPO[c] ?? c,
      antes: criacao ? null : fmt(c, antes),
      depois: fmt(c, depois),
    });
  }
  return out;
}

export async function listarHistorico(
  cliente: ClienteDoParceiro,
  filtro: { entidade?: string; entidades?: string[]; limite?: number } = {},
) {
  const entidades = filtro.entidades ?? (filtro.entidade ? [filtro.entidade] : null);
  const linhas = await cliente.historicoAlteracao.findMany({
    where: entidades ? { entidade: { in: entidades } } : undefined,
    orderBy: { ocorridoEm: 'desc' },
    take: filtro.limite ?? 100,
  });
  return linhas.map((h) => ({
    id: h.id,
    entidade: h.entidade,
    acao: h.acao,
    motivo: h.motivo,
    autorNome: h.autorNome,
    ocorridoEm: h.ocorridoEm,
    mudancas: descreverMudancas(h.antes, h.depois),
  }));
}

export type LinhaDeHistorico = Awaited<ReturnType<typeof listarHistorico>>[number];
