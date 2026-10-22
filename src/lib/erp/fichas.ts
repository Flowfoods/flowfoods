/**
 * Ficha técnica (1.2 + 1.3) — regra de negócio com banco, sem tela. Recebe
 * sempre um `ClienteDoParceiro`: não existe função aqui que alcance ficha,
 * item, insumo ou foto de outro parceiro. Leitura do formulário, custo e
 * retrato são puros (`ficha-campos.ts`); a cascata e o grafo, em
 * `ficha-cascata.ts` (puro) e `ficha-custos.ts` (leitura por nível); a foto é
 * conferida em `foto.ts` e gravada em `arquivos.ts`.
 *
 * - toda gravação leva o histórico (antes/depois só do que mudou) na MESMA
 *   transação;
 * - os insumos e os pré-preparos citados são lidos COM a linha travada (FOR
 *   SHARE): a unidade não muda no meio da conversão. De outro parceiro nem
 *   aparecem (portão) e, se aparecessem, a FK composta do banco recusaria;
 * - toda gravação de ficha pega a trava do "grafo de fichas" do parceiro
 *   (`pg_advisory_xact_lock`) ANTES de ler as ligações: duas edições que
 *   juntas fariam um círculo (A usa B, B usa A) entram uma de cada vez, e a
 *   segunda vê a primeira e é recusada (1.3);
 * - editar é condicional à versão lida (`atualizadoEm`): duas abas, a segunda
 *   recebe "alguém alterou" e nada é sobrescrito;
 * - itens são trocados por inteiro a cada gravação (a ficha é a receita de
 *   agora; o retrato antigo fica no histórico);
 * - pré-preparo mantém, na mesma transação, o insumo que ele produz (nome,
 *   unidade, situação e — 1.4 — conservação e validades acompanham a ficha);
 * - a foto vai para o disco ANTES da transação e sai se ela não fechar; a
 *   antiga só é apagada depois do commit.
 */

import type { Prisma } from '@prisma/client';
import type { ClienteDoParceiro } from './tenant';
import { ehErroDeUnicidade } from './tenant';
import { listarHistorico } from './historico';
import { diferenca, type Erros } from './insumo-campos';
import {
  chaveDoItem,
  custoDoInsumo,
  custoIncompleto,
  FICHAS_POR_PAGINA,
  FILTROS_DE_FICHA_PADRAO,
  lerFormFicha,
  retratoDaFicha,
  type CustoDaFicha,
  type DadosFicha,
  type EntradaDaFicha,
  type FiltrosDeFicha,
  type InsumoDaFicha,
  type PreparoDaFicha,
  type TipoFicha,
} from './ficha-campos';
import { cascataDeCusto, conferirGrafo, grafoDasArestas, type FichaDaCascata } from './ficha-cascata';
import { custosEmCascata, lerCascata, SELECAO_DO_INSUMO, SELECAO_DO_ITEM, type FichaLida } from './ficha-custos';
import { anexarUltimasCompras, type ComUltimaCompra } from './compras-custo';
import { motivoDaUnidadeTravada } from './insumos';
import { garantirCategoriasPadrao, sugestaoParaInsumo } from './categorias';
import { prepararFoto, type FotoPronta } from './foto';
import { apagarFoto, assumirFotoPendente, devolverFotoPendente, faxinarPendentesDeVezEmQuando, salvarFoto } from './arquivos';
import { cabeNaExibicao, UNIDADES, type CustoExato, type Fracao, type Unidade } from './unidades';
import { colunasDaValidade, retratoDaValidade, SELECAO_DA_VALIDADE, validadesDaLinha, type Validades } from './validade';

export type ResultadoFicha =
  | { ok: true; id: string; nome: string; mudou: string[] }
  | { ok: false; erros: Erros; conflito?: boolean; desativadoId?: string; naoEncontrado?: boolean };

export const MENSAGEM_CONFLITO_FICHA =
  'Alguém alterou esta ficha agora há pouco. Recarregue a página para ver a versão nova; nada foi gravado.';
export const MENSAGEM_FICHA_DESATIVADA = 'Ficha desativada: reative antes de editar.';

/**
 * O que fazer com a foto ao gravar. `enviada` = a tela já mandou a foto pela
 * rota de envio (`foto-envio.ts`) e só traz o nome da pendente; `trocar` =
 * bytes na mão (testes e scripts), passam pela mesma limpeza.
 */
export type MudancaDeFoto =
  | { tipo: 'manter' }
  | { tipo: 'trocar'; bytes: Uint8Array }
  | { tipo: 'enviada'; arquivo: string }
  | { tipo: 'remover' };

export const MENSAGEM_FOTO_SUMIU = 'A foto enviada não está mais aqui (passou de 24 h ou já foi usada). Escolha a foto de novo.';

/** Recusa no meio da transação: desfaz tudo e vira mensagem. */
export class RecusaDaFicha extends Error {
  constructor(readonly resultado: Extract<ResultadoFicha, { ok: false }>) {
    super('recusa');
  }
}

/** L.1: o insumo escolhido foi excluído de vez agora há pouco (o cadastro dele sumiu depois de a tela ser aberta). */
export const FRASE_INSUMO_EXCLUIDO = 'Este insumo acabou de ser excluído do cadastro. Tire-o da ficha ou escolha outro e salve de novo; nada foi gravado.';

/**
 * L.1: "Insumo não encontrado neste cadastro" para um insumo que existia e foi EXCLUÍDO DE VEZ (o histórico guarda `EXCLUIU`) vira a
 * frase que diz isso; para um id que nunca foi deste cadastro (ou de outro parceiro) a frase continua a de sempre, sem confirmar nada.
 */
async function explicarInsumoExcluido(tx: ClienteDoParceiro, entrada: EntradaDaFicha, erros: Erros): Promise<Erros> {
  const novos: Erros = { ...erros };
  for (const [chave, msg] of Object.entries(erros)) {
    if (msg !== 'Insumo não encontrado neste cadastro.') continue;
    const id = entrada.itens[Number(chave.replace('item-', ''))]?.insumoId;
    if (!id || id.length > 64) continue;
    if ((await tx.historicoAlteracao.count({ where: { entidade: 'Insumo', entidadeId: id, acao: 'EXCLUIU' } })) > 0) novos[chave] = FRASE_INSUMO_EXCLUIDO;
  }
  return novos;
}

/** A FK do banco é a última palavra: o insumo foi excluído entre a conferência e a gravação (nada foi gravado). */
function erroDeInsumoExcluidoNaFk(e: unknown): Extract<ResultadoFicha, { ok: false }> | null {
  const msg = e instanceof Error ? `${e.message} ${(e as { code?: string }).code ?? ''}` : '';
  return /FichaItem_parceiroId_insumoId_fkey|ProdutoEmbalagem_parceiroId_insumoId_fkey/.test(msg) ? { ok: false, erros: { geral: FRASE_INSUMO_EXCLUIDO } } : null;
}

const recusar = (erros: Erros): never => {
  throw new RecusaDaFicha({ ok: false, erros });
};

/**
 * Insumos DESTE parceiro com esses ids, com a linha travada em FOR SHARE até o
 * fim da transação (uma troca de unidade concorrente espera). Id de outro
 * parceiro não volta: o portão e a RLS só enxergam este.
 */
export async function insumosTravados(tx: ClienteDoParceiro, ids: string[]): Promise<Map<string, InsumoDaFicha>> {
  const unicos = Array.from(new Set(ids.filter((x) => typeof x === 'string' && x.length > 0 && x.length <= 64)));
  if (unicos.length === 0) return new Map();
  await tx.sql`SELECT 1 FROM "Insumo" WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ANY(${unicos}::text[]) FOR SHARE`;
  const lidos = await tx.insumo.findMany({
    where: { id: { in: unicos } },
    select: { ...SELECAO_DO_INSUMO, fichaQueProduz: { select: { nome: true } } },
  });
  const mapa = new Map<string, InsumoDaFicha>(lidos.map(({ fichaQueProduz, ...i }) => [i.id, { ...i, produzidoPor: fichaQueProduz?.nome ?? null }]));
  // 1.5: custo pela última compra (a conferência do teto usa o custo de verdade).
  await anexarUltimasCompras(tx, Array.from(mapa.values()));
  return mapa;
}

/** O mesmo para os pré-preparos (fichas) citados: travados, só deste parceiro. */
export async function preparosTravados(tx: ClienteDoParceiro, ids: string[]): Promise<Map<string, PreparoDaFicha>> {
  const unicos = Array.from(new Set(ids.filter((x) => typeof x === 'string' && x.length > 0 && x.length <= 64)));
  if (unicos.length === 0) return new Map();
  await tx.sql`SELECT 1 FROM "FichaTecnica" WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ANY(${unicos}::text[]) FOR SHARE`;
  const lidos = await tx.fichaTecnica.findMany({
    where: { id: { in: unicos } },
    select: { id: true, nome: true, tipo: true, ativa: true, unidadeRendimento: true },
  });
  return new Map(lidos.map((p) => [p.id, p]));
}

/**
 * Uma gravação de ficha por vez no parceiro (até o fim da transação). É o que
 * impede duas edições simultâneas de formarem um círculo sem que nenhuma veja a
 * outra. Precisa ser a primeira coisa da transação de gravar.
 */
export async function travarGrafoDeFichas(tx: ClienteDoParceiro): Promise<void> {
  await tx.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`erp:fichas:${tx.parceiroId}`}, 0))::text AS "trava"`;
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
      subfichaId: i.subfichaId,
      quantidadeMilesimos: i.quantidadeMilesimos,
      fatorCorrecaoMilesimos: i.fatorCorrecaoMilesimos,
      ordem,
    })),
  });
}

/**
 * Confere a foto que chegou (bytes, não nome) e a regrava sem metadados —
 * antes de qualquer gravação.
 */
function prepararMudancaDeFoto(foto: MudancaDeFoto): { erro: string } | Extract<FotoPronta, { ok: true }> | null {
  if (foto.tipo !== 'trocar') return null;
  const p = prepararFoto(foto.bytes);
  return p.ok ? p : { erro: p.erro };
}

// ------------------------------------------------- ler e conferir (comum)

/** Como a ficha está gravada (edição e importação). */
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
  insumoProduzidoId: true,
  ...SELECAO_DA_VALIDADE,
  itens: { orderBy: { ordem: 'asc' as const }, select: { insumoId: true, subfichaId: true, quantidadeMilesimos: true, fatorCorrecaoMilesimos: true } },
} as const;

export type FichaGravada = Prisma.FichaTecnicaGetPayload<{ select: typeof SELECAO_PARA_EDITAR }>;

/** Dados gravados → o formato do leitor (para comparar retratos). */
export function dadosGravados(f: {
  nome: string;
  tipo: TipoFicha;
  descricao: string | null;
  modoPreparo: string | null;
  rendimentoMilesimos: number;
  unidadeRendimento: Unidade;
  itens: { insumoId: string | null; subfichaId?: string | null; quantidadeMilesimos: number; fatorCorrecaoMilesimos?: number }[];
  /** 1.4: as colunas de validade (sem elas, a ficha conta como "não informada"). */
  validades?: Validades | null;
}): DadosFicha {
  return {
    nome: f.nome,
    tipo: f.tipo,
    descricao: f.descricao,
    modoPreparo: f.modoPreparo,
    rendimentoMilesimos: f.rendimentoMilesimos,
    unidadeRendimento: f.unidadeRendimento,
    itens: f.itens
      .filter((i) => i.insumoId || i.subfichaId)
      .map((i) => ({
        insumoId: i.insumoId ?? null,
        subfichaId: i.subfichaId ?? null,
        quantidadeMilesimos: i.quantidadeMilesimos,
        fatorCorrecaoMilesimos: i.fatorCorrecaoMilesimos ?? 1000,
      })),
    validades: f.validades ?? null,
  };
}

/** Ficha gravada (com as colunas de validade) → dados do leitor. */
export const dadosDaFichaGravada = (f: FichaGravada): DadosFicha => dadosGravados({ ...f, validades: validadesDaLinha(f) });

/** Os insumos e pré-preparos que a entrada e a ficha atual citam, travados. */
export async function cadastroDaEntrada(tx: ClienteDoParceiro, entrada: EntradaDaFicha, atual: Pick<FichaGravada, 'itens'> | null) {
  const doCadastro = await insumosTravados(tx, [...entrada.itens.map((i) => i.insumoId ?? ''), ...(atual?.itens.map((i) => i.insumoId ?? '') ?? [])]);
  const preparos = await preparosTravados(tx, [...entrada.itens.map((i) => i.subfichaId ?? ''), ...(atual?.itens.map((i) => i.subfichaId ?? '') ?? [])]);
  const jaNaFicha = new Set((atual?.itens ?? []).flatMap((i) => [i.insumoId, i.subfichaId]).filter((x): x is string => !!x));
  return { doCadastro, preparos, jaNaFicha };
}

const ID_DA_NOVA = '(ficha nova)';

/**
 * O que só o banco sabe (1.3), com a trava do grafo já tomada:
 * - círculo e profundidade dos pré-preparos (todas as ligações do parceiro,
 *   uma consulta);
 * - pré-preparo usado por outra ficha não vira prato nem muda a unidade do
 *   rendimento (as quantidades de lá estão nela);
 * - o custo da receita cabe no que a tela mostra sem erro (2^53 centavos).
 */
export async function conferirEstrutura(
  tx: ClienteDoParceiro,
  dados: DadosFicha,
  atual: Pick<FichaGravada, 'id' | 'nome' | 'tipo' | 'unidadeRendimento'> | null,
  doCadastro: ReadonlyMap<string, InsumoDaFicha>,
): Promise<void> {
  const id = atual?.id ?? ID_DA_NOVA;
  const subfichas = dados.itens.map((i) => i.subfichaId).filter((x): x is string => !!x);

  if (atual?.tipo === 'PRE_PREPARO') {
    const usos = await tx.fichaItem.findMany({ where: { subfichaId: atual.id }, select: { ficha: { select: { nome: true } } }, take: 50 });
    const quem = Array.from(new Set(usos.map((u) => u.ficha.nome)));
    const citados = quem.length === 1 ? `“${quem[0]}”` : `${quem.length} fichas (${quem.slice(0, 3).map((n) => `“${n}”`).join(', ')}${quem.length > 3 ? '…' : ''})`;
    const usa = quem.length === 1 ? 'usa' : 'usam';
    if (quem.length > 0 && dados.tipo === 'PRATO') {
      recusar({ tipo: `${citados} ${usa} este pré-preparo: ele não vira prato. Tire de lá antes, ou crie uma ficha nova de prato.` });
    }
    if (quem.length > 0 && dados.unidadeRendimento !== atual.unidadeRendimento) {
      const u = UNIDADES[atual.unidadeRendimento];
      recusar({ rendimento: `${citados} ${usa} este pré-preparo em ${u.nome.toLowerCase()}: o rendimento continua em ${u.sigla}.` });
    }
  }

  // 1.10 (herança a da 1.9): o prato que já tem produto de venda (embalagens, preço) não vira pré-preparo — o
  // produto ficaria pendurado numa ficha que não se vende. A ficha travada: a gravação das embalagens e dos preços
  // (que criam o produto) também a trava, então a conferência não perde a corrida.
  if (atual?.tipo === 'PRATO' && dados.tipo === 'PRE_PREPARO') {
    await tx.sql`SELECT 1 FROM "FichaTecnica" WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ${atual.id} FOR NO KEY UPDATE`;
    if ((await tx.produtoVenda.count({ where: { fichaId: atual.id } })) > 0) {
      recusar({
        tipo: 'Este prato já tem preço ou embalagem por canal: ele não vira pré-preparo. Para usar a receita como pré-preparo, crie uma ficha nova de pré-preparo.',
      });
    }
  }

  if (subfichas.length > 0 || atual?.tipo === 'PRE_PREPARO') {
    const arestas = await tx.fichaItem.findMany({ where: { subfichaId: { not: null } }, select: { fichaId: true, subfichaId: true } });
    const nomes = new Map((await tx.fichaTecnica.findMany({ where: { tipo: 'PRE_PREPARO' }, select: { id: true, nome: true } })).map((f) => [f.id, f.nome]));
    const r = conferirGrafo(grafoDasArestas(arestas), id, subfichas, (x) => (x === id ? dados.nome : (nomes.get(x) ?? '?')));
    if (!r.ok) recusar({ [chaveDoItem(Math.max(0, dados.itens.findIndex((i) => i.subfichaId === r.subfichaId)))]: r.erro });
  }

  // Custo exato desta receita (com os pré-preparos em cascata) dentro do teto da tela.
  if (dados.itens.length > 0) {
    const raiz: FichaDaCascata = {
      id,
      nome: dados.nome,
      rendimentoMilesimos: dados.rendimentoMilesimos,
      itens: dados.itens.map((i) => ({ ...i, insumo: i.insumoId ? (doCadastro.get(i.insumoId) ?? null) : null })),
    };
    const lidas = await lerCascata(tx, subfichas);
    const custo = cascataDeCusto(new Map<string, FichaDaCascata>([...lidas, [id, raiz]])).custo(id)!;
    if (!cabeNaExibicao(custo.total) || !cabeNaExibicao(custo.porRendimento)) {
      recusar({ itens: 'O custo desta receita passa do limite que o sistema mostra sem erro. Confira as quantidades, os fatores e os preços.' });
    }
  }
}

// ------------------------------------------- insumo produzido pelo pré-preparo

const MOTIVO_DO_PREPARO = 'Acompanha a ficha técnica do pré-preparo';

/**
 * Pré-preparo vira insumo (1.3): o `Insumo` tipo PRE_PREPARO que a ficha
 * produz, com o nome e a unidade do rendimento dela e a mesma situação. A
 * embalagem dele não se usa (1 un a "sem preço"): o custo vem da ficha. Nome
 * já usado por outro insumo é recusado — exceto um insumo de pré-preparo solto
 * e sem preço, que é adotado. Ficha que deixa de ser pré-preparo solta o
 * insumo e o desativa (o histórico dele fica).
 */
async function sincronizarInsumoProduzido(
  tx: ClienteDoParceiro,
  f: {
    id: string;
    nome: string;
    tipo: TipoFicha;
    unidadeRendimento: Unidade;
    ativa: boolean;
    insumoProduzidoId: string | null;
    /** 1.4: a conservação do insumo produzido vem daqui (null = não informada). */
    validades: Validades | null;
  },
  autorNome: string,
): Promise<void> {
  const historico = (entidadeId: string, acao: string, antes: Prisma.InputJsonValue | undefined, depois: Prisma.InputJsonValue, motivo = MOTIVO_DO_PREPARO) =>
    tx.historicoAlteracao.create({ data: { parceiroId: tx.parceiroId, entidade: 'Insumo', entidadeId, acao, antes, depois, motivo, autorNome } });

  if (f.tipo !== 'PRE_PREPARO') {
    if (!f.insumoProduzidoId) return;
    await tx.fichaTecnica.updateMany({ where: { id: f.id }, data: { insumoProduzidoId: null } });
    const ins = await tx.insumo.findUnique({ where: { id: f.insumoProduzidoId }, select: { nome: true, ativo: true } });
    if (ins?.ativo) {
      await tx.insumo.updateMany({ where: { id: f.insumoProduzidoId }, data: { ativo: false } });
      await historico(f.insumoProduzidoId, 'DESATIVOU', { nome: ins.nome, ativo: true }, { nome: ins.nome, ativo: false }, `A ficha “${f.nome}” virou prato.`);
    }
    return;
  }

  const nomeOcupado = async (nome: string, menos: string | null) => {
    const outro = await tx.insumo.findFirst({ where: { nome, ...(menos ? { NOT: { id: menos } } : {}) }, select: { id: true } });
    if (outro) {
      recusar({ nome: `Já existe o insumo “${nome}” em Insumos. Dê outro nome ao pré-preparo (ex.: “${nome} da casa”) ou renomeie o insumo.` });
    }
  };
  const conferirUnidade = async (insumoId: string) => {
    const motivo = await motivoDaUnidadeTravada(tx, insumoId, { peloPreparo: true });
    if (motivo) recusar({ rendimento: `O rendimento não muda de unidade: o insumo “${f.nome}” já tem compra, estoque ou outra embalagem.` });
  };

  // Conservação do insumo produzido (1.4): a da ficha. Sem validade na ficha, as
  // validades do insumo ficam nulas e a principal fica a que estava (coluna NOT NULL).
  const conservacaoDe = (atual: Validades['principal']) => ({ conservacao: f.validades?.principal ?? atual, ...colunasDaValidade(f.validades) });

  if (f.insumoProduzidoId) {
    const ins = await tx.insumo.findUnique({ where: { id: f.insumoProduzidoId }, select: { nome: true, unidade: true, ativo: true, ...SELECAO_DA_VALIDADE } });
    if (ins) {
      const antes: Record<string, string | boolean | null> = {};
      const depois: Record<string, string | boolean | null> = {};
      const validadeAntes = validadesDaLinha(ins);
      const conservacao = conservacaoDe(ins.conservacao);
      if (ins.conservacao !== conservacao.conservacao) [antes.conservacao, depois.conservacao] = [ins.conservacao, conservacao.conservacao];
      if (retratoDaValidade(validadeAntes) !== retratoDaValidade(f.validades)) {
        [antes.validade, depois.validade] = [retratoDaValidade(validadeAntes), retratoDaValidade(f.validades)];
      }
      if (ins.nome !== f.nome) {
        await nomeOcupado(f.nome, f.insumoProduzidoId);
        [antes.nome, depois.nome] = [ins.nome, f.nome];
      }
      if (ins.unidade !== f.unidadeRendimento) {
        await conferirUnidade(f.insumoProduzidoId);
        [antes.unidade, depois.unidade] = [ins.unidade, f.unidadeRendimento];
      }
      if (ins.ativo !== f.ativa) [antes.ativo, depois.ativo] = [ins.ativo, f.ativa];
      if (Object.keys(depois).length === 0) return;
      await tx.insumo.updateMany({ where: { id: f.insumoProduzidoId }, data: { nome: f.nome, unidade: f.unidadeRendimento, ativo: f.ativa, ...conservacao } });
      await historico(f.insumoProduzidoId, 'ALTEROU', { nome: ins.nome, ...antes }, { nome: f.nome, ...depois });
      return;
    }
  }

  // Ainda não tem insumo: adota um de pré-preparo solto e sem preço com o mesmo nome, ou cria.
  const mesmoNome = await tx.insumo.findFirst({
    where: { nome: f.nome },
    select: { id: true, tipo: true, unidade: true, ativo: true, precoEmbalagemCentavos: true, conservacao: true, fichaQueProduz: { select: { id: true } } },
  });
  let insumoId: string;
  if (mesmoNome) {
    if (mesmoNome.tipo !== 'PRE_PREPARO' || mesmoNome.fichaQueProduz || mesmoNome.precoEmbalagemCentavos !== 0) await nomeOcupado(f.nome, null);
    if (mesmoNome.unidade !== f.unidadeRendimento) await conferirUnidade(mesmoNome.id);
    await tx.insumo.updateMany({ where: { id: mesmoNome.id }, data: { unidade: f.unidadeRendimento, ativo: f.ativa, ...conservacaoDe(mesmoNome.conservacao) } });
    await historico(mesmoNome.id, 'ALTEROU', { nome: f.nome, fichaQueProduz: null }, { nome: f.nome, fichaQueProduz: f.nome });
    insumoId = mesmoNome.id;
  } else {
    // I.1a: o pré-preparo nasce com a categoria que o nome sugere. Na dúvida ele vai para "Outros / a classificar" com o
    // motivo (a fila de revisão o pega): a ficha nunca trava por causa disso.
    let sugestao = await sugestaoParaInsumo(tx, f.nome, 'PRE_PREPARO');
    if (!sugestao.categoriaId) {
      await garantirCategoriasPadrao(tx);
      sugestao = await sugestaoParaInsumo(tx, f.nome, 'PRE_PREPARO');
    }
    const novo = await tx.insumo.create({
      data: {
        parceiroId: tx.parceiroId,
        nome: f.nome,
        tipo: 'PRE_PREPARO',
        unidade: f.unidadeRendimento,
        conteudoMilesimos: 1000,
        precoEmbalagemCentavos: 0,
        ativo: f.ativa,
        ...conservacaoDe('SECO'),
        ...(sugestao.categoriaId
          ? { categoriaId: sugestao.categoriaId, classificadoPor: 'SUGESTAO', classificacaoMotivo: sugestao.chave === 'OUTROS' ? sugestao.motivo : null, classificadoEm: new Date() }
          : {}),
      },
      select: { id: true },
    });
    await historico(novo.id, 'CRIOU', undefined, {
      nome: f.nome,
      tipo: 'PRE_PREPARO',
      ...(sugestao.categoriaId ? { categoria: sugestao.nome, categoriaId: sugestao.categoriaId, classificadoPor: 'SUGESTAO' } : {}),
      unidade: f.unidadeRendimento,
      fichaQueProduz: f.nome,
      ...(f.validades ? { conservacao: f.validades.principal, validade: retratoDaValidade(f.validades) } : {}),
    });
    insumoId = novo.id;
  }
  await tx.fichaTecnica.updateMany({ where: { id: f.id }, data: { insumoProduzidoId: insumoId } });
}

// --------------------------------------------------------- gravar (comum)

export interface Gravacao {
  /** Ficha nova (null) ou a versão lida da existente. */
  atual: Pick<FichaGravada, 'id' | 'atualizadoEm' | 'fotoArquivo' | 'insumoProduzidoId'> | null;
  dados: DadosFicha;
  doCadastro: ReadonlyMap<string, InsumoDaFicha>;
  preparos: ReadonlyMap<string, PreparoDaFicha>;
  foto: { arquivo: string; mime: string; bytes: number } | null | 'manter';
  origem?: 'MANUAL' | 'IMPORTACAO';
  autorNome: string;
  motivo?: string | null;
  /** Retrato de antes (edição), para a diferença. */
  antes?: ReturnType<typeof retratoDaFicha>;
}

/**
 * Cria ou altera UMA ficha dentro de uma transação já aberta (o formulário e a
 * importação passam por aqui), com a trava do grafo e `conferirEstrutura` já
 * feitos. Edição é condicional à versão lida; sem mudança, não grava nada (só
 * acerta o insumo produzido, se faltar). Devolve os campos que mudaram.
 */
export async function gravarFicha(tx: ClienteDoParceiro, g: Gravacao): Promise<{ id: string; mudou: string[] }> {
  const d = g.dados;
  const fotoArquivo = g.foto === 'manter' ? (g.atual?.fotoArquivo ?? null) : (g.foto?.arquivo ?? null);
  const dadosDaFoto =
    g.foto === 'manter' ? {} : { fotoArquivo: g.foto?.arquivo ?? null, fotoMime: g.foto?.mime ?? null, fotoBytes: g.foto?.bytes ?? null };
  const depois = retratoDaFicha(d, g.doCadastro, fotoArquivo, g.preparos);
  const sincronizar = (id: string, insumoProduzidoId: string | null) =>
    sincronizarInsumoProduzido(
      tx,
      { id, nome: d.nome, tipo: d.tipo, unidadeRendimento: d.unidadeRendimento, ativa: true, insumoProduzidoId, validades: d.validades },
      g.autorNome,
    );

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
        conservacao: d.validades?.principal ?? null,
        ...colunasDaValidade(d.validades),
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
    await sincronizar(nova.id, null);
    return { id: nova.id, mudou: [] };
  }

  const mudanca = g.antes ? diferenca(g.antes, depois) : null;
  if (!mudanca) {
    await sincronizar(g.atual.id, g.atual.insumoProduzidoId);
    return { id: g.atual.id, mudou: [] };
  }
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
      conservacao: d.validades?.principal ?? null,
      ...colunasDaValidade(d.validades),
      ...dadosDaFoto,
    },
  });
  if (r.count === 0) throw new RecusaDaFicha({ ok: false, erros: { geral: MENSAGEM_CONFLITO_FICHA }, conflito: true });
  if (mudanca.campos.includes('itens')) {
    await tx.fichaItem.deleteMany({ where: { fichaId: g.atual.id } });
    await gravarItens(tx, g.atual.id, d.itens);
  }
  // 1.9: o produto de venda da casa (sem marca) leva o nome da ficha — renomear a ficha leva o dele junto.
  if (mudanca.campos.includes('nome')) await tx.produtoVenda.updateMany({ where: { fichaId: g.atual.id, marcaId: null }, data: { nome: d.nome } });
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
  await sincronizar(g.atual.id, g.atual.insumoProduzidoId);
  return { id: g.atual.id, mudou: mudanca.campos };
}

/**
 * Põe a foto nova no lugar (bytes: grava já sem metadados; enviada: move a
 * pendente) e roda a gravação. Se a transação não fechar, a foto nova sai do
 * lugar: a gravada é apagada, a enviada volta a ser pendente.
 */
async function comFoto<T>(
  cliente: ClienteDoParceiro,
  foto: MudancaDeFoto,
  pronta: Extract<FotoPronta, { ok: true }> | null,
  fn: (nova: { arquivo: string; mime: string; bytes: number } | null | 'manter') => Promise<T>,
): Promise<T> {
  let nova: { arquivo: string; mime: string; bytes: number } | null | 'manter' = foto.tipo === 'manter' ? 'manter' : null;
  if (foto.tipo === 'trocar' && pronta) {
    const arquivo = await salvarFoto(cliente.parceiroId, pronta.bytes, pronta.extensao);
    nova = { arquivo, mime: pronta.mime, bytes: pronta.bytes.length };
  }
  if (foto.tipo === 'enviada') {
    nova = await assumirFotoPendente(cliente.parceiroId, foto.arquivo);
    if (!nova) throw new RecusaDaFicha({ ok: false, erros: { foto: MENSAGEM_FOTO_SUMIU } });
  }
  try {
    return await fn(nova);
  } catch (e) {
    if (nova && nova !== 'manter') {
      if (foto.tipo === 'enviada') await devolverFotoPendente(cliente.parceiroId, nova.arquivo);
      else await apagarFoto(cliente.parceiroId, nova.arquivo);
    }
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
  const pronta = prepararMudancaDeFoto(foto);
  if (pronta && 'erro' in pronta) return { ok: false, erros: { foto: pronta.erro } };
  let nome = '';
  try {
    return await comFoto(cliente, foto.tipo === 'remover' ? { tipo: 'manter' } : foto, pronta, (nova) =>
      cliente.transacao(async (tx) => {
        await travarGrafoDeFichas(tx);
        const { doCadastro, preparos } = await cadastroDaEntrada(tx, entrada, null);
        const lido = lerFormFicha(entrada, doCadastro, new Set(), { preparos });
        if (!lido.ok) throw new RecusaDaFicha({ ...lido, erros: await explicarInsumoExcluido(tx, entrada, lido.erros) });
        nome = lido.dados.nome;
        await conferirEstrutura(tx, lido.dados, null, doCadastro);
        const r = await gravarFicha(tx, {
          atual: null,
          dados: lido.dados,
          doCadastro,
          preparos,
          foto: nova === 'manter' ? null : nova,
          autorNome,
        });
        return { ok: true as const, id: r.id, nome, mudou: [] };
      }),
    );
  } catch (e) {
    if (e instanceof RecusaDaFicha) return e.resultado;
    if (ehErroDeUnicidade(e)) return erroDeNomeRepetido(cliente, nome);
    const fk = erroDeInsumoExcluidoNaFk(e);
    if (fk) return fk;
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
  const pronta = prepararMudancaDeFoto(foto);
  if (pronta && 'erro' in pronta) return { ok: false, erros: { foto: pronta.erro } };

  let nome = '';
  let fotoAntiga: string | null = null;
  let resultado: ResultadoFicha;
  try {
    resultado = await comFoto(cliente, foto, pronta, (nova) =>
      cliente.transacao(async (tx) => {
        await travarGrafoDeFichas(tx);
        const atual = await tx.fichaTecnica.findUnique({ where: { id }, select: SELECAO_PARA_EDITAR });
        if (!atual) throw new RecusaDaFicha({ ok: false, erros: { geral: 'Ficha não encontrada.' }, naoEncontrado: true });
        if (!atual.ativa) throw new RecusaDaFicha({ ok: false, erros: { geral: MENSAGEM_FICHA_DESATIVADA } });
        if (atual.atualizadoEm.getTime() !== versao.getTime()) {
          throw new RecusaDaFicha({ ok: false, erros: { geral: MENSAGEM_CONFLITO_FICHA }, conflito: true });
        }
        const { doCadastro, preparos, jaNaFicha } = await cadastroDaEntrada(tx, entrada, atual);
        const lido = lerFormFicha(entrada, doCadastro, jaNaFicha, { preparos, propriaId: atual.id });
        if (!lido.ok) throw new RecusaDaFicha({ ...lido, erros: await explicarInsumoExcluido(tx, entrada, lido.erros) });
        // Envio sem o bloco de validade (1.4) não apaga a que a ficha tem.
        if (entrada.validade === undefined) lido.dados.validades = validadesDaLinha(atual);
        nome = lido.dados.nome;
        await conferirEstrutura(tx, lido.dados, atual, doCadastro);
        const r = await gravarFicha(tx, {
          atual,
          dados: lido.dados,
          doCadastro,
          preparos,
          foto: nova,
          antes: retratoDaFicha(dadosDaFichaGravada(atual), doCadastro, atual.fotoArquivo, preparos),
          autorNome,
        });
        if (nova !== 'manter' && r.mudou.includes('foto')) fotoAntiga = atual.fotoArquivo;
        return { ok: true as const, id, nome, mudou: r.mudou };
      }),
    );
  } catch (e) {
    if (e instanceof RecusaDaFicha) return e.resultado;
    if (ehErroDeUnicidade(e)) return erroDeNomeRepetido(cliente, nome);
    const fk = erroDeInsumoExcluidoNaFk(e);
    if (fk) return fk;
    throw e;
  }
  // Depois do commit: a foto velha já não é de ninguém.
  await apagarFoto(cliente.parceiroId, fotoAntiga);
  return resultado;
}

// --------------------------------------------------- desativar/reativar

/** Desativar/reativar; o insumo que o pré-preparo produz acompanha. */
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
      const atual = await tx.fichaTecnica.findUnique({
        where: { id },
        select: { nome: true, tipo: true, unidadeRendimento: true, insumoProduzidoId: true, ...SELECAO_DA_VALIDADE },
      });
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
      if (atual.insumoProduzidoId) {
        const { conservacao: _c, validadeSecoMin: _s, validadePistaFriaMin: _p, validadeRefrigeradoMin: _r, validadeCongeladoMin: _g, ...resto } = atual;
        await sincronizarInsumoProduzido(tx, { id, ...resto, ativa, validades: validadesDaLinha(atual) }, autorNome);
      }
      return { ok: true as const, id, nome: atual.nome, mudou: ['ativo'] };
    });
  } catch (e) {
    if (e instanceof RecusaDaFicha) return e.resultado;
    throw e;
  }
}

// ---------------------------------------------------------------- ler

/** Pré-preparos com custo incompleto (para o filtro "só custo incompleto"). */
async function preparosIncompletos(tx: ClienteDoParceiro): Promise<string[]> {
  const ids = (await tx.fichaTecnica.findMany({ where: { tipo: 'PRE_PREPARO' }, select: { id: true } })).map((p) => p.id);
  if (ids.length === 0) return [];
  const c = await custosEmCascata(tx, ids);
  return ids.filter((id) => custoIncompleto(c.custo(id)!));
}

/** Insumo sem preço: nem preço cadastrado nem nota lançada (1.5: a compra dá o preço). */
const SEM_PRECO_NEM_COMPRA = { precoEmbalagemCentavos: 0, notaItens: { none: { nota: { status: 'LANCADA' as const } } } };

function filtroDoBanco(f: FiltrosDeFicha, incompletos: string[]): Prisma.FichaTecnicaWhereInput {
  const q = f.q.trim().slice(0, 80);
  return {
    ...(q ? { nome: { contains: q, mode: 'insensitive' as const } } : {}),
    ...(f.tipo ? { tipo: f.tipo } : {}),
    ...(f.situacao === 'ativas' ? { ativa: true } : f.situacao === 'desativadas' ? { ativa: false } : {}),
    ...(f.incompleto ? { itens: { some: { OR: [{ insumo: SEM_PRECO_NEM_COMPRA }, { subfichaId: { in: incompletos } }] } } } : {}),
  };
}

/** Versão da foto para a URL (troca de foto = URL nova; o navegador não mostra a velha). */
const versaoDaFoto = (arquivo: string | null) => (arquivo ? arquivo.slice(0, 12) : null);

const SELECAO_DA_LISTA = {
  id: true,
  nome: true,
  tipo: true,
  descricao: true,
  rendimentoMilesimos: true,
  unidadeRendimento: true,
  ativa: true,
  fotoArquivo: true,
  ...SELECAO_DA_VALIDADE,
  itens: { orderBy: { ordem: 'asc' as const }, select: SELECAO_DO_ITEM },
} as const;

/** Página da lista com o total, custo calculado na hora (nunca gravado), em cascata. */
export async function listarFichas(cliente: ClienteDoParceiro, filtros: Partial<FiltrosDeFicha> = {}) {
  const f: FiltrosDeFicha = { ...FILTROS_DE_FICHA_PADRAO, ...filtros };
  // Foto enviada e nunca salva (herança d da 1.3): sai também ao abrir a lista, de vez em quando.
  await faxinarPendentesDeVezEmQuando(cliente.parceiroId);
  return cliente.transacao(async (tx) => {
    const where = filtroDoBanco(f, f.incompleto ? await preparosIncompletos(tx) : []);
    const total = await tx.fichaTecnica.count({ where });
    const paginas = Math.max(1, Math.ceil(total / FICHAS_POR_PAGINA));
    const pagina = Math.min(Math.max(1, Math.trunc(f.pagina) || 1), paginas);
    const lidas = await tx.fichaTecnica.findMany({
      where,
      orderBy: [{ nome: 'asc' }, { id: 'asc' }],
      skip: (pagina - 1) * FICHAS_POR_PAGINA,
      take: FICHAS_POR_PAGINA,
      select: SELECAO_DA_LISTA,
    });
    const cascata = await custosEmCascata(tx, [], lidas);
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
      preparos: l.itens.filter((i) => i.subfichaId).length,
      custo: cascata.custo(l.id)!,
      validades: validadesDaLinha(l),
    }));
    return { linhas, total, pagina, paginas };
  });
}

export type LinhaDeFicha = Awaited<ReturnType<typeof listarFichas>>['linhas'][number];

/** Um item do pré-preparo, para "de onde vem" no detalhe de quem o usa. */
export interface ItemDoPreparo {
  nome: string;
  unidade: Unidade;
  quantidadeMilesimos: number;
  fatorCorrecaoMilesimos: number;
  preparo: boolean;
  custo: Fracao | null;
}

function itensDoPreparo(sub: FichaLida, custo: CustoDaFicha, fichas: ReadonlyMap<string, FichaLida>): ItemDoPreparo[] {
  return sub.itens.map((i, n) => {
    const p = i.subfichaId ? fichas.get(i.subfichaId) : undefined;
    const ins = i.insumo as { nome?: string; unidade?: Unidade } | null;
    return {
      nome: p?.nome ?? ins?.nome ?? '?',
      unidade: p?.unidadeRendimento ?? ins?.unidade ?? 'UN',
      quantidadeMilesimos: i.quantidadeMilesimos,
      fatorCorrecaoMilesimos: i.fatorCorrecaoMilesimos,
      preparo: !!i.subfichaId,
      custo: custo.itens[n] ?? null,
    };
  });
}

/**
 * `verPrecos` (1.10): o histórico da ficha leva preço, margem e custo do canal
 * só para quem vê preços (`precos.ver`). Padrão: não.
 */
export async function obterFicha(cliente: ClienteDoParceiro, id: string, opcoes: { verPrecos?: boolean } = {}) {
  return cliente.transacao(async (tx) => {
    const f = await tx.fichaTecnica.findUnique({
      where: { id },
      select: {
        ...SELECAO_DA_LISTA,
        modoPreparo: true,
        origem: true,
        atualizadoEm: true,
        insumoProduzido: { select: { id: true, nome: true } },
        usadaComoSub: { select: { ficha: { select: { id: true, nome: true, ativa: true } } } },
      },
    });
    if (!f) return null;
    const historico = await listarHistorico(tx, { de: [{ entidade: 'FichaTecnica', ids: [id] }], limite: 10, verPrecos: opcoes.verPrecos === true });
    const cascata = await custosEmCascata(tx, [], [f]);
    const custo = cascata.custo(id)!;
    const usadaEm = Array.from(new Map(f.usadaComoSub.map((u) => [u.ficha.id, u.ficha])).values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
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
      insumoProduzido: f.insumoProduzido,
      validades: validadesDaLinha(f),
      usadaEm,
      itens: f.itens.map((i, n) => {
        const sub = i.subfichaId ? cascata.fichas.get(i.subfichaId) : undefined;
        const custoDoSub = sub ? cascata.custo(sub.id)! : null;
        return {
          id: i.id,
          insumoId: i.insumoId,
          subfichaId: i.subfichaId,
          nome: sub?.nome ?? i.insumo?.nome ?? '?',
          unidade: (sub?.unidadeRendimento ?? i.insumo?.unidade ?? 'UN') as Unidade,
          ativo: sub?.ativa ?? i.insumo?.ativo ?? true,
          quantidadeMilesimos: i.quantidadeMilesimos,
          fatorCorrecaoMilesimos: i.fatorCorrecaoMilesimos,
          custoDoInsumo: i.insumo ? custoDoInsumo(i.insumo) : null,
          custo: custo.itens[n],
          preparo:
            sub && custoDoSub
              ? {
                  id: sub.id,
                  rendimentoMilesimos: sub.rendimentoMilesimos,
                  unidadeRendimento: sub.unidadeRendimento,
                  custo: custoDoSub,
                  itens: itensDoPreparo(sub, custoDoSub, cascata.fichas),
                }
              : null,
        };
      }),
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

/**
 * Insumos que o formulário oferece: os ativos e os que já estão na ficha
 * (desativados, marcados). O insumo produzido por um pré-preparo NÃO entra
 * aqui: na receita, ele aparece como o pré-preparo (`preparosParaFicha`).
 */
export async function insumosParaFicha(cliente: ClienteDoParceiro, jaNaFicha: string[] = []) {
  const lidos = await cliente.insumo.findMany({
    // I.1b: material de limpeza e uso não é ingrediente: não é oferecido na ficha (o que já estivesse nela continua).
    where: { fichaQueProduz: { is: null }, OR: [{ ativo: true, NOT: { tipo: 'MATERIAL' } }, { id: { in: jaNaFicha } }] },
    orderBy: { nome: 'asc' },
    select: SELECAO_DO_INSUMO,
  });
  await anexarUltimasCompras(cliente, lidos as (typeof lidos[number] & ComUltimaCompra)[]);
  return lidos.map((i) => ({
    id: i.id,
    nome: i.nome,
    unidade: i.unidade as Unidade,
    ativo: i.ativo,
    custo: custoDoInsumo(i) as CustoExato | null,
  }));
}

export type InsumoDoFormulario = Awaited<ReturnType<typeof insumosParaFicha>>[number];

/**
 * Pré-preparos que o formulário oferece (ativos e os que já estão na ficha),
 * sem a própria ficha, com o custo por unidade de rendimento já em cascata. O
 * custo vai como texto (num/den): a tela é cliente e BigInt não atravessa.
 */
export async function preparosParaFicha(cliente: ClienteDoParceiro, jaNaFicha: string[] = [], propriaId?: string) {
  return cliente.transacao(async (tx) => {
    const lidos = await tx.fichaTecnica.findMany({
      where: { tipo: 'PRE_PREPARO', OR: [{ ativa: true }, { id: { in: jaNaFicha } }], ...(propriaId ? { NOT: { id: propriaId } } : {}) },
      orderBy: { nome: 'asc' },
      select: { id: true },
    });
    const c = await custosEmCascata(tx, lidos.map((l) => l.id));
    return lidos.map((l) => {
      const f = c.fichas.get(l.id)!;
      const k = c.custo(l.id)!;
      return {
        id: f.id,
        nome: f.nome,
        unidade: f.unidadeRendimento,
        ativo: f.ativa,
        /** Centavos por unidade do rendimento (1 kg, 1 L, 1 un), exato. */
        custo: { num: k.porRendimento.num.toString(), den: k.porRendimento.den.toString() },
        incompleto: custoIncompleto(k),
      };
    });
  });
}

export type PreparoDoFormulario = Awaited<ReturnType<typeof preparosParaFicha>>[number];

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
