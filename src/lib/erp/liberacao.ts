/**
 * Liberação de módulos por parceiro (decisão de Rodolfo de 25/10/2026: "cada módulo liberado individualmente por Rodolfo para
 * cada Parceiro Flow"; INT-1.1, decisão 482).
 *
 * Esta é a BASE da camada, não a rodada inteira (catálogo com cadeado, pedido do parceiro e central de solicitações continuam na
 * rodada da liberação). Os módulos de `MODULOS_COM_LIBERACAO` dependem dela e nascem bloqueados. Os
 * módulos que já existem seguem como estão: o estado inicial deles não foi decidido, e esta base não tira nem dá acesso a eles.
 *
 * Regras:
 *  - acesso efetivo = módulo liberado para o parceiro E a permissão da pessoa e da loja (a liberação não substitui a 0.4);
 *  - bloquear não apaga dado nem histórico; liberar de novo não restaura nada além do acesso;
 *  - quem grava é o nível 1 (o teste-guarda reprova chamar `mudarLiberacao` de rota do parceiro);
 *  - repetir a mesma mudança não cria registro nem histórico.
 */

import type { ClienteDoParceiro } from './tenant';
import type { AmbienteDeIntegracao } from '@prisma/client';
import { alcancaLoja, type Alcance } from './permissoes';

export const MODULOS_COM_LIBERACAO = ['integracao', 'consultoria-de-delivery'] as const;
export type ModuloComLiberacao = (typeof MODULOS_COM_LIBERACAO)[number];

export const ROTULO_DO_MODULO: Record<ModuloComLiberacao, string> = {
  integracao: 'Integração',
  'consultoria-de-delivery': 'Consultoria de Delivery',
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

export function recorteDaConsultoria(cliente: ClienteDoParceiro) {
  return cliente.liberacaoDeModulo.findUnique({
    where: { parceiroId_modulo: { parceiroId: cliente.parceiroId, modulo: 'consultoria-de-delivery' } },
    select: { liberado: true, consultoriaLojaId: true, consultoriaConexaoId: true },
  });
}

function origemDaConsultoria(ambiente: AmbienteDeIntegracao) {
  return { provedor: 'IFOOD', ambiente, estado: 'ATIVA', loja: { ativa: true }, modulos: { some: { modulo: 'ANALYTICS', estado: 'ATIVO' } } } as const;
}

export async function opcoesDeRecorteDaConsultoria(cliente: ClienteDoParceiro, ambiente: AmbienteDeIntegracao) {
  const origens = await cliente.integracaoConexao.findMany({
    where: origemDaConsultoria(ambiente),
    select: { id: true, nomeExterno: true, loja: { select: { nome: true } }, marca: { select: { nome: true } } },
    orderBy: [{ loja: { nome: 'asc' } }, { nomeExterno: 'asc' }, { id: 'asc' }],
  });
  return origens.map(origem => ({
    id: origem.id,
    rotulo: origem.marca && origem.marca.nome !== origem.nomeExterno
      ? `${origem.loja.nome} · ${origem.marca.nome} (${origem.nomeExterno})`
      : `${origem.loja.nome} · ${origem.nomeExterno}`,
  }));
}

/** Os módulos liberados para o parceiro (para o menu e o hub decidirem as abas que dependem de liberação). */
export async function modulosLiberados(cliente: ClienteDoParceiro, alcance?: Pick<Alcance, 'lojas'>): Promise<Set<ModuloComLiberacao>> {
  const linhas = await cliente.liberacaoDeModulo.findMany({
    where: { liberado: true },
    select: { modulo: true, consultoriaLojaId: true },
  });
  return new Set(linhas
    .filter(l => l.modulo !== 'consultoria-de-delivery' || (l.consultoriaLojaId && (!alcance || alcancaLoja(alcance, l.consultoriaLojaId))))
    .map(l => l.modulo).filter(ehModuloComLiberacao));
}

/** Nenhum módulo liberado: parceiro que não tem nenhum (o padrão de quem nasce). */
export const NENHUM_MODULO_LIBERADO: ReadonlySet<ModuloComLiberacao> = new Set();

/** Todos os módulos com liberação: o nível 1 vê as abas deles em qualquer parceiro (é quem libera). */
export const TODOS_OS_MODULOS_COM_LIBERACAO: ReadonlySet<ModuloComLiberacao> = new Set(MODULOS_COM_LIBERACAO);

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
export async function mudarLiberacao(
  cliente: ClienteDoParceiro, modulo: unknown, liberado: boolean, autorNome: string,
  recorteConsultoria?: { conexaoId: string; ambiente: AmbienteDeIntegracao },
): Promise<ResultadoDaLiberacao> {
  if (!ehModuloComLiberacao(modulo)) return { ok: false, erro: 'Módulo desconhecido.' };
  if (typeof liberado !== 'boolean') return { ok: false, erro: 'Diga se é para liberar ou bloquear.' };
  const habilitarConsultoria = modulo === 'consultoria-de-delivery' && liberado;
  if (habilitarConsultoria && (!recorteConsultoria?.conexaoId ||
      recorteConsultoria.conexaoId.length > 128 ||
      !['PRODUCAO', 'TEST'].includes(recorteConsultoria.ambiente))) {
    return { ok: false, erro: 'Escolha a loja e a origem Analytics da prévia.' };
  }
  const autor = String(autorNome ?? '').trim().slice(0, 120);
  if (!autor) return { ok: false, erro: 'Falta quem fez a mudança.' };
  return cliente.transacao(async (tx): Promise<ResultadoDaLiberacao> => {
    // Uma mudança por parceiro e módulo de cada vez: dois cliques ao mesmo tempo não gravam dois históricos.
    await tx.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`erp-liberacao:${tx.parceiroId}:${modulo}`}, 0))::text AS "trava"`;
    const atual = await tx.liberacaoDeModulo.findUnique({
      where: { parceiroId_modulo: { parceiroId: tx.parceiroId, modulo } },
      select: { id: true, liberado: true, consultoriaLojaId: true, consultoriaConexaoId: true },
    });
    if (habilitarConsultoria && !await moduloLiberado(tx, 'integracao')) {
      return { ok: false, erro: 'Libere Integração para este parceiro antes de configurar a origem da Consultoria.' };
    }
    const conexao = habilitarConsultoria && recorteConsultoria ? await tx.integracaoConexao.findFirst({
      where: { id: recorteConsultoria.conexaoId, ...origemDaConsultoria(recorteConsultoria.ambiente) },
      select: { id: true, lojaId: true },
    }) : null;
    if (habilitarConsultoria && !conexao) return { ok: false, erro: 'A origem escolhida precisa ter Analytics ativo neste parceiro e ambiente.' };
    const mudouRecorte = !!conexao && (atual?.consultoriaLojaId !== conexao.lojaId || atual?.consultoriaConexaoId !== conexao.id);
    if (atual?.liberado === liberado && !mudouRecorte) return { ok: true, mudou: false, liberado };
    if (!atual && !liberado) return { ok: true, mudou: false, liberado: false };
    const dados = {
      liberado, mudadoEm: new Date(), mudadoPorNome: autor,
      ...(conexao ? { consultoriaLojaId: conexao.lojaId, consultoriaConexaoId: conexao.id } : {}),
    };
    const linha = atual
      ? await tx.liberacaoDeModulo.update({ where: { id: atual.id }, data: dados, select: { id: true } })
      : await tx.liberacaoDeModulo.create({ data: { parceiroId: tx.parceiroId, modulo, ...dados }, select: { id: true } });
    const recorteAnterior = atual?.consultoriaConexaoId ? { lojaId: atual.consultoriaLojaId, conexaoId: atual.consultoriaConexaoId } : {};
    const recorteNovo = conexao ? { lojaId: conexao.lojaId, conexaoId: conexao.id } : recorteAnterior;
    await tx.historicoAlteracao.create({
      data: {
        parceiroId: tx.parceiroId,
        entidade: 'LiberacaoDeModulo',
        entidadeId: linha.id,
        acao: liberado ? atual?.liberado ? 'ALTEROU' : 'LIBEROU' : 'BLOQUEOU',
        antes: { modulo: ROTULO_DO_MODULO[modulo], situacao: atual?.liberado ? 'Liberado' : 'Bloqueado', ...recorteAnterior },
        depois: { modulo: ROTULO_DO_MODULO[modulo], situacao: liberado ? 'Liberado' : 'Bloqueado', ...recorteNovo },
        autorNome: autor,
      },
    });
    return { ok: true, mudou: true, liberado };
  });
}
