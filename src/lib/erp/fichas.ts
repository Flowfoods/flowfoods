/**
 * Ficha técnica (1.2) — regra de negócio com banco, sem tela. Recebe sempre um
 * `ClienteDoParceiro`: não existe função aqui que alcance ficha, item, insumo
 * ou foto de outro parceiro. Leitura do formulário, custo e retrato são puros
 * (`ficha-campos.ts`); a foto é conferida em `foto.ts` e gravada em
 * `arquivos.ts`.
 *
 * - toda gravação leva o histórico (antes/depois só do que mudou) na MESMA
 *   transação;
 * - os insumos citados são lidos COM a linha travada (FOR SHARE, como a
 *   embalagem da 1.1): a unidade de um insumo não muda no meio da conversão.
 *   Insumo de outro parceiro nem aparece (portão) e, se aparecesse, a FK
 *   composta do banco recusaria;
 * - editar é condicional à versão lida (`atualizadoEm`): duas abas, a segunda
 *   recebe "alguém alterou" e nada é sobrescrito;
 * - itens são trocados por inteiro a cada gravação (a ficha é a receita de
 *   agora; o retrato antigo fica no histórico);
 * - a foto vai para o disco ANTES da transação (nome sorteado) e é apagada se
 *   a transação não fechar; a antiga só é apagada depois do commit.
 */

import type { Prisma } from '@prisma/client';
import type { ClienteDoParceiro } from './tenant';
import { ehErroDeUnicidade } from './tenant';
import { listarHistorico } from './historico';
import { diferenca, type Erros } from './insumo-campos';
import {
  custoDaFicha,
  custoDoInsumo,
  FICHAS_POR_PAGINA,
  FILTROS_DE_FICHA_PADRAO,
  lerFormFicha,
  retratoDaFicha,
  type DadosFicha,
  type EntradaDaFicha,
  type FiltrosDeFicha,
  type InsumoDaFicha,
  type TipoFicha,
} from './ficha-campos';
import { conferirFoto } from './foto';
import { apagarFoto, salvarFoto } from './arquivos';
import type { CustoExato, Unidade } from './unidades';

export type ResultadoFicha =
  | { ok: true; id: string; nome: string; mudou: string[] }
  | { ok: false; erros: Erros; conflito?: boolean; desativadoId?: string; naoEncontrado?: boolean };

export const MENSAGEM_CONFLITO_FICHA =
  'Alguém alterou esta ficha agora há pouco. Recarregue a página para ver a versão nova; nada foi gravado.';
export const MENSAGEM_FICHA_DESATIVADA = 'Ficha desativada: reative antes de editar.';

/** O que fazer com a foto ao gravar. */
export type MudancaDeFoto = { tipo: 'manter' } | { tipo: 'trocar'; bytes: Uint8Array } | { tipo: 'remover' };

/** Recusa no meio da transação: desfaz tudo e vira mensagem. */
export class RecusaDaFicha extends Error {
  constructor(readonly resultado: Extract<ResultadoFicha, { ok: false }>) {
    super('recusa');
  }
}

const SELECAO_DO_INSUMO = {
  id: true,
  nome: true,
  unidade: true,
  ativo: true,
  conteudoMilesimos: true,
  precoEmbalagemCentavos: true,
  taxaEntregaCentavos: true,
} as const;

/**
 * Insumos DESTE parceiro com esses ids, com a linha travada em FOR SHARE até o
 * fim da transação (uma troca de unidade concorrente espera). Id de outro
 * parceiro não volta: o portão e a RLS só enxergam este.
 */
export async function insumosTravados(tx: ClienteDoParceiro, ids: string[]): Promise<Map<string, InsumoDaFicha>> {
  const unicos = Array.from(new Set(ids.filter((x) => typeof x === 'string' && x.length > 0 && x.length <= 64)));
  if (unicos.length === 0) return new Map();
  await tx.sql`SELECT 1 FROM "Insumo" WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ANY(${unicos}::text[]) FOR SHARE`;
  const lidos = await tx.insumo.findMany({ where: { id: { in: unicos } }, select: SELECAO_DO_INSUMO });
  return new Map(lidos.map((i) => [i.id, i]));
}

async function erroDeNomeRepetido(cliente: ClienteDoParceiro, nome: string): Promise<ResultadoFicha> {
  const existente = await cliente.fichaTecnica.findFirst({ where: { nome }, select: { id: true, ativa: true } });
  if (existente && !existente.ativa) {
    return {
      ok: false,
      erros: { nome: `Já existe a ficha “${nome}” desativada. Reative em vez de criar de novo.` },
      desativadoId: existente.id,
    };
  }
  return { ok: false, erros: { nome: 'Já existe uma ficha com esse nome.' } };
}

/** Grava os itens (a lista inteira) de uma ficha; quem chama apagou os anteriores. */
async function gravarItens(tx: ClienteDoParceiro, fichaId: string, itens: DadosFicha['itens']) {
  if (itens.length === 0) return;
  await tx.fichaItem.createMany({
    data: itens.map((i, ordem) => ({
      parceiroId: tx.parceiroId,
      fichaId,
      insumoId: i.insumoId,
      quantidadeMilesimos: i.quantidadeMilesimos,
      ordem,
    })),
  });
}

/** Confere a foto que chegou (bytes, não nome) — antes de qualquer gravação. */
function conferirMudancaDeFoto(foto: MudancaDeFoto): { erro: string } | { extensao: 'jpg' | 'png' | 'webp'; mime: string; bytes: number } | null {
  if (foto.tipo !== 'trocar') return null;
  const c = conferirFoto(foto.bytes);
  return c.ok ? c : { erro: c.erro };
}

// --------------------------------------------------------- gravar (comum)

export interface Gravacao {
  /** Ficha nova (null) ou a versão lida da existente. */
  atual: { id: string; atualizadoEm: Date; fotoArquivo: string | null } | null;
  dados: DadosFicha;
  doCadastro: ReadonlyMap<string, InsumoDaFicha>;
  foto: { arquivo: string; mime: string; bytes: number } | null | 'manter';
  origem?: 'MANUAL' | 'IMPORTACAO';
  autorNome: string;
  motivo?: string | null;
  /** Retrato de antes (edição), para a diferença. */
  antes?: ReturnType<typeof retratoDaFicha>;
}

/**
 * Cria ou altera UMA ficha dentro de uma transação já aberta (o formulário e a
 * importação passam por aqui). Edição é condicional à versão lida; sem
 * mudança, não grava nada. Devolve os campos que mudaram (vazio = igual).
 */
export async function gravarFicha(tx: ClienteDoParceiro, g: Gravacao): Promise<{ id: string; mudou: string[] }> {
  const d = g.dados;
  const fotoArquivo = g.foto === 'manter' ? (g.atual?.fotoArquivo ?? null) : (g.foto?.arquivo ?? null);
  const dadosDaFoto =
    g.foto === 'manter' ? {} : { fotoArquivo: g.foto?.arquivo ?? null, fotoMime: g.foto?.mime ?? null, fotoBytes: g.foto?.bytes ?? null };
  const depois = retratoDaFicha(d, g.doCadastro, fotoArquivo);

  if (!g.atual) {
    const nova = await tx.fichaTecnica.create({
      data: {
        parceiroId: tx.parceiroId,
        nome: d.nome,
        tipo: d.tipo,
        rendimentoMilesimos: d.rendimentoMilesimos,
        unidadeRendimento: d.unidadeRendimento,
        descricao: d.descricao,
        modoPreparo: d.modoPreparo,
        origem: g.origem ?? 'MANUAL',
        ...dadosDaFoto,
      },
      select: { id: true },
    });
    await gravarItens(tx, nova.id, d.itens);
    await tx.historicoAlteracao.create({
      data: {
        parceiroId: tx.parceiroId,
        entidade: 'FichaTecnica',
        entidadeId: nova.id,
        acao: 'CRIOU',
        depois,
        motivo: g.motivo ?? null,
        autorNome: g.autorNome,
      },
    });
    return { id: nova.id, mudou: [] };
  }

  const mudanca = g.antes ? diferenca(g.antes, depois) : null;
  if (!mudanca) return { id: g.atual.id, mudou: [] };
  // Condicional: só muda se ainda está na versão lida e ativa. O UPDATE trava a linha.
  const r = await tx.fichaTecnica.updateMany({
    where: { id: g.atual.id, atualizadoEm: g.atual.atualizadoEm, ativa: true },
    data: {
      nome: d.nome,
      tipo: d.tipo,
      rendimentoMilesimos: d.rendimentoMilesimos,
      unidadeRendimento: d.unidadeRendimento,
      descricao: d.descricao,
      modoPreparo: d.modoPreparo,
      ...dadosDaFoto,
    },
  });
  if (r.count === 0) throw new RecusaDaFicha({ ok: false, erros: { geral: MENSAGEM_CONFLITO_FICHA }, conflito: true });
  if (mudanca.campos.includes('itens')) {
    await tx.fichaItem.deleteMany({ where: { fichaId: g.atual.id } });
    await gravarItens(tx, g.atual.id, d.itens);
  }
  await tx.historicoAlteracao.create({
    data: {
      parceiroId: tx.parceiroId,
      entidade: 'FichaTecnica',
      entidadeId: g.atual.id,
      acao: 'ALTEROU',
      antes: mudanca.antes,
      depois: mudanca.depois,
      motivo: g.motivo ?? null,
      autorNome: g.autorNome,
    },
  });
  return { id: g.atual.id, mudou: mudanca.campos };
}

/** Dados gravados → o formato do leitor (para comparar retratos). */
export function dadosGravados(f: {
  nome: string;
  tipo: TipoFicha;
  descricao: string | null;
  modoPreparo: string | null;
  rendimentoMilesimos: number;
  unidadeRendimento: Unidade;
  itens: { insumoId: string | null; quantidadeMilesimos: number }[];
}): DadosFicha {
  return {
    nome: f.nome,
    tipo: f.tipo,
    descricao: f.descricao,
    modoPreparo: f.modoPreparo,
    rendimentoMilesimos: f.rendimentoMilesimos,
    unidadeRendimento: f.unidadeRendimento,
    itens: f.itens.filter((i) => i.insumoId).map((i) => ({ insumoId: i.insumoId!, quantidadeMilesimos: i.quantidadeMilesimos })),
  };
}

export const SELECAO_PARA_EDITAR = {
  id: true,
  nome: true,
  tipo: true,
  descricao: true,
  modoPreparo: true,
  rendimentoMilesimos: true,
  unidadeRendimento: true,
  ativa: true,
  atualizadoEm: true,
  fotoArquivo: true,
  itens: { orderBy: { ordem: 'asc' as const }, select: { insumoId: true, quantidadeMilesimos: true } },
} as const;

/** Salva a foto no disco (se veio) e roda a gravação; se a transação não fechar, a foto nova sai do disco. */
async function comFoto<T>(
  cliente: ClienteDoParceiro,
  foto: MudancaDeFoto,
  conferida: { extensao: 'jpg' | 'png' | 'webp'; mime: string; bytes: number } | null,
  fn: (nova: { arquivo: string; mime: string; bytes: number } | null | 'manter') => Promise<T>,
): Promise<T> {
  let nova: { arquivo: string; mime: string; bytes: number } | null | 'manter' = foto.tipo === 'manter' ? 'manter' : null;
  if (foto.tipo === 'trocar' && conferida) {
    const arquivo = await salvarFoto(cliente.parceiroId, foto.bytes, conferida.extensao);
    nova = { arquivo, mime: conferida.mime, bytes: conferida.bytes };
  }
  try {
    return await fn(nova);
  } catch (e) {
    if (nova && nova !== 'manter') await apagarFoto(cliente.parceiroId, nova.arquivo);
    throw e;
  }
}

// ------------------------------------------------------------ cadastrar

export async function cadastrarFicha(
  cliente: ClienteDoParceiro,
  entrada: EntradaDaFicha,
  foto: MudancaDeFoto = { tipo: 'manter' },
  autorNome = 'Sistema',
): Promise<ResultadoFicha> {
  const conferida = conferirMudancaDeFoto(foto);
  if (conferida && 'erro' in conferida) return { ok: false, erros: { foto: conferida.erro } };
  let nome = '';
  try {
    return await comFoto(cliente, foto.tipo === 'remover' ? { tipo: 'manter' } : foto, conferida, (nova) =>
      cliente.transacao(async (tx) => {
        const doCadastro = await insumosTravados(tx, entrada.itens.map((i) => i.insumoId));
        const lido = lerFormFicha(entrada, doCadastro);
        if (!lido.ok) throw new RecusaDaFicha(lido);
        nome = lido.dados.nome;
        const r = await gravarFicha(tx, {
          atual: null,
          dados: lido.dados,
          doCadastro,
          foto: nova === 'manter' ? null : nova,
          autorNome,
        });
        return { ok: true as const, id: r.id, nome, mudou: [] };
      }),
    );
  } catch (e) {
    if (e instanceof RecusaDaFicha) return e.resultado;
    if (ehErroDeUnicidade(e)) return erroDeNomeRepetido(cliente, nome);
    throw e;
  }
}

// --------------------------------------------------------------- editar

/** `entrada.versao` = o `atualizadoEm` que a tela leu (ISO). */
export async function editarFicha(
  cliente: ClienteDoParceiro,
  id: string,
  entrada: EntradaDaFicha & { versao?: unknown },
  foto: MudancaDeFoto = { tipo: 'manter' },
  autorNome = 'Sistema',
): Promise<ResultadoFicha> {
  const versao = new Date(typeof entrada.versao === 'string' ? entrada.versao : '');
  if (Number.isNaN(versao.getTime())) return { ok: false, erros: { geral: MENSAGEM_CONFLITO_FICHA }, conflito: true };
  const conferida = conferirMudancaDeFoto(foto);
  if (conferida && 'erro' in conferida) return { ok: false, erros: { foto: conferida.erro } };

  let nome = '';
  let fotoAntiga: string | null = null;
  let resultado: ResultadoFicha;
  try {
    resultado = await comFoto(cliente, foto, conferida, (nova) =>
      cliente.transacao(async (tx) => {
        const atual = await tx.fichaTecnica.findUnique({ where: { id }, select: SELECAO_PARA_EDITAR });
        if (!atual) throw new RecusaDaFicha({ ok: false, erros: { geral: 'Ficha não encontrada.' }, naoEncontrado: true });
        if (!atual.ativa) throw new RecusaDaFicha({ ok: false, erros: { geral: MENSAGEM_FICHA_DESATIVADA } });
        if (atual.atualizadoEm.getTime() !== versao.getTime()) {
          throw new RecusaDaFicha({ ok: false, erros: { geral: MENSAGEM_CONFLITO_FICHA }, conflito: true });
        }
        const jaNaFicha = new Set(atual.itens.map((i) => i.insumoId).filter((x): x is string => !!x));
        const doCadastro = await insumosTravados(tx, [...entrada.itens.map((i) => i.insumoId), ...jaNaFicha]);
        const lido = lerFormFicha(entrada, doCadastro, jaNaFicha);
        if (!lido.ok) throw new RecusaDaFicha(lido);
        nome = lido.dados.nome;
        const r = await gravarFicha(tx, {
          atual,
          dados: lido.dados,
          doCadastro,
          foto: nova,
          antes: retratoDaFicha(dadosGravados(atual), doCadastro, atual.fotoArquivo),
          autorNome,
        });
        if (nova !== 'manter' && r.mudou.includes('foto')) fotoAntiga = atual.fotoArquivo;
        return { ok: true as const, id, nome, mudou: r.mudou };
      }),
    );
  } catch (e) {
    if (e instanceof RecusaDaFicha) return e.resultado;
    if (ehErroDeUnicidade(e)) return erroDeNomeRepetido(cliente, nome);
    throw e;
  }
  // Depois do commit: a foto velha já não é de ninguém.
  await apagarFoto(cliente.parceiroId, fotoAntiga);
  return resultado;
}

// --------------------------------------------------- desativar/reativar

export async function mudarSituacaoFicha(
  cliente: ClienteDoParceiro,
  id: string,
  ativa: boolean,
  motivoTexto: unknown,
  autorNome = 'Sistema',
): Promise<ResultadoFicha> {
  const motivo = typeof motivoTexto === 'string' ? motivoTexto.trim().replace(/\s+/g, ' ').slice(0, 200) || null : null;
  try {
    return await cliente.transacao(async (tx) => {
      const atual = await tx.fichaTecnica.findUnique({ where: { id }, select: { nome: true } });
      if (!atual) throw new RecusaDaFicha({ ok: false, erros: { geral: 'Ficha não encontrada.' }, naoEncontrado: true });
      const r = await tx.fichaTecnica.updateMany({ where: { id, ativa: !ativa }, data: { ativa } });
      if (r.count === 0) {
        throw new RecusaDaFicha({
          ok: false,
          erros: { geral: ativa ? 'Esta ficha já está ativa.' : 'Esta ficha já estava desativada.' },
          conflito: true,
        });
      }
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'FichaTecnica',
          entidadeId: id,
          acao: ativa ? 'REATIVOU' : 'DESATIVOU',
          antes: { nome: atual.nome, ativo: !ativa },
          depois: { nome: atual.nome, ativo: ativa },
          motivo,
          autorNome,
        },
      });
      return { ok: true as const, id, nome: atual.nome, mudou: ['ativo'] };
    });
  } catch (e) {
    if (e instanceof RecusaDaFicha) return e.resultado;
    throw e;
  }
}

// ---------------------------------------------------------------- ler

const SELECAO_DO_ITEM = {
  id: true,
  quantidadeMilesimos: true,
  fatorCorrecaoMilesimos: true,
  insumoId: true,
  subfichaId: true,
  insumo: { select: SELECAO_DO_INSUMO },
} as const;

type ItemLido = Prisma.FichaItemGetPayload<{ select: typeof SELECAO_DO_ITEM }>;

/** Itens para o custo. Subficha (1.3) ainda não tem custo: conta como sem preço. */
function paraCusto(itens: ItemLido[]) {
  return itens.map((i) => ({
    nome: i.insumo?.nome ?? 'Subficha',
    quantidadeMilesimos: i.quantidadeMilesimos,
    fatorCorrecaoMilesimos: i.fatorCorrecaoMilesimos,
    custo: i.insumo ? custoDoInsumo(i.insumo) : null,
  }));
}

function filtroDoBanco(f: FiltrosDeFicha): Prisma.FichaTecnicaWhereInput {
  const q = f.q.trim().slice(0, 80);
  return {
    ...(q ? { nome: { contains: q, mode: 'insensitive' as const } } : {}),
    ...(f.tipo ? { tipo: f.tipo } : {}),
    ...(f.situacao === 'ativas' ? { ativa: true } : f.situacao === 'desativadas' ? { ativa: false } : {}),
    ...(f.incompleto ? { itens: { some: { OR: [{ insumo: { precoEmbalagemCentavos: 0 } }, { subfichaId: { not: null } }] } } } : {}),
  };
}

/** Versão da foto para a URL (troca de foto = URL nova; o navegador não mostra a velha). */
export const versaoDaFoto = (arquivo: string | null) => (arquivo ? arquivo.slice(0, 12) : null);

/** Página da lista com o total, custo calculado na hora (nunca gravado). */
export async function listarFichas(cliente: ClienteDoParceiro, filtros: Partial<FiltrosDeFicha> = {}) {
  const f: FiltrosDeFicha = { ...FILTROS_DE_FICHA_PADRAO, ...filtros };
  const where = filtroDoBanco(f);
  return cliente.transacao(async (tx) => {
    const total = await tx.fichaTecnica.count({ where });
    const paginas = Math.max(1, Math.ceil(total / FICHAS_POR_PAGINA));
    const pagina = Math.min(Math.max(1, Math.trunc(f.pagina) || 1), paginas);
    const lidas = await tx.fichaTecnica.findMany({
      where,
      orderBy: [{ nome: 'asc' }, { id: 'asc' }],
      skip: (pagina - 1) * FICHAS_POR_PAGINA,
      take: FICHAS_POR_PAGINA,
      select: {
        id: true,
        nome: true,
        tipo: true,
        descricao: true,
        rendimentoMilesimos: true,
        unidadeRendimento: true,
        ativa: true,
        fotoArquivo: true,
        itens: { orderBy: { ordem: 'asc' }, select: SELECAO_DO_ITEM },
      },
    });
    const linhas = lidas.map((l) => ({
      id: l.id,
      nome: l.nome,
      tipo: l.tipo,
      descricao: l.descricao,
      rendimentoMilesimos: l.rendimentoMilesimos,
      unidadeRendimento: l.unidadeRendimento,
      ativa: l.ativa,
      foto: versaoDaFoto(l.fotoArquivo),
      itens: l.itens.length,
      custo: custoDaFicha(paraCusto(l.itens), l.rendimentoMilesimos),
    }));
    return { linhas, total, pagina, paginas };
  });
}

export type LinhaDeFicha = Awaited<ReturnType<typeof listarFichas>>['linhas'][number];

export async function obterFicha(cliente: ClienteDoParceiro, id: string) {
  return cliente.transacao(async (tx) => {
    const f = await tx.fichaTecnica.findUnique({
      where: { id },
      select: {
        id: true,
        nome: true,
        tipo: true,
        descricao: true,
        modoPreparo: true,
        rendimentoMilesimos: true,
        unidadeRendimento: true,
        ativa: true,
        origem: true,
        atualizadoEm: true,
        fotoArquivo: true,
        itens: { orderBy: { ordem: 'asc' }, select: SELECAO_DO_ITEM },
      },
    });
    if (!f) return null;
    const historico = await listarHistorico(tx, { de: [{ entidade: 'FichaTecnica', ids: [id] }], limite: 10 });
    const custo = custoDaFicha(paraCusto(f.itens), f.rendimentoMilesimos);
    return {
      id: f.id,
      nome: f.nome,
      tipo: f.tipo,
      descricao: f.descricao,
      modoPreparo: f.modoPreparo,
      rendimentoMilesimos: f.rendimentoMilesimos,
      unidadeRendimento: f.unidadeRendimento,
      ativa: f.ativa,
      origem: f.origem,
      versao: f.atualizadoEm.toISOString(),
      foto: versaoDaFoto(f.fotoArquivo),
      itens: f.itens.map((i, n) => ({
        id: i.id,
        insumoId: i.insumoId,
        nome: i.insumo?.nome ?? 'Subficha',
        unidade: (i.insumo?.unidade ?? 'UN') as Unidade,
        ativo: i.insumo?.ativo ?? true,
        quantidadeMilesimos: i.quantidadeMilesimos,
        custoDoInsumo: i.insumo ? custoDoInsumo(i.insumo) : null,
        custo: custo.itens[n],
      })),
      custo,
      historico,
    };
  });
}

export type FichaDetalhada = NonNullable<Awaited<ReturnType<typeof obterFicha>>>;

/**
 * A foto de uma ficha DESTE parceiro (nome do arquivo e tipo), ou null. É o
 * que a rota da foto usa: id de ficha de outro parceiro não é achado.
 */
export async function fotoDaFicha(cliente: ClienteDoParceiro, id: string) {
  const f = await cliente.fichaTecnica.findUnique({ where: { id }, select: { fotoArquivo: true, fotoMime: true } });
  return f?.fotoArquivo && f.fotoMime ? { arquivo: f.fotoArquivo, mime: f.fotoMime } : null;
}

/** Insumos que o formulário oferece: os ativos e os que já estão na ficha (desativados, marcados). */
export async function insumosParaFicha(cliente: ClienteDoParceiro, jaNaFicha: string[] = []) {
  const lidos = await cliente.insumo.findMany({
    where: { OR: [{ ativo: true }, { id: { in: jaNaFicha } }] },
    orderBy: { nome: 'asc' },
    select: SELECAO_DO_INSUMO,
  });
  return lidos.map((i) => ({
    id: i.id,
    nome: i.nome,
    unidade: i.unidade as Unidade,
    ativo: i.ativo,
    custo: custoDoInsumo(i) as CustoExato | null,
  }));
}

export type InsumoDoFormulario = Awaited<ReturnType<typeof insumosParaFicha>>[number];

/** Busca do ⌘K: fichas DESTE parceiro pelo nome. */
export async function buscarFichas(cliente: ClienteDoParceiro, texto: string, limite = 6) {
  const q = texto.trim().slice(0, 80);
  if (q.length < 2) return [];
  return cliente.fichaTecnica.findMany({
    where: { nome: { contains: q, mode: 'insensitive' } },
    orderBy: [{ ativa: 'desc' }, { nome: 'asc' }],
    take: limite,
    select: { id: true, nome: true, tipo: true, ativa: true },
  });
}
