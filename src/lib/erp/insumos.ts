/**
 * Insumos (1.1) — regra de negócio com banco, sem tela. Recebe sempre um
 * `ClienteDoParceiro`: não existe função aqui que consiga tocar em insumo de
 * outro parceiro. A leitura do formulário, o custo e o retrato do histórico
 * são puros (`insumo-campos.ts`, `unidades.ts`).
 *
 * - toda gravação leva o histórico (antes/depois só do que mudou) na MESMA
 *   transação: ou ficam os dois, ou nenhum;
 * - editar é condicional à versão lida (`atualizadoEm`): duas abas editando, a
 *   segunda recebe "alguém alterou" e nada é sobrescrito;
 * - desativar não apaga (insumo tem uso em ficha, nota, estoque...);
 * - trocar a unidade só sem outra embalagem e sem uso (conferido com a linha
 *   travada, dentro da transação).
 */

import type { Prisma } from '@prisma/client';
import type { ClienteDoParceiro } from './tenant';
import { checkVioladoDe, ehErroDeUnicidade } from './tenant';
import { listarHistorico } from './historico';
import {
  diferenca,
  FILTROS_PADRAO,
  lerFormInsumo,
  POR_PAGINA,
  retratoDoInsumo,
  versaoDaVariante,
  type Conservacao,
  type DadosInsumo,
  type Erros,
  type FiltrosDeInsumo,
  type TipoInsumo,
} from './insumo-campos';
import { pode, type Alcance } from './permissoes';
import { compararFracoes, custoDaEmbalagem, custoPorUnidade, type CustoExato, type Fracao, type Unidade } from './unidades';
import { contaDaFicha, custoIncompleto, type CustoDaFicha } from './ficha-campos';
import { custosEmCascata } from './ficha-custos';
import { comprasDoInsumo, ultimasCompras, type UltimaCompra } from './compras-custo';
import { colunasDaValidade, COLUNA_DA_VALIDADE, SELECAO_DA_VALIDADE, validadesDaLinha, type ColunasDaValidade, type Validades } from './validade';

export type ResultadoCadastro =
  | { ok: true; id: string; nome: string; mudou: string[] }
  | {
      ok: false;
      erros: Erros;
      /** Alguém gravou depois da leitura desta tela. */
      conflito?: boolean;
      /** Nome repetido de um insumo desativado: dá para reativar em vez de criar. */
      desativadoId?: string;
      naoEncontrado?: boolean;
    };

export const MENSAGEM_CONFLITO = 'Alguém alterou este insumo agora há pouco. Recarregue a página para ver a versão nova; nada foi gravado.';

export const MENSAGEM_DESATIVADO = 'Insumo desativado: reative antes de editar.';

/** Insumo produzido por pré-preparo (1.3): nome, unidade, situação e custo vêm da ficha. */
const mensagemDoPreparo = (nome: string, ficha: string) =>
  `“${nome}” é pré-preparo: muda junto com a ficha técnica “${ficha}” (nome, rendimento, situação e custo).`;

/** Recusa no meio da transação: desfaz tudo e vira mensagem. */
class Recusa extends Error {
  constructor(readonly resultado: Extract<ResultadoCadastro, { ok: false }>) {
    super('recusa');
  }
}

/**
 * O banco recusou por um CHECK (herança a da 1.4): frase em vez de 500. Com os
 * CHECKs validados (migration 20261018000000) uma linha antiga fora da regra
 * não existe mais; se aparecer (gravada por fora), a pessoa sabe o que fazer.
 */
export function erroDoCheck(e: unknown): Extract<ResultadoCadastro, { ok: false }> | null {
  const check = checkVioladoDe(e);
  if (!check) return null;
  const geral = /validade/i.test(check)
    ? 'A validade gravada neste insumo está fora da regra (a conservação principal precisa ter validade, até 730 dias). Corrija em Editar, no bloco “Onde guarda e quanto dura”, e tente de novo. Nada foi gravado.'
    : 'O banco recusou estes valores (fora da faixa permitida). Confira os números e tente de novo. Nada foi gravado.';
  return { ok: false, erros: { geral } };
}

async function erroDeNomeRepetido(cliente: ClienteDoParceiro, nome: string): Promise<ResultadoCadastro> {
  const existente = await cliente.insumo.findFirst({ where: { nome }, select: { id: true, ativo: true } });
  if (existente && !existente.ativo) {
    return {
      ok: false,
      erros: { nome: `Já existe “${nome}” desativado. Reative em vez de cadastrar de novo.` },
      desativadoId: existente.id,
    };
  }
  return { ok: false, erros: { nome: 'Já existe um insumo com esse nome.' } };
}

// ------------------------------------------------------------ cadastrar

/**
 * Valida o texto do formulário e grava. Toda conversão para inteiro acontece no
 * servidor: o navegador manda texto, nunca o número já calculado.
 */
export async function cadastrarInsumo(
  cliente: ClienteDoParceiro,
  entrada: Record<string, unknown>,
  autorNome = 'Sistema',
): Promise<ResultadoCadastro> {
  const lido = lerFormInsumo(entrada);
  if (!lido.ok) return lido;
  const d = lido.dados;
  try {
    const criado = await cliente.transacao(async (tx) => {
      const novo = await tx.insumo.create({
        data: {
          parceiroId: tx.parceiroId,
          nome: d.nome,
          tipo: d.tipo,
          unidade: d.unidade,
          conservacao: d.conservacao,
          ...colunasDaValidade(d.validades),
          conteudoMilesimos: d.conteudoMilesimos,
          precoEmbalagemCentavos: d.precoEmbalagemCentavos,
          taxaEntregaCentavos: d.taxaEntregaCentavos,
        },
        select: { id: true, nome: true },
      });
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'Insumo',
          entidadeId: novo.id,
          acao: 'CRIOU',
          depois: retratoDoInsumo(d),
          autorNome,
        },
      });
      return novo;
    });
    return { ok: true, ...criado, mudou: [] };
  } catch (e) {
    if (ehErroDeUnicidade(e)) return erroDeNomeRepetido(cliente, d.nome);
    const check = erroDoCheck(e);
    if (check) return check;
    throw e;
  }
}

// --------------------------------------------------------------- editar

const SELECAO_DE_USO = {
  _count: {
    select: {
      variantes: true,
      usosEmFichas: true,
      usosComoEmbalagem: true,
      notaItens: true,
      saldos: true,
      movimentos: true,
      contagemItens: true,
      requisicaoItens: true,
      producoes: true,
      etiquetas: true,
    },
  },
  fichaQueProduz: { select: { id: true } },
} as const;

/**
 * Por que a unidade NÃO pode mudar (null = pode). Com outra embalagem ou
 * qualquer uso, os milésimos gravados ali passariam a significar outra coisa.
 */
export async function motivoDaUnidadeTravada(
  cliente: ClienteDoParceiro,
  id: string,
  { peloPreparo = false }: { /** Quem muda é a ficha que o produz (1.3): ela não conta como uso. */ peloPreparo?: boolean } = {},
): Promise<string | null> {
  const i = await cliente.insumo.findUnique({ where: { id }, select: SELECAO_DE_USO });
  if (!i) return null;
  if (i._count.variantes > 0) return 'A unidade não muda: este insumo tem outra embalagem cadastrada.';
  const { variantes: _v, ...usos } = i._count;
  const emUso = Object.values(usos).some((n) => n > 0) || (!!i.fichaQueProduz && !peloPreparo);
  return emUso ? 'A unidade não muda: este insumo já é usado em ficha, compra ou estoque.' : null;
}

function dadosDe(
  i: {
    nome: string;
    tipo: TipoInsumo;
    unidade: Unidade;
    conservacao: Conservacao;
    conteudoMilesimos: number;
    precoEmbalagemCentavos: number;
    taxaEntregaCentavos: number;
  } & ColunasDaValidade,
): DadosInsumo {
  return {
    nome: i.nome,
    tipo: i.tipo,
    unidade: i.unidade,
    conservacao: i.conservacao,
    validades: validadesDaLinha(i)!,
    conteudoMilesimos: i.conteudoMilesimos,
    precoEmbalagemCentavos: i.precoEmbalagemCentavos,
    taxaEntregaCentavos: i.taxaEntregaCentavos,
  };
}

/**
 * `entrada.versao` = o `atualizadoEm` que a tela leu (ISO). A gravação só
 * acontece se a linha ainda estiver nessa versão.
 */
export async function editarInsumo(
  cliente: ClienteDoParceiro,
  id: string,
  entrada: Record<string, unknown>,
  autorNome = 'Sistema',
): Promise<ResultadoCadastro> {
  const versao = new Date(typeof entrada.versao === 'string' ? entrada.versao : '');
  if (Number.isNaN(versao.getTime())) return { ok: false, erros: { geral: MENSAGEM_CONFLITO }, conflito: true };

  const atual = await cliente.insumo.findUnique({ where: { id }, include: { fichaQueProduz: { select: { nome: true } } } });
  if (!atual) return { ok: false, erros: { geral: 'Insumo não encontrado.' }, naoEncontrado: true };
  if (atual.fichaQueProduz) return { ok: false, erros: { geral: mensagemDoPreparo(atual.nome, atual.fichaQueProduz.nome) } };
  // A tela esconde "Editar" de desativado; quem decide é aqui.
  if (!atual.ativo) return { ok: false, erros: { geral: MENSAGEM_DESATIVADO } };
  if (atual.atualizadoEm.getTime() !== versao.getTime()) {
    return { ok: false, erros: { geral: MENSAGEM_CONFLITO }, conflito: true };
  }

  const lido = lerFormInsumo(entrada, atual.tipo);
  if (!lido.ok) return lido;
  const d = lido.dados;
  const mudanca = diferenca(retratoDoInsumo(dadosDe(atual)), retratoDoInsumo(d));
  if (!mudanca) return { ok: true, id, nome: atual.nome, mudou: [] };

  try {
    await cliente.transacao(async (tx) => {
      // Condicional: a linha só muda se ainda está na versão que a tela leu.
      // O UPDATE trava a linha até o fim da transação.
      const r = await tx.insumo.updateMany({
        // `ativo: true`: desativar no meio do caminho também conta como conflito.
        where: { id, atualizadoEm: versao, ativo: true },
        data: {
          nome: d.nome,
          tipo: d.tipo,
          unidade: d.unidade,
          conservacao: d.conservacao,
          ...colunasDaValidade(d.validades),
          conteudoMilesimos: d.conteudoMilesimos,
          precoEmbalagemCentavos: d.precoEmbalagemCentavos,
          taxaEntregaCentavos: d.taxaEntregaCentavos,
        },
      });
      if (r.count === 0) throw new Recusa({ ok: false, erros: { geral: MENSAGEM_CONFLITO }, conflito: true });
      if (d.unidade !== atual.unidade) {
        // Com a linha travada: uma embalagem nova (que trava a linha em FOR
        // SHARE) ou um uso não entra no meio desta conferência.
        const motivo = await motivoDaUnidadeTravada(tx, id);
        if (motivo) throw new Recusa({ ok: false, erros: { unidade: motivo } });
      }
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'Insumo',
          entidadeId: id,
          acao: 'ALTEROU',
          antes: mudanca.antes,
          depois: mudanca.depois,
          autorNome,
        },
      });
    });
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    if (ehErroDeUnicidade(e)) return erroDeNomeRepetido(cliente, d.nome);
    const check = erroDoCheck(e);
    if (check) return check;
    throw e;
  }
  return { ok: true, id, nome: d.nome, mudou: mudanca.campos };
}

// --------------------------------------------------- desativar/reativar

/**
 * Desativar não apaga: o insumo sai da lista padrão e do ⌘K fica marcado.
 * Condicional à situação lida (desativar o que já está desativado é recusado).
 */
export async function mudarSituacaoInsumo(
  cliente: ClienteDoParceiro,
  id: string,
  ativo: boolean,
  motivoTexto: unknown,
  autorNome = 'Sistema',
): Promise<ResultadoCadastro> {
  const motivo = typeof motivoTexto === 'string' ? motivoTexto.trim().replace(/\s+/g, ' ').slice(0, 200) || null : null;
  try {
    return await cliente.transacao(async (tx) => {
      const atual = await tx.insumo.findUnique({ where: { id }, select: { nome: true, ativo: true, fichaQueProduz: { select: { nome: true } } } });
      if (!atual) throw new Recusa({ ok: false, erros: { geral: 'Insumo não encontrado.' }, naoEncontrado: true });
      if (atual.fichaQueProduz) throw new Recusa({ ok: false, erros: { geral: mensagemDoPreparo(atual.nome, atual.fichaQueProduz.nome) } });
      const r = await tx.insumo.updateMany({ where: { id, ativo: !ativo }, data: { ativo } });
      if (r.count === 0) {
        throw new Recusa({
          ok: false,
          erros: { geral: ativo ? 'Este insumo já está ativo.' : 'Este insumo já estava desativado.' },
          conflito: true,
        });
      }
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'Insumo',
          entidadeId: id,
          acao: ativo ? 'REATIVOU' : 'DESATIVOU',
          antes: { nome: atual.nome, ativo: !ativo },
          depois: { nome: atual.nome, ativo },
          motivo,
          autorNome,
        },
      });
      return { ok: true as const, id, nome: atual.nome, mudou: ['ativo'] };
    });
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    const check = erroDoCheck(e);
    if (check) return check;
    throw e;
  }
}

// --------------------------------------------------------------- listar

export interface LinhaDeInsumo {
  id: string;
  nome: string;
  tipo: TipoInsumo;
  unidade: Unidade;
  conservacao: Conservacao;
  /** 1.4: principal + validade em cada conservação aceita (minutos). */
  validades: Validades;
  /** Insumo de pré-preparo cuja ficha não diz a validade: a conservação também não foi dita. */
  conservacaoInformada: boolean;
  conteudoMilesimos: number;
  precoEmbalagemCentavos: number;
  taxaEntregaCentavos: number;
  /**
   * Custo de referência exato: o da última compra lançada (1.5) ou, sem
   * compra, o do preço cadastrado; null = "Sem preço" (custo incompleto).
   * Pré-preparo: ver `preparo`.
   */
  custo: CustoExato | null;
  /** 1.5: a data da última compra lançada (de onde vem o custo), quando há. Nota, fornecedor e loja ficam no módulo de compras. */
  ultimaCompra: { entradaEm: string } | null;
  /** Outras embalagens ativas. */
  variantes: number;
  ativo: boolean;
  /** Produzido por um pré-preparo (1.3): o custo por unidade vem da ficha, em cascata. */
  preparo: { fichaId: string; porUnidade: Fracao; incompleto: boolean } | null;
}

function filtroDoBanco(f: FiltrosDeInsumo): Prisma.InsumoWhereInput {
  const q = f.q.trim().slice(0, 80);
  return {
    ...(q ? { nome: { contains: q, mode: 'insensitive' as const } } : {}),
    ...(f.tipo ? { tipo: f.tipo } : {}),
    // 1.4: "conservação X" = os que ficam em X (a principal ou com validade nela).
    ...(f.conservacao ? { OR: [{ conservacao: f.conservacao }, { [COLUNA_DA_VALIDADE[f.conservacao]]: { not: null } }] } : {}),
    ...(f.situacao === 'ativos' ? { ativo: true } : f.situacao === 'desativados' ? { ativo: false } : {}),
    // "Sem preço" é quem precisa de preço digitado: o pré-preparo tem custo da ficha.
    // 1.5: com nota lançada, o insumo tem o preço da compra.
    ...(f.semPreco ? { precoEmbalagemCentavos: 0, fichaQueProduz: { is: null }, notaItens: { none: { nota: { status: 'LANCADA' as const } } } } : {}),
  };
}

const SELECAO_DA_LINHA = {
  id: true,
  nome: true,
  tipo: true,
  unidade: true,
  ...SELECAO_DA_VALIDADE,
  conteudoMilesimos: true,
  precoEmbalagemCentavos: true,
  taxaEntregaCentavos: true,
  ativo: true,
  _count: { select: { variantes: { where: { ativo: true } } } },
  fichaQueProduz: { select: { id: true } },
} as const;

type LinhaDoBanco = Prisma.InsumoGetPayload<{ select: typeof SELECAO_DA_LINHA }>;

/**
 * Banco → linha. Pré-preparo: custo da ficha que o produz, por unidade (o
 * rendimento é na unidade do insumo), lido em cascata para a página inteira
 * de uma vez (`custosDosPreparos`).
 */
function paraLinha(i: LinhaDoBanco, preparos: ReadonlyMap<string, CustoDaFicha>, compras: ReadonlyMap<string, UltimaCompra>): LinhaDeInsumo {
  const { _count, fichaQueProduz, validadeSecoMin: _s, validadePistaFriaMin: _p, validadeRefrigeradoMin: _r, validadeCongeladoMin: _g, ...resto } = i;
  const c = fichaQueProduz ? preparos.get(fichaQueProduz.id) : undefined;
  const validades = validadesDaLinha(i)!;
  const compra = fichaQueProduz ? undefined : compras.get(i.id);
  return {
    ...resto,
    validades,
    conservacaoInformada: !fichaQueProduz || Object.keys(validades.minutos).length > 0,
    custo: fichaQueProduz ? null : (compra?.custo ?? custoDaEmbalagem(i.precoEmbalagemCentavos, i.taxaEntregaCentavos, i.conteudoMilesimos)),
    ultimaCompra: compra ? { entradaEm: compra.entradaEm } : null,
    variantes: _count.variantes,
    preparo: fichaQueProduz && c ? { fichaId: fichaQueProduz.id, porUnidade: c.porRendimento, incompleto: custoIncompleto(c) } : null,
  };
}

async function custosDosPreparos(tx: ClienteDoParceiro, linhas: LinhaDoBanco[]): Promise<Map<string, CustoDaFicha>> {
  const ids = linhas.map((l) => l.fichaQueProduz?.id).filter((x): x is string => !!x);
  if (ids.length === 0) return new Map();
  const c = await custosEmCascata(tx, ids);
  return new Map(ids.map((id) => [id, c.custo(id)!]));
}

/** 1.5: a última compra de cada insumo comprado da página (uma consulta). */
function comprasDasLinhas(tx: ClienteDoParceiro, linhas: LinhaDoBanco[]) {
  return ultimasCompras(
    tx,
    linhas.filter((l) => !l.fichaQueProduz).map((l) => l.id),
  );
}

/** Custo por unidade para ordenar (exato); null = sem preço (vai para o fim). */
const custoParaOrdenar = (l: LinhaDeInsumo): Fracao | null => l.preparo?.porUnidade ?? (l.custo ? custoPorUnidade(l.custo) : null);

/**
 * Página da lista com o total. Filtros e ordem vêm da URL (`lerFiltros`), o
 * servidor filtra. Por custo: o custo é derivado (nunca gravado), então a
 * ordenação é feita aqui pelo custo exato (multiplicação cruzada), e "Sem
 * preço" fica sempre no fim. Contagem e página na mesma transação (o total bate com a página).
 */
export async function listarInsumos(
  cliente: ClienteDoParceiro,
  filtros: Partial<FiltrosDeInsumo> = {},
): Promise<{ linhas: LinhaDeInsumo[]; total: number; pagina: number; paginas: number }> {
  const f: FiltrosDeInsumo = { ...FILTROS_PADRAO, ...filtros };
  const where = filtroDoBanco(f);
  return cliente.transacao(async (tx) => {
    const total = await tx.insumo.count({ where });
    const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    const pagina = Math.min(Math.max(1, Math.trunc(f.pagina) || 1), paginas);
    if (f.ordem === 'nome') {
      const linhas = await tx.insumo.findMany({
        where,
        orderBy: [{ nome: f.direcao }, { id: 'asc' }],
        skip: (pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
        select: SELECAO_DA_LINHA,
      });
      const preparos = await custosDosPreparos(tx, linhas);
      const compras = await comprasDasLinhas(tx, linhas);
      return { linhas: linhas.map((l) => paraLinha(l, preparos, compras)), total, pagina, paginas };
    }
    const lidas = await tx.insumo.findMany({ where, orderBy: { nome: 'asc' }, select: SELECAO_DA_LINHA });
    const preparos = await custosDosPreparos(tx, lidas);
    const compras = await comprasDasLinhas(tx, lidas);
    const todas = lidas.map((l) => paraLinha(l, preparos, compras));
    const sinal = f.direcao === 'asc' ? 1 : -1;
    todas.sort((a, b) => {
      const x = custoParaOrdenar(a);
      const y = custoParaOrdenar(b);
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
      // Exato (multiplicação cruzada): R$ 0,004/un vem antes de R$ 0,005/un.
      return sinal * compararFracoes(x, y);
    });
    return { linhas: todas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA), total, pagina, paginas };
  });
}

// ---------------------------------------------------------------- obter

/**
 * Detalhe do insumo. `alcance`: quem pede. O custo de referência (último
 * preço, número derivado) é da rede e vem sempre; nota, série, fornecedor,
 * loja, quantidade, valor e frete de cada compra só nas lojas em que a pessoa
 * tem "ver compras e notas" (o resto nem sai do servidor).
 */
export async function obterInsumo(cliente: ClienteDoParceiro, id: string, alcance: Alcance) {
  return cliente.transacao(async (tx) => {
    const i = await tx.insumo.findUnique({
      where: { id },
      include: {
        variantes: { orderBy: [{ ativo: 'desc' }, { nome: 'asc' }] },
        fichaQueProduz: { select: { id: true, nome: true, tipo: true, rendimentoMilesimos: true, unidadeRendimento: true } },
      },
    });
    if (!i) return null;
    const ficha = i.fichaQueProduz;
    const custoDaFicha = ficha ? (await custosEmCascata(tx, [ficha.id])).custo(ficha.id)! : null;
    const travaDaUnidade = await motivoDaUnidadeTravada(tx, id);
    // 1.5: o custo vem da última compra lançada, quando há; o histórico de preços e o último de cada fornecedor.
    const ultima = ficha ? undefined : (await ultimasCompras(tx, [id])).get(id);
    const compras = ficha ? { compras: [], fornecedores: [] } : await comprasDoInsumo(tx, id, alcance);
    const veUltima = !!ultima && pode(alcance, 'compras.ver', { lojaId: ultima.lojaId });
    const lojaDaUltima = ultima && veUltima ? ((await tx.loja.findUnique({ where: { id: ultima.lojaId }, select: { nome: true } }))?.nome ?? null) : null;
    const historico = await listarHistorico(tx, {
      de: [
        { entidade: 'Insumo', ids: [id] },
        { entidade: 'InsumoVariante', ids: i.variantes.map((v) => v.id) },
      ],
      limite: 10,
      // Insumo não tem campo de preço por canal (o preço de compra é do cadastro).
      verPrecos: false,
    });
    return {
      id: i.id,
      nome: i.nome,
      tipo: i.tipo,
      unidade: i.unidade,
      conservacao: i.conservacao,
      validades: validadesDaLinha(i)!,
      conteudoMilesimos: i.conteudoMilesimos,
      precoEmbalagemCentavos: i.precoEmbalagemCentavos,
      taxaEntregaCentavos: i.taxaEntregaCentavos,
      /** O custo que vale: última compra ou, sem ela, o preço cadastrado. */
      custo: ultima?.custo ?? custoDaEmbalagem(i.precoEmbalagemCentavos, i.taxaEntregaCentavos, i.conteudoMilesimos),
      /** O do preço cadastrado (embalagem padrão), sempre. */
      custoCadastrado: custoDaEmbalagem(i.precoEmbalagemCentavos, i.taxaEntregaCentavos, i.conteudoMilesimos),
      ultimaCompra: ultima
        ? {
            custo: ultima.custo,
            entradaEm: ultima.entradaEm,
            /** De que compra veio: só para quem vê compras naquela loja (null = só o custo). */
            detalhe: veUltima
              ? {
                  notaId: ultima.notaId,
                  numero: ultima.numero,
                  serie: ultima.serie,
                  lojaId: ultima.lojaId,
                  lojaNome: lojaDaUltima,
                  fornecedor: ultima.fornecedor,
                  valorCentavos: ultima.valorCentavos,
                  freteCentavos: ultima.freteCentavos,
                  quantidadeMilesimos: ultima.quantidadeMilesimos,
                }
              : null,
          }
        : null,
      compras: compras.compras,
      precoPorFornecedor: compras.fornecedores,
      ativo: i.ativo,
      versao: i.atualizadoEm.toISOString(),
      travaDaUnidade,
      preparo:
        ficha && custoDaFicha
          ? {
              fichaId: ficha.id,
              nome: ficha.nome,
              porUnidade: custoDaFicha.porRendimento,
              incompleto: custoIncompleto(custoDaFicha),
              conta: contaDaFicha(custoDaFicha, ficha.rendimentoMilesimos, ficha.unidadeRendimento, ficha.tipo),
            }
          : null,
      variantes: i.variantes.map((v) => ({
        id: v.id,
        nome: v.nome,
        conteudoMilesimos: v.conteudoMilesimos,
        precoEmbalagemCentavos: v.precoEmbalagemCentavos,
        taxaEntregaCentavos: v.taxaEntregaCentavos,
        custo: custoDaEmbalagem(v.precoEmbalagemCentavos, v.taxaEntregaCentavos, v.conteudoMilesimos),
        codigoBarras: v.codigoBarras,
        ativo: v.ativo,
        versao: versaoDaVariante(v),
      })),
      historico,
    };
  });
}

export type InsumoDetalhado = NonNullable<Awaited<ReturnType<typeof obterInsumo>>>;

// --------------------------------------------------------------- buscar

/**
 * Busca do ⌘K: insumos DESTE parceiro (o cliente é do portão) cujo nome
 * contém o texto, sem diferenciar maiúscula. Desativados vêm marcados.
 */
export async function buscarInsumos(cliente: ClienteDoParceiro, texto: string, limite = 8) {
  const q = texto.trim().slice(0, 80);
  if (q.length < 2) return [];
  return cliente.insumo.findMany({
    where: { nome: { contains: q, mode: 'insensitive' } },
    orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
    take: limite,
    select: { id: true, nome: true, unidade: true, ativo: true },
  });
}
