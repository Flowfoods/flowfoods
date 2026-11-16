/**
 * Central de Integrações (INT-1.1) — os apps da FlowFoods no provedor (tabela GLOBAL, sem parceiro). Só o nível 1 e o serviço
 * da integração chegam aqui: o teste-guarda reprova tocar `integracaoApp`/`integracaoToken` fora de `src/lib/integracoes/`, e o
 * papel do tenant não tem acesso no banco.
 *
 * O segredo nunca entra: o app guarda o NOME da variável do cofre (Dokploy). Ler o valor é do cofre (INT-1.2).
 */

import { prisma } from '@/lib/db';
import type { SessaoErp } from '@/lib/erp/contexto-base';
import { ehErroDeUnicidade } from '@/lib/erp/tenant';
import { lerApp, type CampoDoApp, type DadosDoApp } from './campos';

export interface AppDeIntegracao extends DadosDoApp {
  id: string;
  estadoHomologacao: 'NAO_SE_APLICA' | 'PENDENTE' | 'EM_ANDAMENTO' | 'HOMOLOGADO' | 'RECUSADO';
  criadoEm: Date;
  atualizadoEm: Date;
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
  atualizadoEm: true,
} as const;

export async function listarApps(): Promise<AppDeIntegracao[]> {
  return prisma.integracaoApp.findMany({ select: SELECAO, orderBy: [{ provedor: 'asc' }, { ambiente: 'asc' }, { nome: 'asc' }] });
}

export async function appPorId(id: string): Promise<AppDeIntegracao | null> {
  if (typeof id !== 'string' || id.length === 0 || id.length > 60) return null;
  return prisma.integracaoApp.findUnique({ where: { id }, select: SELECAO });
}

const APP_IFOOD_DE_TESTE = { provedor: 'IFOOD', ambiente: 'TEST', categoria: 'TEST' } as const;
export const EVENTO_FINANCEIRO_INCLUIDO = 'integracao.app-teste-financial-incluido';

export function ehAppIfoodDeTeste(app: Pick<DadosDoApp, 'provedor' | 'ambiente' | 'categoria'>) {
  return app.provedor === APP_IFOOD_DE_TESTE.provedor && app.ambiente === APP_IFOOD_DE_TESTE.ambiente && app.categoria === APP_IFOOD_DE_TESTE.categoria;
}

export async function incluirFinanceiroNoAppDeTeste(appId: string, autor: SessaoErp): Promise<{ ok: true; mudou: boolean } | { ok: false; erro: string }> {
  if (typeof appId !== 'string' || !appId || appId.length > 60 || !autor.userId || !autor.autorNome.trim()) {
    return { ok: false, erro: 'Não foi possível identificar o app ou o responsável.' };
  }
  const alvo = { id: appId, ...APP_IFOOD_DE_TESTE };
  return prisma.$transaction(async (tx) => {
    // O mesmo UPDATE confere a ausência e acrescenta ao array atual, inclusive com dois envios simultâneos.
    const inclusao = await tx.integracaoApp.updateMany({
      where: { ...alvo, NOT: { modulos: { has: 'FINANCIAL' } } },
      data: { modulos: { push: 'FINANCIAL' } },
    });
    if (inclusao.count === 0) {
      const jaIncluido = await tx.integracaoApp.findFirst({ where: { ...alvo, modulos: { has: 'FINANCIAL' } }, select: { id: true } });
      if (jaIncluido) return { ok: true, mudou: false };
      return { ok: false, erro: 'Escolha um app do iFood com ambiente e categoria de teste.' };
    }
    await tx.auditLog.create({
      data: { userId: autor.userId, evento: EVENTO_FINANCEIRO_INCLUIDO, dados: { appId, modulo: 'FINANCIAL', autorNome: autor.autorNome.trim().slice(0, 120) } },
    });
    return { ok: true, mudou: true };
  });
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
