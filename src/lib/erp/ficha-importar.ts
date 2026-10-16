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
import { custoDaFicha, custoDoInsumo, formatarRendimento, lerFormFicha, porUnidadeDeRendimento, retratoDaFicha, type DadosFicha, type InsumoDaFicha } from './ficha-campos';
import { casarComInsumos, chaveDeNome, lerPlanilhaDeFichas, type ErroDeLinha, type FichaDaPlanilha } from './ficha-planilha';
import { dadosGravados, gravarFicha, insumosTravados, RecusaDaFicha, SELECAO_PARA_EDITAR } from './fichas';
import { diferenca } from './insumo-campos';
import { formatarFracao } from './unidades';

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
    select: { id: true, nome: true, unidade: true, ativo: true, conteudoMilesimos: true, precoEmbalagemCentavos: true, taxaEntregaCentavos: true },
  });
  const porNome = new Map<string, { id: string }[]>();
  for (const i of todos) porNome.set(chaveDeNome(i.nome), [...(porNome.get(chaveDeNome(i.nome)) ?? []), i]);
  const atuais = new Map((await lerAtuais(tx, leitura.fichas.map((f) => f.nome))).map((a) => [a.nome, a]));

  const casadas = leitura.fichas.map((f) => ({ f, ...casarComInsumos(f, porNome) }));
  let insumos: Map<string, InsumoDaFicha> = new Map(todos.map((i) => [i.id, i]));
  if (travar) {
    const ids = casadas.flatMap((c) => [
      ...c.entrada.itens.map((i) => i.insumoId),
      ...(atuais.get(c.f.nome)?.itens.map((i) => i.insumoId ?? '') ?? []),
    ]);
    insumos = new Map([...insumos, ...(await insumosTravados(tx, ids))]);
  }

  const planos: Plano[] = casadas.map(({ f, entrada, linhaDoItem, faltam, erros }) => planejarUma(f, entrada, linhaDoItem, faltam, erros, atuais.get(f.nome), insumos));
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
  insumos: ReadonlyMap<string, InsumoDaFicha>,
): Plano {
  const base = { nome: f.nome, linhas: intervalo(f.linhas), mudancas: [], itens: f.itens.length, rende: null, custo: null, incompleto: false, faltam };
  const erros: ErroDeLinha[] = [...f.erros, ...errosDoCasamento];
  if (atual && !atual.ativa) erros.push({ linha: f.primeiraLinha, mensagem: `A ficha “${f.nome}” está desativada: reative antes de importar por cima.` });
  const jaNaFicha = new Set((atual?.itens ?? []).map((i) => i.insumoId).filter((x): x is string => !!x));
  const lido = lerFormFicha(entrada, insumos, jaNaFicha);
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

  // Vazio na planilha não apaga o que a ficha já tem.
  const dados: DadosFicha = {
    ...lido.dados,
    descricao: lido.dados.descricao ?? atual?.descricao ?? null,
    modoPreparo: lido.dados.modoPreparo ?? atual?.modoPreparo ?? null,
  };
  const custo = custoDaFicha(
    dados.itens.map((i) => {
      const ins = insumos.get(i.insumoId)!;
      return { nome: ins.nome, quantidadeMilesimos: i.quantidadeMilesimos, fatorCorrecaoMilesimos: 1000, custo: custoDoInsumo(ins) };
    }),
    dados.rendimentoMilesimos,
  );
  const comum = {
    ...base,
    erros: [],
    itens: dados.itens.length,
    rende: formatarRendimento(dados.rendimentoMilesimos, dados.unidadeRendimento, dados.tipo),
    custo: `${formatarFracao(custo.porRendimento)} ${porUnidadeDeRendimento(dados.unidadeRendimento, dados.tipo)}`,
    incompleto: custo.semPreco.length > 0,
  };
  if (!atual) return { previa: { ...comum, situacao: 'nova' }, dados };
  const mudanca = diferenca(
    retratoDaFicha(dadosGravados(atual), insumos, atual.fotoArquivo),
    retratoDaFicha(dados, insumos, atual.fotoArquivo),
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
export async function importarFichas(cliente: ClienteDoParceiro, texto: string, autorNome = 'Sistema'): Promise<ResultadoDaImportacao> {
  try {
    return await cliente.transacao(
      async (tx) => {
        const { planos, previa } = await planejar(tx, texto, true);
        const boas = planos.filter((p) => p.previa.situacao === 'nova' || p.previa.situacao === 'muda');
        if (boas.length === 0) {
          throw new RecusaDaFicha({
            ok: false,
            erros: {
              geral:
                previa.contagem.igual > 0 && previa.contagem.erro === 0
                  ? 'Nada mudou: as fichas da planilha já estão iguais no cadastro.'
                  : 'Nenhuma ficha da planilha pode entrar: corrija os erros e envie de novo.',
            },
          });
        }
        for (const p of boas) {
          const insumos = await insumosTravados(tx, p.dados!.itens.map((i) => i.insumoId).concat(p.atual?.itens.map((i) => i.insumoId ?? '') ?? []));
          await gravarFicha(tx, {
            atual: p.atual ?? null,
            dados: p.dados!,
            insumos,
            foto: 'manter',
            origem: 'IMPORTACAO',
            antes: p.atual ? retratoDaFicha(dadosGravados(p.atual), insumos, p.atual.fotoArquivo) : undefined,
            motivo: 'Importada por planilha',
            autorNome,
          });
        }
        return { ok: true as const, criadas: previa.contagem.nova, alteradas: previa.contagem.muda, iguais: previa.contagem.igual, comErro: previa.contagem.erro };
      },
      { timeout: 30_000 },
    );
  } catch (e) {
    if (e instanceof RecusaDaFicha) return { ok: false, erro: e.resultado.erros.geral ?? 'Importação recusada.' };
    if (ehErroDeUnicidade(e)) {
      return { ok: false, erro: 'Alguém criou uma ficha com o mesmo nome enquanto você importava. Veja a prévia de novo; nada foi gravado.' };
    }
    throw e;
  }
}
