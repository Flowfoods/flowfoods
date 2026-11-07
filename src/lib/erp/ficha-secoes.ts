/** Classificação de fichas: todo acesso pelo tenant; nenhuma consulta ou DTO financeiro. */
import type { ClienteDoParceiro } from './tenant';
import { ehErroDeUnicidade } from './tenant';
import {
  idDeClassificacaoValido, lerClassificacaoDigitada, lerNomeDaClassificacao, TAMANHO_PAGINA_CLASSIFICACAO,
  type ClassificacaoDaFicha, type ClassificacaoDigitada, type PedidoBuscaClassificacao, type PedidoGestaoClassificacao,
  type RegistroDeClassificacao, type ResultadoBuscaClassificacao, type ResultadoGestaoClassificacao,
  type SecaoDaFicha, type SubsecaoDaFicha,
} from './ficha-secoes-campos';

const SECAO = { id: true, nome: true, ativa: true, atualizadoEm: true } as const;
const SUBSECAO = { ...SECAO, secaoId: true, secao: { select: { ativa: true } } } as const;
type LinhaSecao = { id: string; nome: string; ativa: boolean; atualizadoEm: Date };
type LinhaSubsecao = LinhaSecao & { secaoId: string; secao: { ativa: boolean } };
const secaoDto = (r: LinhaSecao): SecaoDaFicha => ({ id: r.id, nome: r.nome, ativa: r.ativa, versao: r.atualizadoEm.toISOString() });
const subsecaoDto = (r: LinhaSubsecao): SubsecaoDaFicha => ({ ...secaoDto(r), secaoId: r.secaoId, secaoAtiva: r.secao.ativa });
const secaoRegistro = (r: LinhaSecao): RegistroDeClassificacao => ({ nivel: 'secao', registro: secaoDto(r) });
const subsecaoRegistro = (r: LinhaSubsecao): RegistroDeClassificacao => ({ nivel: 'subsecao', registro: subsecaoDto(r) });
export const SELECAO_DA_CLASSIFICACAO = { secaoId: true, subsecaoId: true, secao: { select: SECAO }, subsecao: { select: SUBSECAO } } as const;
export function classificacaoDaLinha(f: { secao: LinhaSecao | null; subsecao: LinhaSubsecao | null }): ClassificacaoDaFicha {
  return { secao: f.secao ? secaoDto(f.secao) : null, subsecao: f.subsecao ? subsecaoDto(f.subsecao) : null };
}
const INDISPONIVEL = 'Essa classificação não está disponível. Escolha outra ou limpe a seleção.';
const CONFLITO = 'Alguém alterou esta classificação. Recarregue os nomes e tente de novo; nada foi gravado.';

export class ErroDeClassificacao extends Error {
  constructor(readonly erros: Record<string, string>) { super('Classificação recusada'); }
}

/** Ordem: grafo de fichas (quando houver) → taxonomia → seção → subseção → ficha. */
export async function travarClassificacao(tx: ClienteDoParceiro) {
  await tx.sql`SELECT 1 AS "ok" FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`ff:ficha-secoes:${tx.parceiroId}`}, 0))) AS "trava"`;
}
async function travarSecao(tx: ClienteDoParceiro, id: string) {
  await tx.sql`SELECT "id" FROM "SecaoFicha" WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ${id} FOR SHARE`;
}
async function travarSubsecao(tx: ClienteDoParceiro, id: string) {
  await tx.sql`SELECT "id" FROM "SubsecaoFicha" WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ${id} FOR SHARE`;
}
type Par = { secaoId?: string | null; subsecaoId?: string | null };

/** A chave pertence ao banco: lower Unicode pode variar entre locales, não refazemos em JS. */
async function chaveNoBanco(tx: ClienteDoParceiro, nome: string): Promise<string> {
  const [r] = await tx.sql<{ chave: string }>`SELECT "erp_chave_nome_classificacao_ficha"(${nome}) AS "chave"`;
  return r.chave;
}

export async function classificacaoDaFicha(cliente: ClienteDoParceiro, par: Par): Promise<ClassificacaoDaFicha> {
  return cliente.transacao(async tx => {
    const secao = par.secaoId ? await tx.secaoFicha.findUnique({ where: { id: par.secaoId }, select: SECAO }) : null;
    const subsecao = secao && par.subsecaoId ? await tx.subsecaoFicha.findFirst({ where: { id: par.subsecaoId, secaoId: secao.id }, select: SUBSECAO }) : null;
    return { secao: secao ? secaoDto(secao) : null, subsecao: subsecao ? subsecaoDto(subsecao) : null };
  }, { repetivel: true });
}

/** Só é chamada na transação que salva a ficha: erro posterior desfaz nomes e histórico juntos. */
export async function resolverClassificacao(tx: ClienteDoParceiro, entrada: unknown, atual: Par | null, autorNome: string) {
  await travarClassificacao(tx);
  const escolhas: ClassificacaoDigitada = entrada === undefined
    ? { secao: atual?.secaoId ? { tipo: 'existente', id: atual.secaoId } : { tipo: 'nenhuma' }, subsecao: atual?.subsecaoId ? { tipo: 'existente', id: atual.subsecaoId } : { tipo: 'nenhuma' } }
    : (() => { const r = lerClassificacaoDigitada(entrada); if (!r.ok) throw new ErroDeClassificacao(r.erros); return r.dados; })();
  if (escolhas.secao.tipo === 'nenhuma') return { secaoId: null, subsecaoId: null, classificacao: { secao: null, subsecao: null } as ClassificacaoDaFicha };
  let secao: LinhaSecao | null;
  if (escolhas.secao.tipo === 'existente') {
    await travarSecao(tx, escolhas.secao.id);
    secao = await tx.secaoFicha.findUnique({ where: { id: escolhas.secao.id }, select: SECAO });
  } else {
    secao = await tx.secaoFicha.findFirst({ where: { nomeChave: await chaveNoBanco(tx, escolhas.secao.nome) }, select: SECAO });
    if (!secao) {
      secao = await tx.secaoFicha.create({ data: { parceiroId: tx.parceiroId, nome: escolhas.secao.nome }, select: SECAO });
      await registrarCriacao(tx, 'SecaoFicha', secao, autorNome);
    }
    await travarSecao(tx, secao.id);
    secao = await tx.secaoFicha.findUnique({ where: { id: secao.id }, select: SECAO });
  }
  if (!secao) throw new ErroDeClassificacao({ secao: INDISPONIVEL });
  if (!secao.ativa && (escolhas.secao.tipo !== 'existente' || atual?.secaoId !== secao.id)) throw new ErroDeClassificacao({ secao: `A seção “${secao.nome}” já existe e está arquivada. Restaure-a em Gerenciar seções ou escolha outra.` });
  let subsecao: LinhaSubsecao | null = null;
  if (escolhas.subsecao.tipo !== 'nenhuma') {
    if (escolhas.subsecao.tipo === 'existente') {
      await travarSubsecao(tx, escolhas.subsecao.id);
      subsecao = await tx.subsecaoFicha.findFirst({ where: { id: escolhas.subsecao.id, secaoId: secao.id }, select: SUBSECAO });
    } else {
      if (!secao.ativa) throw new ErroDeClassificacao({ subsecao: `A seção “${secao.nome}” está arquivada. Restaure-a antes de criar uma subseção.` });
      subsecao = await tx.subsecaoFicha.findFirst({ where: { secaoId: secao.id, nomeChave: await chaveNoBanco(tx, escolhas.subsecao.nome) }, select: SUBSECAO });
      if (!subsecao) {
        subsecao = await tx.subsecaoFicha.create({ data: { parceiroId: tx.parceiroId, secaoId: secao.id, nome: escolhas.subsecao.nome }, select: SUBSECAO });
        await registrarCriacao(tx, 'SubsecaoFicha', subsecao, autorNome, secao);
      }
      await travarSubsecao(tx, subsecao.id);
      subsecao = await tx.subsecaoFicha.findUnique({ where: { id: subsecao.id }, select: SUBSECAO });
    }
    const preserva = escolhas.subsecao.tipo === 'existente' && atual?.secaoId === secao.id && atual?.subsecaoId === subsecao?.id;
    if (!subsecao) throw new ErroDeClassificacao({ subsecao: INDISPONIVEL });
    if ((!subsecao.ativa || !secao.ativa) && !preserva) throw new ErroDeClassificacao({ subsecao: !secao.ativa
      ? `A seção “${secao.nome}” está arquivada. Restaure-a antes de atribuir outra subseção.`
      : `A subseção “${subsecao.nome}” já existe e está arquivada. Restaure-a em Gerenciar seções ou escolha outra.` });
  }
  return { secaoId: secao.id, subsecaoId: subsecao?.id ?? null, classificacao: { secao: secaoDto(secao), subsecao: subsecao ? subsecaoDto(subsecao) : null } };
}

async function registrarCriacao(tx: ClienteDoParceiro, entidade: string, r: LinhaSecao, autorNome: string, secao?: LinhaSecao) {
  await tx.historicoAlteracao.create({ data: { parceiroId: tx.parceiroId, entidade, entidadeId: r.id, acao: 'CRIOU', autorNome,
    depois: { id: r.id, nome: r.nome, ativa: r.ativa, ...(secao ? { secaoId: secao.id, secao: secao.nome } : {}) } } });
}

export async function buscarClassificacao(cliente: ClienteDoParceiro, pedido: PedidoBuscaClassificacao): Promise<ResultadoBuscaClassificacao> {
  if (!pedido || !['formulario', 'filtro', 'gestao'].includes(pedido.contexto) || !['secao', 'subsecao'].includes(pedido.nivel)
    || (pedido.q !== undefined && (typeof pedido.q !== 'string' || pedido.q.length > 80))
    || (pedido.cursor !== undefined && !idDeClassificacaoValido(pedido.cursor))
    || (pedido.selecionados !== undefined && (!Array.isArray(pedido.selecionados) || pedido.selecionados.length > 200 || !pedido.selecionados.every(idDeClassificacaoValido)))) return { ok: false, erro: 'Busca inválida.' };
  if (pedido.nivel === 'subsecao' && !idDeClassificacaoValido(pedido.secaoId)) return { ok: false, erro: 'Escolha uma seção para buscar subseções.' };
  return cliente.transacao(async tx => {
    const pai = pedido.nivel === 'subsecao' ? await tx.secaoFicha.findUnique({ where: { id: pedido.secaoId! }, select: SECAO }) : null;
    if (pedido.nivel === 'subsecao' && !pai) return { ok: false, erro: INDISPONIVEL };
    const ativos = pedido.contexto === 'formulario';
    const nomeChave = { contains: await chaveNoBanco(tx, pedido.q ?? '') };
    const ids = [...new Set(pedido.selecionados ?? [])];
    const selecionados = pedido.nivel === 'secao'
      ? (await tx.secaoFicha.findMany({ where: { id: { in: ids } }, select: SECAO })).map(secaoRegistro)
      : (await tx.subsecaoFicha.findMany({ where: { id: { in: ids }, secaoId: pedido.secaoId }, select: SUBSECAO })).map(subsecaoRegistro);
    const cursor = pedido.cursor ? (pedido.nivel === 'secao'
      ? await tx.secaoFicha.findFirst({ where: { id: pedido.cursor, nomeChave, ...(ativos ? { ativa: true } : {}) }, select: { id: true, nomeChave: true } })
      : await tx.subsecaoFicha.findFirst({ where: { id: pedido.cursor, secaoId: pedido.secaoId, nomeChave, ...(ativos ? { ativa: true } : {}) }, select: { id: true, nomeChave: true } })) : null;
    if (pedido.cursor && !cursor) return { ok: false, erro: 'A busca mudou. Comece pela primeira página.' };
    const depois = cursor ? { OR: [{ nomeChave: { gt: cursor.nomeChave } }, { nomeChave: cursor.nomeChave, id: { gt: cursor.id } }] } : {};
    const comuns = { nomeChave, ...depois, ...(ativos ? { ativa: true } : {}) };
    const pagina = pedido.nivel === 'secao'
      ? (await tx.secaoFicha.findMany({ where: comuns, orderBy: [{ nomeChave: 'asc' }, { id: 'asc' }], take: TAMANHO_PAGINA_CLASSIFICACAO + 1, select: SECAO })).map(secaoRegistro)
      : ativos && !pai?.ativa ? [] : (await tx.subsecaoFicha.findMany({ where: { ...comuns, secaoId: pedido.secaoId }, orderBy: [{ nomeChave: 'asc' }, { id: 'asc' }], take: TAMANHO_PAGINA_CLASSIFICACAO + 1, select: SUBSECAO })).map(subsecaoRegistro);
    const itens = pagina.slice(0, TAMANHO_PAGINA_CLASSIFICACAO);
    const proximoCursor = pagina.length > itens.length ? itens[itens.length - 1].registro.id : null;
    const impacto: Record<string, { fichas: number; subsecoes: number }> = {};
    if (pedido.contexto === 'gestao') {
      const alvo = [...new Set([...itens, ...selecionados].map(r => r.registro.id))];
      for (const id of alvo) impacto[id] = { fichas: 0, subsecoes: 0 };
      if (pedido.nivel === 'secao') {
        for (const r of await tx.fichaTecnica.groupBy({ by: ['secaoId'], where: { secaoId: { in: alvo } }, _count: { _all: true } })) if (r.secaoId) impacto[r.secaoId].fichas = r._count._all;
        for (const r of await tx.subsecaoFicha.groupBy({ by: ['secaoId'], where: { secaoId: { in: alvo } }, _count: { _all: true } })) impacto[r.secaoId].subsecoes = r._count._all;
      } else for (const r of await tx.fichaTecnica.groupBy({ by: ['subsecaoId'], where: { subsecaoId: { in: alvo } }, _count: { _all: true } })) if (r.subsecaoId) impacto[r.subsecaoId].fichas = r._count._all;
    }
    return { ok: true, pagina: { itens, proximoCursor, selecionados, ...(pedido.contexto === 'gestao' ? { impacto } : {}) } };
  }, { repetivel: true });
}

export async function gerirClassificacao(cliente: ClienteDoParceiro, pedido: PedidoGestaoClassificacao, autorNome = 'Sistema'): Promise<ResultadoGestaoClassificacao> {
  if (!pedido || !['secao', 'subsecao'].includes(pedido.nivel) || !['renomear', 'arquivar', 'restaurar', 'excluir'].includes(pedido.intencao) || !idDeClassificacaoValido(pedido.id)) return { ok: false, erros: { geral: 'Pedido inválido.' } };
  const versao = new Date(typeof pedido.versao === 'string' ? pedido.versao : '');
  if (Number.isNaN(versao.getTime())) return { ok: false, erros: { geral: CONFLITO }, conflito: true };
  const nome = pedido.intencao === 'renomear' ? lerNomeDaClassificacao(pedido.nome) : null;
  if (nome && !nome.ok) return nome;
  try {
    return await cliente.transacao(async tx => {
      await travarClassificacao(tx);
      const filho = pedido.nivel === 'subsecao' ? await tx.subsecaoFicha.findUnique({ where: { id: pedido.id }, select: SUBSECAO }) : null;
      if (filho) await travarSecao(tx, filho.secaoId);
      if (pedido.nivel === 'secao') await tx.sql`SELECT "id" FROM "SecaoFicha" WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ${pedido.id} FOR UPDATE`;
      else await tx.sql`SELECT "id" FROM "SubsecaoFicha" WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ${pedido.id} FOR UPDATE`;
      const atual = pedido.nivel === 'secao'
        ? await tx.secaoFicha.findUnique({ where: { id: pedido.id }, select: SECAO })
        : await tx.subsecaoFicha.findUnique({ where: { id: pedido.id }, select: SUBSECAO });
      if (!atual) return { ok: false, erros: { geral: INDISPONIVEL } };
      const registro = pedido.nivel === 'secao' ? secaoRegistro(atual) : subsecaoRegistro(atual as LinhaSubsecao);
      if (atual.atualizadoEm.getTime() !== versao.getTime()) return { ok: false, erros: { geral: CONFLITO }, conflito: true, existente: registro };
      if (pedido.intencao === 'excluir') {
        const fichas = await tx.fichaTecnica.count({ where: pedido.nivel === 'secao' ? { secaoId: atual.id } : { subsecaoId: atual.id } });
        const subsecoes = pedido.nivel === 'secao' ? await tx.subsecaoFicha.count({ where: { secaoId: atual.id } }) : 0;
        if (fichas || subsecoes) return { ok: false, erros: { geral: `Esta classificação tem ${fichas} ficha(s) e ${subsecoes} subseção(ões). Arquive para manter os vínculos.` } };
        if (pedido.nivel === 'secao') await tx.secaoFicha.delete({ where: { id: atual.id } });
        else await tx.subsecaoFicha.delete({ where: { id: atual.id } });
      } else {
        if (pedido.intencao === 'restaurar' && registro.nivel === 'subsecao' && !registro.registro.secaoAtiva) return { ok: false, erros: { geral: 'Restaure a seção antes de restaurar esta subseção.' } };
        if (nome?.ok) {
          const nomeChave = await chaveNoBanco(tx, nome.dados);
          const existente = pedido.nivel === 'secao'
            ? await tx.secaoFicha.findFirst({ where: { nomeChave, id: { not: atual.id } }, select: SECAO })
            : await tx.subsecaoFicha.findFirst({ where: { secaoId: (atual as LinhaSubsecao).secaoId, nomeChave, id: { not: atual.id } }, select: SUBSECAO });
          if (existente) return { ok: false, erros: { nome: 'Esse nome já existe, inclusive entre arquivados.' }, existente: pedido.nivel === 'secao' ? secaoRegistro(existente) : subsecaoRegistro(existente as LinhaSubsecao) };
        }
        const data = { ...(nome?.ok ? { nome: nome.dados } : { ativa: pedido.intencao === 'restaurar' }), atualizadoEm: new Date(Math.max(Date.now(), atual.atualizadoEm.getTime() + 1)) };
        const alterado = pedido.nivel === 'secao'
          ? secaoRegistro(await tx.secaoFicha.update({ where: { id: atual.id }, data, select: SECAO }))
          : subsecaoRegistro(await tx.subsecaoFicha.update({ where: { id: atual.id }, data, select: SUBSECAO }));
        await historicoGestao(tx, pedido, registro, alterado, autorNome);
        return { ok: true, alterado, excluido: null, mensagem: 'Classificação atualizada.' };
      }
      await historicoGestao(tx, pedido, registro, null, autorNome);
      return { ok: true, alterado: null, excluido: { nivel: pedido.nivel, id: pedido.id }, mensagem: 'Classificação excluída.' };
    });
  } catch (e) {
    if (ehErroDeUnicidade(e)) return { ok: false, erros: { nome: 'Esse nome já existe. Atualize a busca.' }, conflito: true };
    if (e && typeof e === 'object' && 'code' in e && e.code === 'P2003') return { ok: false, erros: { geral: 'Esta classificação passou a ter vínculos. Arquive para mantê-los.' }, conflito: true };
    throw e;
  }
}

async function historicoGestao(tx: ClienteDoParceiro, pedido: PedidoGestaoClassificacao, antes: RegistroDeClassificacao, depois: RegistroDeClassificacao | null, autorNome: string) {
  const pai = antes.nivel === 'subsecao' ? await tx.secaoFicha.findUnique({ where: { id: antes.registro.secaoId }, select: { nome: true } }) : null;
  const retrato = (r: RegistroDeClassificacao) => ({ id: r.registro.id, nome: r.registro.nome, ativa: r.registro.ativa, ...(r.nivel === 'subsecao' ? { secaoId: r.registro.secaoId, secao: pai?.nome ?? null } : {}) });
  const acao = { renomear: 'RENOMEOU', arquivar: 'DESATIVOU', restaurar: 'REATIVOU', excluir: 'EXCLUIU' }[pedido.intencao];
  await tx.historicoAlteracao.create({ data: { parceiroId: tx.parceiroId, entidade: pedido.nivel === 'secao' ? 'SecaoFicha' : 'SubsecaoFicha', entidadeId: pedido.id, acao, autorNome, antes: retrato(antes), ...(depois ? { depois: retrato(depois) } : {}) } });
}
