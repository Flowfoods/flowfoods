/**
 * Central de Integrações (INT-1.1) — os apps da FlowFoods no provedor (tabela GLOBAL, sem parceiro). Só o nível 1 e o serviço
 * da integração chegam aqui: o teste-guarda reprova tocar `integracaoApp`/`integracaoToken` fora de `src/lib/integracoes/`, e o
 * papel do tenant não tem acesso no banco.
 *
 * O segredo nunca entra: o app guarda o NOME da variável do cofre (Dokploy). Ler o valor é do cofre (INT-1.2).
 */

import { prisma } from '@/lib/db';
import { ehErroDeUnicidade } from '@/lib/erp/tenant';
import { lerApp, type CampoDoApp, type DadosDoApp } from './campos';

export interface AppDeIntegracao extends DadosDoApp {
  id: string;
  estadoHomologacao: 'NAO_SE_APLICA' | 'PENDENTE' | 'EM_ANDAMENTO' | 'HOMOLOGADO' | 'RECUSADO';
  criadoEm: Date;
}

const SELECAO = {
  id: true,
  provedor: true,
  ambiente: true,
  nome: true,
  categoria: true,
  clientId: true,
  nomeDoSegredo: true,
  modulos: true,
  estadoHomologacao: true,
  criadoEm: true,
} as const;

export async function listarApps(): Promise<AppDeIntegracao[]> {
  return prisma.integracaoApp.findMany({ select: SELECAO, orderBy: [{ provedor: 'asc' }, { ambiente: 'asc' }, { nome: 'asc' }] });
}

export async function appPorId(id: string): Promise<AppDeIntegracao | null> {
  if (typeof id !== 'string' || id.length === 0 || id.length > 60) return null;
  return prisma.integracaoApp.findUnique({ where: { id }, select: SELECAO });
}

export type ResultadoDoApp = { ok: true; id: string } | { ok: false; erros: Partial<Record<CampoDoApp | 'geral', string>> };

/** Cadastra um app (nível 1). O mesmo Client ID no mesmo provedor e ambiente não entra duas vezes. */
export async function registrarApp(entrada: Record<string, unknown>, autorNome: string): Promise<ResultadoDoApp> {
  const lido = lerApp(entrada);
  if (!lido.ok) return { ok: false, erros: lido.erros };
  const autor = String(autorNome ?? '').trim().slice(0, 120);
  if (!autor) return { ok: false, erros: { geral: 'Falta quem cadastrou.' } };
  try {
    const app = await prisma.integracaoApp.create({
      data: { ...lido.dados, estadoHomologacao: lido.dados.ambiente === 'TEST' ? 'NAO_SE_APLICA' : 'PENDENTE', criadoPorNome: autor },
      select: { id: true },
    });
    return { ok: true, id: app.id };
  } catch (e) {
    if (ehErroDeUnicidade(e)) return { ok: false, erros: { clientId: 'Este Client ID já está cadastrado neste provedor e ambiente.' } };
    throw e;
  }
}
