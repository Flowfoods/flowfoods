/**
 * Importar fichas técnicas por planilha (1.2) — com banco. Duas portas, a
 * mesma regra do formulário (`lerFormFicha` + `gravarFicha`):
 *
 * 1. `previaDaImportacao`: lê a planilha, casa os insumos e diz, ficha a
 *    ficha, o que VAI acontecer (nova, muda, igual ou com erro, com a linha
 *    do erro). Não grava nada.
 * 2. `importarFichas`: refaz tudo dentro de UMA transação, com os insumos
 *    travados, e grava só as fichas sem erro. Idempotente pela chave nome da
 *    ficha: a que já existe é atualizada só se mudou; reimportar a mesma
 *    planilha não cria nem altera nada. Descrição e modo de preparo vazios na
 *    planilha não apagam o que já está na ficha. Foto não vem pela planilha.
 */

import type { ClienteDoParceiro } from './tenant';
import { ehErroDeUnicidade } from './tenant';
import {
  custoDaFicha,
  custoDoInsumo,
  custoIncompleto,
  formatarRendimento,
  lerFormFicha,
  porUnidadeDeRendimento,
  retratoDaFicha,
  type DadosFicha,
  type InsumoDaFicha,
  type PreparoDaFicha,
} from './ficha-campos';
import { casarComInsumos, chaveDeNome, lerPlanilhaDeFichas, type ErroDeLinha, type FichaDaPlanilha } from './ficha-planilha';
import { custosEmCascata } from './ficha-custos';
import { anexarUltimasCompras, type ComUltimaCompra } from './compras-custo';
import {
  cadastroDaEntrada,
  conferirEstrutura,
  dadosDaFichaGravada,
  gravarFicha,
  insumosTravados,
  preparosTravados,
  RecusaDaFicha,
  SELECAO_PARA_EDITAR,
  travarGrafoDeFichas,
} from './fichas';
import { diferenca } from './insumo-campos';
import { formatarFracao } from './unidades';
import { validadesDaLinha, validadesEmTexto } from './validade';

export type SituacaoNaPrevia = 'nova' | 'muda' | 'igual' | 'erro';

export interface FichaNaPrevia {
  nome: string;
  /** "2" ou "2–5": de onde ela veio na planilha. */
  linhas: string;
  situacao: SituacaoNaPrevia;
  /** O que muda (só em "muda"), em palavras. */
  mudancas: string[];
  itens: number;
  /** "4 porções" / "2,5 kg". */
  rende: string | null;
  /** "R$ 3,09 por porção"; null com erro. */
  custo: string | null;
  incompleto: boolean;
  /** 1.4: "Refrigerado: 3 dias · Congelado: 30 dias" (como fica depois de importar); null = não informada. */
  validade: string | null;
  erros: ErroDeLinha[];
  /** Insumos que a planilha cita e não estão cadastrados. */
  faltam: string[];
}

export interface Previa {
  fichas: FichaNaPrevia[];
  /** Erros fora de uma ficha (cabeçalho, linha sem nome). */
  erros: ErroDeLinha[];
  linhasLidas: number;
  contagem: Record<SituacaoNaPrevia, number>;
}

const PALAVRA: Record<string, string> = {
  nome: 'nome',
  tipo: 'tipo',
  rendimento: 'rende',
  descricao: 'descrição',
  modoPreparo: 'modo de preparo',
  itens: 'insumos e quantidades',
  conservacao: 'conservação',
  validade: 'validade',
};

const intervalo = (linhas: number[]) => {
  const a = Math.min(...linhas);
  const b = Math.max(...linhas);
  return a === b ? String(a) : `${a}–${b}`;
};

type Atual = Awaited<ReturnType<typeof lerAtuais>>[number];

async function lerAtuais(tx: ClienteDoParceiro, nomes: string[]) {
  if (nomes.length === 0) return [];
  return tx.fichaTecnica.findMany({ where: { nome: { in: nomes } }, select: SELECAO_PARA_EDITAR });
}

interface Plano {
  previa: FichaNaPrevia;
  dados?: DadosFicha;
  atual?: Atual;
}

/**
 * Lê, casa e compara. `travar`: na importação, os insumos citados são lidos
 * com FOR SHARE (como no formulário); na prévia, leitura simples.
 */
async function planejar(tx: ClienteDoParceiro, texto: string, travar: boolean): Promise<{ planos: Plano[]; previa: Previa }> {
  const leitura = lerPlanilhaDeFichas(texto);
  const todos = await tx.insumo.findMany({
    // O insumo que um pré-preparo produz não entra: na receita, vale o pré-preparo (mesmo nome).
    where: { fichaQueProduz: { is: null } },
    select: { id: true, nome: true, tipo: true, unidade: true, ativo: true, conteudoMilesimos: true, precoEmbalagemCentavos: true, taxaEntregaCentavos: true },
  });
  // 1.5: custo pela última compra (uma consulta para a planilha inteira).
  await anexarUltimasCompras(tx, todos as (typeof todos[number] & ComUltimaCompra)[]);
  const preparosLidos = await tx.fichaTecnica.findMany({
    where: { tipo: 'PRE_PREPARO' },
    select: { id: true, nome: true, tipo: true, ativa: true, unidadeRendimento: true },
  });
  const agrupar = <T extends { nome: string }>(lista: T[]) => {
    const m = new Map<string, T[]>();
    for (const i of lista) m.set(chaveDeNome(i.nome), [...(m.get(chaveDeNome(i.nome)) ?? []), i]);
    return m;
  };
  const porNome = agrupar(todos);
  const preparosPorNome = agrupar(preparosLidos);
  const daPlanilha = new Set(leitura.fichas.filter((f) => f.tipo === 'PRE_PREPARO').map((f) => chaveDeNome(f.nome)));
  const atuais = new Map((await lerAtuais(tx, leitura.fichas.map((f) => f.nome))).map((a) => [a.nome, a]));

  const casadas = leitura.fichas.map((f) => ({ f, ...casarComInsumos(f, porNome, preparosPorNome, daPlanilha) }));
  let doCadastro: Map<string, InsumoDaFicha> = new Map(todos.map((i) => [i.id, i]));
  let preparos: Map<string, PreparoDaFicha> = new Map(preparosLidos.map((p) => [p.id, p]));
  if (travar) {
    const doItem = (c: (typeof casadas)[number], chave: 'insumoId' | 'subfichaId') => [
      ...c.entrada.itens.map((i) => i[chave] ?? ''),
      ...(atuais.get(c.f.nome)?.itens.map((i) => i[chave] ?? '') ?? []),
    ];
    doCadastro = new Map([...doCadastro, ...(await insumosTravados(tx, casadas.flatMap((c) => doItem(c, 'insumoId'))))]);
    preparos = new Map([...preparos, ...(await preparosTravados(tx, casadas.flatMap((c) => doItem(c, 'subfichaId'))))]);
  }
  // Custo dos pré-preparos citados, em cascata (uma leitura por nível para a planilha inteira).
  const citados = Array.from(new Set(casadas.flatMap((c) => c.entrada.itens.map((i) => i.subfichaId ?? '')).filter(Boolean)));
  const cascata = await custosEmCascata(tx, citados);

  const planos: Plano[] = casadas.map(({ f, entrada, linhaDoItem, faltam, erros }) =>
    planejarUma(f, entrada, linhaDoItem, faltam, erros, atuais.get(f.nome), doCadastro, preparos, cascata.custo),
  );
  const contagem: Record<SituacaoNaPrevia, number> = { nova: 0, muda: 0, igual: 0, erro: 0 };
  for (const p of planos) contagem[p.previa.situacao]++;
  return { planos, previa: { fichas: planos.map((p) => p.previa), erros: leitura.erros, linhasLidas: leitura.linhasLidas, contagem } };
}

function planejarUma(
  f: FichaDaPlanilha,
  entrada: ReturnType<typeof casarComInsumos>['entrada'],
  linhaDoItem: number[],
  faltam: string[],
  errosDoCasamento: ErroDeLinha[],
  atual: Atual | undefined,
  doCadastro: ReadonlyMap<string, InsumoDaFicha>,
  preparos: ReadonlyMap<string, PreparoDaFicha>,
  custoDoPreparo: (id: string) => ReturnType<typeof custoDaFicha> | null,
): Plano {
  const base = { nome: f.nome, linhas: intervalo(f.linhas), mudancas: [], itens: f.itens.length, rende: null, custo: null, incompleto: false, validade: null, faltam };
  const erros: ErroDeLinha[] = [...f.erros, ...errosDoCasamento];
  if (atual && !atual.ativa) erros.push({ linha: f.primeiraLinha, mensagem: `A ficha “${f.nome}” está desativada: reative antes de importar por cima.` });
  const jaNaFicha = new Set((atual?.itens ?? []).flatMap((i) => [i.insumoId, i.subfichaId]).filter((x): x is string => !!x));
  const lido = lerFormFicha(entrada, doCadastro, jaNaFicha, { preparos, propriaId: atual?.id });
  if (!lido.ok) {
    for (const [chave, mensagem] of Object.entries(lido.erros)) {
      const m = /^item-(\d+)$/.exec(chave);
      erros.push({ linha: m ? (linhaDoItem[Number(m[1])] ?? f.primeiraLinha) : f.primeiraLinha, mensagem });
    }
  }
  // Insumo que faltou já foi dito; "inclua pelo menos um insumo" só se a ficha não tinha nenhum.
  const unicos = erros.filter((e, i) => erros.findIndex((x) => x.linha === e.linha && x.mensagem === e.mensagem) === i);
  if (unicos.length > 0 || !lido.ok) {
    return { previa: { ...base, situacao: 'erro', erros: unicos.sort((a, b) => a.linha - b.linha) } };
  }

  // Vazio na planilha não apaga o que a ficha já tem (1.4: nem a validade, quando as colunas não vieram).
  const dados: DadosFicha = {
    ...lido.dados,
    descricao: lido.dados.descricao ?? atual?.descricao ?? null,
    modoPreparo: lido.dados.modoPreparo ?? atual?.modoPreparo ?? null,
    // N.4: a planilha não traz etapas: as que a ficha já tem ficam.
    passosPreparo: atual?.passosPreparo ?? [],
    validades: entrada.validade === undefined ? (atual ? validadesDaLinha(atual) : null) : lido.dados.validades,
  };
  const custo = custoDaFicha(
    dados.itens.map((i) => {
      const comum = { quantidadeMilesimos: i.quantidadeMilesimos, fatorCorrecaoMilesimos: i.fatorCorrecaoMilesimos };
      if (i.subfichaId) return { ...comum, nome: preparos.get(i.subfichaId)!.nome, custo: null, preparo: custoDoPreparo(i.subfichaId) ?? undefined };
      const ins = doCadastro.get(i.insumoId!)!;
      return { ...comum, nome: ins.nome, custo: custoDoInsumo(ins) };
    }),
    dados.rendimentoMilesimos,
  );
  const comum = {
    ...base,
    erros: [],
    itens: dados.itens.length,
    rende: formatarRendimento(dados.rendimentoMilesimos, dados.unidadeRendimento, dados.tipo),
    custo: `${formatarFracao(custo.porRendimento)} ${porUnidadeDeRendimento(dados.unidadeRendimento, dados.tipo)}`,
    incompleto: custoIncompleto(custo),
    validade: validadesEmTexto(dados.validades),
  };
  if (!atual) return { previa: { ...comum, situacao: 'nova' }, dados };
  const mudanca = diferenca(
    retratoDaFicha(dadosDaFichaGravada(atual), doCadastro, atual.fotoArquivo, preparos),
    retratoDaFicha(dados, doCadastro, atual.fotoArquivo, preparos),
  );
  if (!mudanca) return { previa: { ...comum, situacao: 'igual' }, dados, atual };
  return { previa: { ...comum, situacao: 'muda', mudancas: mudanca.campos.map((c) => PALAVRA[c] ?? c) }, dados, atual };
}

/** O que a planilha vai fazer, sem gravar nada. */
export async function previaDaImportacao(cliente: ClienteDoParceiro, texto: string): Promise<Previa> {
  return cliente.transacao((tx) => planejar(tx, texto, false).then((r) => r.previa));
}

export type ResultadoDaImportacao =
  | { ok: true; criadas: number; alteradas: number; iguais: number; comErro: number }
  | { ok: false; erro: string };

/**
 * Grava, numa transação só, as fichas sem erro. Ou entram todas as que a
 * prévia mostrou como boas, ou nenhuma (conflito com uma edição em curso,
 * nome criado por outra pessoa no meio).
 */
export const MENSAGEM_IMPORTACAO_DEMOROU =
  'A importação passou de 30 segundos e foi desfeita: nada foi gravado. Divida a planilha em arquivos menores e envie um de cada vez (reimportar não duplica).';

/** Prisma: transação que estourou o tempo (P2028) ou que fechou por isso. */
function estourouOTempo(e: unknown): boolean {
  const codigo = (e as { code?: string } | null)?.code;
  const msg = e instanceof Error ? e.message : '';
  return codigo === 'P2028' || /expired transaction|Transaction already closed|timeout for this transaction/i.test(msg);
}

export async function importarFichas(
  cliente: ClienteDoParceiro,
  texto: string,
  autorNome = 'Sistema',
  { timeout = 30_000 }: { timeout?: number } = {},
): Promise<ResultadoDaImportacao> {
  try {
    return await cliente.transacao(
      async (tx) => {
        // A mesma trava das edições: o círculo entre pré-preparos é conferido com o grafo parado.
        await travarGrafoDeFichas(tx);
        const { planos, previa } = await planejar(tx, texto, true);
        const boas = planos.filter((p) => p.previa.situacao === 'nova' || p.previa.situacao === 'muda');
        if (boas.length === 0) {
          throw new RecusaDaFicha({
            ok: false,
            erros: {
              geral:
                previa.fichas.length === 0 && previa.erros.length > 0
                  ? previa.erros[0].mensagem
                  : previa.contagem.igual > 0 && previa.contagem.erro === 0
                  ? 'Nada mudou: as fichas da planilha já estão iguais no cadastro.'
                  : 'Nenhuma ficha da planilha pode entrar: corrija os erros e envie de novo.',
            },
          });
        }
        for (const p of boas) {
          const entrada = { itens: p.dados!.itens.map((i) => ({ insumoId: i.insumoId ?? undefined, subfichaId: i.subfichaId ?? undefined, quantidade: '', unidade: '' })) };
          const { doCadastro, preparos } = await cadastroDaEntrada(tx, entrada, p.atual ?? null);
          try {
            await conferirEstrutura(tx, p.dados!, p.atual ?? null, doCadastro);
          } catch (e) {
            // Ex.: a planilha faria um círculo entre pré-preparos. Nada entra (tudo ou nada).
            if (e instanceof RecusaDaFicha) {
              const motivo = Object.values(e.resultado.erros)[0] ?? 'recusada';
              throw new RecusaDaFicha({ ok: false, erros: { geral: `“${p.dados!.nome}”: ${motivo} Nada foi gravado.` } });
            }
            throw e;
          }
          await gravarFicha(tx, {
            atual: p.atual ?? null,
            dados: p.dados!,
            doCadastro,
            preparos,
            foto: 'manter',
            origem: 'IMPORTACAO',
            antes: p.atual ? retratoDaFicha(dadosDaFichaGravada(p.atual), doCadastro, p.atual.fotoArquivo, preparos) : undefined,
            motivo: 'Importada por planilha',
            autorNome,
          });
        }
        return { ok: true as const, criadas: previa.contagem.nova, alteradas: previa.contagem.muda, iguais: previa.contagem.igual, comErro: previa.contagem.erro };
      },
      { timeout },
    );
  } catch (e) {
    if (e instanceof RecusaDaFicha) return { ok: false, erro: e.resultado.erros.geral ?? 'Importação recusada.' };
    if (estourouOTempo(e)) return { ok: false, erro: MENSAGEM_IMPORTACAO_DEMOROU };
    if (ehErroDeUnicidade(e)) {
      return { ok: false, erro: 'Alguém criou uma ficha com o mesmo nome enquanto você importava. Veja a prévia de novo; nada foi gravado.' };
    }
    throw e;
  }
}
