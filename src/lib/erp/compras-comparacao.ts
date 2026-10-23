/**
 * Comparação de fornecedores e de períodos (L.3) — a leitura com banco. Reaproveita o motor da L.2 (`fonte`, `resolverRecorte`,
 * `gruposDoRecorte`, `canceladasDoRecorte`...): o recorte (lojas do acesso, data usada, fornecedor, insumo, categoria) é um só, e o
 * período B é o MESMO recorte do A com as datas trocadas, então os dois lados nunca usam critérios, lojas ou unidades diferentes.
 *
 * - O banco agrega (GROUP BY insumo × unidade × fornecedor); o código só faz a conta pura de `compras-comparacao-campos.ts` sobre as
 *   células já somadas (nunca sobre notas). Mais de `TETO_DE_CELULAS` células num lado: a tela recusa em frase, sem cortar calada.
 * - Só entram as linhas COMPARÁVEIS (as que a L.2 não marca "sem base"). As outras são contadas, valorizadas e abertas.
 * - Uma fotografia só por tela (`transacao(..., { repetivel: true })`): A, B e os avisos concordam entre si.
 * - Quem vê: `compras.ver`, só nas lojas do acesso (a mesma `resolverRecorte` da L.2).
 */

import { Prisma } from '@prisma/client';
import type { ClienteDoParceiro } from './tenant';
import { conferirSqlDoParceiro } from './tenant';
import type { Alcance } from './permissoes';
import {
  canceladasDoRecorte,
  documentosAguardando,
  FORNECEDOR_DA_LINHA,
  fonte,
  gruposDoRecorte,
  NOME_DO_FORNECEDOR_DA_LINHA,
  opcoesDoRelatorio,
  resolverRecorte,
  semEmissaoNoRecorte,
  totaisDoRecorte,
  type Opcoes,
  type Recorte,
} from './compras-relatorio';
import {
  compararPeriodos,
  ranquearFornecedores,
  type Celula,
  type Comparacao,
  type FiltrosDePeriodos,
  type FornecedorDoInsumo,
  type TabelaDeUnidade,
} from './compras-comparacao-campos';
import { somarDias, type FiltrosDoRelatorio, type MotivoSemBase } from './compras-relatorio-campos';
import { numeroDaNota } from './compra-campos';
import type { Unidade } from './unidades';

function guardado(f: Prisma.Sql): Prisma.Sql {
  conferirSqlDoParceiro(f.strings);
  return f;
}

/** O teto de células (insumo × unidade × fornecedor) que um lado carrega. Acima disso a tela manda reduzir o recorte. */
export const TETO_DE_CELULAS = 20_000;

const FORNECEDOR = FORNECEDOR_DA_LINHA;

const MOTIVOS = new Set<string>(['insumo', 'unidade', 'conversao', 'valor']);

export interface SemBaseDoLado {
  linhas: number;
  valorCentavos: number;
  freteCentavos: number;
  porMotivo: Partial<Record<MotivoSemBase, number>>;
  /** Por insumo ("-" = linha sem insumo): quantas linhas e quanto dinheiro ficaram fora da conta. */
  porInsumo: Record<string, { linhas: number; valorCentavos: number; freteCentavos: number }>;
}

export interface LadoDoBanco {
  celulas: Celula[];
  passouDoTeto: boolean;
  /** Todas as notas e linhas do lado (com e sem base). */
  notas: number;
  linhas: number;
  notasComDesconto: number;
  semBase: SemBaseDoLado;
  /** valor + frete de TODAS as linhas do lado (a cobertura é o comparável sobre isto). */
  dinheiroTotalCentavos: number;
  /** valor + frete só das linhas comparáveis. */
  dinheiroComparavelCentavos: number;
}

/** As células comparáveis de um lado, o que ficou sem base e os totais de notas e linhas. */
export async function ladoDoRecorte(tx: ClienteDoParceiro, r: Recorte, teto = TETO_DE_CELULAS): Promise<LadoDoBanco> {
  // UMA leitura do recorte (CTE materializada) devolve as três coisas de que o lado precisa: as células comparáveis, o que ficou
  // sem base (por motivo e por insumo) e os totais de notas e linhas. Ler três vezes custava três vezes o mesmo SQL.
  const lidas = await tx.sql<{
    tipo: string; insumoId: string | null; insumo: string | null; unidade: string | null; fornecedorId: string | null; fornecedor: string | null;
    motivo: string | null; notas: number; linhas: number; quantidade: number; valor: number; frete: number; descontos: number;
  }>`
    WITH f AS MATERIALIZED (${fonte(r)})
    (SELECT 'celula'::text AS "tipo", f."insumoId", MIN(COALESCE(f."insumoNome", f."insumoNomeSnapshot", 'Sem insumo identificado')) AS "insumo", f."unidade",
            ${FORNECEDOR} AS "fornecedorId",
            MIN(${NOME_DO_FORNECEDOR_DA_LINHA}) AS "fornecedor", NULL::text AS "motivo",
            count(DISTINCT f."notaId")::float8 AS "notas", count(*)::float8 AS "linhas",
            sum(f."quantidadeMilesimos")::float8 AS "quantidade", sum(f."valor")::float8 AS "valor", sum(f."frete")::float8 AS "frete", 0::float8 AS "descontos"
     FROM f WHERE f."motivo" IS NULL
     GROUP BY f."insumoId", f."unidade", ${FORNECEDOR}
     ORDER BY 3, 2, 4, 5
     LIMIT ${teto + 1}::int)
    UNION ALL
    (SELECT 'sem'::text, COALESCE(f."insumoId", '-'), NULL::text, NULL::text, NULL::text, NULL::text, f."motivo",
            0::float8, count(*)::float8, 0::float8, COALESCE(sum(f."valor"), 0)::float8, COALESCE(sum(f."frete"), 0)::float8, 0::float8
     FROM f WHERE f."motivo" IS NOT NULL
     GROUP BY f."motivo", COALESCE(f."insumoId", '-')
     LIMIT ${teto + 1}::int)
    UNION ALL
    (SELECT 'geral'::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
            count(DISTINCT f."notaId")::float8, count(*)::float8, 0::float8, 0::float8, 0::float8,
            count(DISTINCT f."notaId") FILTER (WHERE f."descontoDaNota" > 0)::float8
     FROM f)`;
  const celulas = lidas.filter((l) => l.tipo === 'celula');
  const sem = lidas.filter((l) => l.tipo === 'sem');
  const geral = lidas.find((l) => l.tipo === 'geral');
  const semBase: SemBaseDoLado = { linhas: 0, valorCentavos: 0, freteCentavos: 0, porMotivo: {}, porInsumo: {} };
  for (const s of sem) {
    semBase.linhas += s.linhas;
    semBase.valorCentavos += s.valor;
    semBase.freteCentavos += s.frete;
    if (s.motivo && MOTIVOS.has(s.motivo)) semBase.porMotivo[s.motivo as MotivoSemBase] = (semBase.porMotivo[s.motivo as MotivoSemBase] ?? 0) + s.linhas;
    const i = (semBase.porInsumo[s.insumoId ?? '-'] ??= { linhas: 0, valorCentavos: 0, freteCentavos: 0 });
    i.linhas += s.linhas;
    i.valorCentavos += s.valor;
    i.freteCentavos += s.frete;
  }
  const passouDoTeto = celulas.length > teto || sem.length > teto;
  const doBanco = celulas.slice(0, teto).map(
    (c): Celula => ({
      insumoId: c.insumoId as string,
      insumo: c.insumo as string,
      unidade: c.unidade as Unidade,
      fornecedorId: c.fornecedorId as string,
      fornecedor: c.fornecedor as string,
      notas: c.notas,
      linhas: c.linhas,
      quantidadeMilesimos: c.quantidade,
      valorCentavos: c.valor,
      freteCentavos: c.frete,
    }),
  );
  const comparavel = doBanco.reduce((s, c) => s + c.valorCentavos + c.freteCentavos, 0);
  return {
    celulas: doBanco,
    passouDoTeto,
    notas: geral?.notas ?? 0,
    linhas: geral?.linhas ?? 0,
    notasComDesconto: geral?.descontos ?? 0,
    semBase,
    dinheiroComparavelCentavos: comparavel,
    dinheiroTotalCentavos: comparavel + semBase.valorCentavos + semBase.freteCentavos,
  };
}

/** O mesmo recorte do A com as datas do B: as mesmas lojas, o mesmo fornecedor, o mesmo insumo, a mesma data usada. */
export function recorteDoLadoB(a: Recorte, deB: string, ateB: string): Recorte {
  return { ...a, de: deB, ate: ateB, fim: somarDias(ateB, 1) };
}

// ------------------------------------------------------------- períodos

export interface LadoDaTela extends LadoDoBanco {
  de: string;
  ate: string;
  canceladas: { notas: number; valorCentavos: number; freteCentavos: number };
  /** Base "emissão": notas lançadas (pela entrada) que ficaram de fora por não terem emissão. */
  semEmissao: number | null;
}

export interface ComparacaoDePeriodosDaTela {
  motivoVazio: 'sem-permissao' | 'sem-loja' | 'periodo' | null;
  opcoes: Opcoes;
  lojasUsadas: { id: string; nome: string }[];
  a: LadoDaTela | null;
  b: LadoDaTela | null;
  comparacao: Comparacao | null;
  /** Os itens da página pedida (a ordem é a da comparação: do que mais mexeu no gasto ao que menos). */
  itensDaPagina: Comparacao['itens'];
  totalDeItens: number;
  pagina: number;
  paginas: number;
  aguardando: number;
  /** Um insumo só no recorte: o custo médio quer dizer alguma coisa e os fornecedores aparecem lado a lado. */
  umInsumo: boolean;
  insumo: { id: string; nome: string; marcaReferencia: string | null } | null;
  /** Um dos lados passou do teto de células: a comparação não é feita. */
  passouDoTeto: boolean;
  /** Procurou pelo nome e só um insumo com compra tem esse nome: a comparação já saiu dele (a página põe no endereço, sem ler tudo de novo). */
  insumoDaBusca: string | null;
}

const SEM_OPCOES: Opcoes = { lojas: [], fornecedores: [], categorias: [], listaDeInsumos: [], insumosTruncados: false };

async function ladoDaTela(tx: ClienteDoParceiro, r: Recorte, teto: number): Promise<LadoDaTela> {
  const base = await ladoDoRecorte(tx, r, teto);
  const c = await canceladasDoRecorte(tx, r);
  return {
    ...base,
    de: r.de,
    ate: r.ate,
    canceladas: { notas: c.notas, valorCentavos: c.valorCentavos, freteCentavos: c.freteCentavos },
    semEmissao: r.base === 'emissao' ? await semEmissaoNoRecorte(tx, r) : null,
  };
}

/** A comparação de dois períodos, numa fotografia só do banco. */
/** `limites.teto`: só para o teste do teto (o padrão é `TETO_DE_CELULAS`). */
export async function comparacaoDePeriodos(cliente: ClienteDoParceiro, alcance: Alcance, f: FiltrosDePeriodos, limites: { teto?: number } = {}): Promise<ComparacaoDePeriodosDaTela> {
  return cliente.transacao(
    async (tx) => {
      const { recorte, lojasDoAcesso, motivo } = await resolverRecorte(tx, alcance, { ...f.rel, periodoInvalido: f.periodoInvalido });
      const opcoes = motivo === 'sem-permissao' ? SEM_OPCOES : await opcoesDoRelatorio(tx, lojasDoAcesso, f.rel);
      const vazio: ComparacaoDePeriodosDaTela = {
        motivoVazio: motivo,
        opcoes,
        lojasUsadas: [],
        a: null,
        b: null,
        comparacao: null,
        itensDaPagina: [],
        totalDeItens: 0,
        pagina: 1,
        paginas: 1,
        aguardando: 0,
        umInsumo: false,
        insumo: null,
        passouDoTeto: false,
        insumoDaBusca: null,
      };
      if (!recorte) return vazio;
      const unicoDaBusca = !f.rel.insumoId && f.rel.q && opcoes.listaDeInsumos.length === 1 ? opcoes.listaDeInsumos[0].id : null;
      if (unicoDaBusca) recorte.insumoIds = [unicoDaBusca];
      const teto = limites.teto ?? TETO_DE_CELULAS;
      const a = await ladoDaTela(tx, recorte, teto);
      const b = await ladoDaTela(tx, recorteDoLadoB(recorte, f.deB, f.ateB), teto);
      const umInsumo = recorte.insumoIds?.length === 1;
      const insumo = umInsumo ? await tx.insumo.findUnique({ where: { id: recorte.insumoIds![0] }, select: { id: true, nome: true, marcaReferencia: true } }) : null;
      const base = { ...vazio, insumoDaBusca: unicoDaBusca, motivoVazio: null, lojasUsadas: lojasDoAcesso.filter((l) => recorte.lojas.includes(l.id)), a, b, umInsumo, insumo, aguardando: await documentosAguardando(tx, recorte.lojas) };
      if (a.passouDoTeto || b.passouDoTeto) return { ...base, passouDoTeto: true };
      const comparacao = compararPeriodos(a.celulas, b.celulas, f.medida);
      const total = comparacao.itens.length;
      const paginas = Math.max(1, Math.ceil(total / f.porPagina));
      const pagina = Math.min(Math.max(1, f.pagina), paginas);
      return { ...base, comparacao, totalDeItens: total, pagina, paginas, itensDaPagina: comparacao.itens.slice((pagina - 1) * f.porPagina, pagina * f.porPagina) };
    },
    { repetivel: true, timeout: 60_000 },
  );
}

// ---------------------------------------------------------- fornecedores

export interface ComparacaoDeFornecedoresDaTela {
  motivoVazio: 'sem-permissao' | 'sem-loja' | 'periodo' | null;
  opcoes: Opcoes;
  lojasUsadas: { id: string; nome: string }[];
  insumo: { id: string; nome: string; marcaReferencia: string | null; unidade: Unidade } | null;
  tabelas: TabelaDeUnidade[];
  /** Fornecedores que só têm linha sem unidade gravada (fora de qualquer disputa). */
  semUnidade: FornecedorDoInsumo[];
  totais: Awaited<ReturnType<typeof totaisDoRecorte>> | null;
  canceladas: { notas: number; valorCentavos: number; freteCentavos: number } | null;
  semEmissao: number | null;
  aguardando: number;
  /** Procurou pelo nome e só um insumo com compra tem esse nome: a comparação já saiu dele. */
  insumoDaBusca: string | null;
}

/** Os fornecedores de UM insumo no período: preço do item e custo entregue por unidade, embalagens e a última compra de cada um. */
export async function comparacaoDeFornecedores(cliente: ClienteDoParceiro, alcance: Alcance, f: FiltrosDoRelatorio): Promise<ComparacaoDeFornecedoresDaTela> {
  return cliente.transacao(
    async (tx) => {
      const { recorte, lojasDoAcesso, motivo } = await resolverRecorte(tx, alcance, { ...f, agrupar: 'fornecedor', situacao: 'lancadas', grupo: '', unidade: '', so: '' });
      const opcoes = motivo === 'sem-permissao' ? SEM_OPCOES : await opcoesDoRelatorio(tx, lojasDoAcesso, f);
      const vazio: ComparacaoDeFornecedoresDaTela = { motivoVazio: motivo, opcoes, lojasUsadas: [], insumo: null, tabelas: [], semUnidade: [], totais: null, canceladas: null, semEmissao: null, aguardando: 0, insumoDaBusca: null };
      if (!recorte) return vazio;
      const base = { ...vazio, lojasUsadas: lojasDoAcesso.filter((l) => recorte.lojas.includes(l.id)) };
      const insumoId = f.insumoId || (f.q && opcoes.listaDeInsumos.length === 1 ? opcoes.listaDeInsumos[0].id : '');
      if (!insumoId) return base;
      const insumo = await tx.insumo.findUnique({ where: { id: insumoId }, select: { id: true, nome: true, marcaReferencia: true, unidade: true } });
      if (!insumo) return base;
      const r: Recorte = { ...recorte, insumoIds: [insumoId] };
      const grupos = await gruposDoRecorte(tx, { ...r, agrupar: 'fornecedor' }, null);
      const embalagens = await tx.sql<{ fornecedorId: string; unidade: string | null; embalagens: string[] | null }>`
        WITH f AS (${fonte(r)})
        SELECT ${FORNECEDOR} AS "fornecedorId", f."unidade",
               array_agg(DISTINCT f."embalagemSnapshot" ORDER BY f."embalagemSnapshot") FILTER (WHERE f."embalagemSnapshot" IS NOT NULL AND f."embalagemSnapshot" <> '') AS "embalagens"
        FROM f WHERE f."motivo" IS NULL
        GROUP BY 1, 2`;
      const ultimas = await tx.sql<{ fornecedorId: string; unidade: string; notaId: string; dia: Date; numero: string | null; serie: string; q: number; v: number; fr: number }>`
        WITH f AS (${fonte(r)}),
        n AS (
          SELECT ${FORNECEDOR} AS "fornecedorId", f."unidade", f."notaId", f."dia", f."numero", f."serie",
                 sum(f."quantidadeMilesimos")::float8 AS "q", sum(f."valor")::float8 AS "v", sum(f."frete")::float8 AS "fr"
          FROM f WHERE f."motivo" IS NULL
          GROUP BY 1, 2, 3, 4, 5, 6
        )
        SELECT DISTINCT ON (n."fornecedorId", n."unidade") n."fornecedorId", n."unidade", n."notaId", n."dia", n."numero", n."serie", n."q", n."v", n."fr"
        FROM n
        ORDER BY n."fornecedorId", n."unidade", n."dia" DESC, n."notaId" DESC`;
      const lista = grupos.grupos.map((g): FornecedorDoInsumo => {
        const u = g.total.unidade;
        const ult = ultimas.find((x) => x.fornecedorId === g.chave && x.unidade === u);
        return {
          fornecedorId: g.chave,
          fornecedor: g.rotulo,
          unidade: u,
          notas: g.notas,
          linhas: g.total.linhas,
          linhasSemBase: g.total.linhas - g.total.comparavel.linhas,
          comparavel: g.total.comparavel,
          embalagens: embalagens.find((x) => x.fornecedorId === g.chave && x.unidade === u)?.embalagens ?? [],
          ultima: ult
            ? { data: ult.dia.toISOString().slice(0, 10), notaId: ult.notaId, rotuloDaNota: numeroDaNota(ult), quantidadeMilesimos: ult.q, valorCentavos: ult.v, freteCentavos: ult.fr }
            : null,
        };
      });
      const { tabelas, semUnidade } = ranquearFornecedores(lista);
      const c = await canceladasDoRecorte(tx, r);
      return {
        ...base,
        insumoDaBusca: f.insumoId ? null : insumoId,
        insumo: { id: insumo.id, nome: insumo.nome, marcaReferencia: insumo.marcaReferencia, unidade: insumo.unidade as Unidade },
        tabelas,
        semUnidade,
        totais: await totaisDoRecorte(tx, r),
        canceladas: { notas: c.notas, valorCentavos: c.valorCentavos, freteCentavos: c.freteCentavos },
        semEmissao: f.base === 'emissao' ? await semEmissaoNoRecorte(tx, r) : null,
        aguardando: await documentosAguardando(tx, r.lojas),
      };
    },
    { repetivel: true, timeout: 60_000 },
  );
}
