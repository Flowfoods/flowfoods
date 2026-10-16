/**
 * Precificação dentro da ficha técnica (1.9) — regra com banco, sem tela.
 * Sempre um `ClienteDoParceiro`: embalagem, produto e taxa de outro parceiro
 * não existem para estas funções (portão + RLS; e a FK composta recusa no
 * banco). A conta é a pura (`canal-campos.ts`); o custo da ficha é o da
 * cascata (1.3) com o último preço (1.5) — nada é gravado, tudo se deriva na
 * leitura (decisões 53, 57, 65).
 *
 * - a ficha de PRATO tem um produto de venda "da casa" (`ProdutoVenda` sem
 *   marca, nome = o da ficha), criado na primeira gravação das embalagens e
 *   renomeado junto com a ficha; as embalagens por canal são dele
 *   (`ProdutoEmbalagem`). Marca e nome de venda próprios: 1.10+;
 * - gravar as embalagens trava a ficha (`FOR NO KEY UPDATE`) e confere a
 *   impressão da lista lida: duas abas, a segunda recebe "alguém alterou";
 * - os insumos citados são lidos travados (`FOR SHARE`: a unidade não muda no
 *   meio) e só tipo Embalagem entram;
 * - a taxa do iFood é do parceiro (`CanalConfig` IFOOD): editar é condicional
 *   ao `atualizadoEm` lido; criar em corrida = único (parceiro, canal);
 * - todo gravar leva o histórico (só o que mudou) na MESMA transação.
 */

import type { ClienteDoParceiro } from './tenant';
import { checkVioladoDe, ehErroDeUnicidade } from './tenant';
import { anexarUltimasCompras } from './compras-custo';
import { custosEmCascata, SELECAO_DO_INSUMO } from './ficha-custos';
import { custoDoInsumo, type CustoDaFicha } from './ficha-campos';
import { diferenca, type Erros } from './insumo-campos';
import { listarHistorico } from './historico';
import {
  CAMPO_DO_CANAL,
  CANAIS,
  taxaTotalBp,
  CANAIS_COM_EMBALAGEM,
  ehCanalComEmbalagem,
  impressaoDasEmbalagens,
  lerEmbalagens,
  lerTaxaDoCanal,
  ORDEM_DOS_CANAIS,
  retratoDasEmbalagens,
  type CamadasDoCanal,
  type CanalComEmbalagem,
  type EmbalagemDigitada,
  type EmbalagemDoCadastro,
  type EmbalagemDoCanal,
  type EmbalagemParaCusto,
  type TaxaDoCanal,
  type CanalVenda,
} from './canal-campos';
import { formatarPontosBase, type CustoExato, type Unidade } from './unidades';
import {
  camposDoCanal,
  impressaoDosCustos,
  impressaoDosPrecos,
  lerMargensAlvo,
  lerPrecos,
  precoDoCanal,
  retratoDosPrecos,
  type EntradaDoCanal,
} from './preco-campos';

export type ResultadoDoCanal = { ok: true; id: string; mudou: string[] } | { ok: false; erros: Erros; conflito?: boolean; naoEncontrado?: boolean };

class Recusa extends Error {
  constructor(readonly resultado: Extract<ResultadoDoCanal, { ok: false }>) {
    super('recusa');
  }
}

export const MENSAGEM_CONFLITO_DAS_EMBALAGENS =
  'Alguém mudou as embalagens desta ficha agora há pouco. Recarregue a página para ver a versão nova; nada foi gravado.';
export const MENSAGEM_CONFLITO_DA_TAXA = 'Alguém mudou a taxa do iFood agora há pouco. Recarregue a página para ver a versão nova; nada foi gravado.';

const ID = /^[a-z0-9]{1,64}$/i;

// ------------------------------------------------------------------- ler

/** Embalagens gravadas do produto da ficha, na ordem da tela: canal, nome. */
async function embalagensGravadas(tx: ClienteDoParceiro, fichaId: string) {
  const produto = await tx.produtoVenda.findFirst({
    where: { fichaId, marcaId: null },
    select: {
      id: true,
      embalagens: { select: { canal: true, insumoId: true, quantidadeMilesimos: true, insumo: { select: { ...SELECAO_DO_INSUMO, tipo: true } } } },
    },
  });
  const lista = (produto?.embalagens ?? [])
    .filter((e) => ehCanalComEmbalagem(e.canal))
    .map((e) => ({
      canal: e.canal as CanalComEmbalagem,
      insumoId: e.insumoId,
      quantidadeMilesimos: e.quantidadeMilesimos,
      insumo: { ...e.insumo, unidade: e.insumo.unidade as Unidade, ultimaCompra: null as CustoExato | null },
    }))
    .sort(
      (a, b) =>
        CANAIS_COM_EMBALAGEM.indexOf(a.canal) - CANAIS_COM_EMBALAGEM.indexOf(b.canal) ||
        a.insumo.nome.localeCompare(b.insumo.nome, 'pt-BR') ||
        (a.insumoId < b.insumoId ? -1 : 1),
    );
  return { produtoId: produto?.id ?? null, lista };
}

/** A taxa do iFood do parceiro (null = não configurada). */
async function taxaDoIfood(tx: ClienteDoParceiro) {
  return tx.canalConfig.findFirst({
    where: { canal: 'IFOOD' },
    select: { id: true, taxaBp: true, taxaPagamentoBp: true, margemAlvoPadraoBp: true, atualizadoEm: true },
  });
}

/** As configurações dos canais do parceiro (até 3 linhas): a taxa do iFood e as margens-alvo (1.10). */
async function configsDosCanais(tx: ClienteDoParceiro) {
  const lidas = await tx.canalConfig.findMany({
    select: { id: true, canal: true, taxaBp: true, taxaPagamentoBp: true, margemAlvoPadraoBp: true, atualizadoEm: true },
  });
  const de = (c: CanalVenda) => lidas.find((x) => x.canal === c) ?? null;
  const ifood = de('IFOOD');
  // A linha do iFood nasce na configuração da taxa (1.9): sem ela, a taxa não foi configurada.
  const taxa: TaxaDoCanal | null = ifood ? { comissaoBp: ifood.taxaBp, pagamentoBp: ifood.taxaPagamentoBp } : null;
  const margens = Object.fromEntries(ORDEM_DOS_CANAIS.map((c) => [c, de(c)?.margemAlvoPadraoBp ?? null])) as Record<CanalVenda, number | null>;
  return { lidas, de, taxa, margens };
}

/**
 * Tudo o que a conta dos canais de UMA ficha de prato precisa, lido na mesma
 * transação: embalagens (com o último preço), taxa do iFood, margens-alvo e
 * os preços próprios gravados. `custo` = o custo da ficha (a cascata).
 */
async function contaDosCanais(tx: ClienteDoParceiro, fichaId: string, custo: Pick<CustoDaFicha, 'porRendimento' | 'faltaPreco'>) {
  const [{ produtoId, lista }, cfg] = await Promise.all([embalagensGravadas(tx, fichaId), configsDosCanais(tx)]);
  const gravados = produtoId
    ? await tx.produtoCanal.findMany({ where: { produtoId }, select: { id: true, canal: true, precoManualCentavos: true } })
    : [];
  // 1.5: a embalagem custa o último preço da nota (uma consulta para a leitura inteira).
  await anexarUltimasCompras(
    tx,
    lista.map((e) => e.insumo),
  );
  const paraCusto = (canal: CanalComEmbalagem): EmbalagemParaCusto[] =>
    lista
      .filter((e) => e.canal === canal)
      .map((e) => ({ insumoId: e.insumoId, nome: e.insumo.nome, unidade: e.insumo.unidade, quantidadeMilesimos: e.quantidadeMilesimos, insumo: e.insumo }));
  const entradas: EntradaDoCanal[] = ORDEM_DOS_CANAIS.map((canal) => ({
    canal,
    custoDaFicha: custo,
    embalagens: canal === 'LOJA' ? [] : paraCusto(canal),
    // Só o iFood cobra sobre o preço; loja e delivery próprio, não.
    taxa: canal === 'IFOOD' ? (cfg.taxa ?? 'naoConfigurada') : null,
  }));
  const proprio = (c: CanalVenda) => gravados.find((g) => g.canal === c)?.precoManualCentavos ?? null;
  const precos = entradas.map((e) => precoDoCanal(e, { margemAlvoBp: cfg.margens[e.canal], precoProprioCentavos: proprio(e.canal) }));
  return { produtoId, lista, cfg, gravados, entradas, precos };
}

/**
 * O custo por canal da ficha de PRATO, em camadas, com o custo da ficha que a
 * tela já calculou (a cascata: não se lê duas vezes) — e, desde a 1.10, o
 * preço e a margem de cada canal. Pré-preparo não se vende: null.
 */
export async function custoPorCanal(cliente: ClienteDoParceiro, ficha: { id: string; tipo: string; custo: CustoDaFicha }) {
  if (ficha.tipo !== 'PRATO') return null;
  return cliente.transacao(async (tx) => {
    const { produtoId, lista, cfg, gravados, entradas, precos } = await contaDosCanais(tx, ficha.id, ficha.custo);
    return {
      produtoId,
      impressao: impressaoDasEmbalagens(lista),
      embalagens: lista.map((e) => ({
        canal: e.canal,
        insumoId: e.insumoId,
        nome: e.insumo.nome,
        unidade: e.insumo.unidade,
        ativo: e.insumo.ativo,
        tipo: e.insumo.tipo,
        quantidadeMilesimos: e.quantidadeMilesimos,
      })),
      taxaDoIfood: cfg.taxa,
      /** As camadas da 1.9 (com a taxa em R$ quando o canal tem preço). */
      canais: precos.map((p) => p.camadas) as CamadasDoCanal[],
      // 1.10
      entradas,
      precos,
      margensAlvo: cfg.margens,
      impressaoDosPrecos: impressaoDosPrecos(gravados),
      impressaoDosCustos: impressaoDosCustos(entradas),
    };
  });
}

export type CustoPorCanal = NonNullable<Awaited<ReturnType<typeof custoPorCanal>>>;

/**
 * Embalagens que o formulário oferece: insumos tipo Embalagem ativos e as que
 * já estão na ficha (desativadas ou que mudaram de tipo, marcadas), com o
 * custo de referência para a prévia.
 */
export async function embalagensParaEscolher(cliente: ClienteDoParceiro, jaNaFicha: readonly string[] = []) {
  const lidos = await cliente.insumo.findMany({
    where: { OR: [{ tipo: 'EMBALAGEM', ativo: true }, { id: { in: [...jaNaFicha] } }] },
    orderBy: { nome: 'asc' },
    select: { ...SELECAO_DO_INSUMO, tipo: true },
  });
  const comCompra = lidos.map((i) => ({ ...i, ultimaCompra: null as CustoExato | null }));
  await anexarUltimasCompras(cliente, comCompra);
  return comCompra.map((i) => ({
    id: i.id,
    nome: i.nome,
    unidade: i.unidade as Unidade,
    ativo: i.ativo,
    embalagem: i.tipo === 'EMBALAGEM',
    custo: custoDoInsumo(i) as CustoExato | null,
  }));
}

export type EmbalagemDoFormulario = Awaited<ReturnType<typeof embalagensParaEscolher>>[number];

// ------------------------------------------------------------ gravar embalagens

/** O produto de venda da casa: sem marca, nome = o da ficha (o nome acompanha a ficha ao renomear). */
async function criarProdutoDaCasa(tx: ClienteDoParceiro, f: { id: string; nome: string }): Promise<string> {
  const p = await tx.produtoVenda.create({ data: { parceiroId: tx.parceiroId, fichaId: f.id, nome: f.nome }, select: { id: true } });
  return p.id;
}

/** A ficha de prato travada (`FOR NO KEY UPDATE`) para gravar embalagens ou preços; recusa com a frase. */
async function pratoTravado(tx: ClienteDoParceiro, fichaId: string) {
  const [f] = await tx.sql<{ id: string; nome: string; tipo: string; ativa: boolean }>`
    SELECT "id", "nome", "tipo"::text AS "tipo", "ativa" FROM "FichaTecnica"
    WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ${fichaId}
    FOR NO KEY UPDATE`;
  if (!f) throw new Recusa({ ok: false, erros: { geral: 'Ficha não encontrada.' }, naoEncontrado: true });
  if (f.tipo !== 'PRATO') throw new Recusa({ ok: false, erros: { geral: 'Pré-preparo não se vende: embalagem e preço por canal são da ficha de prato.' } });
  if (!f.ativa) throw new Recusa({ ok: false, erros: { geral: 'Ficha desativada: reative antes de editar.' } });
  return f;
}

/**
 * Troca as embalagens dos dois canais da ficha (a lista inteira, como a tela
 * mandou). `impressao` = a lista que a tela leu: se o banco tiver outra,
 * conflito e nada muda.
 */
export async function salvarEmbalagens(
  cliente: ClienteDoParceiro,
  fichaId: string,
  entrada: { impressao: unknown; linhas: readonly EmbalagemDigitada[] },
  autorNome = 'Sistema',
): Promise<ResultadoDoCanal> {
  if (!ID.test(fichaId)) return { ok: false, erros: { geral: 'Ficha não encontrada.' }, naoEncontrado: true };
  try {
    return await cliente.transacao(async (tx) => {
      // A ficha travada: duas gravações das embalagens dela entram uma de cada vez (e a 2ª confere a impressão).
      const f = await pratoTravado(tx, fichaId);
      const atual = await embalagensGravadas(tx, f.id);
      if (typeof entrada.impressao !== 'string' || entrada.impressao !== impressaoDasEmbalagens(atual.lista)) {
        throw new Recusa({ ok: false, erros: { geral: MENSAGEM_CONFLITO_DAS_EMBALAGENS }, conflito: true });
      }
      // Os insumos citados, travados (FOR SHARE) e só deste parceiro.
      const ids = Array.from(new Set(entrada.linhas.map((l) => l.insumoId).filter((x) => typeof x === 'string' && ID.test(x))));
      if (ids.length) await tx.sql`SELECT 1 FROM "Insumo" WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ANY(${ids}::text[]) FOR SHARE`;
      const lidos = ids.length
        ? await tx.insumo.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true, unidade: true, tipo: true, ativo: true } })
        : [];
      const cadastro = new Map<string, EmbalagemDoCadastro>(lidos.map((i) => [i.id, { ...i, unidade: i.unidade as Unidade }]));
      const lido = lerEmbalagens(entrada.linhas, cadastro, new Set(atual.lista.map((e) => `${e.canal}:${e.insumoId}`)));
      if (!lido.ok) throw new Recusa({ ok: false, erros: lido.erros });

      const nomes = new Map<string, { nome: string; unidade: Unidade }>([
        ...atual.lista.map((e) => [e.insumoId, { nome: e.insumo.nome, unidade: e.insumo.unidade }] as const),
        ...lidos.map((i) => [i.id, { nome: i.nome, unidade: i.unidade as Unidade }] as const),
      ]);
      const antes = { nome: f.nome, ...retratoDasEmbalagens(atual.lista, nomes) };
      const depois = { nome: f.nome, ...retratoDasEmbalagens(lido.dados, nomes) };
      const mudanca = diferenca(antes, depois);
      if (!mudanca) return { ok: true as const, id: f.id, mudou: [] };

      const produtoId = atual.produtoId ?? (await criarProdutoDaCasa(tx, f));
      await tx.produtoEmbalagem.deleteMany({ where: { produtoId, canal: { in: [...CANAIS_COM_EMBALAGEM] } } });
      if (lido.dados.length) {
        await tx.produtoEmbalagem.createMany({
          data: lido.dados.map((e: EmbalagemDoCanal) => ({
            parceiroId: tx.parceiroId,
            produtoId: produtoId!,
            canal: e.canal,
            insumoId: e.insumoId,
            quantidadeMilesimos: e.quantidadeMilesimos,
          })),
        });
      }
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'FichaTecnica',
          entidadeId: f.id,
          acao: 'ALTEROU',
          antes: mudanca.antes,
          depois: mudanca.depois,
          autorNome,
        },
      });
      return { ok: true as const, id: f.id, mudou: mudanca.campos };
    });
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    // Dois "primeiros" produtos da mesma ficha (a trava da ficha já serializa; fica o seguro).
    if (ehErroDeUnicidade(e)) return { ok: false, erros: { geral: MENSAGEM_CONFLITO_DAS_EMBALAGENS }, conflito: true };
    if (checkVioladoDe(e)) return { ok: false, erros: { geral: 'Algum número passou do limite (até 1.000 por porção). Confira e salve de novo.' } };
    throw e;
  }
}

/** Campos do histórico que a gravação das embalagens mexe (para a frase do "feito"). */
export const CAMPOS_DAS_EMBALAGENS = Object.values(CAMPO_DO_CANAL);

// ------------------------------------------------------------ taxa do iFood

/** Retrato da taxa para o histórico ("23%"). */
const retratoDaTaxa = (t: TaxaDoCanal) => ({ nome: 'iFood', comissao: formatarPontosBase(t.comissaoBp), pagamento: formatarPontosBase(t.pagamentoBp) });

/** A taxa do iFood do parceiro, as margens-alvo dos canais (1.10) e as últimas alterações deles. */
export async function obterTaxaDoIfood(cliente: ClienteDoParceiro) {
  return cliente.transacao(async (tx) => {
    const cfg = await configsDosCanais(tx);
    const ifood = cfg.de('IFOOD');
    const historico = cfg.lidas.length ? await listarHistorico(tx, { de: [{ entidade: 'CanalConfig', ids: cfg.lidas.map((l) => l.id) }], limite: 10, verPrecos: true }) : [];
    return {
      taxa: cfg.taxa,
      versao: ifood ? ifood.atualizadoEm.toISOString() : '',
      margens: cfg.margens,
      versaoDasMargens: versaoDasMargens(cfg.lidas),
      historico,
    };
  });
}

/**
 * Configura a taxa do iFood do parceiro (comissão + pagamento online, %).
 * `versao` = o `atualizadoEm` lido ('' = a tela leu "não configurada").
 */
export async function salvarTaxaDoIfood(
  cliente: ClienteDoParceiro,
  entrada: { comissao: unknown; pagamento: unknown; versao: unknown },
  autorNome = 'Sistema',
): Promise<ResultadoDoCanal> {
  const lido = lerTaxaDoCanal(entrada);
  if (!lido.ok) return lido;
  const t = lido.dados;
  const versao = typeof entrada.versao === 'string' ? entrada.versao : '';
  try {
    return await cliente.transacao(async (tx) => {
      const atual = await taxaDoIfood(tx);
      if ((atual ? atual.atualizadoEm.toISOString() : '') !== versao)
        throw new Recusa({ ok: false, erros: { geral: MENSAGEM_CONFLITO_DA_TAXA }, conflito: true });
      if (!atual) {
        const novo = await tx.canalConfig.create({
          data: { parceiroId: tx.parceiroId, canal: 'IFOOD', taxaBp: t.comissaoBp, taxaPagamentoBp: t.pagamentoBp },
          select: { id: true },
        });
        await tx.historicoAlteracao.create({
          data: { parceiroId: tx.parceiroId, entidade: 'CanalConfig', entidadeId: novo.id, acao: 'CRIOU', depois: retratoDaTaxa(t), autorNome },
        });
        return { ok: true as const, id: novo.id, mudou: ['comissao', 'pagamento'] };
      }
      // 1.10: a margem-alvo do iFood já configurada + a taxa nova não podem passar de 100 % (nenhum preço chegaria lá).
      if (atual.margemAlvoPadraoBp !== null && taxaTotalBp(t) + atual.margemAlvoPadraoBp >= 10_000) {
        throw new Recusa({
          ok: false,
          erros: {
            geral: `Com a margem-alvo do iFood em ${formatarPontosBase(atual.margemAlvoPadraoBp)}, a taxa precisa ficar abaixo de ${formatarPontosBase(10_000 - atual.margemAlvoPadraoBp)}: nenhum preço chegaria lá. Baixe a margem-alvo do iFood antes.`,
          },
        });
      }
      const antes = retratoDaTaxa({ comissaoBp: atual.taxaBp, pagamentoBp: atual.taxaPagamentoBp });
      const mudanca = diferenca(antes, retratoDaTaxa(t));
      if (!mudanca) return { ok: true as const, id: atual.id, mudou: [] };
      const r = await tx.canalConfig.updateMany({
        where: { id: atual.id, atualizadoEm: atual.atualizadoEm },
        data: { taxaBp: t.comissaoBp, taxaPagamentoBp: t.pagamentoBp },
      });
      if (r.count !== 1) throw new Recusa({ ok: false, erros: { geral: MENSAGEM_CONFLITO_DA_TAXA }, conflito: true });
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'CanalConfig',
          entidadeId: atual.id,
          acao: 'ALTEROU',
          antes: mudanca.antes,
          depois: mudanca.depois,
          autorNome,
        },
      });
      return { ok: true as const, id: atual.id, mudou: mudanca.campos };
    });
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    // Duas "primeiras" configurações juntas: o único (parceiro, canal) deixa uma; a outra relê.
    if (ehErroDeUnicidade(e)) return { ok: false, erros: { geral: MENSAGEM_CONFLITO_DA_TAXA }, conflito: true };
    throw e;
  }
}

// ------------------------------------------------------- margens-alvo (1.10)

export const MENSAGEM_CONFLITO_DAS_MARGENS =
  'Alguém mudou as margens-alvo ou a taxa do iFood agora há pouco. Recarregue a página para ver a versão nova; nada foi gravado.';

/** O que a tela leu das margens (canal:alvo:versão), na ordem dos canais. */
function versaoDasMargens(lidas: readonly { canal: string; margemAlvoPadraoBp: number | null; atualizadoEm: Date }[]): string {
  return ORDEM_DOS_CANAIS.map((c) => {
    const l = lidas.find((x) => x.canal === c);
    return l ? `${c}:${l.margemAlvoPadraoBp ?? '-'}:${l.atualizadoEm.toISOString()}` : `${c}:novo`;
  }).join('|');
}

/**
 * Margem-alvo (líquida) de cada canal do parceiro. `versao` = a impressão que a
 * tela leu: se uma linha mudou (inclusive a taxa do iFood, que mora na mesma
 * linha), conflito e nada muda. Loja e delivery nascem aqui; a linha do iFood
 * nasce com a taxa (sem taxa, o alvo do iFood espera).
 */
export async function salvarMargensAlvo(
  cliente: ClienteDoParceiro,
  entrada: { margens: Partial<Record<CanalVenda, unknown>>; versao: unknown },
  autorNome = 'Sistema',
): Promise<ResultadoDoCanal> {
  try {
    return await cliente.transacao(async (tx) => {
      const cfg = await configsDosCanais(tx);
      if (typeof entrada.versao !== 'string' || entrada.versao !== versaoDasMargens(cfg.lidas)) {
        throw new Recusa({ ok: false, erros: { geral: MENSAGEM_CONFLITO_DAS_MARGENS }, conflito: true });
      }
      const lido = lerMargensAlvo(entrada.margens, cfg.taxa ? taxaTotalBp(cfg.taxa) : null);
      if (!lido.ok) throw new Recusa(lido);
      const mudou: string[] = [];
      let id = '';
      for (const canal of ORDEM_DOS_CANAIS) {
        const novo = lido.dados[canal];
        const linha = cfg.de(canal);
        const retrato = (bp: number | null) => ({ nome: CANAIS[canal].rotulo, margemAlvo: bp === null ? 'sem alvo' : formatarPontosBase(bp) });
        if (!linha) {
          if (novo === null) continue;
          const criada = await tx.canalConfig.create({ data: { parceiroId: tx.parceiroId, canal, margemAlvoPadraoBp: novo }, select: { id: true } });
          await tx.historicoAlteracao.create({
            data: { parceiroId: tx.parceiroId, entidade: 'CanalConfig', entidadeId: criada.id, acao: 'ALTEROU', antes: retrato(null), depois: retrato(novo), autorNome },
          });
          mudou.push(canal);
          id = criada.id;
          continue;
        }
        if (linha.margemAlvoPadraoBp === novo) continue;
        const r = await tx.canalConfig.updateMany({ where: { id: linha.id, atualizadoEm: linha.atualizadoEm }, data: { margemAlvoPadraoBp: novo } });
        if (r.count !== 1) throw new Recusa({ ok: false, erros: { geral: MENSAGEM_CONFLITO_DAS_MARGENS }, conflito: true });
        await tx.historicoAlteracao.create({
          data: {
            parceiroId: tx.parceiroId,
            entidade: 'CanalConfig',
            entidadeId: linha.id,
            acao: 'ALTEROU',
            antes: retrato(linha.margemAlvoPadraoBp),
            depois: retrato(novo),
            autorNome,
          },
        });
        mudou.push(canal);
        id = linha.id;
      }
      return { ok: true as const, id, mudou };
    });
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    // Duas "primeiras" margens da loja (ou do delivery) juntas: o único (parceiro, canal) deixa uma; a outra relê.
    if (ehErroDeUnicidade(e)) return { ok: false, erros: { geral: MENSAGEM_CONFLITO_DAS_MARGENS }, conflito: true };
    if (checkVioladoDe(e)) return { ok: false, erros: { geral: 'A margem-alvo fica entre 0% e 99,99%.' } };
    throw e;
  }
}

// ------------------------------------------------------- preços por canal (1.10)

export const MENSAGEM_CONFLITO_DOS_PRECOS =
  'Alguém mudou os preços desta ficha agora há pouco. Recarregue a página para ver a versão nova; nada foi gravado.';

/**
 * Grava o preço próprio de cada canal da ficha de PRATO (vazio = vale o
 * sugerido). O navegador manda só o texto do preço: o servidor trava a ficha,
 * confere os preços que a tela leu (`impressao`), lê o custo de AGORA (cascata
 * + embalagens + taxa + margem-alvo), recalcula sugerido e margens e grava o
 * preço com o retrato no histórico da ficha (antes/depois e o custo do canal
 * naquele instante), tudo na mesma transação. `custos` = o custo que a tela
 * leu: só escolhe a frase ("o custo mudou enquanto você editava").
 */
export async function salvarPrecos(
  cliente: ClienteDoParceiro,
  fichaId: string,
  entrada: { impressao: unknown; custos: unknown; precos: Partial<Record<CanalVenda, unknown>> },
  autorNome = 'Sistema',
): Promise<ResultadoDoCanal & { custoMudou?: boolean }> {
  if (!ID.test(fichaId)) return { ok: false, erros: { geral: 'Ficha não encontrada.' }, naoEncontrado: true };
  const lido = lerPrecos(entrada.precos);
  try {
    return await cliente.transacao(async (tx) => {
      const f = await pratoTravado(tx, fichaId);
      // O custo de agora (depois da trava): a nota que entrou um instante antes já vale.
      const custo = (await custosEmCascata(tx, [f.id])).custo(f.id)!;
      const conta = await contaDosCanais(tx, f.id, custo);
      if (typeof entrada.impressao !== 'string' || entrada.impressao !== impressaoDosPrecos(conta.gravados)) {
        throw new Recusa({ ok: false, erros: { geral: MENSAGEM_CONFLITO_DOS_PRECOS }, conflito: true });
      }
      if (!lido.ok) throw new Recusa(lido);
      const novos = conta.entradas.map((e) => precoDoCanal(e, { margemAlvoBp: conta.cfg.margens[e.canal], precoProprioCentavos: lido.dados[e.canal] }));
      const sem = (r: Record<string, string>) => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith('custo')));
      const antes = { nome: f.nome, ...sem(retratoDosPrecos(conta.precos)) };
      const depoisCompleto = retratoDosPrecos(novos);
      const mudanca = diferenca(antes, { nome: f.nome, ...sem(depoisCompleto) });
      const custoMudou = typeof entrada.custos === 'string' && entrada.custos !== impressaoDosCustos(conta.entradas);
      if (!mudanca) return { ok: true as const, id: f.id, mudou: [], custoMudou };

      const produtoId = conta.produtoId ?? (await criarProdutoDaCasa(tx, f));
      const mudaram: CanalVenda[] = [];
      for (const canal of ORDEM_DOS_CANAIS) {
        const novo = lido.dados[canal];
        const linha = conta.gravados.find((g) => g.canal === canal);
        if ((linha?.precoManualCentavos ?? null) === novo) continue;
        mudaram.push(canal);
        if (linha) await tx.produtoCanal.update({ where: { id: linha.id }, data: { precoManualCentavos: novo } });
        else await tx.produtoCanal.create({ data: { parceiroId: tx.parceiroId, produtoId, canal, precoManualCentavos: novo } });
      }
      // O snapshot: o custo do canal naquele instante, de cada canal cujo preço mudou (só no depois: é retrato, não mudança).
      const depois: Record<string, string> = { ...mudanca.depois } as Record<string, string>;
      for (const canal of mudaram) depois[camposDoCanal(canal).custo] = depoisCompleto[camposDoCanal(canal).custo];
      await tx.historicoAlteracao.create({
        data: { parceiroId: tx.parceiroId, entidade: 'FichaTecnica', entidadeId: f.id, acao: 'ALTEROU', antes: mudanca.antes, depois, autorNome },
      });
      return { ok: true as const, id: f.id, mudou: mudanca.campos, custoMudou };
    });
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    // Dois "primeiros" produtos (ou preços) da mesma ficha: a trava já serializa; fica o seguro.
    if (ehErroDeUnicidade(e)) return { ok: false, erros: { geral: MENSAGEM_CONFLITO_DOS_PRECOS }, conflito: true };
    if (checkVioladoDe(e)) return { ok: false, erros: { geral: 'Algum preço passou do limite. Confira e salve de novo.' } };
    throw e;
  }
}

/**
 * Lista de fichas (1.10, herança da 1.9): preço e margem de cada canal das
 * fichas de prato da página, numa leitura em lote (produtos, embalagens e
 * preços da página numa consulta; o último preço de todas as embalagens em
 * outra). `fichas` = as da página, com o custo da cascata já calculado.
 */
export async function precosDaLista(cliente: ClienteDoParceiro, fichas: readonly { id: string; tipo: string; custo: CustoDaFicha }[]) {
  const pratos = fichas.filter((f) => f.tipo === 'PRATO');
  const mapa = new Map<string, ReturnType<typeof precoDoCanal>[]>();
  if (pratos.length === 0) return mapa;
  return cliente.transacao(async (tx) => {
    const [produtos, cfg] = await Promise.all([
      tx.produtoVenda.findMany({
        where: { fichaId: { in: pratos.map((p) => p.id) }, marcaId: null },
        select: {
          fichaId: true,
          canais: { select: { canal: true, precoManualCentavos: true } },
          embalagens: { select: { canal: true, insumoId: true, quantidadeMilesimos: true, insumo: { select: SELECAO_DO_INSUMO } } },
        },
      }),
      configsDosCanais(tx),
    ]);
    const insumos = produtos.flatMap((p) => p.embalagens.map((e) => e.insumo)).map((i) => ({ ...i, ultimaCompra: null as CustoExato | null }));
    await anexarUltimasCompras(tx, insumos);
    let n = 0;
    const comCompra = produtos.map((p) => ({ ...p, embalagens: p.embalagens.map((e) => ({ ...e, insumo: insumos[n++] })) }));
    for (const f of pratos) {
      const p = comCompra.find((x) => x.fichaId === f.id);
      const entradas: EntradaDoCanal[] = ORDEM_DOS_CANAIS.map((canal) => ({
        canal,
        custoDaFicha: f.custo,
        embalagens:
          canal === 'LOJA'
            ? []
            : (p?.embalagens ?? [])
                .filter((e) => e.canal === canal)
                .map((e) => ({ insumoId: e.insumoId, nome: e.insumo.nome, unidade: e.insumo.unidade as Unidade, quantidadeMilesimos: e.quantidadeMilesimos, insumo: e.insumo })),
        taxa: canal === 'IFOOD' ? (cfg.taxa ?? 'naoConfigurada') : null,
      }));
      mapa.set(
        f.id,
        entradas.map((e) =>
          precoDoCanal(e, { margemAlvoBp: cfg.margens[e.canal], precoProprioCentavos: p?.canais.find((c) => c.canal === e.canal)?.precoManualCentavos ?? null }),
        ),
      );
    }
    return mapa;
  });
}

export type PrecosDaLista = Awaited<ReturnType<typeof precosDaLista>>;
