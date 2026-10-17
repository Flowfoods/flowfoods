/**
 * Lista do dia (3.2) — com banco. O gerente define o que produzir no dia; a tela cruza com o estoque e mostra, por insumo,
 * o que VAI USAR, o que TEM e o que falta COMPRAR. A lista não tem tabela (decisão 202): é o conjunto de lotes
 * (`OrdemProducao`) do dia na loja; confirmar a lista grava os lotes pela mesma regra de planejar da 3.1
 * (`planejarProducaoNaTx`), todos numa transação só.
 *
 * Recebe sempre o `ClienteDoParceiro` (parceiro da sessão) e o `Alcance`, com a LOJA:
 * - ver a lista e os lotes do dia = `producao.ver`; o rascunho e confirmar = `producao.planejar` (decisão 205);
 * - vai usar / tem / comprar = também `estoque.ver` na loja (sem ele só a lista de lotes);
 * - R$ só com `insumos.ver`; o fornecedor da última compra só com `compras.ver` NA LOJA DA NOTA. Montados no servidor:
 *   quem não pode nunca recebe o dado (contrato da 3.1).
 *
 * Concorrência: confirmar pega a trava do dia (a mesma de planejar) e a chave do envio é por lote (`<envio>:<n>`, única no
 * parceiro): duplo clique ou duas abas dão N lotes, nunca 2N. A prévia NÃO confia no número da tela: quando se confirma, o
 * servidor lê a ficha e grava a requisição de cada lote de novo; "comprar" é sempre recalculado na leitura.
 */

import type { ClienteDoParceiro } from './tenant';
import { pode, type Alcance } from './permissoes';
import { hojeNoRio } from './compra-campos';
import { ultimasCompras } from './compras-custo';
import { aberturasDe, comRecusa, custosDeReferencia, lojaDoAlcance, Recusa } from './estoque';
import { listaDaFichaNaTx } from './requisicao';
import { planejarProducaoNaTx, type Autor } from './producao';
import { lerChaveDoEnvio, type StatusDaProducao } from './producao-campos';
import { faltaDe, lerParaDia, numeroDaRequisicao, rotuloDoSetor, type StatusDaRequisicao } from './requisicao-campos';
import {
  avisoDoLoteJaExistente,
  contaDaLista,
  juntarLinhas,
  lerDiaDaLista,
  LINHAS_POR_ENVIO,
  textoDaQuantidade,
  valorDaCompra,
  type ContaDoInsumo,
  type FichaParaLinha,
  type InsumoDaConta,
  type LinhaDoRascunho,
  type LinhaJuntada,
  type ProducaoPrevista,
  type UsoPrevisto,
} from './lista-do-dia-campos';
import { formatarQuantidade, lerQuantidade, type Fracao, type Unidade } from './unidades';
import type { ResultadoEstoque } from './estoque';

const ID = /^[a-z0-9]{1,64}$/i;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dataDe = (dia: string) => new Date(`${dia}T00:00:00.000Z`);

// ================================================================ ler a lista

/** Um lote do dia, como a lista o mostra. */
export interface LoteDoDia {
  id: string;
  codigoLote: string;
  status: StatusDaProducao;
  fichaId: string;
  fichaNome: string;
  unidade: Unidade;
  planejadoMilesimos: number;
  produzidoMilesimos: number | null;
  daLista: boolean;
  planejadaPorNome: string | null;
  estornado: boolean;
  requisicao: { id: string; numero: number | null; status: StatusDaRequisicao } | null;
}

/** Um pré-preparo que se pode pôr na lista, com o saldo dele na loja agora (só para quem vê o estoque). */
export interface FichaParaLista {
  id: string;
  nome: string;
  unidade: Unidade;
  /** O insumo que ela produz. */
  insumoId: string;
  /** Quanto há na loja agora; null = a pessoa não vê o estoque. */
  temMilesimos: number | null;
}

/** A linha do rascunho como a prévia a mostra: o pré-preparo, quanto, e o que a conferência achou. */
export interface LinhaDaPrevia {
  posicao: number;
  fichaId: string;
  nome: string;
  unidade: Unidade;
  quantidadeMilesimos: number;
  juntou: number;
  /** "Já tem o lote 261018-03 de 5 kg…" */
  aviso: string | null;
  /** O que a ficha avisa (insumo desativado que ficou de fora). */
  avisosDaFicha: string[];
}

export interface FornecedorDaLinha {
  nome: string;
  /** Dia da nota (aaaa-mm-dd). */
  notaEm: string;
}

/** O insumo na conta, com o que só alguns podem ver (R$, fornecedor) já decidido no servidor. */
export interface LinhaDaConta extends ContaDoInsumo {
  /** O pré-preparo que produz este insumo (para o botão "Pôr na lista"); null = sem ficha ativa. */
  ficha: { id: string; nome: string } | null;
  /** Só `compras.ver` na loja da nota: o fornecedor da última compra. */
  fornecedor: FornecedorDaLinha | null;
  /** Só `insumos.ver`: o que a compra custa, em centavos; null = sem preço (ou sem permissão). */
  valorCentavos: number | null;
  /** Só `insumos.ver`: a compra tem insumo sem preço de referência. */
  semPreco: boolean;
}

export interface ContaDaTela {
  linhas: LinhaDaConta[];
  /** Só `insumos.ver`: o que a compra custa e quem ficou sem preço. null para quem não vê custos (ou nada a comprar). */
  compra: { totalCentavos: number; semPreco: string[] } | null;
}

export interface ListaDoDia {
  loja: { id: string; nome: string };
  hoje: string;
  dia: string;
  /** O dia já foi: só leitura. */
  passado: boolean;
  /** O estoque da loja está aberto (sem ele só se vê "vai usar"). */
  aberto: boolean;
  pode: { planejar: boolean; verEstoque: boolean; verCustos: boolean; verCompras: boolean };
  /** Os lotes do dia, de qualquer etapa. */
  lotes: LoteDoDia[];
  /** Os pré-preparos que se pode pôr na lista (só para quem planeja e num dia que ainda não passou). */
  fichas: FichaParaLista[];
  /** O rascunho, já lido e conferido (só para quem planeja). */
  rascunho: { linhas: LinhaDaPrevia[]; erros: Record<string, string>; excedeu: boolean };
  /** Vai usar · tem · comprar (null = a pessoa não vê o estoque, ou o dia já passou). */
  conta: ContaDaTela | null;
}

/**
 * A lista de um dia: os lotes, o rascunho conferido e a conta. Nada é gravado. Dia fora de "um ano atrás a 14 dias à
 * frente" (ou lixo) volta para hoje; dia passado é só leitura.
 */
export async function obterListaDoDia(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  lojaId: string,
  entrada: { dia?: unknown; linhas?: readonly LinhaDoRascunho[]; excedeu?: boolean },
  agora = new Date(),
) {
  const r = await comRecusa(() =>
    cliente.transacao(
      async (tx) => {
        const loja = await lojaDoAlcance(tx, alcance, lojaId, 'producao.ver');
        const hoje = hojeNoRio(agora);
        const { dia, passado } = lerDiaDaLista(entrada.dia, hoje);
        const planejar = pode(alcance, 'producao.planejar', { lojaId });
        const verEstoque = pode(alcance, 'estoque.ver', { lojaId });
        const verCustos = pode(alcance, 'insumos.ver');
        const verCompras = pode(alcance, 'compras.ver');

        const ordens = await tx.ordemProducao.findMany({
          where: { lojaId, dataPlanejada: dataDe(dia) },
          orderBy: [{ codigoLote: 'asc' }],
          select: {
            id: true,
            codigoLote: true,
            status: true,
            fichaId: true,
            fichaNomeSnapshot: true,
            unidadeSnapshot: true,
            planejadoMilesimos: true,
            produzidoMilesimos: true,
            daLista: true,
            planejadaPorNome: true,
            concluidaEm: true,
            requisicao: { select: { id: true, numero: true, status: true } },
          },
        });
        const lotes: LoteDoDia[] = ordens.map((o) => ({
          id: o.id,
          codigoLote: o.codigoLote,
          status: o.status as StatusDaProducao,
          fichaId: o.fichaId,
          fichaNome: o.fichaNomeSnapshot,
          unidade: (o.unidadeSnapshot ?? 'KG') as Unidade,
          planejadoMilesimos: o.planejadoMilesimos,
          produzidoMilesimos: o.produzidoMilesimos,
          daLista: o.daLista,
          planejadaPorNome: o.planejadaPorNome,
          estornado: o.status === 'CANCELADA' && o.concluidaEm !== null,
          requisicao: o.requisicao ? { id: o.requisicao.id, numero: o.requisicao.numero, status: o.requisicao.status as StatusDaRequisicao } : null,
        }));
        const aberto = ((await aberturasDe(tx, [lojaId])).get(lojaId)?.status ?? null) === 'FECHADA';
        const base: ListaDoDia = {
          loja: { id: loja.id, nome: loja.nome },
          hoje,
          dia,
          passado,
          aberto,
          pode: { planejar, verEstoque, verCustos, verCompras },
          lotes,
          fichas: [],
          rascunho: { linhas: [], erros: {}, excedeu: false },
          conta: null,
        };
        if (passado) return base;

        // Os pré-preparos que se pode pôr na lista (quem planeja) e o insumo que cada um produz.
        const fichasAtivas = await tx.fichaTecnica.findMany({
          where: { tipo: 'PRE_PREPARO', ativa: true, insumoProduzidoId: { not: null } },
          orderBy: { nome: 'asc' },
          select: { id: true, nome: true, unidadeRendimento: true, insumoProduzidoId: true },
        });
        const saldosDasFichas = verEstoque && fichasAtivas.length ? await saldosDe(tx, lojaId, fichasAtivas.map((f) => f.insumoProduzidoId!)) : new Map<string, number>();
        if (planejar) {
          base.fichas = fichasAtivas.map((f) => ({
            id: f.id,
            nome: f.nome,
            unidade: f.unidadeRendimento as Unidade,
            insumoId: f.insumoProduzidoId!,
            temMilesimos: verEstoque ? (saldosDasFichas.get(f.insumoProduzidoId!) ?? 0) : null,
          }));
        }

        // O rascunho: só quem planeja, e só com o que tem a forma de uma linha (o resto da URL é dado de fora).
        const digitadas = planejar ? (entrada.linhas ?? []).filter((l) => ID.test(l.fichaId)) : [];
        const lidas = planejar ? await lerRascunhoNaTx(tx, digitadas) : { linhas: [] as LinhaJuntada[], erros: {} as Record<string, string>, listas: new Map<string, Awaited<ReturnType<typeof listaDaFichaNaTx>>>() };
        if (planejar) {
          const jaNoDia = new Map<string, { codigoLote: string; quantidade: string }[]>();
          for (const l of lotes) if (l.status !== 'CANCELADA') jaNoDia.set(l.fichaId, [...(jaNoDia.get(l.fichaId) ?? []), { codigoLote: l.codigoLote, quantidade: formatarQuantidade(l.planejadoMilesimos, l.unidade) }]);
          base.rascunho = {
            linhas: lidas.linhas.map((l) => ({
              posicao: l.posicao,
              fichaId: l.fichaId,
              nome: l.nome,
              unidade: l.unidade,
              quantidadeMilesimos: l.quantidadeMilesimos,
              juntou: l.juntou,
              aviso: avisoDoLoteJaExistente(jaNoDia.get(l.fichaId) ?? []),
              avisosDaFicha: lidas.listas.get(l.fichaId)?.avisos ?? [],
            })),
            // Sem nenhuma linha digitada não é erro: é a lista ainda por montar.
            erros: digitadas.length === 0 && !entrada.excedeu ? {} : lidas.erros,
            excedeu: !!entrada.excedeu,
          };
        }

        if (!verEstoque) return base;

        // Vai usar: o que ainda vai SAIR do estoque até o dia (falta das requisições abertas) + o rascunho.
        const usos: UsoPrevisto[] = [];
        const requisicoes = await tx.requisicao.findMany({
          where: { lojaId, status: { in: ['ABERTA', 'PARCIAL'] }, OR: [{ paraDia: null }, { paraDia: { lte: dataDe(dia) } }] },
          orderBy: [{ paraDia: 'asc' }, { numero: 'asc' }],
          select: { id: true, numero: true, setor: true, paraDia: true, itens: { select: { insumoId: true, solicitadoMilesimos: true, atendidoMilesimos: true } } },
        });
        const lotesDasRequisicoes = requisicoes.length
          ? await tx.ordemProducao.findMany({ where: { requisicaoId: { in: requisicoes.map((q) => q.id) } }, select: { requisicaoId: true, codigoLote: true, dataPlanejada: true, fichaNomeSnapshot: true } })
          : [];
        const loteDe = new Map(lotesDasRequisicoes.map((o) => [o.requisicaoId!, o]));
        for (const q of requisicoes) {
          const lote = loteDe.get(q.id);
          const daLista = !!lote && iso(lote.dataPlanejada) === dia;
          const de = daLista ? lote!.fichaNomeSnapshot : lote ? `Lote ${lote.codigoLote} · ${lote.fichaNomeSnapshot} (requisição ${numeroDaRequisicao(q.numero)})` : `${rotuloDoSetor(q.setor)} ${numeroDaRequisicao(q.numero)}`;
          for (const i of q.itens) {
            const falta = faltaDe({ solicitadoMilesimos: i.solicitadoMilesimos, atendidoMilesimos: i.atendidoMilesimos ?? 0 });
            if (falta > 0) usos.push({ insumoId: i.insumoId, grupo: daLista ? 'LISTA' : 'OUTROS', quantidadeMilesimos: falta, de });
          }
        }
        // O que a lista já produz: lotes pendentes até o dia e o rascunho.
        const producoes: ProducaoPrevista[] = [];
        const pendentes = await tx.ordemProducao.findMany({
          where: { lojaId, status: { in: ['PLANEJADA', 'EM_EXECUCAO'] }, dataPlanejada: { lte: dataDe(dia) }, insumoProduzidoId: { not: null } },
          select: { insumoProduzidoId: true, planejadoMilesimos: true },
        });
        for (const o of pendentes) producoes.push({ insumoId: o.insumoProduzidoId!, quantidadeMilesimos: o.planejadoMilesimos });
        const fichaPorId = new Map(fichasAtivas.map((f) => [f.id, f]));
        for (const l of lidas.linhas) {
          const lista = lidas.listas.get(l.fichaId);
          const f = fichaPorId.get(l.fichaId);
          if (!lista || !f) continue;
          for (const x of lista.linhas) {
            const q = lerQuantidade(x.quantidade);
            if (q) usos.push({ insumoId: x.insumoId, grupo: 'LISTA', quantidadeMilesimos: q, de: l.nome });
          }
          producoes.push({ insumoId: f.insumoProduzidoId!, quantidadeMilesimos: l.quantidadeMilesimos });
        }

        const ids = Array.from(new Set([...usos.map((u) => u.insumoId), ...producoes.map((p) => p.insumoId)]));
        const insumos = new Map<string, InsumoDaConta>(
          (ids.length ? await tx.insumo.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true, unidade: true, tipo: true, ativo: true, conteudoMilesimos: true } }) : []).map((i) => [
            i.id,
            { id: i.id, nome: i.nome, unidade: i.unidade as Unidade, tipo: i.tipo, ativo: i.ativo, conteudoMilesimos: i.conteudoMilesimos },
          ]),
        );
        const saldos = aberto ? await saldosDe(tx, lojaId, ids) : new Map<string, number>();
        let contas = contaDaLista({ cadastro: insumos, usos, saldos, producoes });
        // Estoque não aberto: só "vai usar" (sem o livro não há "tem" nem "comprar").
        if (!aberto) contas = contas.map((c) => ({ ...c, temMilesimos: 0, noLivroMilesimos: 0, comprar: null, produzir: null }));

        const comprar = contas.filter((c) => c.comprar);
        const custos = verCustos && comprar.length ? await custosDeReferencia(tx, comprar.map((c) => c.insumoId)) : new Map<string, { porUnidade: Fracao | null }>();
        const valor = verCustos && comprar.length ? valorDaCompra(comprar.map((c) => ({ insumoId: c.insumoId, nome: c.nome, totalMilesimos: c.comprar!.totalMilesimos })), new Map(Array.from(custos).map(([k, v]) => [k, v.porUnidade]))) : null;
        const ultimas = verCompras && comprar.length ? await ultimasCompras(tx, comprar.map((c) => c.insumoId)) : new Map();
        const fichaDoInsumo = new Map(fichasAtivas.map((f) => [f.insumoProduzidoId!, { id: f.id, nome: f.nome }]));
        const linhas: LinhaDaConta[] = contas.map((c) => {
          const compra = ultimas.get(c.insumoId);
          // O fornecedor é da NOTA: só sai para quem vê compras na loja daquela nota.
          const fornecedor = compra && compra.fornecedor && pode(alcance, 'compras.ver', { lojaId: compra.lojaId }) ? { nome: compra.fornecedor, notaEm: compra.entradaEm } : null;
          return {
            ...c,
            ficha: c.tipo === 'PRE_PREPARO' ? (fichaDoInsumo.get(c.insumoId) ?? null) : null,
            fornecedor,
            valorCentavos: valor?.porInsumo.get(c.insumoId) ?? null,
            semPreco: !!valor && c.comprar !== null && !valor.porInsumo.has(c.insumoId),
          };
        });
        base.conta = { linhas, compra: valor ? { totalCentavos: valor.totalCentavos, semPreco: valor.semPreco } : null };
        return base;
      },
      { timeout: 30_000, maxWait: 10_000 },
    ),
  );
  return 'ok' in r ? null : r;
}

async function saldosDe(tx: ClienteDoParceiro, lojaId: string, insumoIds: readonly string[]): Promise<Map<string, number>> {
  if (insumoIds.length === 0) return new Map();
  const s = await tx.saldoEstoque.findMany({ where: { lojaId, insumoId: { in: [...insumoIds] } }, select: { insumoId: true, quantidadeMilesimos: true } });
  return new Map(s.map((x) => [x.insumoId, x.quantidadeMilesimos]));
}

/** As fichas do rascunho como `juntarLinhas` as quer (o que se produz e o que não). Ficha de outro parceiro não existe aqui: o portão não a lê. */
async function fichasDoRascunho(tx: ClienteDoParceiro, linhas: readonly LinhaDoRascunho[]) {
  const ids = Array.from(new Set(linhas.map((l) => l.fichaId).filter((x) => ID.test(x))));
  const fichas = ids.length ? await tx.fichaTecnica.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true, tipo: true, ativa: true, unidadeRendimento: true, insumoProduzidoId: true } }) : [];
  const mapa = new Map<string, FichaParaLinha>();
  for (const f of fichas) {
    const naoProduz =
      f.tipo !== 'PRE_PREPARO'
        ? 'Só se produz pré-preparo: escolha um dos pré-preparos.'
        : !f.ativa
          ? `“${f.nome}” está desativado.`
          : !f.insumoProduzidoId
            ? `“${f.nome}” ainda não vira insumo do estoque: salve a ficha dele de novo.`
            : null;
    mapa.set(f.id, { nome: f.nome, unidade: f.unidadeRendimento as Unidade, naoProduz });
  }
  return mapa;
}

/** Lê o rascunho: junta a mesma ficha, confere cada uma e monta a lista de insumos de cada (a mesma que o lote vai pedir). */
async function lerRascunhoNaTx(tx: ClienteDoParceiro, digitadas: readonly LinhaDoRascunho[]) {
  const fichas = await fichasDoRascunho(tx, digitadas);
  const juntas = juntarLinhas(digitadas, fichas);
  const erros = { ...juntas.erros };
  const validas: LinhaJuntada[] = [];
  const listas = new Map<string, Awaited<ReturnType<typeof listaDaFichaNaTx>>>();
  for (const l of juntas.linhas) {
    try {
      listas.set(l.fichaId, await listaDaFichaNaTx(tx, l.fichaId, textoDaQuantidade(l.quantidadeMilesimos), { soPreparo: true }));
      validas.push(l);
    } catch (e) {
      if (!(e instanceof Recusa)) throw e;
      erros[`linha:${l.posicao}`] = Object.values(e.resultado.erros)[0] ?? 'Esta linha não vale.';
    }
  }
  return { linhas: validas, erros, listas };
}

// ================================================================ confirmar a lista

export type ResultadoDaLista = ResultadoEstoque & { lotes?: number };

/**
 * Confirma a lista: `producao.planejar` na loja, dia de hoje a 14 dias à frente, de 1 a 30 linhas. A mesma ficha duas vezes
 * soma. UMA transação: grava um lote (`daLista`) e a requisição dos insumos de cada linha, pela mesma regra de planejar da
 * 3.1; linha ruim ou estoque não aberto e NADA entra. Idempotente pela chave do envio (cada lote leva `<envio>:<n>`): o
 * duplo clique devolve os mesmos lotes. Nada sai do estoque aqui (a baixa é a entrega de cada requisição).
 */
export async function confirmarLista(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  lojaId: string,
  entrada: { dia: unknown; linhas: readonly LinhaDoRascunho[]; envio?: unknown },
  autor: Autor,
  agora = new Date(),
): Promise<ResultadoDaLista> {
  return comRecusa(() =>
    cliente.transacao(
      async (tx) => {
        const loja = await lojaDoAlcance(tx, alcance, lojaId, 'producao.planejar');
        const hoje = hojeNoRio(agora);
        const dia = lerParaDia(entrada.dia, hoje);
        if ('erro' in dia) throw new Recusa({ ok: false, erros: { paraDia: dia.erro } });
        const chave = lerChaveDoEnvio(entrada.envio);
        // A mesma trava do dia que cada lote pega: o envio repetido espera o primeiro terminar e o encontra pronto.
        await tx.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`erp:lote:${tx.parceiroId}:${dia.dia}`}, 0))::text AS "trava"`;
        if (chave) {
          const feitos = await tx.ordemProducao.findMany({ where: { chaveIdempotencia: { startsWith: `${chave}:` } }, orderBy: { codigoLote: 'asc' }, select: { id: true, lojaId: true } });
          if (feitos.length) {
            if (feitos.some((f) => f.lojaId !== lojaId)) throw new Recusa({ ok: false, erros: { geral: 'Este envio já foi usado: recarregue a tela e confirme de novo.' } });
            return { ok: true as const, id: feitos[0].id, jaFeito: true, lotes: feitos.length };
          }
        }
        if (entrada.linhas.length > LINHAS_POR_ENVIO) throw new Recusa({ ok: false, erros: { geral: `Até ${LINHAS_POR_ENVIO} linhas por vez: confirme estas e monte o resto depois.` } });
        const lidas = await lerRascunhoNaTx(tx, entrada.linhas);
        if (Object.keys(lidas.erros).length) throw new Recusa({ ok: false, erros: lidas.erros });
        let primeiro: string | null = null;
        let n = 0;
        for (const l of lidas.linhas) {
          const lista = lidas.listas.get(l.fichaId)!;
          let lote;
          try {
            lote = await planejarProducaoNaTx(
              tx,
              loja,
              { fichaId: l.fichaId, quantidade: textoDaQuantidade(l.quantidadeMilesimos), dia: dia.dia, observacao: '', linhas: lista.linhas, chave: chave ? `${chave}:${n}` : null, daLista: true, lista },
              autor,
              agora,
            );
          } catch (e) {
            // Erro de ficha ou de quantidade é DA LINHA; o resto (estoque não aberto, loja desativada) fica geral.
            if (e instanceof Recusa) {
              const { ficha, quantidade, itens, ...resto } = e.resultado.erros as Record<string, string | undefined>;
              const daLinha = ficha ?? quantidade ?? itens;
              if (daLinha) throw new Recusa({ ...e.resultado, erros: { ...resto, [`linha:${l.posicao}`]: daLinha } as Record<string, string> });
            }
            throw e;
          }
          primeiro ??= lote.id;
          n += 1;
        }
        return { ok: true as const, id: primeiro!, lotes: n };
      },
      // Até 30 lotes, cada um com a sua requisição: mais folga que o lote avulso.
      { timeout: 60_000, maxWait: 10_000 },
    ),
  );
}
