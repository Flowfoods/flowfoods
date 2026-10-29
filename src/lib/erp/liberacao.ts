/**
 * Liberação de módulos por parceiro (decisão de Rodolfo de 25/10/2026: "cada módulo liberado individualmente por Rodolfo para
 * cada Parceiro Flow"; INT-1.1, decisão 482).
 *
 * Esta é a BASE da camada, não a rodada inteira (catálogo com cadeado, pedido do parceiro e central de solicitações continuam na
 * rodada da liberação). Hoje só os módulos de `MODULOS_COM_LIBERACAO` dependem dela — o Integração, que nasce bloqueado. Os
 * módulos que já existem seguem como estão: o estado inicial deles não foi decidido, e esta base não tira nem dá acesso a eles.
 *
 * Regras:
 *  - acesso efetivo = módulo liberado para o parceiro E a permissão da pessoa e da loja (a liberação não substitui a 0.4);
 *  - bloquear não apaga dado nem histórico; liberar de novo não restaura nada além do acesso;
 *  - quem grava é o nível 1 (o teste-guarda reprova chamar `mudarLiberacao` de rota do parceiro);
 *  - repetir a mesma mudança não cria registro nem histórico.
 */

import type { ClienteDoParceiro } from './tenant';

export const MODULOS_COM_LIBERACAO = ['integracao'] as const;
export type ModuloComLiberacao = (typeof MODULOS_COM_LIBERACAO)[number];

export const ROTULO_DO_MODULO: Record<ModuloComLiberacao, string> = {
  integracao: 'Integração',
};

export function ehModuloComLiberacao(x: unknown): x is ModuloComLiberacao {
  return typeof x === 'string' && (MODULOS_COM_LIBERACAO as readonly string[]).includes(x);
}

/** O módulo está liberado para este parceiro? Sem registro, um módulo com liberação nasce bloqueado. */
export async function moduloLiberado(cliente: ClienteDoParceiro, modulo: ModuloComLiberacao): Promise<boolean> {
  const r = await cliente.liberacaoDeModulo.findUnique({
    where: { parceiroId_modulo: { parceiroId: cliente.parceiroId, modulo } },
    select: { liberado: true },
  });
  return r?.liberado ?? false;
}

export interface EstadoDaLiberacao {
  modulo: ModuloComLiberacao;
  rotulo: string;
  liberado: boolean;
  mudadoEm: Date | null;
  mudadoPorNome: string | null;
}

/** Todos os módulos com liberação, com o estado de agora neste parceiro (para a tela do nível 1). */
export async function liberacoesDoParceiro(cliente: ClienteDoParceiro): Promise<EstadoDaLiberacao[]> {
  const linhas = await cliente.liberacaoDeModulo.findMany({ select: { modulo: true, liberado: true, mudadoEm: true, mudadoPorNome: true } });
  return MODULOS_COM_LIBERACAO.map((modulo) => {
    const l = linhas.find((x) => x.modulo === modulo);
    return { modulo, rotulo: ROTULO_DO_MODULO[modulo], liberado: l?.liberado ?? false, mudadoEm: l?.mudadoEm ?? null, mudadoPorNome: l?.mudadoPorNome ?? null };
  });
}

export type ResultadoDaLiberacao = { ok: true; mudou: boolean; liberado: boolean } | { ok: false; erro: string };

/**
 * Liberar ou bloquear um módulo para o parceiro (nível 1). Mesma mudança repetida não grava nada. Grava o histórico do
 * parceiro na mesma transação: ou fica a mudança com o registro, ou nada.
 */
export async function mudarLiberacao(cliente: ClienteDoParceiro, modulo: unknown, liberado: boolean, autorNome: string): Promise<ResultadoDaLiberacao> {
  if (!ehModuloComLiberacao(modulo)) return { ok: false, erro: 'Módulo desconhecido.' };
  if (typeof liberado !== 'boolean') return { ok: false, erro: 'Diga se é para liberar ou bloquear.' };
  const autor = String(autorNome ?? '').trim().slice(0, 120);
  if (!autor) return { ok: false, erro: 'Falta quem fez a mudança.' };
  return cliente.transacao(async (tx): Promise<ResultadoDaLiberacao> => {
    // Uma mudança por parceiro e módulo de cada vez: dois cliques ao mesmo tempo não gravam dois históricos.
    await tx.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`erp-liberacao:${tx.parceiroId}:${modulo}`}, 0))::text AS "trava"`;
    const atual = await tx.liberacaoDeModulo.findUnique({ where: { parceiroId_modulo: { parceiroId: tx.parceiroId, modulo } }, select: { id: true, liberado: true } });
    if ((atual?.liberado ?? false) === liberado && atual) return { ok: true, mudou: false, liberado };
    if (!atual && !liberado) return { ok: true, mudou: false, liberado: false };
    const agora = new Date();
    const linha = atual
      ? await tx.liberacaoDeModulo.update({ where: { id: atual.id }, data: { liberado, mudadoEm: agora, mudadoPorNome: autor }, select: { id: true } })
      : await tx.liberacaoDeModulo.create({ data: { parceiroId: tx.parceiroId, modulo, liberado, mudadoEm: agora, mudadoPorNome: autor }, select: { id: true } });
    await tx.historicoAlteracao.create({
      data: {
        parceiroId: tx.parceiroId,
        entidade: 'LiberacaoDeModulo',
        entidadeId: linha.id,
        acao: liberado ? 'LIBEROU' : 'BLOQUEOU',
        antes: { modulo: ROTULO_DO_MODULO[modulo], situacao: atual?.liberado ? 'Liberado' : 'Bloqueado' },
        depois: { modulo: ROTULO_DO_MODULO[modulo], situacao: liberado ? 'Liberado' : 'Bloqueado' },
        autorNome: autor,
      },
    });
    return { ok: true, mudou: true, liberado };
  });
}
