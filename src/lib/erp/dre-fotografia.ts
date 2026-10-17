/**
 * A fotografia do fechamento (2.2b, decisão 153) — ler e gravar, com banco.
 *
 * GRAVAR só acontece dentro do fechamento (`dre-fechamento.ts`), na transação que pegou a trava
 * exclusiva do período. LER entrega a fotografia VIGENTE de um período já filtrada pelo alcance
 * de quem pede (o gerente de uma loja só recebe as linhas, as ressalvas e nada da justificativa da
 * rede) e NUNCA lê a coluna `entrada` (a receita de todas as lojas por canal, a base da conta),
 * que só a conta do fechamento e a 2.3 usam.
 */

import type { Prisma } from '@prisma/client';
import { cmvLidoDaFotografia, type CmvDoDre } from './cmv-campos';
import type { LinhaGravada, Ressalva } from './dre-fechamento-campos';
import type { ReceitaLida, TaxaDoIfood } from './dre-campos';
import type { GrupoDoDre, SentidoDaLinha } from './dre-plano';
import type { Alcance } from './permissoes';
import type { ClienteDoParceiro } from './tenant';

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** BigInt do banco → número, recusando o que não cabe com exatidão (nunca aconteceu; seria um dado fora da conta). */
function numero(v: bigint | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new RangeError('Valor da fotografia fora do que a tela mostra com exatidão.');
  return n;
}

export interface FotografiaLida {
  id: string;
  periodoId: string;
  versao: number;
  inicio: string;
  fim: string;
  nomeDoPeriodo: string;
  criadoEm: Date;
  fechadoPorNome: string;
  taxa: TaxaDoIfood | null;
  versaoDaConta: number;
  /** As ressalvas que a pessoa pode ver (a de loja só para quem alcança a loja; a da rede só para a rede inteira). */
  ressalvas: Ressalva[];
  /** Quantas ressalvas a fotografia tem ao todo (só para a rede inteira; o gerente de loja recebe só as dele). */
  totalDeRessalvas: number | null;
  /** Só a rede inteira lê. */
  justificativa: string | null;
  substituidaEm: Date | null;
  reabertaPorNome: string | null;
  motivoReabertura: string | null;
  /** As linhas dos escopos que a pessoa alcança (rede: tudo; loja: só as da loja). */
  linhas: LinhaGravada[];
}

const doBanco = (l: {
  lojaId: string | null;
  lojaNome: string | null;
  ordem: number;
  chave: string;
  codigo: string | null;
  linhaId: string | null;
  nome: string;
  grupo: GrupoDoDre;
  tipo: string;
  nivel: number;
  sentido: SentidoDaLinha;
  valorCentavos: bigint | null;
  percentualBp: number | null;
  metaBp: number | null;
  semContar: string[];
  nota: string | null;
  oculta: boolean;
}): LinhaGravada => ({
  lojaId: l.lojaId,
  lojaNome: l.lojaNome,
  ordem: l.ordem,
  chave: l.chave,
  codigo: l.codigo,
  linhaId: l.linhaId,
  nome: l.nome,
  grupo: l.grupo,
  tipo: l.tipo as LinhaGravada['tipo'],
  nivel: l.nivel === 0 ? 0 : 1,
  sentido: l.sentido,
  valorCentavos: numero(l.valorCentavos),
  percentualBp: l.percentualBp,
  metaBp: l.metaBp,
  semContar: l.semContar,
  nota: l.nota,
  oculta: l.oculta,
});

const ressalvasDe = (json: Prisma.JsonValue): Ressalva[] => (Array.isArray(json) ? (json as unknown as Ressalva[]) : []);

const CABECALHO = {
  id: true,
  periodoId: true,
  versao: true,
  inicio: true,
  fim: true,
  nomeDoPeriodo: true,
  criadoEm: true,
  fechadoPorNome: true,
  taxaComissaoBp: true,
  taxaPagamentoBp: true,
  versaoDaConta: true,
  ressalvas: true,
  justificativa: true,
  substituidaEm: true,
  reabertaPorNome: true,
  motivoReabertura: true,
} as const;

type Cabecalho = Prisma.DreFotografiaGetPayload<{ select: typeof CABECALHO }>;

async function paraALeitura(tx: ClienteDoParceiro, alcance: Pick<Alcance, 'lojas'>, f: Cabecalho): Promise<FotografiaLida> {
  const rede = alcance.lojas === 'todas';
  const linhas = await tx.dreFotografiaLinha.findMany({
    where: { fotografiaId: f.id, ...(rede ? {} : { lojaId: { in: [...alcance.lojas] } }) },
    orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
    select: {
      lojaId: true, lojaNome: true, ordem: true, chave: true, codigo: true, linhaId: true, nome: true, grupo: true, tipo: true, nivel: true, sentido: true,
      valorCentavos: true, percentualBp: true, metaBp: true, semContar: true, nota: true, oculta: true,
    },
  });
  const todas = ressalvasDe(f.ressalvas);
  const minhas = rede ? todas : todas.filter((r) => r.lojaId !== null && (alcance.lojas as readonly string[]).includes(r.lojaId));
  return {
    id: f.id,
    periodoId: f.periodoId,
    versao: f.versao,
    inicio: iso(f.inicio),
    fim: iso(f.fim),
    nomeDoPeriodo: f.nomeDoPeriodo,
    criadoEm: f.criadoEm,
    fechadoPorNome: f.fechadoPorNome,
    taxa: f.taxaComissaoBp !== null && f.taxaPagamentoBp !== null ? { comissaoBp: f.taxaComissaoBp, pagamentoBp: f.taxaPagamentoBp } : null,
    versaoDaConta: f.versaoDaConta,
    ressalvas: minhas,
    totalDeRessalvas: rede ? todas.length : null,
    justificativa: rede ? f.justificativa : null,
    substituidaEm: f.substituidaEm,
    reabertaPorNome: rede ? f.reabertaPorNome : null,
    motivoReabertura: rede ? f.motivoReabertura : null,
    linhas: linhas.map(doBanco),
  };
}

/** A fotografia vigente do período, no alcance de quem pede. Nenhuma: null. */
export async function lerFotografiaVigente(tx: ClienteDoParceiro, alcance: Pick<Alcance, 'lojas'>, periodoId: string): Promise<FotografiaLida | null> {
  const f = await tx.dreFotografia.findFirst({ where: { periodoId, substituidaEm: null }, select: CABECALHO });
  return f ? paraALeitura(tx, alcance, f) : null;
}

/** Todas as versões do período, da mais nova para a mais velha (para a rede inteira: "Versões"). */
export async function lerVersoesDoPeriodo(tx: ClienteDoParceiro, periodoId: string): Promise<FotografiaLida[]> {
  const fs = await tx.dreFotografia.findMany({ where: { periodoId }, orderBy: { versao: 'desc' }, select: CABECALHO });
  const todas: FotografiaLida[] = [];
  for (const f of fs) todas.push(await paraALeitura(tx, { lojas: 'todas' }, f));
  return todas;
}

/**
 * O CMV por loja que a fotografia guardou (`entrada.cmv`, 2.3), só das lojas que a pessoa alcança: a consulta
 * já extrai do JSON apenas essas lojas, então a base da conta das outras nunca sai do banco (nem a `entrada`
 * inteira, que a tela nunca recebe). Fotografia de antes do CMV: sem lojas.
 */
export async function lerCmvDaFotografia(tx: ClienteDoParceiro, alcance: Pick<Alcance, 'lojas'>, fotografiaId: string): Promise<CmvDoDre> {
  const todas = alcance.lojas === 'todas';
  const ids = todas ? [] : [...alcance.lojas];
  const linhas = await tx.sql<{ lojaId: string; v: unknown }>`
    SELECT e."key" AS "lojaId", e."value" AS "v"
    FROM "DreFotografia" f, jsonb_each(CASE WHEN jsonb_typeof(f."entrada"->'cmv'->'lojas') = 'object' THEN f."entrada"->'cmv'->'lojas' ELSE '{}'::jsonb END) e
    WHERE f."parceiroId" = ${tx.parceiroId} AND f."id" = ${fotografiaId} AND (${todas} OR e."key" = ANY(${ids}::text[]))`;
  const [p] = await tx.sql<{ parcial: boolean | null }>`
    SELECT (f."entrada"->'cmv'->>'parcial')::boolean AS "parcial" FROM "DreFotografia" f WHERE f."parceiroId" = ${tx.parceiroId} AND f."id" = ${fotografiaId}`;
  return cmvLidoDaFotografia({ versao: 1, parcial: p?.parcial ?? false, lojas: Object.fromEntries(linhas.map((l) => [l.lojaId, l.v])) });
}

/**
 * O que a fotografia v3 (2.4) guardou para o painel por canal, só das lojas que a pessoa alcança: a receita de cada loja e
 * canal com os pedidos, e o ano passado (`entrada.anoPassado`). Como no CMV, a consulta já extrai do JSON só essas lojas:
 * a base da conta das outras nunca sai do banco. Fotografia de antes da v3: nada (receitas sem pedidos, sem ano passado).
 */
export async function lerCanaisDaFotografia(tx: ClienteDoParceiro, alcance: Pick<Alcance, 'lojas'>, fotografiaId: string): Promise<{ receitas: ReceitaLida[]; anoPassado: unknown }> {
  const todas = alcance.lojas === 'todas';
  const ids = todas ? [] : [...alcance.lojas];
  const linhas = await tx.sql<{ lojaId: string; canal: string; valorCentavos: number; pedidos: number | null }>`
    SELECT r."lojaId", r."canal", r."valorCentavos", r."pedidos"
    FROM "DreFotografia" f,
      jsonb_to_recordset(CASE WHEN jsonb_typeof(f."entrada"->'receitas') = 'array' THEN f."entrada"->'receitas' ELSE '[]'::jsonb END)
        AS r("lojaId" text, "canal" text, "valorCentavos" bigint, "pedidos" int)
    WHERE f."parceiroId" = ${tx.parceiroId} AND f."id" = ${fotografiaId} AND (${todas} OR r."lojaId" = ANY(${ids}::text[]))`;
  const [ano] = await tx.sql<{ ano: unknown }>`
    SELECT CASE WHEN jsonb_typeof(f."entrada"->'anoPassado') = 'object' AND jsonb_typeof(f."entrada"->'anoPassado'->'lojas') = 'object' THEN
      jsonb_build_object(
        'versao', f."entrada"->'anoPassado'->'versao', 'de', f."entrada"->'anoPassado'->'de', 'ate', f."entrada"->'anoPassado'->'ate',
        'lojas', COALESCE((SELECT jsonb_object_agg(e."key", e."value") FROM jsonb_each(f."entrada"->'anoPassado'->'lojas') e WHERE (${todas} OR e."key" = ANY(${ids}::text[]))), '{}'::jsonb))
      ELSE NULL END AS "ano"
    FROM "DreFotografia" f WHERE f."parceiroId" = ${tx.parceiroId} AND f."id" = ${fotografiaId}`;
  return {
    receitas: linhas.map((l) => ({ lojaId: l.lojaId, canal: l.canal as ReceitaLida['canal'], valorCentavos: Number(l.valorCentavos), ...(l.pedidos !== null ? { pedidos: l.pedidos } : {}) })),
    anoPassado: ano?.ano ?? null,
  };
}

export interface FotografiaParaGravar {
  periodoId: string;
  inicio: string;
  fim: string;
  nomeDoPeriodo: string;
  fechadoPorNome: string;
  taxa: TaxaDoIfood | null;
  /** 1 = sem CMV (2.2b); 2 = com o CMV de compra e o real (2.3, o padrão); 3 = com o ano passado e a versão do farol (2.4, o que o fechamento grava). */
  versaoDaConta?: number;
  /** O que a conta leu: a base da fotografia (a receita, a despesa e o CMV de cada loja). */
  entrada: Prisma.InputJsonValue;
  ressalvas: readonly Ressalva[];
  justificativa: string | null;
  linhas: readonly LinhaGravada[];
}

/** O número da versão que sai agora: a última mais um. */
export async function proximaVersao(tx: ClienteDoParceiro, periodoId: string): Promise<number> {
  const ultima = await tx.dreFotografia.findFirst({ where: { periodoId }, orderBy: { versao: 'desc' }, select: { versao: true } });
  return (ultima?.versao ?? 0) + 1;
}

/**
 * Grava a fotografia e as linhas. Só dentro do fechamento: o banco só aceita as linhas na mesma
 * transação da fotografia, e a fotografia só com o período FECHADO no commit.
 */
export async function gravarFotografia(tx: ClienteDoParceiro, f: FotografiaParaGravar, versao: number): Promise<string> {
  const criada = await tx.dreFotografia.create({
    data: {
      parceiroId: tx.parceiroId,
      periodoId: f.periodoId,
      versao,
      inicio: new Date(`${f.inicio}T00:00:00.000Z`),
      fim: new Date(`${f.fim}T00:00:00.000Z`),
      nomeDoPeriodo: f.nomeDoPeriodo,
      fechadoPorNome: f.fechadoPorNome.slice(0, 120),
      taxaComissaoBp: f.taxa?.comissaoBp ?? null,
      taxaPagamentoBp: f.taxa?.pagamentoBp ?? null,
      versaoDaConta: f.versaoDaConta ?? 2,
      entrada: f.entrada,
      ressalvas: f.ressalvas as unknown as Prisma.InputJsonValue,
      justificativa: f.justificativa,
    },
    select: { id: true },
  });
  const LOTE = 500;
  for (let i = 0; i < f.linhas.length; i += LOTE) {
    await tx.dreFotografiaLinha.createMany({
      data: f.linhas.slice(i, i + LOTE).map((l) => ({
        parceiroId: tx.parceiroId,
        fotografiaId: criada.id,
        lojaId: l.lojaId,
        lojaNome: l.lojaNome,
        ordem: l.ordem,
        chave: l.chave,
        codigo: l.codigo,
        linhaId: l.linhaId,
        nome: l.nome,
        grupo: l.grupo,
        tipo: l.tipo,
        nivel: l.nivel,
        sentido: l.sentido,
        valorCentavos: l.valorCentavos === null ? null : BigInt(l.valorCentavos),
        percentualBp: l.percentualBp,
        metaBp: l.metaBp,
        semContar: l.semContar,
        nota: l.nota,
        oculta: l.oculta,
      })),
    });
  }
  return criada.id;
}
